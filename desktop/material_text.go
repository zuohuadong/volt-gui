package main

import (
	"archive/zip"
	"bytes"
	"compress/zlib"
	"encoding/hex"
	"encoding/xml"
	"html"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf16"
	"unicode/utf8"
)

const maxMaterialTextBytes = 2 * 1024 * 1024

func extractProjectMaterialText(path, mimeType, fileName string) (string, error) {
	ext := strings.ToLower(filepath.Ext(firstNonEmpty(fileName, path)))
	switch ext {
	case ".txt", ".md", ".markdown", ".csv", ".json", ".xml", ".html", ".htm", ".log", ".yaml", ".yml":
		return extractPlainTextFile(path)
	case ".docx":
		return extractDocxText(path)
	case ".pdf":
		return extractPDFText(path)
	default:
		if strings.HasPrefix(strings.ToLower(mimeType), "text/") {
			return extractPlainTextFile(path)
		}
		return "", nil
	}
}

func extractPlainTextFile(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	if len(b) > maxMaterialTextBytes {
		b = b[:maxMaterialTextBytes]
	}
	return normalizeExtractedText(string(bytes.TrimPrefix(b, []byte{0xEF, 0xBB, 0xBF}))), nil
}

func extractDocxText(path string) (string, error) {
	r, err := zip.OpenReader(path)
	if err != nil {
		return "", err
	}
	defer r.Close()
	var parts []string
	for _, f := range r.File {
		name := strings.ToLower(f.Name)
		if !strings.HasPrefix(name, "word/") || !strings.HasSuffix(name, ".xml") {
			continue
		}
		if !(strings.Contains(name, "document") || strings.Contains(name, "header") || strings.Contains(name, "footer")) {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		text := extractXMLCharacterData(io.LimitReader(rc, maxMaterialTextBytes))
		_ = rc.Close()
		if text != "" {
			parts = append(parts, text)
		}
	}
	return normalizeExtractedText(strings.Join(parts, "\n")), nil
}

func extractXMLCharacterData(r io.Reader) string {
	decoder := xml.NewDecoder(r)
	var b strings.Builder
	for {
		tok, err := decoder.Token()
		if err != nil {
			break
		}
		switch t := tok.(type) {
		case xml.CharData:
			text := strings.TrimSpace(string(t))
			if text != "" {
				if b.Len() > 0 {
					b.WriteByte(' ')
				}
				b.WriteString(text)
			}
		case xml.StartElement:
			switch strings.ToLower(t.Name.Local) {
			case "p", "br", "tab", "tr":
				b.WriteByte('\n')
			}
		}
	}
	return b.String()
}

func extractPDFText(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	var streams [][]byte
	streamPattern := regexp.MustCompile(`(?s)<<.*?>>\s*stream\r?\n(.*?)\r?\nendstream`)
	for _, match := range streamPattern.FindAllSubmatch(b, -1) {
		header := match[0]
		stream := match[1]
		if bytes.Contains(header, []byte("/FlateDecode")) {
			if decoded, ok := inflatePDFStream(stream); ok {
				streams = append(streams, decoded)
				continue
			}
		}
		streams = append(streams, stream)
	}
	if len(streams) == 0 {
		streams = append(streams, b)
	}
	var parts []string
	for _, stream := range streams {
		if len(stream) > maxMaterialTextBytes {
			stream = stream[:maxMaterialTextBytes]
		}
		text := extractPDFTextOperators(string(stream))
		if text != "" {
			parts = append(parts, text)
		}
	}
	return normalizeExtractedText(strings.Join(parts, "\n")), nil
}

func inflatePDFStream(stream []byte) ([]byte, bool) {
	reader, err := zlib.NewReader(bytes.NewReader(bytes.TrimSpace(stream)))
	if err != nil {
		return nil, false
	}
	defer reader.Close()
	var out bytes.Buffer
	if _, err := io.CopyN(&out, reader, maxMaterialTextBytes); err != nil && err != io.EOF {
		return nil, false
	}
	return out.Bytes(), true
}

func extractPDFTextOperators(s string) string {
	var parts []string
	literalPattern := regexp.MustCompile(`\((?:\\.|[^\\()])*\)\s*(?:Tj|'|"|TJ)`)
	for _, token := range literalPattern.FindAllString(s, -1) {
		open := strings.IndexByte(token, '(')
		close := strings.LastIndexByte(token, ')')
		if open >= 0 && close > open {
			if text := decodePDFLiteralString(token[open+1 : close]); strings.TrimSpace(text) != "" {
				parts = append(parts, text)
			}
		}
	}
	hexPattern := regexp.MustCompile(`<([0-9A-Fa-f\s]+)>\s*(?:Tj|'|"|TJ)`)
	for _, match := range hexPattern.FindAllStringSubmatch(s, -1) {
		if text := decodePDFHexString(match[1]); strings.TrimSpace(text) != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, " ")
}

func decodePDFLiteralString(s string) string {
	var b strings.Builder
	escaped := false
	for _, r := range s {
		if escaped {
			switch r {
			case 'n':
				b.WriteByte('\n')
			case 'r':
				b.WriteByte('\r')
			case 't':
				b.WriteByte('\t')
			case 'b', 'f':
			default:
				b.WriteRune(r)
			}
			escaped = false
			continue
		}
		if r == '\\' {
			escaped = true
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func decodePDFHexString(s string) string {
	cleaned := strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return -1
		}
		return r
	}, s)
	if len(cleaned)%2 == 1 {
		cleaned += "0"
	}
	b, err := hex.DecodeString(cleaned)
	if err != nil {
		return ""
	}
	if len(b) >= 2 && b[0] == 0xFE && b[1] == 0xFF {
		var units []uint16
		for i := 2; i+1 < len(b); i += 2 {
			units = append(units, uint16(b[i])<<8|uint16(b[i+1]))
		}
		return string(utf16.Decode(units))
	}
	if utf8.Valid(b) {
		return string(b)
	}
	return string([]rune(string(b)))
}

func normalizeExtractedText(s string) string {
	s = html.UnescapeString(strings.ReplaceAll(s, "\x00", " "))
	fields := strings.Fields(s)
	if len(fields) == 0 {
		return ""
	}
	text := strings.Join(fields, " ")
	if len(text) > 20000 {
		return text[:20000]
	}
	return text
}
