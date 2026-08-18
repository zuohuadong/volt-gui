/**
 * Degeneration Guard for DeepSeek Streaming
 * Prevents model degeneration loops (such as infinite repeating CJK characters
 * or repeating short phrase patterns).
 */

const REPEATED_CJK_RUNE_LIMIT = 32;
const REPEATED_PATTERN_SPAN = 128;
const DEGENERATION_HISTORY_MAX = REPEATED_PATTERN_SPAN * 2;

// CJK Unicode ranges
const CJK_REGEX = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/;

export class DegenerationGuard {
  private history: string[] = [];
  private lastChar = '';
  private charRun = 0;
  private inCodeFence = false;
  private backtickRun = 0;
  private observedChars = 0;

  public observe(delta: string): { degenerated: boolean; reason: string; count: number } {
    const chars = Array.from(delta);

    for (const ch of chars) {
      this.observeFence(ch);
      this.appendChar(ch);

      if (this.inCodeFence) {
        this.charRun = 0;
        continue;
      }

      if (CJK_REGEX.test(ch) && ch === this.lastChar) {
        this.charRun++;
      } else if (CJK_REGEX.test(ch)) {
        this.lastChar = ch;
        this.charRun = 1;
      } else {
        this.lastChar = '';
        this.charRun = 0;
      }

      if (this.charRun >= REPEATED_CJK_RUNE_LIMIT) {
        return {
          degenerated: true,
          reason: 'repeated_cjk_rune',
          count: this.charRun,
        };
      }

      if (this.observedChars % 16 === 0 && !this.recentlyClosedCodeFence()) {
        const pattern = this.checkRepeatedPattern();
        if (pattern.repeated) {
          return {
            degenerated: true,
            reason: 'repeated_short_pattern',
            count: Math.floor(REPEATED_PATTERN_SPAN / pattern.period),
          };
        }
      }
    }

    return { degenerated: false, reason: '', count: 0 };
  }

  private observeFence(ch: string): void {
    if (ch !== '`') {
      this.backtickRun = 0;
      return;
    }
    this.backtickRun++;
    if (this.backtickRun === 3) {
      this.inCodeFence = !this.inCodeFence;
      this.backtickRun = 0;
    }
  }

  private appendChar(ch: string): void {
    this.history.push(ch);
    this.observedChars++;
    if (this.history.length > DEGENERATION_HISTORY_MAX) {
      this.history = this.history.slice(-REPEATED_PATTERN_SPAN);
    }
  }

  private recentlyClosedCodeFence(): boolean {
    if (this.inCodeFence || this.history.length < 3) {
      return this.inCodeFence;
    }
    const recent = this.history.slice(-REPEATED_PATTERN_SPAN).join('');
    return recent.includes('```');
  }

  private checkRepeatedPattern(): { repeated: boolean; period: number } {
    if (this.history.length < REPEATED_PATTERN_SPAN) {
      return { repeated: false, period: 0 };
    }

    const suffix = this.history.slice(-REPEATED_PATTERN_SPAN);
    const suffixStr = suffix.join('');

    // Check if it has readable text
    if (!/[a-zA-Z\u4e00-\u9fa5]/.test(suffixStr)) {
      return { repeated: false, period: 0 };
    }

    for (let period = 2; period <= 16; period++) {
      let repeated = true;
      for (let i = period; i < suffix.length; i++) {
        if (suffix[i] !== suffix[i - period]) {
          repeated = false;
          break;
        }
      }
      if (repeated) {
        return { repeated: true, period };
      }
    }

    return { repeated: false, period: 0 };
  }

  public reset(): void {
    this.history = [];
    this.lastChar = '';
    this.charRun = 0;
    this.inCodeFence = false;
    this.backtickRun = 0;
    this.observedChars = 0;
  }
}
