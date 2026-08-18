/**
 * ThinkSplitter extracts inline `<think>...</think>` blocks from the content stream
 * into explicit reasoning text deltas.
 */
const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';
var ThinkState;
(function (ThinkState) {
    ThinkState[ThinkState["Probe"] = 0] = "Probe";
    ThinkState[ThinkState["Inside"] = 1] = "Inside";
    ThinkState[ThinkState["Passthrough"] = 2] = "Passthrough";
})(ThinkState || (ThinkState = {}));
export class ThinkSplitter {
    state = ThinkState.Probe;
    buffer = '';
    push(chunk) {
        switch (this.state) {
            case ThinkState.Passthrough:
                return { reasoning: '', content: chunk };
            case ThinkState.Inside:
                return this.scanClose(chunk);
            case ThinkState.Probe:
                this.buffer += chunk;
                const trimmed = this.buffer.trimStart();
                if (trimmed.length < THINK_OPEN.length) {
                    if (THINK_OPEN.startsWith(trimmed)) {
                        // Could still become <think>
                        return { reasoning: '', content: '' };
                    }
                    return { reasoning: '', content: this.drainPassthrough() };
                }
                if (trimmed.startsWith(THINK_OPEN)) {
                    this.state = ThinkState.Inside;
                    const rest = trimmed.slice(THINK_OPEN.length);
                    this.buffer = '';
                    return this.scanClose(rest);
                }
                return { reasoning: '', content: this.drainPassthrough() };
        }
    }
    scanClose(chunk) {
        this.buffer += chunk;
        const closeIdx = this.buffer.indexOf(THINK_CLOSE);
        if (closeIdx >= 0) {
            const reasoning = this.buffer.slice(0, closeIdx);
            const rest = this.buffer.slice(closeIdx + THINK_CLOSE.length).trimStart();
            this.buffer = '';
            this.state = ThinkState.Passthrough;
            return { reasoning, content: rest };
        }
        // Keep potential partial </think> in buffer
        const keep = this.markerSuffixLen(this.buffer, THINK_CLOSE);
        const reasoning = this.buffer.slice(0, this.buffer.length - keep);
        this.buffer = this.buffer.slice(this.buffer.length - keep);
        return { reasoning, content: '' };
    }
    flush() {
        if (!this.buffer) {
            return { reasoning: '', content: '' };
        }
        const out = this.buffer;
        this.buffer = '';
        if (this.state === ThinkState.Inside) {
            return { reasoning: out, content: '' };
        }
        return { reasoning: '', content: out };
    }
    drainPassthrough() {
        this.state = ThinkState.Passthrough;
        const out = this.buffer;
        this.buffer = '';
        return out;
    }
    markerSuffixLen(str, marker) {
        const max = Math.min(marker.length - 1, str.length);
        for (let n = max; n > 0; n--) {
            if (marker.startsWith(str.slice(str.length - n))) {
                return n;
            }
        }
        return 0;
    }
    reset() {
        this.state = ThinkState.Probe;
        this.buffer = '';
    }
}
//# sourceMappingURL=think_splitter.js.map