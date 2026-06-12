//go:build darwin

package builtin

func browserBinCandidates() []string {
	return []string{
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		// Homebrew cask installs:
		"/opt/homebrew/Caskroom/google-chrome/*/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/opt/homebrew/Caskroom/chromium/*/Chromium.app/Contents/MacOS/Chromium",
	}
}
