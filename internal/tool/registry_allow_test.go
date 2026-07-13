package tool

import (
	"context"
	"encoding/json"
	"testing"
)

type allowPolicyTool string

func (t allowPolicyTool) Name() string                                           { return string(t) }
func (allowPolicyTool) Description() string                                      { return "test tool" }
func (allowPolicyTool) Schema() json.RawMessage                                  { return json.RawMessage(`{"type":"object"}`) }
func (allowPolicyTool) Execute(context.Context, json.RawMessage) (string, error) { return "", nil }
func (allowPolicyTool) ReadOnly() bool                                           { return true }

func TestRegistryAllowPolicyFiltersExistingAndFutureTools(t *testing.T) {
	reg := NewRegistry()
	reg.Add(allowPolicyTool("read_file"))
	reg.Add(allowPolicyTool("bash"))

	reg.SetAllowPolicy(func(name string) bool { return name == "read_file" })
	if _, ok := reg.Get("bash"); ok {
		t.Fatal("existing disallowed tool remained registered")
	}
	if _, ok := reg.Get("read_file"); !ok {
		t.Fatal("existing allowed tool was removed")
	}

	reg.Add(allowPolicyTool("web_fetch"))
	if _, ok := reg.Get("web_fetch"); ok {
		t.Fatal("future disallowed tool bypassed allow policy")
	}
	reg.Add(allowPolicyTool("read_file"))
	if _, ok := reg.Get("read_file"); !ok {
		t.Fatal("future allowed replacement was rejected")
	}
}

func TestRegistryNilAllowPolicyRestoresInheritance(t *testing.T) {
	reg := NewRegistry()
	reg.SetAllowPolicy(func(string) bool { return false })
	reg.Add(allowPolicyTool("bash"))
	if reg.Len() != 0 {
		t.Fatalf("registry len = %d, want 0 under deny-all policy", reg.Len())
	}

	reg.SetAllowPolicy(nil)
	reg.Add(allowPolicyTool("bash"))
	if _, ok := reg.Get("bash"); !ok {
		t.Fatal("nil policy should restore inherited full registry")
	}
}
