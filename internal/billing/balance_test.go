package billing

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetchDeepSeekShape(t *testing.T) {
	const body = `{
		"is_available": true,
		"balance_infos": [
			{"currency": "USD", "total_balance": "15.30", "granted_balance": "0.00", "topped_up_balance": "15.30"},
			{"currency": "CNY", "total_balance": "110.00", "granted_balance": "10.00", "topped_up_balance": "100.00"}
		]
	}`
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	b, err := Fetch(context.Background(), srv.URL, "secret-key")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if b == nil || !b.Available {
		t.Fatalf("want available balance, got %+v", b)
	}
	if gotAuth != "Bearer secret-key" {
		t.Errorf("Authorization = %q, want %q", gotAuth, "Bearer secret-key")
	}
	if len(b.Infos) != 2 {
		t.Fatalf("want 2 infos, got %d", len(b.Infos))
	}
	if got := b.Display(); got != "¥110.00" {
		t.Errorf("Display = %q, want %q", got, "¥110.00")
	}
	if got := b.DisplayForCurrency("USD"); got != "$15.30" {
		t.Errorf("DisplayForCurrency(USD) = %q, want %q", got, "$15.30")
	}
	if got := b.DisplayForCurrency("¥"); got != "¥110.00" {
		t.Errorf("DisplayForCurrency(¥) = %q, want %q", got, "¥110.00")
	}
}

func TestFetchEmptyURL(t *testing.T) {
	b, err := Fetch(context.Background(), "", "key")
	if err != nil || b != nil {
		t.Fatalf("Fetch(\"\") = (%v, %v), want (nil, nil)", b, err)
	}
	if got := b.Display(); got != "" {
		t.Errorf("nil Display = %q, want empty", got)
	}
}

func TestFetchHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"invalid key"}`))
	}))
	defer srv.Close()
	if _, err := Fetch(context.Background(), srv.URL, "bad"); err == nil {
		t.Fatal("want error on 401, got nil")
	}
}

func TestDisplayUSDOnly(t *testing.T) {
	b := &Balance{Available: true, Infos: []Info{{Currency: "USD", TotalBalance: "9.99"}}}
	if got := b.Display(); got != "$9.99" {
		t.Errorf("Display = %q, want %q", got, "$9.99")
	}
	if got := b.DisplayForCurrency("CNY"); got != "USD $9.99" {
		t.Errorf("DisplayForCurrency(CNY) = %q, want explicit real fallback currency %q", got, "USD $9.99")
	}
}

func TestBalanceOriginalCurrencyDisplayNeverConverts(t *testing.T) {
	b := &Balance{Available: true, Infos: []Info{
		{Currency: "CNY", TotalBalance: "70.16"},
		{Currency: "USD", TotalBalance: "9.82"},
	}}
	if got := b.DisplayForCurrency("USD"); got != "$9.82" {
		t.Fatalf("USD display = %q", got)
	}
	if got := (&Balance{Infos: []Info{{Currency: "CNY", TotalBalance: "70.16"}}}).DisplayForCurrency("USD"); got != "CNY ¥70.16" {
		t.Fatalf("fallback display = %q", got)
	}
	if got := b.PrimaryCurrency(); got != "" || !b.MultiCurrency() {
		t.Fatalf("wallet currencies = %v primary=%q", b.Currencies(), got)
	}
}

func TestBalanceSingleWalletCurrencyHint(t *testing.T) {
	b := &Balance{Infos: []Info{{Currency: "RMB", TotalBalance: "1"}}}
	if got := b.PrimaryCurrency(); got != "CNY" {
		t.Fatalf("primary = %q", got)
	}
	if got := b.Currencies(); len(got) != 1 || got[0] != "CNY" {
		t.Fatalf("currencies = %v", got)
	}
}
