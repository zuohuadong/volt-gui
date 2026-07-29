package config

import (
	"github.com/BurntSushi/toml"

	fileencoding "voltui/internal/fileutil/encoding"
)

// decodeTOMLFile decodes a user-editable TOML file after normalizing supported
// Windows text encodings to UTF-8 for the strict TOML parser.
func decodeTOMLFile(path string, v any) (toml.MetaData, error) {
	data, err := fileencoding.ReadFileUTF8(path)
	if err != nil {
		return toml.MetaData{}, err
	}
	return toml.Decode(string(data), v)
}
