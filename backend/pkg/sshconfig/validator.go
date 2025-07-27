package sshconfig

import (
	"fmt"
	"strings"
)

// ConfigValidator SSH配置验证器
type ConfigValidator struct {
	lines []string
}

// NewConfigValidator 创建新的配置验证器
func NewConfigValidator(lines []string) *ConfigValidator {
	return &ConfigValidator{
		lines: lines,
	}
}

// Validate 验证配置文件语法
func (v *ConfigValidator) Validate() error {
	for i, line := range v.lines {
		lineNumber := i + 1
		trimmed := strings.TrimSpace(line)

		// 跳过空行和注释行
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		// 验证配置行
		if err := v.validateConfigLine(line, lineNumber); err != nil {
			return err
		}
	}

	return nil
}

// validateConfigLine 验证单个配置行
func (v *ConfigValidator) validateConfigLine(line string, lineNumber int) error {
	// Host指令验证 - 检查原始行是否以"Host "开头
	if strings.HasPrefix(line, "Host ") {
		return v.validateHostLine(line, lineNumber)
	}

	// Include指令验证
	if strings.HasPrefix(line, "Include ") {
		return v.validateIncludeLine(line, lineNumber)
	}

	// Match指令验证（可选支持）
	if strings.HasPrefix(line, "Match ") {
		return v.validateMatchLine(line, lineNumber)
	}

	// 参数行验证
	return v.validateParamLine(line, lineNumber)
}

// validateHostLine 验证Host行
func (v *ConfigValidator) validateHostLine(line string, lineNumber int) error {
	if !strings.HasPrefix(line, "Host ") {
		return &ConfigError{"validate", fmt.Errorf("line %d: not a valid Host line", lineNumber)}
	}

	hostPart := strings.TrimPrefix(line, "Host ")
	trimmedHostPart := strings.TrimSpace(hostPart)

	if trimmedHostPart == "" {
		return &ConfigError{"validate", fmt.Errorf("line %d: Host directive requires at least one hostname", lineNumber)}
	}

	// 验证主机名格式
	hostNames := parseHostNames(trimmedHostPart)
	if len(hostNames) == 0 {
		return &ConfigError{"validate", fmt.Errorf("line %d: Host directive requires at least one hostname", lineNumber)}
	}

	for _, hostname := range hostNames {
		if err := v.validateHostname(hostname); err != nil {
			return &ConfigError{"validate", fmt.Errorf("line %d: invalid hostname '%s': %v", lineNumber, hostname, err)}
		}
	}

	return nil
}

// validateIncludeLine 验证Include行
func (v *ConfigValidator) validateIncludeLine(line string, lineNumber int) error {
	if !strings.HasPrefix(line, "Include ") {
		return &ConfigError{"validate", fmt.Errorf("line %d: not a valid Include line", lineNumber)}
	}

	includePart := strings.TrimPrefix(line, "Include ")
	trimmedIncludePart := strings.TrimSpace(includePart)

	if trimmedIncludePart == "" {
		return &ConfigError{"validate", fmt.Errorf("line %d: Include directive requires a path", lineNumber)}
	}

	// 基本路径格式验证
	if strings.Contains(includePart, "\n") {
		return &ConfigError{"validate", fmt.Errorf("line %d: Include path cannot contain newlines", lineNumber)}
	}

	return nil
}

// validateParamLine 验证参数行
func (v *ConfigValidator) validateParamLine(line string, lineNumber int) error {
	trimmed := strings.TrimSpace(line)

	// 参数行必须有缩进（空格或制表符）
	if len(line) > 0 && line[0] != ' ' && line[0] != '\t' {
		return &ConfigError{"validate", fmt.Errorf("line %d: parameter lines must be indented", lineNumber)}
	}

	// 解析参数
	key, value := parseParamLine(trimmed)
	if key == "" && trimmed != "" {
		return &ConfigError{"validate", fmt.Errorf("line %d: invalid parameter format", lineNumber)}
	}

	// 验证参数值（基本验证）
	if err := v.validateParamValue(key, value, lineNumber); err != nil {
		return err
	}

	return nil
}

// validateMatchLine 验证Match行
// validateMatchLine 验证Match行
func (v *ConfigValidator) validateMatchLine(line string, lineNumber int) error {
	matchPart := strings.TrimPrefix(strings.TrimSpace(line), "Match ")
	if strings.TrimSpace(matchPart) == "" {
		return &ConfigError{"validate", fmt.Errorf("line %d: Match directive requires criteria", lineNumber)}
	}
	// 基本验证
	validCriteria := []string{"User", "Host", "Address", "LocalAddress", "LocalPort", "RDomain", "Canonical", "All"}
	criteria := strings.Fields(matchPart)
	for i := 0; i < len(criteria); i += 2 {
		if i+1 >= len(criteria) {
			return &ConfigError{"validate", fmt.Errorf("line %d: Match criteria incomplete", lineNumber)}
		}
		criterion := criteria[i]
		value := criteria[i+1]
		valid := false
		for _, validCriterion := range validCriteria {
			if strings.EqualFold(criterion, validCriterion) {
				valid = true
				break
			}
		}
		if !valid {
			return &ConfigError{"validate", fmt.Errorf("line %d: invalid Match criterion '%s'", lineNumber, criterion)}
		}
		// 验证值格式
		// 去除首尾空格和引号后检查是否为空
		finalValue := strings.Trim(strings.TrimSpace(value), "\"'")
		if finalValue == "" {
			return &ConfigError{"validate", fmt.Errorf("line %d: Match criterion '%s' requires a value", lineNumber, criterion)}
		}
	}
	return nil
}

// validateParamValue 验证参数值
func (v *ConfigValidator) validateParamValue(key, value string, lineNumber int) error {
	lowerKey := strings.ToLower(key)
	// 检查必需提供值的参数
	switch lowerKey {
	case "identityfile", "hostname", "user", "proxycommand": // 添加其他必需参数
		if strings.TrimSpace(value) == "" {
			return &ConfigError{"validate", fmt.Errorf("line %d: %s requires a value", lineNumber, key)}
		}
	}

	// 常见参数的值验证
	switch lowerKey {
	case "port":
		if value != "" {
			if !v.isNumeric(value) {
				return &ConfigError{"validate", fmt.Errorf("line %d: Port must be numeric", lineNumber)}
			}
			port := v.parseInt(value)
			if port < 1 || port > 65535 {
				return &ConfigError{"validate", fmt.Errorf("line %d: Port must be between 1 and 65535", lineNumber)}
			}
		}
	case "serveraliveinterval", "serveralivemaxcount", "connecttimeout":
		if value != "" && !v.isNumeric(value) {
			return &ConfigError{"validate", fmt.Errorf("line %d: %s must be numeric", lineNumber, key)}
		}
	case "compression", "tcpkeepalive", "usedns", "useprivilegedport", "stricthostkeychecking":
		if value != "" && !v.isValidYesNo(value) {
			return &ConfigError{"validate", fmt.Errorf("line %d: %s must be 'yes' or 'no'", lineNumber, key)}
		}
	case "protocol":
		if value != "" && value != "1" && value != "2" {
			return &ConfigError{"validate", fmt.Errorf("line %d: Protocol must be '1' or '2'", lineNumber)}
		}
	}

	return nil
}

// validateHostname 验证主机名格式
func (v *ConfigValidator) validateHostname(hostname string) error {
	if hostname == "" {
		return fmt.Errorf("hostname cannot be empty")
	}

	// 通配符是允许的
	if hostname == "*" {
		return nil
	}

	// 基本格式检查
	if len(hostname) > 253 {
		return fmt.Errorf("hostname too long")
	}

	// 不进行严格的DNS格式验证，因为SSH配置允许各种格式
	return nil
}

// 辅助验证函数
func (v *ConfigValidator) isNumeric(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func (v *ConfigValidator) parseInt(s string) int {
	result := 0
	for _, c := range s {
		result = result*10 + int(c-'0')
	}
	return result
}

func (v *ConfigValidator) isValidYesNo(s string) bool {
	lower := strings.ToLower(s)
	return lower == "yes" || lower == "no" || lower == "true" || lower == "false"
}
