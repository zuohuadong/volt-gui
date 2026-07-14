package provider

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"

	jsonschema "github.com/santhosh-tekuri/jsonschema/v6"
)

const toolSchemaResource = "urn:reasonix:tool-schema"

// ValidateToolSchema compiles a provider-visible tool parameter schema without
// resolving external resources. MCP schemas default to draft-07 when they do
// not declare a dialect; explicit $schema declarations still take precedence.
func ValidateToolSchema(raw json.RawMessage) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var doc any
	if err := decoder.Decode(&doc); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return fmt.Errorf("invalid JSON: multiple values")
		}
		return fmt.Errorf("invalid JSON: %w", err)
	}
	if _, ok := doc.(map[string]any); !ok {
		return fmt.Errorf("root must be an object")
	}

	compiler := jsonschema.NewCompiler()
	compiler.DefaultDraft(jsonschema.Draft7)
	if err := compiler.AddResource(toolSchemaResource, doc); err != nil {
		return fmt.Errorf("load schema: %w", err)
	}
	if _, err := compiler.Compile(toolSchemaResource); err != nil {
		return fmt.Errorf("compile schema: %w", err)
	}
	return nil
}
