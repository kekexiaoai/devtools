package backend

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const maxHTTPClientResponseBytes = 10 * 1024 * 1024

type HTTPHeader struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type HTTPClientRequest struct {
	Method         string       `json:"method"`
	URL            string       `json:"url"`
	Headers        []HTTPHeader `json:"headers"`
	Body           string       `json:"body"`
	TimeoutSeconds int          `json:"timeoutSeconds"`
}

type HTTPClientResponse struct {
	StatusCode int          `json:"statusCode"`
	Status     string       `json:"status"`
	Headers    []HTTPHeader `json:"headers"`
	Body       string       `json:"body"`
	DurationMs int64        `json:"durationMs"`
	SizeBytes  int          `json:"sizeBytes"`
}

func (a *App) SendHTTPRequest(input HTTPClientRequest) (HTTPClientResponse, error) {
	method := strings.ToUpper(strings.TrimSpace(input.Method))
	if method == "" {
		method = http.MethodGet
	}

	parsedURL, err := url.Parse(strings.TrimSpace(input.URL))
	if err != nil || parsedURL.Scheme == "" || parsedURL.Host == "" {
		return HTTPClientResponse{}, fmt.Errorf("invalid request URL")
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return HTTPClientResponse{}, fmt.Errorf("only http and https URLs are supported")
	}

	timeout := time.Duration(input.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	if timeout > 300*time.Second {
		timeout = 300 * time.Second
	}

	request, err := http.NewRequest(method, parsedURL.String(), bytes.NewBufferString(input.Body))
	if err != nil {
		return HTTPClientResponse{}, err
	}
	for _, header := range input.Headers {
		name := strings.TrimSpace(header.Name)
		if name == "" {
			continue
		}
		request.Header.Set(name, header.Value)
	}

	client := &http.Client{Timeout: timeout}
	startedAt := time.Now()
	response, err := client.Do(request)
	duration := time.Since(startedAt).Milliseconds()
	if err != nil {
		return HTTPClientResponse{}, err
	}
	defer response.Body.Close()

	limitedBody := io.LimitReader(response.Body, maxHTTPClientResponseBytes+1)
	bodyBytes, err := io.ReadAll(limitedBody)
	if err != nil {
		return HTTPClientResponse{}, err
	}
	if len(bodyBytes) > maxHTTPClientResponseBytes {
		return HTTPClientResponse{}, fmt.Errorf("response body exceeds 10 MiB limit")
	}

	headers := make([]HTTPHeader, 0, len(response.Header))
	for name, values := range response.Header {
		headers = append(headers, HTTPHeader{
			Name:  name,
			Value: strings.Join(values, ", "),
		})
	}

	return HTTPClientResponse{
		StatusCode: response.StatusCode,
		Status:     response.Status,
		Headers:    headers,
		Body:       string(bodyBytes),
		DurationMs: duration,
		SizeBytes:  len(bodyBytes),
	}, nil
}
