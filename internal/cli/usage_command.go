package cli

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	usageledger "voltui/internal/usage"
)

func usageCommand(args []string) int {
	fs := flag.NewFlagSet("usage", flag.ContinueOnError)
	sinceArg := fs.String("since", "30d", "include records since duration/date (examples: 7d, 24h, 2026-07-01)")
	all := fs.Bool("all", false, "include all local usage records")
	jsonOut := fs.Bool("json", false, "print machine-readable JSON")
	limit := fs.Int("limit", 12, "maximum rows per breakdown table")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if fs.NArg() != 0 {
		usageCommandUsage()
		return 2
	}
	now := time.Now()
	var since time.Time
	var err error
	if !*all {
		since, err = parseUsageSince(*sinceArg, now)
		if err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			return 2
		}
	}
	report, err := usageledger.LoadReport("", usageledger.Query{Since: since})
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		return 1
	}
	if *jsonOut {
		b, err := json.MarshalIndent(report, "", "  ")
		if err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			return 1
		}
		fmt.Println(string(b))
		return 0
	}
	if *limit < 0 {
		*limit = 0
	}
	fmt.Print(formatUsageReport(report, *limit))
	return 0
}

func usageCommandUsage() {
	fmt.Print(`Usage:
  voltui usage [--since 7d|24h|YYYY-MM-DD] [--all] [--json] [--limit N]
  voltui stats [same flags]
`)
}

func parseUsageSince(value string, now time.Time) (time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		value = "30d"
	}
	if value == "today" {
		y, m, d := now.Date()
		return time.Date(y, m, d, 0, 0, 0, 0, now.Location()), nil
	}
	if strings.HasSuffix(value, "d") {
		n, err := strconv.Atoi(strings.TrimSuffix(value, "d"))
		if err != nil || n < 0 {
			return time.Time{}, fmt.Errorf("invalid --since %q", value)
		}
		return now.AddDate(0, 0, -n), nil
	}
	if dur, err := time.ParseDuration(value); err == nil {
		if dur < 0 {
			return time.Time{}, fmt.Errorf("invalid --since %q", value)
		}
		return now.Add(-dur), nil
	}
	for _, layout := range []string{"2006-01-02", time.RFC3339, "2006-01-02 15:04"} {
		if t, err := time.ParseInLocation(layout, value, now.Location()); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid --since %q", value)
}

func formatUsageReport(report usageledger.Report, limit int) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Local usage")
	if report.Since != nil && !report.Since.IsZero() {
		fmt.Fprintf(&b, " since %s", report.Since.Format("2006-01-02 15:04"))
	}
	b.WriteByte('\n')
	if report.Path != "" {
		fmt.Fprintf(&b, "Ledger: %s\n", displayPath(report.Path))
	}
	if report.Records == 0 {
		b.WriteString("\nNo local usage records yet. New run/chat/serve/desktop usage events are recorded locally without prompts, tool output, or secrets.\n")
		return b.String()
	}
	if report.Skipped > 0 {
		fmt.Fprintf(&b, "Skipped malformed records: %d\n", report.Skipped)
	}
	b.WriteByte('\n')
	fmt.Fprintf(&b, "Total: %s requests | %s tok | prompt %s | completion %s | cache %s | cost %s\n",
		formatInt(report.Totals.Requests),
		formatInt(report.Totals.TotalTokens),
		formatInt(report.Totals.PromptTokens),
		formatInt(report.Totals.CompletionTokens),
		formatCacheRate(report.Totals),
		formatCosts(report.Totals.CostByCurrency),
	)
	appendUsageTable(&b, "By day", report.ByDay, limit)
	appendUsageTable(&b, "By model", report.ByModel, limit)
	appendUsageTable(&b, "By source", report.BySource, limit)
	appendUsageTable(&b, "By surface", report.BySurface, limit)
	return b.String()
}

func appendUsageTable(b *strings.Builder, title string, buckets []usageledger.Bucket, limit int) {
	if len(buckets) == 0 || limit == 0 {
		return
	}
	if limit > 0 && len(buckets) > limit {
		buckets = buckets[:limit]
	}
	fmt.Fprintf(b, "\n%s\n", title)
	fmt.Fprintf(b, "%-24s %8s %12s %12s %12s %10s %12s\n", "key", "req", "total", "prompt", "completion", "cache", "cost")
	for _, bucket := range buckets {
		t := bucket.Totals
		fmt.Fprintf(b, "%-24s %8s %12s %12s %12s %10s %12s\n",
			truncateCell(bucket.Key, 24),
			formatInt(t.Requests),
			formatInt(t.TotalTokens),
			formatInt(t.PromptTokens),
			formatInt(t.CompletionTokens),
			formatCacheRate(t),
			formatCosts(t.CostByCurrency),
		)
	}
}

func formatCacheRate(t usageledger.Totals) string {
	denom := t.CacheHitTokens + t.CacheMissTokens
	if denom <= 0 {
		return "n/a"
	}
	return fmt.Sprintf("%.1f%%", float64(t.CacheHitTokens)*100/float64(denom))
}

func formatCosts(costs map[string]float64) string {
	if len(costs) == 0 {
		return "n/a"
	}
	keys := make([]string, 0, len(costs))
	for key := range costs {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, formatMoney(key, costs[key]))
	}
	return strings.Join(parts, ",")
}

func formatMoney(currency string, amount float64) string {
	if currency == "" || currency == "unknown" {
		return fmt.Sprintf("%.6f", amount)
	}
	if amount != 0 && amount < 0.0001 {
		return currency + fmt.Sprintf("%.8f", amount)
	}
	if amount < 1 {
		return currency + fmt.Sprintf("%.4f", amount)
	}
	return currency + fmt.Sprintf("%.2f", amount)
}

func formatInt(n int) string {
	sign := ""
	if n < 0 {
		sign = "-"
		n = -n
	}
	s := strconv.Itoa(n)
	if len(s) <= 3 {
		return sign + s
	}
	var b strings.Builder
	b.WriteString(sign)
	lead := len(s) % 3
	if lead == 0 {
		lead = 3
	}
	b.WriteString(s[:lead])
	for i := lead; i < len(s); i += 3 {
		b.WriteByte(',')
		b.WriteString(s[i : i+3])
	}
	return b.String()
}

func truncateCell(value string, width int) string {
	if len(value) <= width {
		return value
	}
	if width <= 1 {
		return value[:width]
	}
	if width <= 3 {
		return value[:width]
	}
	return value[:width-3] + "..."
}
