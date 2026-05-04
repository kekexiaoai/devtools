package backend

import (
	"bufio"
	"errors"
	"os"
	"runtime"
)

type DiagnosticsSnapshot struct {
	Platform    string `json:"platform"`
	Debug       bool   `json:"debug"`
	ConfigDir   string `json:"configDir"`
	LogFilePath string `json:"logFilePath"`
}

func (a *App) GetDiagnosticsSnapshot() DiagnosticsSnapshot {
	return DiagnosticsSnapshot{
		Platform:    runtime.GOOS,
		Debug:       a.isDebug,
		ConfigDir:   a.configDir,
		LogFilePath: a.logFilePath,
	}
}

func (a *App) ReadAppLogTail(lines int) ([]string, error) {
	if lines <= 0 {
		lines = 200
	}
	return readLogTail(a.logFilePath, lines)
}

func readLogTail(logPath string, maxLines int) ([]string, error) {
	if maxLines <= 0 {
		return []string{}, nil
	}

	file, err := os.Open(logPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []string{}, nil
		}
		return nil, err
	}
	defer file.Close()

	ring := make([]string, maxLines)
	count := 0
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		ring[count%maxLines] = scanner.Text()
		count++
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	if count < maxLines {
		return ring[:count], nil
	}

	result := make([]string, 0, maxLines)
	start := count % maxLines
	for i := 0; i < maxLines; i++ {
		result = append(result, ring[(start+i)%maxLines])
	}
	return result, nil
}
