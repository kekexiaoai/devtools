package sshgate

import (
	"fmt"
	"net"
	"strings"
	"time"

	"devtools/backend/internal/types"
	"devtools/backend/pkg/sshconfig"

	"golang.org/x/crypto/ssh"
)

const sshHostDiagnosticTimeout = 3 * time.Second

type SSHHostImportResult struct {
	Alias  string `json:"alias"`
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}

type SSHHostDiagnosticCheck struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

type SSHHostDiagnosticResult struct {
	Alias     string                   `json:"alias"`
	CheckedAt string                   `json:"checkedAt"`
	Healthy   bool                     `json:"healthy"`
	Checks    []SSHHostDiagnosticCheck `json:"checks"`
}

// PreviewSSHConfigImport parses an external SSH config file without modifying the current config.
func (s *Service) PreviewSSHConfigImport(path string) ([]types.SSHHost, error) {
	manager, err := sshconfig.NewManager(path)
	if err != nil {
		return nil, err
	}

	hostConfigs, err := manager.GetAllHosts()
	if err != nil {
		return nil, err
	}

	hosts := make([]types.SSHHost, 0, len(hostConfigs))
	for _, hostConfig := range hostConfigs {
		if hostConfig.IsGlobal || hostConfig.Name == "*" || strings.ContainsAny(hostConfig.Name, "*?") {
			continue
		}
		hosts = append(hosts, sshHostFromConfig(hostConfig))
	}
	return hosts, nil
}

// ImportSSHConfigHosts imports previewed hosts into the current SSH config.
func (s *Service) ImportSSHConfigHosts(hosts []types.SSHHost, overwrite bool) ([]SSHHostImportResult, error) {
	if s.sshManager == nil {
		return nil, fmt.Errorf("ssh manager is not available")
	}

	results := make([]SSHHostImportResult, 0, len(hosts))
	for _, host := range hosts {
		result := SSHHostImportResult{Alias: host.Alias}
		exists := s.sshManager.HasHost(host.Alias)
		if exists && !overwrite {
			result.Status = "skipped"
			results = append(results, result)
			continue
		}

		originalAlias := ""
		if exists {
			originalAlias = host.Alias
			result.Status = "updated"
		} else {
			result.Status = "imported"
		}

		if err := s.SaveSSHHost(host, originalAlias); err != nil {
			result.Status = "failed"
			result.Error = err.Error()
		}
		results = append(results, result)
	}
	return results, nil
}

// DiagnoseSSHHost runs configuration, DNS, TCP, and SSH-auth checks for one SSH host.
func (s *Service) DiagnoseSSHHost(alias string, password string) (*SSHHostDiagnosticResult, error) {
	result := &SSHHostDiagnosticResult{
		Alias:     alias,
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
		Healthy:   true,
		Checks:    []SSHHostDiagnosticCheck{},
	}

	if s.sshManager == nil {
		result.addCheck("config", "failed", "SSH manager is not available.")
		result.finalize()
		return result, nil
	}

	host, err := s.sshManager.GetSSHHostByAlias(alias)
	if err != nil {
		result.addCheck("config", "failed", fmt.Sprintf("Host %s was not found in SSH config.", alias))
		result.finalize()
		return result, nil
	}
	result.addCheck("config", "passed", "Host configuration exists.")

	ips, err := net.LookupHost(host.HostName)
	if err != nil {
		result.addCheck("dns", "failed", fmt.Sprintf("DNS lookup failed for %s: %v", host.HostName, err))
		result.addCheck("tcp", "skipped", "TCP check requires a resolved host.")
		result.addCheck("ssh_auth", "skipped", "SSH check requires a reachable host.")
		result.finalize()
		return result, nil
	}
	result.addCheck("dns", "passed", fmt.Sprintf("Resolved %s to %s.", host.HostName, strings.Join(ips, ", ")))

	address := net.JoinHostPort(host.HostName, host.Port)
	conn, err := net.DialTimeout("tcp", address, sshHostDiagnosticTimeout)
	if err != nil {
		result.addCheck("tcp", "failed", fmt.Sprintf("TCP connection to %s failed: %v", address, err))
		result.addCheck("ssh_auth", "skipped", "SSH check requires an open TCP connection.")
		result.finalize()
		return result, nil
	}
	_ = conn.Close()
	result.addCheck("tcp", "passed", fmt.Sprintf("TCP connection to %s succeeded.", address))

	connConfig, err := s.sshManager.BuildSSHClientConfig(host, password, alias)
	if err != nil {
		result.addCheck("ssh_auth", "failed", err.Error())
		result.finalize()
		return result, nil
	}
	client, err := ssh.Dial("tcp", address, connConfig.ClientConfig)
	if err != nil {
		result.addCheck("ssh_auth", "failed", s.translateNetworkError(err, alias).Error())
		result.finalize()
		return result, nil
	}
	_ = client.Close()
	result.addCheck("ssh_auth", "passed", "SSH authentication succeeded.")
	result.finalize()
	return result, nil
}

func sshHostFromConfig(hostConfig *sshconfig.HostConfig) types.SSHHost {
	getParamValue := func(key string) string {
		if params, ok := hostConfig.Params[key]; ok && len(params) > 0 {
			return params[0].Value
		}
		return ""
	}

	return types.SSHHost{
		Alias:        hostConfig.Name,
		HostName:     getParamValue("HostName"),
		User:         getParamValue("User"),
		Port:         getParamValue("Port"),
		IdentityFile: getParamValue("IdentityFile"),
	}
}

func (r *SSHHostDiagnosticResult) addCheck(name string, status string, message string) {
	r.Checks = append(r.Checks, SSHHostDiagnosticCheck{
		Name:    name,
		Status:  status,
		Message: message,
	})
}

func (r *SSHHostDiagnosticResult) finalize() {
	r.Healthy = true
	for _, check := range r.Checks {
		if check.Status == "failed" {
			r.Healthy = false
			return
		}
	}
}
