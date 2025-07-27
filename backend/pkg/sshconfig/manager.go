package sshconfig

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// SSHConfigManager SSH配置管理器
type SSHConfigManager struct {
	filename string
	rawLines []string
}

// HostConfig 主机配置
type HostConfig struct {
	Name        string
	Params      map[string][]Param // 支持多个相同key的参数
	Description string             // Host块的描述信息
	IsGlobal    bool               // 是否为全局配置 (Host *)
}

// Param 配置参数
type Param struct {
	Key   string
	Value string
	Line  int    // 在原文件中的行号
	Raw   string // 原始行内容（包括缩进和注释）
}

// ConfigError 配置相关错误
type ConfigError struct {
	Op  string
	Err error
}

func (e *ConfigError) Error() string {
	return fmt.Sprintf("ssh config %s: %v", e.Op, e.Err)
}

// NewManager 创建新的配置管理器
func NewManager(filename string) (*SSHConfigManager, error) {
	expandedPath := expandHomeDir(filename)

	manager := &SSHConfigManager{
		filename: expandedPath,
	}

	err := manager.Load()
	if err != nil && !os.IsNotExist(err) {
		return nil, &ConfigError{"load", err}
	}

	if os.IsNotExist(err) {
		manager.rawLines = []string{}
	}

	return manager, nil
}

// Load 加载配置文件
func (m *SSHConfigManager) Load() error {
	file, err := os.Open(m.filename)
	if err != nil {
		return err
	}
	defer file.Close()

	var lines []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	if err := scanner.Err(); err != nil {
		return err
	}

	m.rawLines = lines
	return nil
}

// Save 保存配置到文件
func (m *SSHConfigManager) Save() error {
	content := m.BuildConfig()
	err := m.Validate()
	if err != nil {
		return err
	}

	dir := filepath.Dir(m.filename)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return &ConfigError{"mkdir", err}
	}

	if err := os.WriteFile(m.filename, []byte(content), 0o600); err != nil {
		return &ConfigError{"write", err}
	}

	return nil
}

// BuildConfig 构建配置文件内容
func (m *SSHConfigManager) BuildConfig() string {
	return strings.Join(m.rawLines, "\n") + "\n"
}

// GetHost 获取主机配置
func (m *SSHConfigManager) GetHost(hostname string) (*HostConfig, error) {
	hostStart, hostEnd, found := m.findHost(hostname)
	if !found {
		return nil, fmt.Errorf("host %s not found", hostname)
	}

	hostConfig := &HostConfig{
		Name:   hostname,
		Params: make(map[string][]Param),
	}

	if hostEnd == -1 || hostEnd > len(m.rawLines) {
		hostEnd = len(m.rawLines)
	}

	// 检查是否为全局配置
	line := strings.TrimSpace(m.rawLines[hostStart])
	if strings.ToLower(line) == "host *" {
		hostConfig.IsGlobal = true
	}

	// 查找描述信息（Host行之前的注释）
	if hostStart > 0 {
		var comments []string
		for i := hostStart - 1; i >= 0; i-- {
			line := strings.TrimSpace(m.rawLines[i])
			if line == "" {
				break
			}
			if strings.HasPrefix(line, "#") {
				comment := strings.TrimPrefix(line, "#")
				comments = append([]string{strings.TrimSpace(comment)}, comments...)
			} else {
				break
			}
		}
		if len(comments) > 0 {
			hostConfig.Description = strings.Join(comments, " ")
		}
	}

	// 解析主机参数
	for i := hostStart + 1; i < hostEnd && i < len(m.rawLines); i++ {
		line := m.rawLines[i]
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		// 跳过Include等特殊指令
		if strings.HasPrefix(trimmed, "Host ") || strings.HasPrefix(trimmed, "Include ") {
			break
		}

		if key, value := parseParamLine(trimmed); key != "" {
			hostConfig.Params[key] = append(hostConfig.Params[key], Param{
				Key:   key,
				Value: value,
				Line:  i,
				Raw:   line,
			})
		}
	}

	return hostConfig, nil
}

// GetAllHosts 获取所有主机配置（包括全局配置）
func (m *SSHConfigManager) GetAllHosts() ([]*HostConfig, error) {
	var hosts []*HostConfig

	for i := 0; i < len(m.rawLines); i++ {
		line := strings.TrimSpace(m.rawLines[i])
		if strings.HasPrefix(line, "Host ") {
			hostNames := parseHostNames(strings.TrimPrefix(line, "Host"))
			for _, hostName := range hostNames {
				// 处理所有主机，包括全局配置
				host, err := m.GetHost(hostName)
				if err == nil {
					hosts = append(hosts, host)
				}
			}
		}
	}

	return hosts, nil
}

// GetGlobalConfig 获取全局配置 (Host *)
func (m *SSHConfigManager) GetGlobalConfig() (*HostConfig, error) {
	hostStart, hostEnd, found := m.getGlobalHost()
	if !found {
		return nil, fmt.Errorf("global config (Host *) not found")
	}

	hostConfig := &HostConfig{
		Name:     "*",
		Params:   make(map[string][]Param),
		IsGlobal: true,
	}

	if hostEnd == -1 || hostEnd > len(m.rawLines) {
		hostEnd = len(m.rawLines)
	}

	// 解析全局参数
	for i := hostStart + 1; i < hostEnd && i < len(m.rawLines); i++ {
		line := m.rawLines[i]
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		// 跳过Include等特殊指令
		if strings.HasPrefix(trimmed, "Host ") || strings.HasPrefix(trimmed, "Include ") {
			break
		}

		if key, value := parseParamLine(trimmed); key != "" {
			hostConfig.Params[key] = append(hostConfig.Params[key], Param{
				Key:   key,
				Value: value,
				Line:  i,
				Raw:   line,
			})
		}
	}

	return hostConfig, nil
}

// AddHost 添加新的主机配置（在文件末尾）
func (m *SSHConfigManager) AddHost(hostname string) *HostConfig {
	hostConfig := &HostConfig{
		Name:   hostname,
		Params: make(map[string][]Param),
	}

	// 如果文件不为空且最后一行不是空行，添加空行分隔
	if len(m.rawLines) > 0 && strings.TrimSpace(m.rawLines[len(m.rawLines)-1]) != "" {
		m.rawLines = append(m.rawLines, "")
	}

	// 添加Host行
	hostLine := fmt.Sprintf("Host %s", hostname)
	m.rawLines = append(m.rawLines, hostLine)

	return hostConfig
}

// SetParam 设置主机参数
func (m *SSHConfigManager) SetParam(hostname, key, value string) error {
	if hostname == "" || key == "" {
		return &ConfigError{"set_param", fmt.Errorf("hostname and key cannot be empty")}
	}

	hostStart, hostEnd, found := m.findHost(hostname)
	if !found {
		// 如果主机不存在，先添加主机
		m.AddHost(hostname)
		hostStart, hostEnd, _ = m.findHost(hostname)
	}

	// 查找是否已存在该参数
	paramLine := m.findParamInHost(hostStart, hostEnd, key)
	if paramLine != -1 {
		// 更新现有参数
		indent := getLineIndent(m.rawLines[paramLine])
		m.rawLines[paramLine] = fmt.Sprintf("%s%s %s", indent, key, value)
	} else {
		// 添加新参数（在Host行之后）
		newLine := fmt.Sprintf("  %s %s", key, value)
		insertPos := hostStart + 1
		if insertPos >= len(m.rawLines) {
			m.rawLines = append(m.rawLines, newLine)
		} else {
			// 在Host块中插入新行
			lines := append([]string{}, m.rawLines[:insertPos]...)
			lines = append(lines, newLine)
			lines = append(lines, m.rawLines[insertPos:]...)
			m.rawLines = lines
		}
	}

	return nil
}

// RemoveParam 移除主机参数
func (m *SSHConfigManager) RemoveParam(hostname, key string) error {
	if hostname == "" || key == "" {
		return &ConfigError{"remove_param", fmt.Errorf("hostname and key cannot be empty")}
	}

	hostStart, hostEnd, found := m.findHost(hostname)
	if !found {
		return &ConfigError{"remove_param", fmt.Errorf("host %s not found", hostname)}
	}

	paramLine := m.findParamInHost(hostStart, hostEnd, key)
	if paramLine != -1 {
		// 删除参数行
		m.rawLines = append(m.rawLines[:paramLine], m.rawLines[paramLine+1:]...)
	}

	return nil
}

// RemoveHost 移除主机配置
func (m *SSHConfigManager) RemoveHost(hostname string) error {
	if hostname == "" {
		return &ConfigError{"remove_host", fmt.Errorf("hostname cannot be empty")}
	}

	hostStart, hostEnd, found := m.findHost(hostname)
	if !found {
		return &ConfigError{"remove_host", fmt.Errorf("host %s not found", hostname)}
	}

	// 删除主机块（包括前后空行）
	start := hostStart
	end := hostEnd

	// 包含前面的空行
	for start > 0 && isBlankLine(m.rawLines[start-1]) {
		start--
	}

	// 包含后面的空行
	for end < len(m.rawLines) && isBlankLine(m.rawLines[end]) {
		end++
	}

	m.rawLines = append(m.rawLines[:start], m.rawLines[end:]...)
	return nil
}

// GetParam 获取主机参数值
func (m *SSHConfigManager) GetParam(hostname, key string) (string, error) {
	hostStart, hostEnd, found := m.findHost(hostname)
	if !found {
		return "", &ConfigError{"get_param", fmt.Errorf("host %s not found", hostname)}
	}

	if hostEnd == -1 || hostEnd > len(m.rawLines) {
		hostEnd = len(m.rawLines)
	}

	// 在主机块中查找参数
	for i := hostStart + 1; i < hostEnd && i < len(m.rawLines); i++ {
		line := strings.TrimSpace(m.rawLines[i])
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		if strings.HasPrefix(line, "Host ") || strings.HasPrefix(line, "Include ") {
			break
		}

		if paramKey, paramValue := parseParamLine(line); paramKey != "" {
			if strings.EqualFold(paramKey, key) {
				return paramValue, nil
			}
		}
	}

	return "", &ConfigError{"get_param", fmt.Errorf("parameter %s not found for host %s", key, hostname)}
}

// HasHost 检查主机是否存在
func (m *SSHConfigManager) HasHost(hostname string) bool {
	_, _, found := m.findHost(hostname)
	return found
}

// GetHostNames 获取所有主机名（包括*）
func (m *SSHConfigManager) GetHostNames() ([]string, error) {
	var hostNames []string

	for i := 0; i < len(m.rawLines); i++ {
		line := strings.TrimSpace(m.rawLines[i])
		if strings.HasPrefix(line, "Host ") {
			names := parseHostNames(strings.TrimPrefix(line, "Host"))
			hostNames = append(hostNames, names...)
		}
	}

	return hostNames, nil
}

// AddComment 为主机添加注释
func (m *SSHConfigManager) AddComment(hostname, comment string) error {
	hostStart, _, found := m.findHost(hostname)
	if !found {
		return &ConfigError{"add_comment", fmt.Errorf("host %s not found", hostname)}
	}

	commentLine := fmt.Sprintf("# %s", comment)

	// 在Host行之前插入注释
	lines := append([]string{}, m.rawLines[:hostStart]...)
	lines = append(lines, commentLine)
	lines = append(lines, m.rawLines[hostStart:]...)
	m.rawLines = lines

	return nil
}

// Validate 验证配置文件语法
// Validate 验证配置文件语法
func (m *SSHConfigManager) Validate() error {
	validator := NewConfigValidator(m.rawLines)
	return validator.Validate()
}

// Backup 创建配置文件备份
func (m *SSHConfigManager) Backup() (string, error) {
	backupPath := m.filename + ".bak"
	content := m.BuildConfig()

	if err := os.WriteFile(backupPath, []byte(content), 0o600); err != nil {
		return "", &ConfigError{"backup", err}
	}

	return backupPath, nil
}

// GetIncludes 获取所有Include指令
func (m *SSHConfigManager) GetIncludes() []string {
	var includes []string

	for _, line := range m.rawLines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "Include ") {
			includePath := strings.TrimPrefix(trimmed, "Include ")
			includes = append(includes, includePath)
		}
	}

	return includes
}

// AddInclude 添加Include指令（在文件开头）
func (m *SSHConfigManager) AddInclude(includePath string) {
	includeLine := fmt.Sprintf("Include %s", includePath)

	// 在文件开头添加Include指令（在现有的Include之后或文件开头）
	insertPos := 0
	for i, line := range m.rawLines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "Include ") {
			insertPos = i + 1
		} else if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
			break
		}
	}

	lines := append([]string{}, m.rawLines[:insertPos]...)
	lines = append(lines, includeLine)
	lines = append(lines, m.rawLines[insertPos:]...)
	m.rawLines = lines
}

// SetGlobalParam 设置全局参数
func (m *SSHConfigManager) SetGlobalParam(key, value string) error {
	return m.SetParam("*", key, value)
}

// GetGlobalParam 获取全局参数值
func (m *SSHConfigManager) GetGlobalParam(key string) (string, error) {
	return m.GetParam("*", key)
}

// getGlobalHost 查找全局配置Host *
func (m *SSHConfigManager) getGlobalHost() (start, end int, found bool) {
	for i, line := range m.rawLines {
		trimmed := strings.TrimSpace(line)
		if strings.ToLower(trimmed) == "host *" {
			start = i
			// 查找结束位置（下一个Host或文件结尾）
			for j := i + 1; j < len(m.rawLines); j++ {
				nextLine := strings.TrimSpace(m.rawLines[j])
				if strings.HasPrefix(nextLine, "Host ") {
					end = j
					return start, end, true
				}
			}
			end = len(m.rawLines)
			return start, end, true
		}
	}
	return -1, -1, false
}

// Helper methods

// findHost 查找主机配置的开始和结束行号
func (m *SSHConfigManager) findHost(hostname string) (start, end int, found bool) {
	// 首先尝试精确匹配
	for i, line := range m.rawLines {
		trimmed := strings.TrimSpace(line)
		if after, ok := strings.CutPrefix(trimmed, "Host "); ok {
			hostLine := after
			hostNames := parseHostNames(hostLine)
			for _, name := range hostNames {
				// 精确匹配
				if name == hostname {
					start = i
					// 查找结束位置（下一个Host或文件结尾）
					for j := i + 1; j < len(m.rawLines); j++ {
						nextLine := strings.TrimSpace(m.rawLines[j])
						if strings.HasPrefix(nextLine, "Host ") {
							end = j
							return start, end, true
						}
					}
					end = len(m.rawLines)
					return start, end, true
				}
			}
		}
	}

	// 如果没有精确匹配，查找通配符匹配
	for i, line := range m.rawLines {
		trimmed := strings.TrimSpace(line)
		if after, ok := strings.CutPrefix(trimmed, "Host "); ok {
			hostLine := after
			hostNames := parseHostNames(hostLine)
			for _, name := range hostNames {
				// 通配符匹配（除了单独的*）
				if name != "*" && matchHostName(name, hostname) {
					start = i
					// 查找结束位置（下一个Host或文件结尾）
					for j := i + 1; j < len(m.rawLines); j++ {
						nextLine := strings.TrimSpace(m.rawLines[j])
						if strings.HasPrefix(nextLine, "Host ") {
							end = j
							return start, end, true
						}
					}
					end = len(m.rawLines)
					return start, end, true
				}
			}
		}
	}

	// 注意：不再自动匹配Host *，让调用者决定是否需要全局配置

	return -1, -1, false
}

// findParamInHost 在主机配置块中查找参数
func (m *SSHConfigManager) findParamInHost(start, end int, key string) int {
	if end == -1 || end > len(m.rawLines) {
		end = len(m.rawLines)
	}

	for i := start + 1; i < end && i < len(m.rawLines); i++ {
		line := strings.TrimSpace(m.rawLines[i])
		if strings.HasPrefix(line, key+" ") || strings.HasPrefix(line, key+"\t") ||
			strings.HasPrefix(line, key+"=") {
			return i
		}
		// 遇到下一个Host或Include时停止
		if strings.HasPrefix(line, "Host ") || strings.HasPrefix(line, "Include ") {
			break
		}
	}
	return -1
}

// expandHomeDir 展开家目录路径
func expandHomeDir(path string) string {
	if strings.HasPrefix(path, "~") {
		home, err := os.UserHomeDir()
		if err == nil {
			return filepath.Join(home, path[1:])
		}
	}
	return path
}

// GetRawLines 获取原始行（用于调试）
func (m *SSHConfigManager) GetRawLines() []string {
	// 返回副本，避免外部修改内部状态
	lines := make([]string, len(m.rawLines))
	copy(lines, m.rawLines)
	return lines
}

// Helper functions

// parseHostNames 解析Host行中的主机名列表
// parseHostNames 解析Host行中的主机名列表
// parseHostNames 解析Host行中的主机名列表（改进版）
func parseHostNames(hostLine string) []string {
	var names []string

	// 简化版本：使用strings.Fields然后处理引号
	fields := strings.Fields(hostLine)
	for _, field := range fields {
		// 移除首尾的引号
		trimmed := strings.Trim(field, "\"'")
		if trimmed != "" {
			names = append(names, trimmed)
		}
	}

	return names
}

// matchHostName 检查主机名是否匹配（支持通配符）
func matchHostName(pattern, hostname string) bool {
	// 精确匹配
	if pattern == hostname {
		return true
	}

	// 支持简单的*通配符（但不包括单独的*）
	if strings.Contains(pattern, "*") && pattern != "*" {
		regexPattern := strings.ReplaceAll(regexp.QuoteMeta(pattern), `\*`, `.*`)
		matched, _ := regexp.MatchString("^"+regexPattern+"$", hostname)
		return matched
	}

	return false
}

// parseParamLine 解析参数行
func parseParamLine(line string) (key, value string) {
	// 移除行首的空白
	line = strings.TrimSpace(line)

	// 忽略注释行和特殊指令
	if strings.HasPrefix(line, "#") || strings.HasPrefix(line, "Host ") || strings.HasPrefix(line, "Include ") {
		return "", ""
	}

	// 支持 key=value 和 key value 两种格式
	var parts []string
	if strings.Contains(line, "=") && !strings.Contains(line, " ") {
		parts = strings.SplitN(line, "=", 2)
	} else {
		parts = strings.Fields(line)
	}

	if len(parts) >= 2 {
		key = parts[0]
		value = strings.Join(parts[1:], " ")
		return key, value
	} else if len(parts) == 1 {
		key = parts[0]
		return key, ""
	}

	return "", ""
}

// getLineIndent 获取行的缩进
func getLineIndent(line string) string {
	for i, char := range line {
		if char != ' ' && char != '\t' {
			return line[:i]
		}
	}
	return line
}

// isBlankLine 检查是否为空行
func isBlankLine(line string) bool {
	return strings.TrimSpace(line) == ""
}
