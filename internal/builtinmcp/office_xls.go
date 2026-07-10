package builtinmcp

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"voltui/internal/builtinmcp/third_party/extrame/xlslite"
)

const (
	officeXLSMaxFileBytes     int64 = 64 << 20
	officeXLSMaxCells               = 1000000
	officeXLSMaxSharedStrings       = 262144
	officeXLSMaxCellTextBytes       = 1 << 20
)

// officeReadSpreadsheet is the preferred public entry point for structured
// spreadsheet reading. It keeps the legacy xlsx tools intact while letting
// Windows users read legacy xls files without Microsoft Office or COM.
func officeReadSpreadsheet(args map[string]any) (string, error) {
	switch officeSpreadsheetExtension(requiredString(args, "path")) {
	case ".xlsx":
		return officeReadXLSX(args)
	case ".xls":
		return officeReadXLS(args)
	default:
		return "", fmt.Errorf("expected a .xls or .xlsx file, got %q", filepath.Ext(strings.TrimSpace(requiredString(args, "path"))))
	}
}

func officeCountSpreadsheetColumn(args map[string]any) (string, error) {
	switch officeSpreadsheetExtension(requiredString(args, "path")) {
	case ".xlsx":
		return officeCountXLSXColumn(args)
	case ".xls":
		return officeCountXLSColumn(args)
	default:
		return "", fmt.Errorf("expected a .xls or .xlsx file, got %q", filepath.Ext(strings.TrimSpace(requiredString(args, "path"))))
	}
}

func officeReadXLS(args map[string]any) (string, error) {
	workbook, err := loadOfficeXLS(requiredString(args, "path"), optionalString(args, "sheet"))
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

func officeCountXLSColumn(args map[string]any) (string, error) {
	workbook, err := loadOfficeXLS(requiredString(args, "path"), optionalString(args, "sheet"))
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

func loadOfficeXLS(rawPath, requestedSheet string) (_ *officeXLSXWorkbook, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("parse .xls safely: %v", recovered)
		}
	}()
	filePath, err := validateOfficeXLSPath(rawPath)
	if err != nil {
		return nil, err
	}
	data, err := readOfficeXLSFile(filePath)
	if err != nil {
		return nil, err
	}
	parsed, err := xlslite.Open(data, xlslite.Limits{
		MaxWorkbookBytes: officeXLSMaxFileBytesInt(),
		MaxSheets:        255,
		MaxRecords:       300000,
		MaxCells:         officeXLSMaxCells,
		MaxSharedStrings: officeXLSMaxSharedStrings,
		MaxCellTextBytes: officeXLSMaxCellTextBytes,
	})
	if err != nil {
		return nil, fmt.Errorf("invalid .xls file %q: %w", filePath, err)
	}
	sheetNames := parsed.SheetNames()
	sheets := make([]officeXLSXSheetDefinition, 0, len(sheetNames))
	selectedIndex := 0
	for index, name := range sheetNames {
		sheets = append(sheets, officeXLSXSheetDefinition{Name: name})
		if requestedSheet != "" && name == requestedSheet {
			selectedIndex = index
		}
	}
	if strings.TrimSpace(requestedSheet) != "" && sheetNames[selectedIndex] != requestedSheet {
		return nil, fmt.Errorf("worksheet %q was not found; available worksheets: %s", requestedSheet, strings.Join(sheetNames, ", "))
	}
	sheet, err := parsed.ReadSheet(selectedIndex)
	if err != nil {
		return nil, fmt.Errorf("read worksheet %q from %q: %w", sheetNames[selectedIndex], filePath, err)
	}
	return &officeXLSXWorkbook{
		Path:   filePath,
		Sheets: sheets,
		Sheet:  officeXLSXSheet{Name: sheet.Name, Rows: sheet.Rows},
	}, nil
}

func validateOfficeXLSPath(rawPath string) (string, error) {
	rawPath = strings.TrimSpace(rawPath)
	if rawPath == "" {
		return "", fmt.Errorf("path is required")
	}
	filePath, err := filepath.Abs(expandOfficePath(rawPath))
	if err != nil {
		return "", fmt.Errorf("resolve xls path: %w", err)
	}
	if !strings.EqualFold(filepath.Ext(filePath), ".xls") {
		return "", fmt.Errorf("expected a .xls file, got %q", filepath.Ext(filePath))
	}
	info, err := os.Stat(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("xls file not found: %s", filePath)
		}
		return "", fmt.Errorf("access xls file %q: %w", filePath, err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("xls path is a directory: %s", filePath)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("xls path is not a regular file: %s", filePath)
	}
	if info.Size() > officeXLSMaxFileBytes {
		return "", fmt.Errorf("xls file exceeds maximum file size of %d bytes", officeXLSMaxFileBytes)
	}
	return filePath, nil
}

func readOfficeXLSFile(filePath string) ([]byte, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("open xls file %q: %w", filePath, err)
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, officeXLSMaxFileBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read xls file %q: %w", filePath, err)
	}
	if int64(len(data)) > officeXLSMaxFileBytes {
		return nil, fmt.Errorf("xls file exceeds maximum file size of %d bytes", officeXLSMaxFileBytes)
	}
	return data, nil
}

func officeSpreadsheetExtension(rawPath string) string {
	return strings.ToLower(filepath.Ext(strings.TrimSpace(expandOfficePath(rawPath))))
}

func officeXLSMaxFileBytesInt() int {
	return int(officeXLSMaxFileBytes)
}
