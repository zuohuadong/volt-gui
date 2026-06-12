//go:build windows

package builtin

import "os"

func browserBinCandidates() []string {
	var candidates []string
	for _, tmpl := range []string{
		`%ProgramFiles%\Microsoft\Edge\Application\msedge.exe`,
		`%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe`,
		`%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe`,
		`%ProgramFiles%\Google\Chrome\Application\chrome.exe`,
		`%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe`,
		`%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`,
		`%ProgramFiles%\Chromium\Application\chrome.exe`,
		`%ProgramFiles(x86)%\Chromium\Application\chrome.exe`,
		`%LOCALAPPDATA%\Chromium\Application\chrome.exe`,
		`%VOLTUI_BROWSER_DIR%\msedge.exe`,
		`%VOLTUI_BROWSER_DIR%\chrome.exe`,
	} {
		if p := os.ExpandEnv(tmpl); p != tmpl {
			candidates = append(candidates, p)
		}
	}
	return candidates
}
