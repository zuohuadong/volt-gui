package config

import (
	"github.com/BurntSushi/toml"

	fileencoding "voltui/internal/fileutil/encoding"
)

// decodeTOMLFile decodes a user-editable TOML file after normalizing supported
// Windows text encodings to UTF-8 for the strict TOML parser.
func decodeTOMLFile(path string, v any) (toml.MetaData, error) {
	resolved, err := resolveConfigReadPath(path)
	if err != nil {
		return toml.MetaData{}, err
	}
	return decodeTOMLFileResolved(resolved, v)
}

func decodeTOMLFileResolved(path string, v any) (toml.MetaData, error) {
	data, err := fileencoding.ReadFileUTF8(path)
	if err != nil {
		return toml.MetaData{}, err
	}
	return decodeTOMLBytes(data, v)
}

func decodeTOMLBytes(data []byte, v any) (toml.MetaData, error) {
	return toml.Decode(string(fileencoding.DecodeToUTF8(data)), v)
}
