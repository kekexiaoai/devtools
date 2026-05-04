package backend

import (
	"testing"
)

func TestParseDarwinSystemFontsReport(t *testing.T) {
	fonts, err := parseDarwinSystemFontsReport([]byte(`{
		"SPFontsDataType": [
			{
				"_name": "MesloLGMNerdFont-Regular.ttf",
				"enabled": "yes",
				"typefaces": [
					{
						"enabled": "yes",
						"family": "MesloLGM Nerd Font",
						"fullname": "MesloLGM Nerd Font Regular"
					}
				]
			},
			{
				"_name": "DisabledFont.ttf",
				"enabled": "no",
				"typefaces": [
					{
						"enabled": "yes",
						"family": "Disabled Font"
					}
				]
			}
		]
	}`))
	if err != nil {
		t.Fatalf("parse fonts report: %v", err)
	}

	if !containsString(fonts, "MesloLGM Nerd Font") {
		t.Fatalf("expected MesloLGM Nerd Font in parsed fonts: %#v", fonts)
	}
	if containsString(fonts, "Disabled Font") {
		t.Fatalf("disabled fonts should be ignored: %#v", fonts)
	}
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
