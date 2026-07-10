package builtinmcp

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"os"
	pathpkg "path"
	"path/filepath"
	"strings"
)

const (
	officeDocumentDefaultMaxBlocks     = 100
	officeDocumentMaxBlocks            = 1000
	officeDocumentDefaultMaxTableRows  = 100
	officeDocumentMaxTableRows         = 1000
	officePresentationDefaultMaxSlides = 20
	officePresentationMaxSlides        = 200

	officeOOXMLMaxParsedBlocks              = 10000
	officeDocumentMaxTables                 = 256
	officeOOXMLMaxParsedTableRows           = 2048
	officeOOXMLMaxCellsPerRow               = 2048
	officeOOXMLMaxParagraphsPerCell         = 256
	officePresentationMaxRelationships      = 4096
	officePresentationMaxShapes             = 256
	officePresentationMaxTables             = 256
	officePresentationMaxParagraphsPerShape = 256
	officePresentationMaxTextBlocks         = 1000
	officePresentationMaxTableRows          = 1000
	officeOOXMLMaxResponseTextRunes         = 1 << 20
)

type officeTextBudget struct {
	remaining int
	truncated bool
}

type officeDocumentBlock struct {
	Type         string     `json:"type"`
	Text         string     `json:"text,omitempty"`
	Rows         [][]string `json:"rows,omitempty"`
	TotalRows    int        `json:"total_rows,omitempty"`
	ReturnedRows int        `json:"returned_rows,omitempty"`
	Truncated    bool       `json:"truncated,omitempty"`
}

type officePresentationSlide struct {
	Index      int          `json:"index"`
	Title      string       `json:"title"`
	TextBlocks []string     `json:"text_blocks"`
	Tables     [][][]string `json:"tables,omitempty"`
	Truncated  bool         `json:"truncated,omitempty"`
}

type officePresentationRelationshipXML struct {
	ID         string `xml:"Id,attr"`
	Type       string `xml:"Type,attr"`
	Target     string `xml:"Target,attr"`
	TargetMode string `xml:"TargetMode,attr"`
}

func officeReadDocument(args map[string]any) (string, error) {
	rawPath := requiredString(args, "path")
	switch officeOOXMLExtension(rawPath) {
	case ".doc":
		return "", fmt.Errorf("legacy binary .doc is not supported; save it as .docx and retry")
	case ".docx":
		// Continue below.
	default:
		if strings.TrimSpace(rawPath) == "" {
			return "", fmt.Errorf("path is required")
		}
		return "", fmt.Errorf("expected a .docx file; legacy .doc files must be saved as .docx")
	}
	filePath, err := validateOfficeOOXMLPath(rawPath, "docx")
	if err != nil {
		return "", err
	}
	maxBlocks, err := officePositiveLimit(args, "max_blocks", officeDocumentDefaultMaxBlocks, officeDocumentMaxBlocks)
	if err != nil {
		return "", err
	}
	maxTableRows, err := officePositiveLimit(args, "max_table_rows", officeDocumentDefaultMaxTableRows, officeDocumentMaxTableRows)
	if err != nil {
		return "", err
	}
	archive, err := openOfficeZIPArchive(filePath, "docx")
	if err != nil {
		return "", err
	}
	defer archive.Reader.Close()
	data, err := archive.readEntry("word/document.xml")
	if err != nil {
		return "", err
	}
	budget := &officeTextBudget{remaining: officeOOXMLMaxResponseTextRunes}
	blocks, totalBlocks, truncated, err := readOfficeDOCXBlocks(data, maxBlocks, maxTableRows, budget)
	if err != nil {
		return "", fmt.Errorf("read document body from %q: %w", filePath, err)
	}
	return marshalTimeResult(map[string]any{
		"path":            filePath,
		"format":          "docx",
		"blocks":          blocks,
		"total_blocks":    totalBlocks,
		"returned_blocks": len(blocks),
		"max_blocks":      maxBlocks,
		"max_table_rows":  maxTableRows,
		"truncated":       truncated || budget.truncated,
	})
}

func officeReadPresentation(args map[string]any) (string, error) {
	rawPath := requiredString(args, "path")
	switch officeOOXMLExtension(rawPath) {
	case ".ppt":
		return "", fmt.Errorf("legacy binary .ppt is not supported; save it as .pptx and retry")
	case ".pptx":
		// Continue below.
	default:
		if strings.TrimSpace(rawPath) == "" {
			return "", fmt.Errorf("path is required")
		}
		return "", fmt.Errorf("expected a .pptx file; legacy .ppt files must be saved as .pptx")
	}
	filePath, err := validateOfficeOOXMLPath(rawPath, "pptx")
	if err != nil {
		return "", err
	}
	maxSlides, err := officePositiveLimit(args, "max_slides", officePresentationDefaultMaxSlides, officePresentationMaxSlides)
	if err != nil {
		return "", err
	}
	archive, err := openOfficeZIPArchive(filePath, "pptx")
	if err != nil {
		return "", err
	}
	defer archive.Reader.Close()
	presentationData, err := archive.readEntry("ppt/presentation.xml")
	if err != nil {
		return "", err
	}
	relationshipsData, err := archive.readEntry("ppt/_rels/presentation.xml.rels")
	if err != nil {
		return "", err
	}
	slideIDs, err := readOfficePPTXSlideIDs(presentationData)
	if err != nil {
		return "", fmt.Errorf("read presentation metadata from %q: %w", filePath, err)
	}
	if len(slideIDs) == 0 {
		return "", fmt.Errorf("pptx presentation %q has no slides", filePath)
	}
	returnedCount := len(slideIDs)
	if returnedCount > maxSlides {
		returnedCount = maxSlides
	}
	requestedRelationships := make(map[string]struct{}, returnedCount)
	for _, relationshipID := range slideIDs[:returnedCount] {
		requestedRelationships[relationshipID] = struct{}{}
	}
	relationships, err := readOfficePPTXRelationships(relationshipsData, requestedRelationships)
	if err != nil {
		return "", fmt.Errorf("read presentation relationships from %q: %w", filePath, err)
	}
	budget := &officeTextBudget{remaining: officeOOXMLMaxResponseTextRunes}
	slides := make([]officePresentationSlide, 0, returnedCount)
	truncated := len(slideIDs) > returnedCount
	for index, relationshipID := range slideIDs[:returnedCount] {
		relationship, ok := relationships[relationshipID]
		if !ok {
			return "", fmt.Errorf("pptx presentation %q is missing the slide relationship %q", filePath, relationshipID)
		}
		entry, err := officePPTXSlideEntry(relationship)
		if err != nil {
			return "", err
		}
		data, err := archive.readEntry(entry)
		if err != nil {
			return "", err
		}
		slide, slideTruncated, err := readOfficePPTXSlide(data, index+1, budget)
		if err != nil {
			return "", fmt.Errorf("read slide %d from %q: %w", index+1, filePath, err)
		}
		slides = append(slides, slide)
		truncated = truncated || slideTruncated
	}
	return marshalTimeResult(map[string]any{
		"path":             filePath,
		"format":           "pptx",
		"slides":           slides,
		"total_slides":     len(slideIDs),
		"returned_slides":  len(slides),
		"max_slides":       maxSlides,
		"text_block_limit": officePresentationMaxTextBlocks,
		"table_row_limit":  officePresentationMaxTableRows,
		"truncated":        truncated || budget.truncated,
	})
}

func validateOfficeOOXMLPath(rawPath, format string) (string, error) {
	rawPath = strings.TrimSpace(rawPath)
	if rawPath == "" {
		return "", fmt.Errorf("path is required")
	}
	filePath, err := filepath.Abs(expandOfficePath(rawPath))
	if err != nil {
		return "", fmt.Errorf("resolve %s path: %w", format, err)
	}
	if !strings.EqualFold(filepath.Ext(filePath), "."+format) {
		return "", fmt.Errorf("expected a .%s file, got %q", format, filepath.Ext(filePath))
	}
	info, err := os.Stat(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("%s file not found: %s", format, filePath)
		}
		return "", fmt.Errorf("access %s file %q: %w", format, filePath, err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("%s path is a directory: %s", format, filePath)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("%s path is not a regular file: %s", format, filePath)
	}
	if info.Size() > officeXLSXMaxArchiveBytes {
		return "", fmt.Errorf("%s archive exceeds maximum file size of %d bytes", format, officeXLSXMaxArchiveBytes)
	}
	return filePath, nil
}

func officeOOXMLExtension(rawPath string) string {
	return strings.ToLower(filepath.Ext(strings.TrimSpace(expandOfficePath(rawPath))))
}

func officePositiveLimit(args map[string]any, key string, defaultValue, maximum int) (int, error) {
	if args == nil || args[key] == nil {
		return defaultValue, nil
	}
	value, ok := args[key].(float64)
	if !ok || value != float64(int(value)) {
		return 0, fmt.Errorf("%s must be an integer between 1 and %d", key, maximum)
	}
	limit := int(value)
	if limit < 1 || limit > maximum {
		return 0, fmt.Errorf("%s must be between 1 and %d", key, maximum)
	}
	return limit, nil
}

func readOfficeDOCXBlocks(data []byte, maxBlocks, maxTableRows int, budget *officeTextBudget) ([]officeDocumentBlock, int, bool, error) {
	decoder := xml.NewDecoder(bytes.NewReader(data))
	blocks := make([]officeDocumentBlock, 0, maxBlocks)
	inBody := false
	sawBody := false
	totalBlocks := 0
	tableCount := 0
	truncated := false
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			if !sawBody {
				return nil, 0, false, fmt.Errorf("docx document has no body")
			}
			return blocks, totalBlocks, truncated, nil
		}
		if err != nil {
			return nil, 0, false, err
		}
		switch value := token.(type) {
		case xml.StartElement:
			if value.Name.Local == "body" {
				inBody = true
				sawBody = true
				continue
			}
			if !inBody {
				continue
			}
			switch value.Name.Local {
			case "p":
				totalBlocks++
				if totalBlocks > officeOOXMLMaxParsedBlocks {
					return nil, 0, false, fmt.Errorf("docx has more than %d body blocks", officeOOXMLMaxParsedBlocks)
				}
				keep := totalBlocks <= maxBlocks
				text, err := readOfficeDOCXParagraph(decoder, value, budget, keep)
				if err != nil {
					return nil, 0, false, err
				}
				if keep {
					blocks = append(blocks, officeDocumentBlock{Type: "paragraph", Text: text})
				} else {
					truncated = true
				}
			case "tbl":
				totalBlocks++
				if totalBlocks > officeOOXMLMaxParsedBlocks {
					return nil, 0, false, fmt.Errorf("docx has more than %d body blocks", officeOOXMLMaxParsedBlocks)
				}
				tableCount++
				if tableCount > officeDocumentMaxTables {
					return nil, 0, false, fmt.Errorf("docx has more than %d tables", officeDocumentMaxTables)
				}
				keep := totalBlocks <= maxBlocks
				block, tableTruncated, err := readOfficeDOCXTable(decoder, value, maxTableRows, budget, keep)
				if err != nil {
					return nil, 0, false, err
				}
				if keep {
					blocks = append(blocks, block)
				}
				if !keep || tableTruncated {
					truncated = true
				}
			}
		case xml.EndElement:
			if value.Name.Local == "body" {
				inBody = false
			}
		}
	}
}

func readOfficeDOCXParagraph(decoder *xml.Decoder, start xml.StartElement, budget *officeTextBudget, keep bool) (string, error) {
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
			switch value.Name.Local {
			case "t":
				textDepth++
			case "tab":
				if keep {
					officeAppendText(&text, "\t", budget)
				}
			case "br", "cr":
				if keep {
					officeAppendText(&text, "\n", budget)
				}
			}
		case xml.CharData:
			if keep && textDepth > 0 {
				officeAppendText(&text, string(value), budget)
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

func readOfficeDOCXTable(decoder *xml.Decoder, start xml.StartElement, maxRows int, budget *officeTextBudget, keep bool) (officeDocumentBlock, bool, error) {
	block := officeDocumentBlock{Type: "table"}
	depth := 1
	tableTruncated := false
	for depth > 0 {
		token, err := decoder.Token()
		if err != nil {
			return officeDocumentBlock{}, false, err
		}
		switch value := token.(type) {
		case xml.StartElement:
			depth++
			if value.Name.Local != "tr" {
				continue
			}
			block.TotalRows++
			if block.TotalRows > officeOOXMLMaxParsedTableRows {
				return officeDocumentBlock{}, false, fmt.Errorf("docx table has more than %d rows", officeOOXMLMaxParsedTableRows)
			}
			collect := keep && block.TotalRows <= maxRows
			row, err := readOfficeDOCXTableRow(decoder, value, budget, collect)
			if err != nil {
				return officeDocumentBlock{}, false, err
			}
			depth--
			if collect {
				block.Rows = append(block.Rows, row)
				block.ReturnedRows++
			} else {
				tableTruncated = true
			}
		case xml.EndElement:
			depth--
		}
	}
	if block.TotalRows > block.ReturnedRows {
		block.Truncated = true
	}
	return block, tableTruncated, nil
}

func readOfficeDOCXTableRow(decoder *xml.Decoder, start xml.StartElement, budget *officeTextBudget, keep bool) ([]string, error) {
	row := []string{}
	depth := 1
	cellCount := 0
	for depth > 0 {
		token, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		switch value := token.(type) {
		case xml.StartElement:
			depth++
			if value.Name.Local != "tc" {
				continue
			}
			cellCount++
			if cellCount > officeOOXMLMaxCellsPerRow {
				return nil, fmt.Errorf("docx table row has more than %d cells", officeOOXMLMaxCellsPerRow)
			}
			cell, err := readOfficeDOCXTableCell(decoder, value, budget, keep)
			if err != nil {
				return nil, err
			}
			depth--
			if keep {
				row = append(row, cell)
			}
		case xml.EndElement:
			depth--
		}
	}
	return row, nil
}

func readOfficeDOCXTableCell(decoder *xml.Decoder, start xml.StartElement, budget *officeTextBudget, keep bool) (string, error) {
	paragraphs := []string{}
	depth := 1
	paragraphCount := 0
	for depth > 0 {
		token, err := decoder.Token()
		if err != nil {
			return "", err
		}
		switch value := token.(type) {
		case xml.StartElement:
			depth++
			if value.Name.Local == "p" {
				paragraphCount++
				if paragraphCount > officeOOXMLMaxParagraphsPerCell {
					return "", fmt.Errorf("docx table cell has more than %d paragraphs", officeOOXMLMaxParagraphsPerCell)
				}
				paragraph, err := readOfficeDOCXParagraph(decoder, value, budget, keep)
				if err != nil {
					return "", err
				}
				depth--
				if keep {
					paragraphs = append(paragraphs, paragraph)
				}
			}
		case xml.EndElement:
			depth--
		}
	}
	return strings.Join(paragraphs, "\n"), nil
}

func readOfficePPTXSlideIDs(data []byte) ([]string, error) {
	decoder := xml.NewDecoder(bytes.NewReader(data))
	ids := []string{}
	seen := map[string]struct{}{}
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			return ids, nil
		}
		if err != nil {
			return nil, err
		}
		start, ok := token.(xml.StartElement)
		if !ok || start.Name.Local != "sldId" {
			continue
		}
		relationshipID := ""
		for _, attr := range start.Attr {
			if attr.Name.Local == "id" && attr.Name.Space != "" {
				relationshipID = strings.TrimSpace(attr.Value)
				break
			}
		}
		if relationshipID == "" {
			return nil, fmt.Errorf("slide is missing its relationship id")
		}
		if len(ids) >= officePresentationMaxRelationships {
			return nil, fmt.Errorf("pptx has more than %d slides", officePresentationMaxRelationships)
		}
		if _, exists := seen[relationshipID]; exists {
			return nil, fmt.Errorf("slide relationship %q is duplicated", relationshipID)
		}
		seen[relationshipID] = struct{}{}
		ids = append(ids, relationshipID)
	}
}

func readOfficePPTXRelationships(data []byte, requested map[string]struct{}) (map[string]officePresentationRelationshipXML, error) {
	decoder := xml.NewDecoder(bytes.NewReader(data))
	relationships := make(map[string]officePresentationRelationshipXML, len(requested))
	seen := make(map[string]struct{}, len(requested))
	count := 0
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			return relationships, nil
		}
		if err != nil {
			return nil, err
		}
		start, ok := token.(xml.StartElement)
		if !ok || start.Name.Local != "Relationship" {
			continue
		}
		count++
		if count > officePresentationMaxRelationships {
			return nil, fmt.Errorf("pptx has more than %d relationships", officePresentationMaxRelationships)
		}
		relationship := officePresentationRelationshipXML{}
		for _, attr := range start.Attr {
			switch attr.Name.Local {
			case "Id":
				relationship.ID = strings.TrimSpace(attr.Value)
			case "Type":
				relationship.Type = strings.TrimSpace(attr.Value)
			case "Target":
				relationship.Target = strings.TrimSpace(attr.Value)
			case "TargetMode":
				relationship.TargetMode = strings.TrimSpace(attr.Value)
			}
		}
		if relationship.ID == "" {
			return nil, fmt.Errorf("presentation relationship is missing an id")
		}
		if _, exists := seen[relationship.ID]; exists {
			return nil, fmt.Errorf("presentation relationship %q is duplicated", relationship.ID)
		}
		seen[relationship.ID] = struct{}{}
		if _, needed := requested[relationship.ID]; needed {
			relationships[relationship.ID] = relationship
		}
	}
}

func officePPTXSlideEntry(relationship officePresentationRelationshipXML) (string, error) {
	if strings.EqualFold(strings.TrimSpace(relationship.TargetMode), "external") {
		return "", fmt.Errorf("external slide relationships are not supported")
	}
	if !strings.HasSuffix(strings.ToLower(strings.TrimSpace(relationship.Type)), "/slide") {
		return "", fmt.Errorf("presentation relationship %q is not a slide relationship", relationship.ID)
	}
	target := strings.ReplaceAll(strings.TrimSpace(relationship.Target), "\\", "/")
	if target == "" || strings.Contains(target, ":") || strings.HasPrefix(target, "//") {
		return "", fmt.Errorf("external slide relationships are not supported")
	}
	entry := ""
	if strings.HasPrefix(target, "/") {
		entry = pathpkg.Clean(strings.TrimPrefix(target, "/"))
	} else {
		entry = pathpkg.Clean(pathpkg.Join("ppt", target))
	}
	if !strings.HasPrefix(entry, "ppt/slides/") || !strings.HasSuffix(strings.ToLower(entry), ".xml") {
		return "", fmt.Errorf("slide relationship target must remain within ppt/slides")
	}
	return entry, nil
}

func readOfficePPTXSlide(data []byte, index int, budget *officeTextBudget) (officePresentationSlide, bool, error) {
	slide := officePresentationSlide{Index: index, TextBlocks: []string{}}
	decoder := xml.NewDecoder(bytes.NewReader(data))
	truncated := false
	shapeCount := 0
	tableCount := 0
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			slide.Truncated = truncated
			return slide, truncated, nil
		}
		if err != nil {
			return officePresentationSlide{}, false, err
		}
		start, ok := token.(xml.StartElement)
		if !ok {
			continue
		}
		switch start.Name.Local {
		case "sp":
			shapeCount++
			if shapeCount > officePresentationMaxShapes {
				return officePresentationSlide{}, false, fmt.Errorf("pptx slide has more than %d shapes", officePresentationMaxShapes)
			}
			isTitle, paragraphs, err := readOfficePPTXShape(decoder, start, budget)
			if err != nil {
				return officePresentationSlide{}, false, err
			}
			for _, paragraph := range paragraphs {
				if isTitle && slide.Title == "" {
					slide.Title = paragraph
					continue
				}
				if len(slide.TextBlocks) >= officePresentationMaxTextBlocks {
					truncated = true
					continue
				}
				slide.TextBlocks = append(slide.TextBlocks, paragraph)
			}
		case "tbl":
			tableCount++
			if tableCount > officePresentationMaxTables {
				return officePresentationSlide{}, false, fmt.Errorf("pptx slide has more than %d tables", officePresentationMaxTables)
			}
			table, tableTruncated, err := readOfficePPTXTable(decoder, start, budget)
			if err != nil {
				return officePresentationSlide{}, false, err
			}
			slide.Tables = append(slide.Tables, table)
			truncated = truncated || tableTruncated
		}
	}
}

func readOfficePPTXShape(decoder *xml.Decoder, start xml.StartElement, budget *officeTextBudget) (bool, []string, error) {
	isTitle := false
	paragraphs := []string{}
	depth := 1
	paragraphCount := 0
	for depth > 0 {
		token, err := decoder.Token()
		if err != nil {
			return false, nil, err
		}
		switch value := token.(type) {
		case xml.StartElement:
			depth++
			if value.Name.Local == "ph" {
				for _, attr := range value.Attr {
					if attr.Name.Local == "type" && (strings.EqualFold(attr.Value, "title") || strings.EqualFold(attr.Value, "ctrTitle")) {
						isTitle = true
					}
				}
			}
			if value.Name.Local == "p" {
				paragraphCount++
				if paragraphCount > officePresentationMaxParagraphsPerShape {
					return false, nil, fmt.Errorf("pptx shape has more than %d paragraphs", officePresentationMaxParagraphsPerShape)
				}
				paragraph, err := readOfficePPTXParagraph(decoder, value, budget, true)
				if err != nil {
					return false, nil, err
				}
				depth--
				if paragraph != "" {
					paragraphs = append(paragraphs, paragraph)
				}
			}
		case xml.EndElement:
			depth--
		}
	}
	return isTitle, paragraphs, nil
}

func readOfficePPTXTable(decoder *xml.Decoder, start xml.StartElement, budget *officeTextBudget) ([][]string, bool, error) {
	table := [][]string{}
	depth := 1
	truncated := false
	rowCount := 0
	for depth > 0 {
		token, err := decoder.Token()
		if err != nil {
			return nil, false, err
		}
		switch value := token.(type) {
		case xml.StartElement:
			depth++
			if value.Name.Local != "tr" {
				continue
			}
			rowCount++
			if rowCount > officeOOXMLMaxParsedTableRows {
				return nil, false, fmt.Errorf("pptx table has more than %d rows", officeOOXMLMaxParsedTableRows)
			}
			collect := len(table) < officePresentationMaxTableRows
			row, err := readOfficePPTXTableRow(decoder, value, budget, collect)
			if err != nil {
				return nil, false, err
			}
			depth--
			if collect {
				table = append(table, row)
			} else {
				truncated = true
			}
		case xml.EndElement:
			depth--
		}
	}
	return table, truncated, nil
}

func readOfficePPTXTableRow(decoder *xml.Decoder, start xml.StartElement, budget *officeTextBudget, keep bool) ([]string, error) {
	row := []string{}
	depth := 1
	cellCount := 0
	for depth > 0 {
		token, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		switch value := token.(type) {
		case xml.StartElement:
			depth++
			if value.Name.Local != "tc" {
				continue
			}
			cellCount++
			if cellCount > officeOOXMLMaxCellsPerRow {
				return nil, fmt.Errorf("pptx table row has more than %d cells", officeOOXMLMaxCellsPerRow)
			}
			cell, err := readOfficePPTXTableCell(decoder, value, budget, keep)
			if err != nil {
				return nil, err
			}
			depth--
			if keep {
				row = append(row, cell)
			}
		case xml.EndElement:
			depth--
		}
	}
	return row, nil
}

func readOfficePPTXTableCell(decoder *xml.Decoder, start xml.StartElement, budget *officeTextBudget, keep bool) (string, error) {
	paragraphs := []string{}
	depth := 1
	paragraphCount := 0
	for depth > 0 {
		token, err := decoder.Token()
		if err != nil {
			return "", err
		}
		switch value := token.(type) {
		case xml.StartElement:
			depth++
			if value.Name.Local == "p" {
				paragraphCount++
				if paragraphCount > officeOOXMLMaxParagraphsPerCell {
					return "", fmt.Errorf("pptx table cell has more than %d paragraphs", officeOOXMLMaxParagraphsPerCell)
				}
				paragraph, err := readOfficePPTXParagraph(decoder, value, budget, keep)
				if err != nil {
					return "", err
				}
				depth--
				if keep && paragraph != "" {
					paragraphs = append(paragraphs, paragraph)
				}
			}
		case xml.EndElement:
			depth--
		}
	}
	return strings.Join(paragraphs, "\n"), nil
}

func readOfficePPTXParagraph(decoder *xml.Decoder, start xml.StartElement, budget *officeTextBudget, keep bool) (string, error) {
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
			switch value.Name.Local {
			case "t":
				textDepth++
			case "br":
				if keep {
					officeAppendText(&text, "\n", budget)
				}
			}
		case xml.CharData:
			if keep && textDepth > 0 {
				officeAppendText(&text, string(value), budget)
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

func officeAppendText(builder *strings.Builder, text string, budget *officeTextBudget) {
	for _, r := range text {
		if budget.remaining == 0 {
			budget.truncated = true
			return
		}
		builder.WriteRune(r)
		budget.remaining--
	}
}
