package backend

import (
	"log"
	"os/exec"
	"runtime"
	"sort"
	"strings"
)

type ListeningPort struct {
	Command  string `json:"command"`
	PID      string `json:"pid"`
	Address  string `json:"address"`
	Port     string `json:"port"`
	Protocol string `json:"protocol"`
}

func (a *App) GetListeningPorts() ([]ListeningPort, error) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("netstat", "-ano", "-p", "tcp")
	default:
		cmd = exec.Command("lsof", "-nP", "-iTCP", "-sTCP:LISTEN")
	}
	configureBackgroundCommand(cmd)

	output, err := cmd.Output()
	if err != nil {
		log.Printf("Warning: failed to list listening ports: %v", err)
		return []ListeningPort{}, nil
	}

	var ports []ListeningPort
	if runtime.GOOS == "windows" {
		ports = parseWindowsNetstatListeningPorts(string(output))
	} else {
		ports = parseLsofListeningPorts(string(output))
	}

	sort.SliceStable(ports, func(i, j int) bool {
		if ports[i].Port == ports[j].Port {
			return ports[i].Address < ports[j].Address
		}
		return ports[i].Port < ports[j].Port
	})
	return ports, nil
}

func parseLsofListeningPorts(output string) []ListeningPort {
	lines := strings.Split(output, "\n")
	ports := make([]ListeningPort, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "COMMAND") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 9 {
			continue
		}

		nameField := fields[8]
		if !strings.Contains(strings.Join(fields[8:], " "), "(LISTEN)") {
			continue
		}
		address, port, ok := splitAddressPort(nameField)
		if !ok {
			continue
		}

		ports = append(ports, ListeningPort{
			Command:  fields[0],
			PID:      fields[1],
			Address:  address,
			Port:     port,
			Protocol: "tcp",
		})
	}
	return ports
}

func parseWindowsNetstatListeningPorts(output string) []ListeningPort {
	lines := strings.Split(output, "\n")
	ports := make([]ListeningPort, 0, len(lines))
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 5 || strings.ToUpper(fields[0]) != "TCP" {
			continue
		}
		if strings.ToUpper(fields[3]) != "LISTENING" {
			continue
		}

		address, port, ok := splitAddressPort(fields[1])
		if !ok {
			continue
		}
		pid := fields[4]
		ports = append(ports, ListeningPort{
			Command:  "pid:" + pid,
			PID:      pid,
			Address:  address,
			Port:     port,
			Protocol: "tcp",
		})
	}
	return ports
}

func splitAddressPort(value string) (string, string, bool) {
	value = strings.TrimSpace(value)
	value = strings.TrimSuffix(value, "->")

	lastColon := strings.LastIndex(value, ":")
	if lastColon < 0 || lastColon == len(value)-1 {
		return "", "", false
	}

	address := strings.Trim(value[:lastColon], "[]")
	port := value[lastColon+1:]
	if address == "" {
		address = "*"
	}
	return address, port, true
}
