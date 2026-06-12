//go:build linux

package builtin

func browserBinCandidates() []string {
	return []string{
		"/usr/bin/chromium-browser",
		"/usr/bin/chromium",
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/usr/bin/microsoft-edge",
		"/usr/bin/microsoft-edge-stable",
		"/snap/bin/chromium",
		"/opt/google/chrome/google-chrome",
		"/opt/chromium/chromium",
		"/opt/microsoft/msedge/microsoft-edge",
		"/opt/chrome/chrome",
		"/usr/local/bin/chromium",
	}
}
