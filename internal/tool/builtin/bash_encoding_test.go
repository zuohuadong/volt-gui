package builtin

import (
	"strings"
	"testing"

	"golang.org/x/text/encoding/simplifiedchinese"
)

func TestDecodeShellOutputPassthroughUTF8(t *testing.T) {
	in := "审查并修复：构建失败诊断 voltui-ok"
	got := decodeShellOutput(in)
	if got != in {
		t.Fatalf("UTF-8 passthrough changed output: got %q want %q", got, in)
	}
}

func TestDecodeShellOutputDecodesGBK(t *testing.T) {
	want := "内部资料驱动变更：发布验收"
	encoded, err := simplifiedchinese.GB18030.NewEncoder().Bytes([]byte(want))
	if err != nil {
		t.Fatalf("encode GB18030: %v", err)
	}
	if strings.Contains(string(encoded), "内部") {
		t.Fatalf("setup: input was not actually GBK-encoded")
	}
	got := decodeShellOutput(string(encoded))
	if got != want {
		t.Fatalf("GBK decode mismatch: got %q want %q", got, want)
	}
}

func TestDecodeShellOutputEmpty(t *testing.T) {
	if got := decodeShellOutput(""); got != "" {
		t.Fatalf("empty input should pass through, got %q", got)
	}
}
