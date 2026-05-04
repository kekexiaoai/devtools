package backend

import (
	"context"
	"encoding/json"
	"os/exec"
	"runtime"
	"sort"
	"strings"
	"time"
)

type systemFontsReport struct {
	Fonts []systemFontItem `json:"SPFontsDataType"`
}

type systemFontItem struct {
	Name      string               `json:"_name"`
	Enabled   string               `json:"enabled"`
	Typefaces []systemFontTypeface `json:"typefaces"`
}

type systemFontTypeface struct {
	Enabled  string `json:"enabled"`
	Family   string `json:"family"`
	Fullname string `json:"fullname"`
}

// ListSystemFonts returns installed font family names for terminal font search.
func (a *App) ListSystemFonts() ([]string, error) {
	switch runtime.GOOS {
	case "darwin":
		return listDarwinSystemFonts()
	default:
		return []string{}, nil
	}
}

func listDarwinSystemFonts() ([]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	output, err := exec.CommandContext(
		ctx,
		"system_profiler",
		"SPFontsDataType",
		"-json",
	).Output()
	if err != nil {
		return nil, err
	}

	return parseDarwinSystemFontsReport(output)
}

func parseDarwinSystemFontsReport(output []byte) ([]string, error) {
	var report systemFontsReport
	if err := json.Unmarshal(output, &report); err != nil {
		return nil, err
	}

	fonts := make(map[string]struct{})
	for _, item := range report.Fonts {
		if !isEnabledFont(item.Enabled) {
			continue
		}

		addFontName(fonts, item.Name)
		for _, typeface := range item.Typefaces {
			if !isEnabledFont(typeface.Enabled) {
				continue
			}
			addFontName(fonts, typeface.Family)
			addFontName(fonts, typeface.Fullname)
		}
	}

	result := make([]string, 0, len(fonts))
	for font := range fonts {
		result = append(result, font)
	}
	sort.Strings(result)

	return result, nil
}

func isEnabledFont(value string) bool {
	return value == "" || strings.EqualFold(value, "yes")
}

func addFontName(fonts map[string]struct{}, name string) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return
	}
	fonts[trimmed] = struct{}{}
}
