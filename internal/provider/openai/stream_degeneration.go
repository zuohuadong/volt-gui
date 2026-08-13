package openai

import (
	"strings"
	"unicode"
)

const (
	repeatedCJKRuneLimit = 32
	repeatedPatternSpan  = 128
	degenerationHistory  = repeatedPatternSpan * 2
)

type streamDegenerationGuard struct {
	history       []rune
	lastRune      rune
	runeRun       int
	inCodeFence   bool
	backtickRun   int
	observedRunes int
}

func modelNeedsStreamDegenerationGuard(model string) bool {
	model = strings.ToLower(strings.TrimSpace(model))
	return strings.Contains(model, "glm-5.2") || strings.Contains(model, "step-3.7-flash")
}

func (g *streamDegenerationGuard) observe(delta string) (string, int, bool) {
	for _, currentRune := range []rune(delta) {
		g.observeFence(currentRune)
		g.appendRune(currentRune)
		if g.inCodeFence {
			g.runeRun = 0
			continue
		}
		if isCJKLetter(currentRune) && currentRune == g.lastRune {
			g.runeRun++
		} else if isCJKLetter(currentRune) {
			g.lastRune = currentRune
			g.runeRun = 1
		} else {
			g.lastRune = 0
			g.runeRun = 0
		}
		if g.runeRun >= repeatedCJKRuneLimit {
			return "repeated_cjk_rune", g.runeRun, true
		}
		if g.observedRunes%16 == 0 && !g.recentlyClosedCodeFence() {
			if period, repeated := repeatedShortPattern(g.history); repeated {
				return "repeated_short_pattern", repeatedPatternSpan / period, true
			}
		}
	}
	return "", 0, false
}

func (g *streamDegenerationGuard) recentlyClosedCodeFence() bool {
	if g.inCodeFence || len(g.history) < 3 {
		return g.inCodeFence
	}
	recent := g.history
	if len(recent) > repeatedPatternSpan {
		recent = recent[len(recent)-repeatedPatternSpan:]
	}
	return strings.Contains(string(recent), "```")
}

func (g *streamDegenerationGuard) observeFence(currentRune rune) {
	if currentRune != '`' {
		g.backtickRun = 0
		return
	}
	g.backtickRun++
	if g.backtickRun == 3 {
		g.inCodeFence = !g.inCodeFence
		g.backtickRun = 0
	}
}

func (g *streamDegenerationGuard) appendRune(currentRune rune) {
	g.history = append(g.history, currentRune)
	g.observedRunes++
	if len(g.history) > degenerationHistory {
		g.history = append([]rune(nil), g.history[len(g.history)-repeatedPatternSpan:]...)
	}
}

func repeatedShortPattern(history []rune) (int, bool) {
	if len(history) < repeatedPatternSpan {
		return 0, false
	}
	suffix := history[len(history)-repeatedPatternSpan:]
	if !guardableText(suffix) || looksLikeBase64(suffix) {
		return 0, false
	}
	for period := 2; period <= 16; period++ {
		repeated := true
		for index := period; index < len(suffix); index++ {
			if suffix[index] != suffix[index-period] {
				repeated = false
				break
			}
		}
		if repeated {
			return period, true
		}
	}
	return 0, false
}

func guardableText(runes []rune) bool {
	for _, currentRune := range runes {
		if unicode.IsLetter(currentRune) {
			return true
		}
	}
	return false
}

func looksLikeBase64(runes []rune) bool {
	if len(runes) < 96 {
		return false
	}
	hasBase64Marker := false
	for _, currentRune := range runes {
		switch {
		case currentRune >= 'a' && currentRune <= 'z':
		case currentRune >= 'A' && currentRune <= 'Z':
		case currentRune >= '0' && currentRune <= '9':
			hasBase64Marker = true
		case currentRune == '+', currentRune == '/', currentRune == '=':
			hasBase64Marker = true
		default:
			return false
		}
	}
	return hasBase64Marker
}

func isCJKLetter(currentRune rune) bool {
	return unicode.In(currentRune, unicode.Han, unicode.Hiragana, unicode.Katakana, unicode.Hangul)
}
