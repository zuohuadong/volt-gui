package builtinmcp

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"os"
	pathpkg "path"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	officeXLSXDefaultMaxRows                  = 50
	officeXLSXMaxRows                         = 1000
	officeXLSXMaxColumns                      = 16384 // XFD
	officeXLSXMaxArchiveBytes           int64 = 64 << 20
	officeXLSXMaxArchiveEntries               = 2048
	officeXLSXMaxEntryUncompressedBytes int64 = 16 << 20
	officeXLSXMaxTotalUncompressedBytes int64 = 64 << 20
)

type officeXLSXWorkbook struct {
	Path   string
	Sheets []officeXLSXSheetDefinition
	Sheet  officeXLSXSheet
}

type officeXLSXSheetDefinition struct {
	Name   string
	Target string
}

type officeXLSXSheet struct {
	Name string
	Rows []map[int]string
}

type officeXLSXWorkbookXML struct {
	Sheets []officeXLSXWorkbookSheetXML `xml:"sheets>sheet"`
}

type officeXLSXWorkbookSheetXML struct {
	Name           string `xml:"name,attr"`
	RelationshipID string `xml:"id,attr"`
}

type officeXLSXRelationshipsXML struct {
	Items []officeXLSXRelationshipXML `xml:"Relationship"`
}

type officeXLSXRelationshipXML struct {
	ID     string `xml:"Id,attr"`
	Target string `xml:"Target,attr"`
}

type officeXLSXCell struct {
	Reference string
	Type      string
	Value     string
	Inline    string
}

// officeZIPArchive applies one set of archive-size limits to OOXML formats.
// The format label keeps public errors actionable for the original file type.
type officeZIPArchive struct {
	Reader           *zip.ReadCloser
	UncompressedRead int64
	Format           string
}

func officeReadXLSX(args map[string]any) (string, error) {
	workbook, err := loadOfficeXLSX(requiredString(args, "path"), optionalString(args, "sheet"))
	if err != nil {
		return "", err
	}
	maxRows, err := officeXLSXRowLimit(args)
	if err != nil {
		return "", err
	}
	headers, dataRows, err := workbook.Sheet.table()
	if err != nil {
		return "", err
	}
	returnedRows := dataRows
	if len(returnedRows) > maxRows {
		returnedRows = returnedRows[:maxRows]
	}
	return marshalTimeResult(map[string]any{
		"path":            workbook.Path,
		"sheet":           workbook.Sheet.Name,
		"sheets":          workbook.sheetNames(),
		"headers":         headers,
		"rows":            returnedRows,
		"total_data_rows": len(dataRows),
		"returned_rows":   len(returnedRows),
		"truncated":       len(dataRows) > len(returnedRows),
		"row_limit":       maxRows,
	})
}

func officeCountXLSXColumn(args map[string]any) (string, error) {
	workbook, err := loadOfficeXLSX(requiredString(args, "path"), optionalString(args, "sheet"))
	if err != nil {
		return "", err
	}
	column := requiredString(args, "column")
	if column == "" {
		return "", fmt.Errorf("column is required")
	}
	headers, dataRows, err := workbook.Sheet.table()
	if err != nil {
		return "", err
	}
	found := false
	for _, header := range headers {
		if header == column {
			found = true
			break
		}
	}
	if !found {
		return "", fmt.Errorf("column %q was not found in worksheet %q; available headers: %s", column, workbook.Sheet.Name, officeXLSXDisplayHeaders(headers))
	}

	valueCounts := make(map[string]int)
	nonEmptyCount := 0
	for _, row := range dataRows {
		value := strings.TrimSpace(row[column])
		if value == "" {
			continue
		}
		nonEmptyCount++
		valueCounts[value]++
	}
	return marshalTimeResult(map[string]any{
		"path":            workbook.Path,
		"sheet":           workbook.Sheet.Name,
		"column":          column,
		"data_rows":       len(dataRows),
		"non_empty_count": nonEmptyCount,
		"value_counts":    valueCounts,
	})
}

func loadOfficeXLSX(rawPath, requestedSheet string) (*officeXLSXWorkbook, error) {
	filePath, err := validateOfficeXLSXPath(rawPath)
	if err != nil {
		return nil, err
	}
	archive, err := openOfficeZIPArchive(filePath, "xlsx")
	if err != nil {
		return nil, err
	}
	defer archive.Reader.Close()

	workbookData, err := archive.readEntry("xl/workbook.xml")
	if err != nil {
		return nil, err
	}
	var workbookXML officeXLSXWorkbookXML
	if err := xml.Unmarshal(workbookData, &workbookXML); err != nil {
		return nil, fmt.Errorf("read workbook metadata from %q: %w", filePath, err)
	}
	if len(workbookXML.Sheets) == 0 {
		return nil, fmt.Errorf("xlsx workbook %q has no worksheets", filePath)
	}
	relationshipsData, err := archive.readEntry("xl/_rels/workbook.xml.rels")
	if err != nil {
		return nil, err
	}
	var relationshipsXML officeXLSXRelationshipsXML
	if err := xml.Unmarshal(relationshipsData, &relationshipsXML); err != nil {
		return nil, fmt.Errorf("read worksheet relationships from %q: %w", filePath, err)
	}
	relationships := make(map[string]string, len(relationshipsXML.Items))
	for _, relationship := range relationshipsXML.Items {
		relationships[relationship.ID] = relationship.Target
	}

	sheets := make([]officeXLSXSheetDefinition, 0, len(workbookXML.Sheets))
	for _, item := range workbookXML.Sheets {
		target, ok := relationships[item.RelationshipID]
		if !ok || strings.TrimSpace(target) == "" {
			return nil, fmt.Errorf("xlsx workbook %q is missing the worksheet relationship for %q", filePath, item.Name)
		}
		sheets = append(sheets, officeXLSXSheetDefinition{Name: item.Name, Target: officeXLSXWorksheetEntry(target)})
	}
	selected, err := officeXLSXSelectSheet(sheets, requestedSheet)
	if err != nil {
		return nil, err
	}
	sharedStrings, err := readOfficeXLSXSharedStrings(archive)
	if err != nil {
		return nil, err
	}
	worksheetData, err := archive.readEntry(selected.Target)
	if err != nil {
		return nil, err
	}
	rows, err := readOfficeXLSXWorksheet(worksheetData, sharedStrings)
	if err != nil {
		return nil, fmt.Errorf("read worksheet %q from %q: %w", selected.Name, filePath, err)
	}
	return &officeXLSXWorkbook{Path: filePath, Sheets: sheets, Sheet: officeXLSXSheet{Name: selected.Name, Rows: rows}}, nil
}

func validateOfficeXLSXPath(rawPath string) (string, error) {
	rawPath = strings.TrimSpace(rawPath)
	if rawPath == "" {
		return "", fmt.Errorf("path is required")
	}
	filePath, err := filepath.Abs(expandOfficePath(rawPath))
	if err != nil {
		return "", fmt.Errorf("resolve xlsx path: %w", err)
	}
	if !strings.EqualFold(filepath.Ext(filePath), ".xlsx") {
		return "", fmt.Errorf("expected a .xlsx file, got %q", filepath.Ext(filePath))
	}
	info, err := os.Stat(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("xlsx file not found: %s", filePath)
		}
		return "", fmt.Errorf("access xlsx file %q: %w", filePath, err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("xlsx path is a directory: %s", filePath)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("xlsx path is not a regular file: %s", filePath)
	}
	if info.Size() > officeXLSXMaxArchiveBytes {
		return "", fmt.Errorf("xlsx archive exceeds maximum file size of %d bytes", officeXLSXMaxArchiveBytes)
	}
	return filePath, nil
}

func openOfficeZIPArchive(filePath, format string) (*officeZIPArchive, error) {
	reader, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, fmt.Errorf("invalid .%s file %q: %w", format, filePath, err)
	}
	if len(reader.File) > officeXLSXMaxArchiveEntries {
		_ = reader.Close()
		return nil, fmt.Errorf("%s archive has too many entries (%d); maximum is %d", format, len(reader.File), officeXLSXMaxArchiveEntries)
	}
	if err := validateOfficeZIPEntries(reader.File, format); err != nil {
		_ = reader.Close()
		return nil, err
	}
	return &officeZIPArchive{Reader: reader, Format: format}, nil
}

func validateOfficeZIPEntries(files []*zip.File, format string) error {
	seen := make(map[string]struct{}, len(files))
	for _, file := range files {
		name := file.Name
		if file.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("%s archive contains a symbolic-link ZIP entry %q", format, name)
		}
		key, err := officeZIPEntryKey(name)
		if err != nil {
			return fmt.Errorf("%s archive has unsafe ZIP entry path %q: %w", format, name, err)
		}
		if strings.HasSuffix(name, "/") || file.FileInfo().IsDir() {
			continue
		}
		if _, exists := seen[key]; exists {
			return fmt.Errorf("%s archive contains a duplicate ZIP entry %q", format, name)
		}
		seen[key] = struct{}{}
	}
	return nil
}

func officeZIPEntryKey(name string) (string, error) {
	if name == "" || strings.Contains(name, "\\") || strings.Contains(name, ":") || strings.HasPrefix(name, "/") {
		return "", fmt.Errorf("absolute or invalid path")
	}
	trimmed := strings.TrimSuffix(name, "/")
	if trimmed == "" {
		return "", fmt.Errorf("empty path")
	}
	for _, part := range strings.Split(trimmed, "/") {
		if part == "" || part == "." || part == ".." {
			return "", fmt.Errorf("path traversal")
		}
	}
	if pathpkg.Clean(trimmed) != trimmed {
		return "", fmt.Errorf("path traversal")
	}
	return trimmed, nil
}

func (archive *officeZIPArchive) readEntry(name string) ([]byte, error) {
	for _, file := range archive.Reader.File {
		if file.Name != name {
			continue
		}
		if file.UncompressedSize64 > uint64(officeXLSXMaxEntryUncompressedBytes) {
			return nil, fmt.Errorf("%s entry exceeds maximum uncompressed size: %s", archive.Format, name)
		}
		remaining := officeXLSXMaxTotalUncompressedBytes - archive.UncompressedRead
		if remaining <= 0 || file.UncompressedSize64 > uint64(remaining) {
			return nil, fmt.Errorf("%s archive exceeds total uncompressed size budget", archive.Format)
		}
		reader, err := file.Open()
		if err != nil {
			return nil, fmt.Errorf("open %s entry %q: %w", archive.Format, name, err)
		}
		limit := officeXLSXMaxEntryUncompressedBytes
		limitError := archive.Format + " entry exceeds maximum uncompressed size: " + name
		if remaining < limit {
			limit = remaining
			limitError = archive.Format + " archive exceeds total uncompressed size budget"
		}
		var data bytes.Buffer
		readBytes, readErr := io.Copy(&data, io.LimitReader(reader, limit+1))
		closeErr := reader.Close()
		if readErr != nil {
			return nil, fmt.Errorf("read %s entry %q: %w", archive.Format, name, readErr)
		}
		if closeErr != nil {
			return nil, fmt.Errorf("close %s entry %q: %w", archive.Format, name, closeErr)
		}
		if readBytes > limit {
			return nil, fmt.Errorf("%s", limitError)
		}
		archive.UncompressedRead += readBytes
		return data.Bytes(), nil
	}
	return nil, fmt.Errorf("invalid .%s file: missing %s", archive.Format, name)
}

func readOfficeXLSXSharedStrings(archive *officeZIPArchive) ([]string, error) {
	data, err := archive.readEntry("xl/sharedStrings.xml")
	if err != nil {
		if strings.Contains(err.Error(), "missing xl/sharedStrings.xml") {
			return nil, nil
		}
		return nil, err
	}
	decoder := xml.NewDecoder(bytes.NewReader(data))
	var values []string
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			return values, nil
		}
		if err != nil {
			return nil, fmt.Errorf("parse shared strings: %w", err)
		}
		start, ok := token.(xml.StartElement)
		if !ok || start.Name.Local != "si" {
			continue
		}
		value, err := readOfficeXLSXRichText(decoder, start)
		if err != nil {
			return nil, err
		}
		values = append(values, value)
	}
}

func readOfficeXLSXWorksheet(data []byte, sharedStrings []string) ([]map[int]string, error) {
	decoder := xml.NewDecoder(bytes.NewReader(data))
	var rows []map[int]string
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			return rows, nil
		}
		if err != nil {
			return nil, err
		}
		start, ok := token.(xml.StartElement)
		if !ok || start.Name.Local != "row" {
			continue
		}
		cells, err := readOfficeXLSXRow(decoder, start)
		if err != nil {
			return nil, err
		}
		row, err := officeXLSXCellValues(cells, sharedStrings)
		if err != nil {
			return nil, err
		}
		if len(row) > 0 {
			rows = append(rows, row)
		}
	}
}

func readOfficeXLSXRow(decoder *xml.Decoder, rowStart xml.StartElement) ([]officeXLSXCell, error) {
	var cells []officeXLSXCell
	for {
		token, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		switch value := token.(type) {
		case xml.StartElement:
			if value.Name.Local != "c" {
				continue
			}
			cell, err := readOfficeXLSXCell(decoder, value)
			if err != nil {
				return nil, err
			}
			cells = append(cells, cell)
		case xml.EndElement:
			if value.Name == rowStart.Name {
				return cells, nil
			}
		}
	}
}

func readOfficeXLSXCell(decoder *xml.Decoder, cellStart xml.StartElement) (officeXLSXCell, error) {
	cell := officeXLSXCell{}
	for _, attr := range cellStart.Attr {
		switch attr.Name.Local {
		case "r":
			cell.Reference = attr.Value
		case "t":
			cell.Type = attr.Value
		}
	}
	for {
		token, err := decoder.Token()
		if err != nil {
			return officeXLSXCell{}, err
		}
		switch value := token.(type) {
		case xml.StartElement:
			switch value.Name.Local {
			case "v":
				if err := decoder.DecodeElement(&cell.Value, &value); err != nil {
					return officeXLSXCell{}, err
				}
			case "is":
				text, err := readOfficeXLSXRichText(decoder, value)
				if err != nil {
					return officeXLSXCell{}, err
				}
				cell.Inline = text
			}
		case xml.EndElement:
			if value.Name == cellStart.Name {
				return cell, nil
			}
		}
	}
}

func readOfficeXLSXRichText(decoder *xml.Decoder, start xml.StartElement) (string, error) {
	var text strings.Builder
	depth := 1
	textDepth := 0
	for depth > 0 {
		token, err := decoder.Token()
		if err != nil {
			return "", err
		}
		switch value := token.(type) {
		case xml.StartElement:
			depth++
			if value.Name.Local == "t" {
				textDepth++
			}
		case xml.CharData:
			if textDepth > 0 {
				text.Write([]byte(value))
			}
		case xml.EndElement:
			if value.Name.Local == "t" && textDepth > 0 {
				textDepth--
			}
			depth--
		}
	}
	return text.String(), nil
}

func officeXLSXCellValues(cells []officeXLSXCell, sharedStrings []string) (map[int]string, error) {
	values := make(map[int]string, len(cells))
	lastColumn := -1
	for _, cell := range cells {
		column := lastColumn + 1
		if strings.TrimSpace(cell.Reference) != "" {
			var err error
			column, err = officeXLSXColumnIndex(cell.Reference)
			if err != nil {
				return nil, err
			}
		}
		if column < 0 || column >= officeXLSXMaxColumns {
			return nil, fmt.Errorf("cell reference %q exceeds maximum OOXML column XFD (%d)", cell.Reference, officeXLSXMaxColumns)
		}
		value, err := officeXLSXCellText(cell, sharedStrings)
		if err != nil {
			return nil, err
		}
		values[column] = value
		lastColumn = column
	}
	return values, nil
}

func officeXLSXCellText(cell officeXLSXCell, sharedStrings []string) (string, error) {
	if cell.Type == "inlineStr" {
		return cell.Inline, nil
	}
	if cell.Type != "s" {
		return cell.Value, nil
	}
	index, err := strconv.Atoi(strings.TrimSpace(cell.Value))
	if err != nil || index < 0 || index >= len(sharedStrings) {
		return "", fmt.Errorf("invalid shared-string index %q", cell.Value)
	}
	return sharedStrings[index], nil
}

func officeXLSXColumnIndex(reference string) (int, error) {
	reference = strings.TrimSpace(reference)
	column := 0
	letters := 0
	digits := 0
	for _, r := range reference {
		if r >= '0' && r <= '9' {
			if letters == 0 {
				return 0, fmt.Errorf("invalid cell reference %q", reference)
			}
			digits++
			continue
		}
		if digits > 0 {
			return 0, fmt.Errorf("invalid cell reference %q", reference)
		}
		if r >= 'a' && r <= 'z' {
			r -= 'a' - 'A'
		}
		if r < 'A' || r > 'Z' {
			return 0, fmt.Errorf("invalid cell reference %q", reference)
		}
		value := int(r - 'A' + 1)
		if column > (officeXLSXMaxColumns-value)/26 {
			return 0, fmt.Errorf("cell reference %q exceeds maximum OOXML column XFD (%d)", reference, officeXLSXMaxColumns)
		}
		column = column*26 + value
		letters++
	}
	if letters == 0 || digits == 0 {
		return 0, fmt.Errorf("invalid cell reference %q", reference)
	}
	return column - 1, nil
}

func officeXLSXWorksheetEntry(target string) string {
	target = strings.ReplaceAll(strings.TrimSpace(target), "\\", "/")
	if strings.HasPrefix(target, "/") {
		return pathpkg.Clean(strings.TrimPrefix(target, "/"))
	}
	return pathpkg.Clean(pathpkg.Join("xl", target))
}

func (workbook *officeXLSXWorkbook) sheetNames() []string {
	names := make([]string, 0, len(workbook.Sheets))
	for _, sheet := range workbook.Sheets {
		names = append(names, sheet.Name)
	}
	return names
}

func officeXLSXSelectSheet(sheets []officeXLSXSheetDefinition, name string) (officeXLSXSheetDefinition, error) {
	if strings.TrimSpace(name) == "" {
		return sheets[0], nil
	}
	for _, sheet := range sheets {
		if sheet.Name == name {
			return sheet, nil
		}
	}
	names := make([]string, 0, len(sheets))
	for _, sheet := range sheets {
		names = append(names, sheet.Name)
	}
	return officeXLSXSheetDefinition{}, fmt.Errorf("worksheet %q was not found; available worksheets: %s", name, strings.Join(names, ", "))
}

func (sheet *officeXLSXSheet) table() ([]string, []map[string]string, error) {
	if len(sheet.Rows) == 0 {
		return nil, nil, fmt.Errorf("worksheet %q is empty; it has no header row", sheet.Name)
	}
	headerRow := sheet.Rows[0]
	maxColumn := -1
	for column := range headerRow {
		if column > maxColumn {
			maxColumn = column
		}
	}
	if maxColumn < 0 {
		return nil, nil, fmt.Errorf("worksheet %q is empty; it has no header row", sheet.Name)
	}
	headers := make([]string, maxColumn+1)
	seen := make(map[string]struct{}, len(headerRow))
	for column := 0; column <= maxColumn; column++ {
		header := strings.TrimSpace(headerRow[column])
		headers[column] = header
		if header == "" {
			continue
		}
		if _, exists := seen[header]; exists {
			return nil, nil, fmt.Errorf("worksheet %q has duplicate header %q", sheet.Name, header)
		}
		seen[header] = struct{}{}
	}
	if len(seen) == 0 {
		return nil, nil, fmt.Errorf("worksheet %q is empty; its header row has no values", sheet.Name)
	}

	rows := make([]map[string]string, 0, len(sheet.Rows)-1)
	for _, sourceRow := range sheet.Rows[1:] {
		row := make(map[string]string, len(seen))
		nonEmpty := false
		for column, header := range headers {
			if header == "" {
				continue
			}
			value := sourceRow[column]
			row[header] = value
			if strings.TrimSpace(value) != "" {
				nonEmpty = true
			}
		}
		if nonEmpty {
			rows = append(rows, row)
		}
	}
	return headers, rows, nil
}

func officeXLSXDisplayHeaders(headers []string) string {
	values := make([]string, 0, len(headers))
	for _, header := range headers {
		if header != "" {
			values = append(values, header)
		}
	}
	return strings.Join(values, ", ")
}

func officeXLSXRowLimit(args map[string]any) (int, error) {
	if args == nil || args["max_rows"] == nil {
		return officeXLSXDefaultMaxRows, nil
	}
	value, ok := args["max_rows"].(float64)
	if !ok || value != float64(int(value)) {
		return 0, fmt.Errorf("max_rows must be an integer between 1 and %d", officeXLSXMaxRows)
	}
	limit := int(value)
	if limit < 1 || limit > officeXLSXMaxRows {
		return 0, fmt.Errorf("max_rows must be between 1 and %d", officeXLSXMaxRows)
	}
	return limit, nil
}
