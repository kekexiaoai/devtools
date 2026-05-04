package backend

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSendHTTPRequest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if got := r.Header.Get("X-Test"); got != "yes" {
			t.Fatalf("X-Test = %q, want yes", got)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	app := &App{}
	response, err := app.SendHTTPRequest(HTTPClientRequest{
		Method: "post",
		URL:    server.URL,
		Headers: []HTTPHeader{
			{Name: "X-Test", Value: "yes"},
		},
		Body:           `{"name":"devtools"}`,
		TimeoutSeconds: 5,
	})
	if err != nil {
		t.Fatalf("SendHTTPRequest returned error: %v", err)
	}
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("StatusCode = %d, want %d", response.StatusCode, http.StatusCreated)
	}
	if response.Body != `{"ok":true}` {
		t.Fatalf("Body = %q", response.Body)
	}
}

func TestSendHTTPRequestRejectsUnsupportedScheme(t *testing.T) {
	app := &App{}
	_, err := app.SendHTTPRequest(HTTPClientRequest{
		Method: "GET",
		URL:    "file:///etc/hosts",
	})
	if err == nil {
		t.Fatal("expected unsupported scheme error")
	}
}
