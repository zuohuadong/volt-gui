package xlslite

import (
	"encoding/binary"
	"strings"
	"testing"
)

func TestParseSSTRejectsOversizedPhoneticPayloadBeforeAllocation(t *testing.T) {
	data := make([]byte, 0, 15)
	data = append(data, 1, 0, 0, 0, 1, 0, 0, 0) // total and unique strings
	data = append(data, 0, 0, 0x04)             // empty string with phonetic data
	data = append(data, 0xFF, 0xFF, 0xFF, 0xFF) // untrusted 4 GiB phonetic size

	_, err := parseSST([][]byte{data}, normalizedLimits(Limits{MaxWorkbookBytes: 1024, MaxCellTextBytes: 64}))
	if err == nil || !strings.Contains(err.Error(), "per-string byte budget") {
		t.Fatalf("parseSST oversized phonetic payload error = %v, want bounded payload error", err)
	}
}

func TestReadGlobalsBoundsSSTContinuations(t *testing.T) {
	t.Run("record budget", func(t *testing.T) {
		stream := append(testBIFFRecord(recordBOF, testBOF(biff8Version, biffWorkbookGlobal)), testBIFFRecord(recordSST, make([]byte, 8))...)
		stream = append(stream, testBIFFRecord(recordContinue, nil)...)
		stream = append(stream, testBIFFRecord(recordContinue, nil)...)
		stream = append(stream, testBIFFRecord(recordEOF, nil)...)
		workbook := Workbook{stream: stream, limits: normalizedLimits(Limits{MaxRecords: 3})}
		err := workbook.readGlobals()
		if err == nil || !strings.Contains(err.Error(), "BIFF record limit") {
			t.Fatalf("readGlobals continuation record error = %v, want record-limit error", err)
		}
	})

	t.Run("byte budget", func(t *testing.T) {
		stream := append(testBIFFRecord(recordBOF, testBOF(biff8Version, biffWorkbookGlobal)), testBIFFRecord(recordSST, make([]byte, 8))...)
		stream = append(stream, testBIFFRecord(recordContinue, make([]byte, 25))...)
		stream = append(stream, testBIFFRecord(recordEOF, nil)...)
		workbook := Workbook{stream: stream, limits: normalizedLimits(Limits{MaxWorkbookBytes: 32, MaxRecords: 10})}
		err := workbook.readGlobals()
		if err == nil || !strings.Contains(err.Error(), "workbook byte budget") {
			t.Fatalf("readGlobals continuation byte error = %v, want byte-budget error", err)
		}
	})
}

func TestReadGlobalsRejectsPreBIFF8Workbook(t *testing.T) {
	stream := append(testBIFFRecord(recordBOF, testBOF(0x0500, biffWorkbookGlobal)), testBIFFRecord(recordEOF, nil)...)
	workbook := Workbook{stream: stream, limits: normalizedLimits(Limits{})}
	err := workbook.readGlobals()
	if err == nil || !strings.Contains(err.Error(), "only BIFF8") {
		t.Fatalf("readGlobals BIFF5 error = %v, want explicit BIFF8-only error", err)
	}
}

func testBIFFRecord(id uint16, data []byte) []byte {
	record := make([]byte, 4+len(data))
	binary.LittleEndian.PutUint16(record[:2], id)
	binary.LittleEndian.PutUint16(record[2:4], uint16(len(data)))
	copy(record[4:], data)
	return record
}

func testBOF(version, kind uint16) []byte {
	data := make([]byte, 4)
	binary.LittleEndian.PutUint16(data[:2], version)
	binary.LittleEndian.PutUint16(data[2:4], kind)
	return data
}
