// SPDX-License-Identifier: Apache-2.0
//
// This file is a hardened, reduced derivative of github.com/extrame/xls
// (commit 4a6cf263071b975a90abf74ca3e804b48243be28). See NOTICE and LICENSE.

// Package xlslite provides bounded, read-only BIFF8 `.xls` extraction for
// VoltUI's Office MCP. It intentionally supports values, not formula
// evaluation, editing, macros, OLE embedding, or workbook rendering.
package xlslite

import (
	"encoding/binary"
	"fmt"
	"math"
	"sort"
	"strconv"
	"unicode/utf16"
)

const (
	recordBOF        = 0x0809
	recordEOF        = 0x000A
	recordBoundSheet = 0x0085
	recordSST        = 0x00FC
	recordContinue   = 0x003C
	recordFilePass   = 0x002F
	recordLabelSST   = 0x00FD
	recordLabel      = 0x0204
	recordNumber     = 0x0203
	recordRK         = 0x027E
	recordMulRK      = 0x00BD
	recordFormula    = 0x0006
	recordString     = 0x0207

	biff8Version       = 0x0600
	biffWorkbookGlobal = 0x0005
	biffWorksheet      = 0x0010
	maxBIFFColumns     = 256
	maxSSTSegments     = 8192
)

// Limits bounds the memory and parsing work accepted from an untrusted `.xls`
// document. Zero fields use safe defaults.
type Limits struct {
	MaxWorkbookBytes  int
	MaxSheets         int
	MaxRecords        int
	MaxCells          int
	MaxSharedStrings  int
	MaxCellTextBytes  int
	MaxDirectoryItems int
}

// Workbook exposes only the worksheet names and bounded cell values required
// by the Office MCP.
type Workbook struct {
	stream  []byte
	sheets  []sheetDefinition
	strings []string
	limits  Limits
}

type sheetDefinition struct {
	name   string
	offset int
}

// Sheet is a sparse worksheet: each row maps zero-based BIFF column indexes
// to its displayed cached value.
type Sheet struct {
	Name string
	Rows []map[int]string
}

// Open parses a BIFF8 `.xls` compound file without launching Office or using
// external runtimes. It never writes to stdout and converts malformed input to
// an error; callers should still treat it as an untrusted-file parser.
func Open(data []byte, limits Limits) (_ *Workbook, err error) {
	limits = normalizedLimits(limits)
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("parse .xls safely: %v", recovered)
		}
	}()
	if len(data) == 0 || len(data) > limits.MaxWorkbookBytes {
		return nil, fmt.Errorf("workbook exceeds the configured size limit")
	}
	compound, entries, err := openCompound(data, compoundLimits{
		maxSectors:          max(1, limits.MaxWorkbookBytes/512),
		maxFATSectors:       4096,
		maxDirectoryEntries: limits.MaxDirectoryItems,
		maxStreamBytes:      limits.MaxWorkbookBytes,
	})
	if err != nil {
		return nil, err
	}
	var workbookStream *compoundDirectoryEntry
	for i := range entries {
		if entries[i].type_ == 2 && (entries[i].name == "Workbook" || entries[i].name == "Book") {
			workbookStream = &entries[i]
			break
		}
	}
	if workbookStream == nil {
		return nil, fmt.Errorf("compound file is missing its Workbook stream")
	}
	stream, err := compound.readStream(*workbookStream)
	if err != nil {
		return nil, fmt.Errorf("read Workbook stream: %w", err)
	}
	workbook := &Workbook{stream: stream, limits: limits}
	if err := workbook.readGlobals(); err != nil {
		return nil, err
	}
	if len(workbook.sheets) == 0 {
		return nil, fmt.Errorf("workbook has no worksheets")
	}
	return workbook, nil
}

// SheetNames returns a copy so callers cannot alter parser state.
func (w *Workbook) SheetNames() []string {
	names := make([]string, len(w.sheets))
	for i := range w.sheets {
		names[i] = w.sheets[i].name
	}
	return names
}

// ReadSheet parses one selected worksheet, keeping the rest of the workbook
// untouched.
func (w *Workbook) ReadSheet(index int) (_ Sheet, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("parse worksheet safely: %v", recovered)
		}
	}()
	if index < 0 || index >= len(w.sheets) {
		return Sheet{}, fmt.Errorf("worksheet index %d is out of range", index)
	}
	definition := w.sheets[index]
	rows, err := parseSheet(w.stream, definition.offset, w.strings, w.limits)
	if err != nil {
		return Sheet{}, err
	}
	return Sheet{Name: definition.name, Rows: rows}, nil
}

func normalizedLimits(limits Limits) Limits {
	if limits.MaxWorkbookBytes <= 0 {
		limits.MaxWorkbookBytes = 64 << 20
	}
	if limits.MaxSheets <= 0 {
		limits.MaxSheets = 255
	}
	if limits.MaxRecords <= 0 {
		limits.MaxRecords = 300000
	}
	if limits.MaxCells <= 0 {
		limits.MaxCells = 1000000
	}
	if limits.MaxSharedStrings <= 0 {
		limits.MaxSharedStrings = 262144
	}
	if limits.MaxCellTextBytes <= 0 {
		limits.MaxCellTextBytes = 1 << 20
	}
	if limits.MaxDirectoryItems <= 0 {
		limits.MaxDirectoryItems = 2048
	}
	return limits
}

func maxSSTContinuationSegments(limits Limits) int {
	if limits.MaxRecords < maxSSTSegments {
		return limits.MaxRecords
	}
	return maxSSTSegments
}

func validateBIFF8BOF(data []byte, expectedType uint16, scope string) error {
	if len(data) < 4 {
		return fmt.Errorf("%s has a truncated BOF record", scope)
	}
	version := binary.LittleEndian.Uint16(data[:2])
	if version != biff8Version {
		return fmt.Errorf("unsupported .xls BIFF version 0x%04X; only BIFF8 (Excel 97-2003) is supported", version)
	}
	if got := binary.LittleEndian.Uint16(data[2:4]); got != expectedType {
		return fmt.Errorf("%s has an unexpected BIFF8 BOF type 0x%04X", scope, got)
	}
	return nil
}

func (w *Workbook) readGlobals() error {
	seenBOF := false
	for offset, count := 0, 0; offset < len(w.stream); count++ {
		if count >= w.limits.MaxRecords {
			return fmt.Errorf("workbook has too many BIFF records")
		}
		record, next, err := nextRecord(w.stream, offset)
		if err != nil {
			return err
		}
		offset = next
		switch record.id {
		case recordBOF:
			if seenBOF || count != 0 {
				return fmt.Errorf("workbook has an unexpected BOF record")
			}
			if err := validateBIFF8BOF(record.data, biffWorkbookGlobal, "workbook globals"); err != nil {
				return err
			}
			seenBOF = true
		case recordFilePass:
			return fmt.Errorf("encrypted .xls workbooks are not supported")
		case recordBoundSheet:
			if !seenBOF {
				return fmt.Errorf("workbook has a sheet before its BOF record")
			}
			sheet, err := parseBoundSheet(record.data, len(w.stream))
			if err != nil {
				return err
			}
			w.sheets = append(w.sheets, sheet)
			if len(w.sheets) > w.limits.MaxSheets {
				return fmt.Errorf("workbook has too many worksheets")
			}
		case recordSST:
			segments := [][]byte{record.data}
			totalBytes := len(record.data)
			for offset < len(w.stream) {
				nextRecordValue, nextOffset, err := nextRecord(w.stream, offset)
				if err != nil {
					return err
				}
				if nextRecordValue.id != recordContinue {
					break
				}
				if count+1 >= w.limits.MaxRecords {
					return fmt.Errorf("shared-string table exceeds the BIFF record limit")
				}
				if len(segments) >= maxSSTContinuationSegments(w.limits) {
					return fmt.Errorf("shared-string table has too many CONTINUE records")
				}
				if len(nextRecordValue.data) > w.limits.MaxWorkbookBytes-totalBytes {
					return fmt.Errorf("shared-string table exceeds the workbook byte budget")
				}
				segments = append(segments, nextRecordValue.data)
				totalBytes += len(nextRecordValue.data)
				offset = nextOffset
				count++
			}
			strings, err := parseSST(segments, w.limits)
			if err != nil {
				return err
			}
			w.strings = strings
		case recordEOF:
			if !seenBOF {
				return fmt.Errorf("workbook ends before its BOF record")
			}
			return nil
		}
	}
	return fmt.Errorf("workbook is missing its global EOF record")
}

func parseBoundSheet(data []byte, streamLength int) (sheetDefinition, error) {
	if len(data) < 8 {
		return sheetDefinition{}, fmt.Errorf("workbook has a truncated BOUNDSHEET record")
	}
	offset := int(binary.LittleEndian.Uint32(data[:4]))
	if offset < 0 || offset+4 > streamLength {
		return sheetDefinition{}, fmt.Errorf("workbook sheet offset is outside the Workbook stream")
	}
	name, _, err := parseShortUnicodeString(data[6:], 1<<20)
	if err != nil {
		return sheetDefinition{}, fmt.Errorf("read worksheet name: %w", err)
	}
	if name == "" {
		return sheetDefinition{}, fmt.Errorf("workbook has a worksheet with an empty name")
	}
	return sheetDefinition{name: name, offset: offset}, nil
}

func parseSheet(stream []byte, start int, sharedStrings []string, limits Limits) ([]map[int]string, error) {
	if start < 0 || start+4 > len(stream) {
		return nil, fmt.Errorf("worksheet offset is outside the Workbook stream")
	}
	rows := make(map[int]map[int]string)
	cellCount := 0
	pendingFormula := cellPosition{row: -1, column: -1}
	for offset, count := start, 0; offset < len(stream); count++ {
		if count >= limits.MaxRecords {
			return nil, fmt.Errorf("worksheet has too many BIFF records")
		}
		record, next, err := nextRecord(stream, offset)
		if err != nil {
			return nil, err
		}
		offset = next
		switch record.id {
		case recordBOF:
			if count != 0 {
				return nil, fmt.Errorf("worksheet has an invalid BOF record")
			}
			if err := validateBIFF8BOF(record.data, biffWorksheet, "worksheet"); err != nil {
				return nil, err
			}
		case recordEOF:
			return sparseRows(rows)
		case recordLabelSST:
			row, column, index, err := parseLabelSST(record.data)
			if err != nil {
				return nil, err
			}
			if index >= len(sharedStrings) {
				return nil, fmt.Errorf("worksheet references an invalid shared-string index")
			}
			if err := addCell(rows, &cellCount, row, column, sharedStrings[index], limits); err != nil {
				return nil, err
			}
		case recordLabel:
			row, column, value, err := parseLabel(record.data, limits.MaxCellTextBytes)
			if err != nil {
				return nil, err
			}
			if err := addCell(rows, &cellCount, row, column, value, limits); err != nil {
				return nil, err
			}
		case recordNumber:
			row, column, value, err := parseNumber(record.data)
			if err != nil {
				return nil, err
			}
			if err := addCell(rows, &cellCount, row, column, value, limits); err != nil {
				return nil, err
			}
		case recordRK:
			row, column, value, err := parseRK(record.data)
			if err != nil {
				return nil, err
			}
			if err := addCell(rows, &cellCount, row, column, value, limits); err != nil {
				return nil, err
			}
		case recordMulRK:
			values, err := parseMulRK(record.data)
			if err != nil {
				return nil, err
			}
			for _, value := range values {
				if err := addCell(rows, &cellCount, value.position.row, value.position.column, value.value, limits); err != nil {
					return nil, err
				}
			}
		case recordFormula:
			row, column, value, isString, err := parseFormula(record.data)
			if err != nil {
				return nil, err
			}
			if isString {
				pendingFormula = cellPosition{row: row, column: column}
			} else {
				pendingFormula = cellPosition{row: -1, column: -1}
				if err := addCell(rows, &cellCount, row, column, value, limits); err != nil {
					return nil, err
				}
			}
		case recordString:
			if pendingFormula.row >= 0 {
				value, _, err := parseUnicodeString(record.data, limits.MaxCellTextBytes)
				if err != nil {
					return nil, fmt.Errorf("read formula string result: %w", err)
				}
				if err := addCell(rows, &cellCount, pendingFormula.row, pendingFormula.column, value, limits); err != nil {
					return nil, err
				}
				pendingFormula = cellPosition{row: -1, column: -1}
			}
		}
	}
	return nil, fmt.Errorf("worksheet is missing its EOF record")
}

type biffRecord struct {
	id   uint16
	data []byte
}

func nextRecord(stream []byte, offset int) (biffRecord, int, error) {
	if offset < 0 || offset+4 > len(stream) {
		return biffRecord{}, 0, fmt.Errorf("workbook has a truncated BIFF record header")
	}
	id := binary.LittleEndian.Uint16(stream[offset : offset+2])
	size := int(binary.LittleEndian.Uint16(stream[offset+2 : offset+4]))
	end := offset + 4 + size
	if end < offset || end > len(stream) {
		return biffRecord{}, 0, fmt.Errorf("workbook has a truncated BIFF record")
	}
	return biffRecord{id: id, data: stream[offset+4 : end]}, end, nil
}

func parseSST(segments [][]byte, limits Limits) ([]string, error) {
	if len(segments) == 0 || len(segments[0]) < 8 {
		return nil, fmt.Errorf("workbook has a truncated shared-string table")
	}
	totalBytes := 0
	for _, segment := range segments {
		if len(segment) > limits.MaxWorkbookBytes-totalBytes {
			return nil, fmt.Errorf("shared-string table exceeds the workbook byte budget")
		}
		totalBytes += len(segment)
	}
	count := int(binary.LittleEndian.Uint32(segments[0][4:8]))
	if count < 0 || count > limits.MaxSharedStrings {
		return nil, fmt.Errorf("workbook has too many shared strings (%d)", count)
	}
	cursor := sstCursor{segments: segments, offset: 8, remaining: totalBytes - 8}
	values := make([]string, 0, count)
	for i := 0; i < count; i++ {
		value, err := cursor.readString(limits.MaxCellTextBytes)
		if err != nil {
			return nil, fmt.Errorf("read shared string %d: %w", i, err)
		}
		values = append(values, value)
	}
	return values, nil
}

type sstCursor struct {
	segments  [][]byte
	segment   int
	offset    int
	remaining int
}

func (c *sstCursor) read(n int) ([]byte, error) {
	if n < 0 || n > c.remaining {
		return nil, fmt.Errorf("invalid shared-string length")
	}
	out := make([]byte, n)
	for read := 0; read < n; {
		if c.segment >= len(c.segments) {
			return nil, fmt.Errorf("shared-string table ends unexpectedly")
		}
		if c.offset == len(c.segments[c.segment]) {
			c.segment++
			c.offset = 0
			continue
		}
		available := len(c.segments[c.segment]) - c.offset
		need := n - read
		if available > need {
			available = need
		}
		copy(out[read:read+available], c.segments[c.segment][c.offset:c.offset+available])
		read += available
		c.offset += available
		c.remaining -= available
	}
	return out, nil
}

func (c *sstCursor) discard(n int) error {
	if n < 0 || n > c.remaining {
		return fmt.Errorf("shared-string data exceeds the available workbook bytes")
	}
	for remaining := n; remaining > 0; {
		if c.segment >= len(c.segments) {
			return fmt.Errorf("shared-string table ends unexpectedly")
		}
		if c.offset == len(c.segments[c.segment]) {
			c.segment++
			c.offset = 0
			continue
		}
		step := len(c.segments[c.segment]) - c.offset
		if step > remaining {
			step = remaining
		}
		c.offset += step
		c.remaining -= step
		remaining -= step
	}
	return nil
}

func (c *sstCursor) readString(maxBytes int) (string, error) {
	lengthData, err := c.read(2)
	if err != nil {
		return "", err
	}
	count := int(binary.LittleEndian.Uint16(lengthData))
	flags, err := c.read(1)
	if err != nil {
		return "", err
	}
	is16 := flags[0]&1 != 0
	richRuns := 0
	phoneticSize := uint32(0)
	if flags[0]&8 != 0 {
		data, err := c.read(2)
		if err != nil {
			return "", err
		}
		richRuns = int(binary.LittleEndian.Uint16(data))
	}
	if flags[0]&4 != 0 {
		data, err := c.read(4)
		if err != nil {
			return "", err
		}
		phoneticSize = binary.LittleEndian.Uint32(data)
	}
	characterBudget := count * 2 // CONTINUE records may switch to UTF-16.
	richBytes := richRuns * 4
	if characterBudget > maxBytes || richBytes > maxBytes || uint64(phoneticSize) > uint64(maxBytes) {
		return "", fmt.Errorf("shared-string payload exceeds the per-string byte budget")
	}
	phoneticBytes := int(phoneticSize)
	if characterBudget > maxBytes-richBytes || phoneticBytes > maxBytes-characterBudget-richBytes {
		return "", fmt.Errorf("shared-string payload exceeds the per-string byte budget")
	}
	value, err := c.readCharacters(count, is16, maxBytes)
	if err != nil {
		return "", err
	}
	if err := c.discard(richBytes); err != nil {
		return "", err
	}
	if err := c.discard(phoneticBytes); err != nil {
		return "", err
	}
	return value, nil
}

func (c *sstCursor) readCharacters(count int, is16 bool, maxBytes int) (string, error) {
	if count < 0 || count > maxBytes || count > c.remaining {
		return "", fmt.Errorf("string exceeds the configured size limit")
	}
	runes := make([]rune, 0, count)
	for len(runes) < count {
		if c.segment >= len(c.segments) {
			return "", fmt.Errorf("string characters end unexpectedly")
		}
		if c.offset == len(c.segments[c.segment]) {
			c.segment++
			c.offset = 0
			mode, err := c.read(1)
			if err != nil {
				return "", err
			}
			is16 = mode[0]&1 != 0
		}
		width := 1
		if is16 {
			width = 2
		}
		if len(c.segments[c.segment])-c.offset < width {
			return "", fmt.Errorf("string character is split within an invalid CONTINUE record")
		}
		if is16 {
			runes = append(runes, rune(binary.LittleEndian.Uint16(c.segments[c.segment][c.offset:c.offset+2])))
		} else {
			runes = append(runes, rune(c.segments[c.segment][c.offset]))
		}
		c.offset += width
		c.remaining -= width
	}
	return string(runes), nil
}

func parseShortUnicodeString(data []byte, maxBytes int) (string, int, error) {
	if len(data) < 2 {
		return "", 0, fmt.Errorf("truncated string")
	}
	count := int(data[0])
	flags := data[1]
	width := 1
	if flags&1 != 0 {
		width = 2
	}
	length := 2 + count*width
	if count > maxBytes || length < 2 || length > len(data) {
		return "", 0, fmt.Errorf("truncated or oversized string")
	}
	return decodeCharacters(data[2:length], flags&1 != 0), length, nil
}

func parseUnicodeString(data []byte, maxBytes int) (string, int, error) {
	if len(data) < 3 {
		return "", 0, fmt.Errorf("truncated string")
	}
	count := int(binary.LittleEndian.Uint16(data[:2]))
	flags := data[2]
	width := 1
	if flags&1 != 0 {
		width = 2
	}
	richRuns, phoneticSize, header := 0, 0, 3
	if flags&8 != 0 {
		if len(data) < header+2 {
			return "", 0, fmt.Errorf("truncated rich string")
		}
		richRuns = int(binary.LittleEndian.Uint16(data[header : header+2]))
		header += 2
	}
	if flags&4 != 0 {
		if len(data) < header+4 {
			return "", 0, fmt.Errorf("truncated phonetic string")
		}
		phoneticSize = int(binary.LittleEndian.Uint32(data[header : header+4]))
		header += 4
	}
	characters := count * width
	length := header + characters + richRuns*4 + phoneticSize
	if count > maxBytes || length < header || length > len(data) {
		return "", 0, fmt.Errorf("truncated or oversized string")
	}
	return decodeCharacters(data[header:header+characters], flags&1 != 0), length, nil
}

func decodeCharacters(data []byte, is16 bool) string {
	if !is16 {
		runes := make([]rune, len(data))
		for i, value := range data {
			runes[i] = rune(value)
		}
		return string(runes)
	}
	runes := make([]uint16, len(data)/2)
	for i := range runes {
		runes[i] = binary.LittleEndian.Uint16(data[i*2 : i*2+2])
	}
	return string(utf16.Decode(runes))
}

func parseLabelSST(data []byte) (int, int, int, error) {
	if len(data) < 10 {
		return 0, 0, 0, fmt.Errorf("worksheet has a truncated LABELSST record")
	}
	return int(binary.LittleEndian.Uint16(data[:2])), int(binary.LittleEndian.Uint16(data[2:4])), int(binary.LittleEndian.Uint32(data[6:10])), nil
}

func parseLabel(data []byte, maxBytes int) (int, int, string, error) {
	if len(data) < 9 {
		return 0, 0, "", fmt.Errorf("worksheet has a truncated LABEL record")
	}
	value, _, err := parseUnicodeString(data[6:], maxBytes)
	if err != nil {
		return 0, 0, "", fmt.Errorf("read LABEL string: %w", err)
	}
	return int(binary.LittleEndian.Uint16(data[:2])), int(binary.LittleEndian.Uint16(data[2:4])), value, nil
}

func parseNumber(data []byte) (int, int, string, error) {
	if len(data) != 14 {
		return 0, 0, "", fmt.Errorf("worksheet has an invalid NUMBER record")
	}
	value := math.Float64frombits(binary.LittleEndian.Uint64(data[6:14]))
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, 0, "", fmt.Errorf("worksheet has a non-finite NUMBER value")
	}
	return int(binary.LittleEndian.Uint16(data[:2])), int(binary.LittleEndian.Uint16(data[2:4])), strconv.FormatFloat(value, 'f', -1, 64), nil
}

func parseRK(data []byte) (int, int, string, error) {
	if len(data) != 10 {
		return 0, 0, "", fmt.Errorf("worksheet has an invalid RK record")
	}
	value, err := decodeRK(binary.LittleEndian.Uint32(data[6:10]))
	if err != nil {
		return 0, 0, "", err
	}
	return int(binary.LittleEndian.Uint16(data[:2])), int(binary.LittleEndian.Uint16(data[2:4])), value, nil
}

type cellPosition struct {
	row    int
	column int
}

type positionedValue struct {
	position cellPosition
	value    string
}

func parseMulRK(data []byte) ([]positionedValue, error) {
	if len(data) < 12 || (len(data)-6)%6 != 0 {
		return nil, fmt.Errorf("worksheet has an invalid MULRK record")
	}
	row := int(binary.LittleEndian.Uint16(data[:2]))
	firstColumn := int(binary.LittleEndian.Uint16(data[2:4]))
	lastColumn := int(binary.LittleEndian.Uint16(data[len(data)-2:]))
	count := (len(data) - 6) / 6
	if firstColumn+count-1 != lastColumn {
		return nil, fmt.Errorf("worksheet has an inconsistent MULRK record")
	}
	values := make([]positionedValue, 0, count)
	for i := 0; i < count; i++ {
		value, err := decodeRK(binary.LittleEndian.Uint32(data[4+i*6+2 : 4+i*6+6]))
		if err != nil {
			return nil, err
		}
		values = append(values, positionedValue{position: cellPosition{row: row, column: firstColumn + i}, value: value})
	}
	return values, nil
}

func parseFormula(data []byte) (int, int, string, bool, error) {
	if len(data) < 20 {
		return 0, 0, "", false, fmt.Errorf("worksheet has a truncated FORMULA record")
	}
	row := int(binary.LittleEndian.Uint16(data[:2]))
	column := int(binary.LittleEndian.Uint16(data[2:4]))
	result := data[6:14]
	if result[6] == 0xFF && result[7] == 0xFF {
		switch result[0] {
		case 0:
			return row, column, "", true, nil
		case 1:
			return row, column, "TRUE", false, nil
		case 2:
			return row, column, "ERROR", false, nil
		case 3:
			return row, column, "FALSE", false, nil
		default:
			return row, column, "", false, fmt.Errorf("worksheet has an unsupported formula result")
		}
	}
	value := math.Float64frombits(binary.LittleEndian.Uint64(result))
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, 0, "", false, fmt.Errorf("worksheet has a non-finite formula result")
	}
	return row, column, strconv.FormatFloat(value, 'f', -1, 64), false, nil
}

func decodeRK(raw uint32) (string, error) {
	multiplied := raw&1 != 0
	isInteger := raw&2 != 0
	var value float64
	if isInteger {
		value = float64(int32(raw) >> 2)
	} else {
		value = math.Float64frombits(uint64(int32(raw)>>2) << 34)
	}
	if multiplied {
		value /= 100
	}
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return "", fmt.Errorf("worksheet has a non-finite RK value")
	}
	return strconv.FormatFloat(value, 'f', -1, 64), nil
}

func addCell(rows map[int]map[int]string, cellCount *int, row, column int, value string, limits Limits) error {
	if row < 0 || row > math.MaxUint16 || column < 0 || column >= maxBIFFColumns {
		return fmt.Errorf("worksheet cell is outside legacy .xls row or column limits")
	}
	if len(value) > limits.MaxCellTextBytes {
		return fmt.Errorf("worksheet cell text exceeds the configured size limit")
	}
	current := rows[row]
	if current == nil {
		if len(rows) >= limits.MaxCells {
			return fmt.Errorf("worksheet has too many populated rows")
		}
		current = make(map[int]string)
		rows[row] = current
	}
	if _, exists := current[column]; !exists {
		if *cellCount >= limits.MaxCells {
			return fmt.Errorf("worksheet has too many populated cells")
		}
		*cellCount++
	}
	current[column] = value
	return nil
}

func sparseRows(rows map[int]map[int]string) ([]map[int]string, error) {
	if len(rows) == 0 {
		return nil, nil
	}
	indexes := make([]int, 0, len(rows))
	for row := range rows {
		if row < 0 || row > math.MaxUint16 {
			return nil, fmt.Errorf("worksheet row range is invalid")
		}
		indexes = append(indexes, row)
	}
	sort.Ints(indexes)
	values := make([]map[int]string, 0, len(indexes))
	for _, row := range indexes {
		values = append(values, rows[row])
	}
	return values, nil
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
