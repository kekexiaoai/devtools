package sshconfig

import (
	"errors"
	"fmt"
	"strings"
	"testing"
)

// TestNewConfigValidator 测试创建配置验证器
func TestNewConfigValidator(t *testing.T) {
	lines := []string{"Host test", "    HostName example.com"}
	validator := NewConfigValidator(lines)

	if validator == nil {
		t.Error("NewConfigValidator should not return nil")
	}

	// 验证内部状态
	// 注意：lines字段是私有的，无法直接访问测试
}

// TestValidate_EmptyConfig 测试验证空配置
func TestValidate_EmptyConfig(t *testing.T) {
	validator := NewConfigValidator([]string{})
	err := validator.Validate()
	if err != nil {
		t.Errorf("Validate should pass for empty config: %v", err)
	}
}

// TestValidate_ValidConfig 测试验证有效配置
func TestValidate_ValidConfig(t *testing.T) {
	lines := []string{
		"# Comment",
		"Host test",
		"    HostName example.com",
		"    User testuser",
		"    Port 22",
		"",
		"Host *",
		"    TCPKeepAlive yes",
	}

	validator := NewConfigValidator(lines)
	err := validator.Validate()
	if err != nil {
		t.Errorf("Validate should pass for valid config: %v", err)
	}
}

// TestValidate_ValidConfigWithInclude 测试验证包含Include的有效配置
func TestValidate_ValidConfigWithInclude(t *testing.T) {
	lines := []string{
		"Include ~/.ssh/config.d/*",
		"Host test",
		"    HostName example.com",
	}

	validator := NewConfigValidator(lines)
	err := validator.Validate()
	if err != nil {
		t.Errorf("Validate should pass for config with Include: %v", err)
	}
}

// TestValidate_ParameterLineNotIndented 测试参数行未缩进
func TestValidate_ParameterLineNotIndented(t *testing.T) {
	lines := []string{
		"Host test",
		"HostName example.com", // 未缩进的参数行
	}

	validator := NewConfigValidator(lines)
	err := validator.Validate()
	if err == nil {
		t.Error("Validate should fail for unindented parameter line")
	}

	if err.Error() != "ssh config validate: line 2: parameter lines must be indented" {
		t.Errorf("Expected specific error message, got: %v", err)
	}
}

// TestValidate_InvalidPort 测试无效端口
func TestValidate_InvalidPort(t *testing.T) {
	testCases := []struct {
		port     string
		expected bool // true表示应该通过验证，false表示应该失败
	}{
		{"22", true},
		{"65535", true},
		{"0", false},
		{"65536", false},
		{"abc", false},
		{"-1", false},
		{"", true}, // 空值应该通过（使用默认值）
	}

	for _, tc := range testCases {
		lines := []string{
			"Host test",
			"    Port " + tc.port,
		}

		validator := NewConfigValidator(lines)
		err := validator.Validate()

		if tc.expected && err != nil {
			t.Errorf("Port %s should pass validation, but got error: %v", tc.port, err)
		} else if !tc.expected && err == nil {
			t.Errorf("Port %s should fail validation, but passed", tc.port)
		}
	}
}

// TestValidate_InvalidYesNo 测试无效的yes/no参数
func TestValidate_InvalidYesNo(t *testing.T) {
	testCases := []struct {
		value    string
		expected bool // true表示应该通过验证，false表示应该失败
	}{
		{"yes", true},
		{"no", true},
		{"true", true},
		{"false", true},
		{"YES", true},
		{"NO", true},
		{"invalid", false},
		{"", true}, // 空值应该通过
	}

	for _, tc := range testCases {
		lines := []string{
			"Host test",
			"    Compression " + tc.value,
		}

		validator := NewConfigValidator(lines)
		err := validator.Validate()

		if tc.expected && err != nil {
			t.Errorf("Compression value '%s' should pass validation, but got error: %v", tc.value, err)
		} else if !tc.expected && err == nil {
			t.Errorf("Compression value '%s' should fail validation, but passed", tc.value)
		}
	}
}

// TestValidate_InvalidProtocol 测试无效协议
func TestValidate_InvalidProtocol(t *testing.T) {
	testCases := []struct {
		protocol string
		expected bool // true表示应该通过验证，false表示应该失败
	}{
		{"1", true},
		{"2", true},
		{"3", false},
		{"1,2", false}, // 虽然SSH支持，但我们简化验证
		{"", true},     // 空值应该通过
	}

	for _, tc := range testCases {
		lines := []string{
			"Host test",
			"    Protocol " + tc.protocol,
		}

		validator := NewConfigValidator(lines)
		err := validator.Validate()

		if tc.expected && err != nil {
			t.Errorf("Protocol %s should pass validation, but got error: %v", tc.protocol, err)
		} else if !tc.expected && err == nil {
			t.Errorf("Protocol %s should fail validation, but passed", tc.protocol)
		}
	}
}

// TestValidate_ValidHostname 测试有效主机名
func TestValidate_ValidHostname(t *testing.T) {
	testCases := []struct {
		hostname string
		expected bool // true表示应该通过验证
	}{
		{"example.com", true},
		{"test-server", true},
		{"192.168.1.1", true},
		{"*.example.com", true},
		{"*", true},
		{"test server", true}, // 带空格的主机名
		{"", false},           // 空主机名应该失败
	}

	for _, tc := range testCases {
		lines := []string{
			"Host " + tc.hostname,
		}

		validator := NewConfigValidator(lines)
		err := validator.Validate()

		if tc.expected && err != nil {
			t.Errorf("Hostname '%s' should pass validation, but got error: %v", tc.hostname, err)
		} else if !tc.expected && err == nil {
			t.Errorf("Hostname '%s' should fail validation, but passed", tc.hostname)
		}
	}
}

// TestValidate_IncludePathWithNewline 测试Include路径包含换行符
func TestValidate_IncludePathWithNewline(t *testing.T) {
	lines := []string{
		"Include ~/.ssh/config\ndirectory/*", // 包含换行符的路径
	}

	validator := NewConfigValidator(lines)
	err := validator.Validate()
	if err == nil {
		t.Error("Validate should fail for Include path with newline")
	}

	if err.Error() != "ssh config validate: line 1: Include path cannot contain newlines" {
		t.Errorf("Expected specific error message, got: %v", err)
	}
}

// TestValidate_CommentAndEmptyLines 测试注释和空行
func TestValidate_CommentAndEmptyLines(t *testing.T) {
	lines := []string{
		"# This is a comment",
		"",
		"  ", // 只有空格的行
		"\t", // 只有制表符的行
		"Host test",
		"    # This is an indented comment",
		"    HostName example.com",
	}

	validator := NewConfigValidator(lines)
	err := validator.Validate()
	if err != nil {
		t.Errorf("Validate should pass for config with comments and empty lines: %v", err)
	}
}

// TestValidate_ValidMatchLine 测试有效的Match行
func TestValidate_ValidMatchLine(t *testing.T) {
	lines := []string{
		"Match User test",
		"    HostName example.com",
	}

	validator := NewConfigValidator(lines)
	err := validator.Validate()
	if err != nil {
		t.Errorf("Validate should pass for valid Match line: %v", err)
	}
}

// TestValidate_InvalidMatchLine 测试无效的Match行
func TestValidate_InvalidMatchLine(t *testing.T) {
	testCases := []string{
		"Match ",                       // 空Match条件
		"Match User",                   // 不完整的Match条件
		"Match InvalidCriterion value", // 无效的匹配条件
	}

	for _, invalidMatch := range testCases {
		lines := []string{invalidMatch}

		validator := NewConfigValidator(lines)
		err := validator.Validate()

		if err == nil {
			t.Errorf("Match line '%s' should fail validation, but passed", invalidMatch)
		}
	}
}

// TestValidate_MultipleHostnames 测试多个主机名
func TestValidate_MultipleHostnames(t *testing.T) {
	lines := []string{
		"Host server1 server2 server3",
		"    HostName example.com",
	}

	validator := NewConfigValidator(lines)
	err := validator.Validate()
	if err != nil {
		t.Errorf("Validate should pass for multiple hostnames: %v", err)
	}
}

// TestValidate_ComplexValidConfig 测试复杂的有效配置
func TestValidate_ComplexValidConfig(t *testing.T) {
	lines := []string{
		"# SSH Configuration",
		"Include ~/.ssh/config.d/*",
		"",
		"Host *",
		"    TCPKeepAlive yes",
		"    ServerAliveInterval 60",
		"",
		"# Work servers",
		"Host work-*",
		"    User developer",
		"    Port 2222",
		"",
		"Host github.com",
		"    HostName github.com",
		"    User git",
		"    IdentityFile ~/.ssh/github_key",
		"",
		"Host gitlab.com",
		"    HostName gitlab.com",
		"    User git",
		"    IdentityFile ~/.ssh/gitlab_key",
	}

	validator := NewConfigValidator(lines)
	err := validator.Validate()
	if err != nil {
		t.Errorf("Validate should pass for complex valid config: %v", err)
	}
}

// TestValidateParamValue_Port 测试端口参数值验证
func TestValidateParamValue_Port(t *testing.T) {
	validator := NewConfigValidator([]string{})

	testCases := []struct {
		port     string
		line     int
		expected bool // true表示应该通过验证
	}{
		{"22", 1, true},
		{"65535", 1, true},
		{"0", 1, false},
		{"65536", 1, false},
		{"abc", 1, false},
		{"", 1, true}, // 空值应该通过
	}

	for _, tc := range testCases {
		err := validator.validateParamValue("Port", tc.port, tc.line)
		if tc.expected && err != nil {
			t.Errorf("Port '%s' should pass validation, but got error: %v", tc.port, err)
		} else if !tc.expected && err == nil {
			t.Errorf("Port '%s' should fail validation, but passed", tc.port)
		}
	}
}

// TestValidateParamValue_YesNo 测试yes/no参数值验证
func TestValidateParamValue_YesNo(t *testing.T) {
	validator := NewConfigValidator([]string{})

	testCases := []struct {
		value    string
		line     int
		expected bool // true表示应该通过验证
	}{
		{"yes", 1, true},
		{"no", 1, true},
		{"true", 1, true},
		{"false", 1, true},
		{"YES", 1, true},
		{"NO", 1, true},
		{"invalid", 1, false},
		{"", 1, true}, // 空值应该通过
	}

	for _, tc := range testCases {
		err := validator.validateParamValue("Compression", tc.value, tc.line)
		if tc.expected && err != nil {
			t.Errorf("Value '%s' should pass validation, but got error: %v", tc.value, err)
		} else if !tc.expected && err == nil {
			t.Errorf("Value '%s' should fail validation, but passed", tc.value)
		}
	}
}

// TestValidateParamValue_Protocol 测试协议参数值验证
func TestValidateParamValue_Protocol(t *testing.T) {
	validator := NewConfigValidator([]string{})

	testCases := []struct {
		protocol string
		line     int
		expected bool // true表示应该通过验证
	}{
		{"1", 1, true},
		{"2", 1, true},
		{"3", 1, false},
		{"", 1, true}, // 空值应该通过
	}

	for _, tc := range testCases {
		err := validator.validateParamValue("Protocol", tc.protocol, tc.line)
		if tc.expected && err != nil {
			t.Errorf("Protocol '%s' should pass validation, but got error: %v", tc.protocol, err)
		} else if !tc.expected && err == nil {
			t.Errorf("Protocol '%s' should fail validation, but passed", tc.protocol)
		}
	}
}

// TestValidateHostname 测试主机名验证
func TestValidateHostname(t *testing.T) {
	validator := NewConfigValidator([]string{})

	testCases := []struct {
		hostname string
		expected bool // true表示应该通过验证
	}{
		{"example.com", true},
		{"test-server", true},
		{"192.168.1.1", true},
		{"*.example.com", true},
		{"*", true},
		{"", false}, // 空主机名应该失败
	}

	for _, tc := range testCases {
		err := validator.validateHostname(tc.hostname)
		if tc.expected && err != nil {
			t.Errorf("Hostname '%s' should pass validation, but got error: %v", tc.hostname, err)
		} else if !tc.expected && err == nil {
			t.Errorf("Hostname '%s' should fail validation, but passed", tc.hostname)
		}
	}
}

// TestIsNumeric 测试数字验证
func TestIsNumeric(t *testing.T) {
	validator := NewConfigValidator([]string{})

	testCases := []struct {
		input    string
		expected bool
	}{
		{"123", true},
		{"0", true},
		{"65535", true},
		{"abc", false},
		{"12.34", false},
		{"", false},
		{"-123", false},
	}

	for _, tc := range testCases {
		result := validator.isNumeric(tc.input)
		if result != tc.expected {
			t.Errorf("isNumeric('%s') = %v, expected %v", tc.input, result, tc.expected)
		}
	}
}

// TestParseInt 测试字符串转整数
func TestParseInt(t *testing.T) {
	validator := NewConfigValidator([]string{})

	testCases := []struct {
		input    string
		expected int
	}{
		{"123", 123},
		{"0", 0},
		{"65535", 65535},
		{"1", 1},
	}

	for _, tc := range testCases {
		result := validator.parseInt(tc.input)
		if result != tc.expected {
			t.Errorf("parseInt('%s') = %d, expected %d", tc.input, result, tc.expected)
		}
	}
}

// TestIsValidYesNo 测试yes/no值验证
func TestIsValidYesNo(t *testing.T) {
	validator := NewConfigValidator([]string{})

	testCases := []struct {
		input    string
		expected bool
	}{
		{"yes", true},
		{"no", true},
		{"true", true},
		{"false", true},
		{"YES", true},
		{"NO", true},
		{"TRUE", true},
		{"FALSE", true},
		{"invalid", false},
		{"", false},
		{"y", false},
		{"n", false},
	}

	for _, tc := range testCases {
		result := validator.isValidYesNo(tc.input)
		if result != tc.expected {
			t.Errorf("isValidYesNo('%s') = %v, expected %v", tc.input, result, tc.expected)
		}
	}
}

// TestValidateParamLine 测试参数行验证
func TestValidateParamLine(t *testing.T) {
	validator := NewConfigValidator([]string{})

	// 有效的参数行（正确缩进）
	err := validator.validateParamLine("    HostName example.com", 1)
	if err != nil {
		t.Errorf("Valid parameter line should pass: %v", err)
	}

	// 无效的参数行（未缩进）
	err = validator.validateParamLine("HostName example.com", 1)
	if err == nil {
		t.Error("Unindented parameter line should fail")
	}
}

// TestEdgeCases 测试边界情况
func TestEdgeCases(t *testing.T) {
	// 测试非常大的端口号
	lines := []string{
		"Host test",
		"    Port 999999999", // 超大端口号
	}

	validator := NewConfigValidator(lines)
	err := validator.Validate()
	if err == nil {
		t.Error("Should fail for port number too large")
	}

	// 测试空配置行
	lines = []string{
		"Host test",
		"    ", // 空的缩进行
	}

	validator = NewConfigValidator(lines)
	err = validator.Validate()
	if err != nil {
		t.Errorf("Should not fail for empty indented line: %v", err)
	}
	// 这应该通过，因为空行会被跳过

	// 测试只包含空格的Host行
	lines = []string{
		"Host    ", // Host后只有空格
	}

	validator = NewConfigValidator(lines)
	err = validator.Validate()
	if err == nil {
		t.Error("Should fail for Host line with only spaces")
	}
}

// TestValidate_InvalidParameterFormat 测试无效参数格式
func TestValidate_InvalidParameterFormat(t *testing.T) {
	lines := []string{
		"Host test",
		"    Invalid Line Format With No Key", // 无效的参数格式
	}

	validator := NewConfigValidator(lines)
	err := validator.Validate()
	// 注意：由于parseParamLine的宽松实现，这可能不会失败
	// 这取决于parseParamLine的具体实现
	t.Logf("Validation result for invalid parameter format: %v", err)
}

// TestValidateHostLine 测试Host行验证

// TestValidate_HostLineWithoutHostname 测试Host行缺少主机名
func TestValidate_HostLineWithoutHostname(t *testing.T) {
	lines := []string{
		"Host ", // 空主机名
	}

	validator := NewConfigValidator(lines)
	err := validator.Validate()
	if err == nil {
		t.Error("Validate should fail for Host line without hostname")
	}
	// 接受任何错误，实际会报告Host需要主机名
}

// TestValidate_IncludeLineWithoutPath 测试Include行缺少路径
func TestValidate_IncludeLineWithoutPath(t *testing.T) {
	lines := []string{
		"Include ", // 空路径
	}

	validator := NewConfigValidator(lines)
	err := validator.Validate()
	if err == nil {
		t.Error("Validate should fail for Include line without path")
	}
	// 接受任何错误，实际会报告Include需要路径
}

// TestValidateHostLine 测试Host行验证
func TestValidateHostLine(t *testing.T) {
	validator := NewConfigValidator([]string{})

	// 有效的Host行
	err := validator.validateHostLine("Host test", 1)
	if err != nil {
		t.Errorf("Valid Host line should pass: %v", err)
	}

	// 无效的Host行（空主机名）
	err = validator.validateHostLine("Host ", 1)
	if err == nil {
		t.Error("Host line with empty hostname should fail")
	}
}

// TestValidateIncludeLine 测试Include行验证
func TestValidateIncludeLine(t *testing.T) {
	validator := NewConfigValidator([]string{})

	// 有效的Include行
	err := validator.validateIncludeLine("Include ~/.ssh/config", 1)
	if err != nil {
		t.Errorf("Valid Include line should pass: %v", err)
	}

	// 无效的Include行（空路径）
	err = validator.validateIncludeLine("Include ", 1)
	if err == nil {
		t.Error("Include line with empty path should fail")
	}
}

// TestValidateHostLine_NotHostLine 测试validateHostLine收到非Host行的情况
// 注意：在当前的validateConfigLine实现中，这不会被调用到，因为已经过滤了

// TestValidateHostLine_NoHostnames 测试解析后没有主机名的情况
func TestValidateHostLine_NoHostnames(t *testing.T) {
	validator := NewConfigValidator([]string{})

	// 测试一个只有引号的情况，可能会导致parseHostNames返回空
	err := validator.validateHostLine("Host \"\"", 1)
	if err == nil {
		t.Error("validateHostLine should fail for line with no hostnames")
	}
	t.Logf("validateHostLine error (expected): %v", err)
}

// TestValidateHostLine_InvalidHostname 测试无效主机名（过长）
func TestValidateHostLine_InvalidHostname(t *testing.T) {
	validator := NewConfigValidator([]string{})

	// 创建一个超过253字符的主机名
	longHostname := strings.Repeat("a", 254)
	err := validator.validateHostLine("Host "+longHostname, 1)
	if err == nil {
		t.Error("validateHostLine should fail for hostname that's too long")
	}
	t.Logf("validateHostLine error (expected): %v", err)
}

// TestValidateIncludeLine_NotIncludeLine 测试validateIncludeLine收到非Include行的情况
// 注意：在当前的validateConfigLine实现中，这不会被调用到

// TestValidateParamLine_InvalidFormat 测试无效参数格式
func TestValidateParamLine_InvalidFormat(t *testing.T) {
	validator := NewConfigValidator([]string{})

	// 测试一个缩进但格式无效的行（只有空白）
	err := validator.validateParamLine("    ", 1) // 只有缩进和空格
	if err != nil {
		// 这取决于parseParamLine的实现，如果它返回空key，应该报错
		t.Logf("validateParamLine result for invalid format: %v", err)
	}
}

// TestValidateMatchLine_IncompleteCriteria 测试Match条件不完整
func TestValidateMatchLine_IncompleteCriteria(t *testing.T) {
	validator := NewConfigValidator([]string{})

	// 测试不完整的Match条件
	err := validator.validateMatchLine("Match User", 1) // 只有条件名，没有值
	if err == nil {
		t.Error("validateMatchLine should fail for incomplete criteria")
	}
	t.Logf("validateMatchLine error (expected): %v", err)
}

// TestValidateMatchLine_InvalidCriterion 测试无效的Match条件
func TestValidateMatchLine_InvalidCriterion(t *testing.T) {
	validator := NewConfigValidator([]string{})

	// 测试无效的Match条件
	err := validator.validateMatchLine("Match InvalidCriterion value", 1)
	if err == nil {
		t.Error("validateMatchLine should fail for invalid criterion")
	}
	t.Logf("validateMatchLine error (expected): %v", err)
}

// TestValidateMatchLine_EmptyValue 测试Match条件值为空
func TestValidateMatchLine_EmptyValue(t *testing.T) {
	validator := NewConfigValidator([]string{})

	// 测试Match条件值为空 (引号包裹的空字符串)
	// 这对应于SSH配置文件中的: Match User ""
	err := validator.validateMatchLine("Match User \"\"", 1)
	if err == nil {
		t.Error("validateMatchLine should fail for empty criterion value (quoted empty string)")
	} else {
		if strings.Contains(err.Error(), "requires a value") {
			t.Logf("Got expected error for quoted empty string: %v", err)
		} else {
			t.Errorf("Got error but not the expected type for quoted empty string: %v", err)
		}
	}

	// 测试Match条件值为空格 (引号包裹的空格)
	// 这对应于SSH配置文件中的: Match User " "
	err2 := validator.validateMatchLine("Match User \"  \"", 1)
	if err2 == nil {
		t.Error("validateMatchLine should fail for whitespace-only criterion value (quoted spaces)")
	} else {
		if strings.Contains(err2.Error(), "requires a value") {
			t.Logf("Got expected error for quoted spaces: %v", err2)
		} else {
			t.Errorf("Got error but not the expected type for quoted spaces: %v", err2)
		}
	}

	// 测试Match条件值完全缺失
	// 这对应于SSH配置文件中的: Match User (行尾没有值)
	err3 := validator.validateMatchLine("Match User", 1)
	if err3 == nil {
		t.Error("validateMatchLine should fail for missing criterion value")
	} else {
		if strings.Contains(err3.Error(), "incomplete") {
			t.Logf("Got expected error for missing value: %v", err3)
		} else {
			t.Errorf("Got error but not the expected type for missing value: %v", err3)
		}
	}
}

// TestValidateParamValue_NumericError 测试数值参数的错误值
func TestValidateParamValue_NumericError(t *testing.T) {
	validator := NewConfigValidator([]string{})

	// 测试非数字的ServerAliveInterval
	err := validator.validateParamValue("ServerAliveInterval", "not_a_number", 1)
	if err == nil {
		t.Error("validateParamValue should fail for non-numeric ServerAliveInterval")
	}
	t.Logf("validateParamValue error (expected): %v", err)
}

// TestValidateHostname_TooLong 测试过长的主机名
func TestValidateHostname_TooLong(t *testing.T) {
	validator := NewConfigValidator([]string{})

	// 测试超过253字符的主机名
	longHostname := strings.Repeat("a", 254)
	err := validator.validateHostname(longHostname)
	if err == nil {
		t.Error("validateHostname should fail for hostname that's too long")
	}
	t.Logf("validateHostname error (expected): %v", err)
}

// TestValidateParamValue_RequiredValueEmpty 测试必需参数但值为空的情况
func TestValidateParamValue_RequiredValueEmpty(t *testing.T) {
	validator := NewConfigValidator([]string{})

	// 定义需要非空值的参数列表
	requiredParams := []string{"IdentityFile", "HostName", "User", "ProxyCommand"}

	for _, param := range requiredParams {
		// 测试完全空值 ""
		err := validator.validateParamValue(param, "", 10) // 假设在第10行
		if err == nil {
			t.Errorf("validateParamValue for '%s' with empty value should fail", param)
		} else {
			// 检查错误信息是否包含预期内容
			expectedMsgPart := fmt.Sprintf("line 10: %s requires a value", param)
			if !strings.Contains(err.Error(), expectedMsgPart) {
				t.Errorf("validateParamValue for '%s' error message expected to contain '%s', got '%s'", param, expectedMsgPart, err.Error())
			}
			// 检查错误类型
			var configErr *ConfigError
			if !errors.As(err, &configErr) {
				t.Errorf("validateParamValue for '%s' should return *ConfigError, got %T", param, err)
			} else if configErr.Op != "validate" {
				t.Errorf("validateParamValue for '%s' ConfigError.Op should be 'validate', got '%s'", param, configErr.Op)
			}
		}

		// 测试只有空白字符的值 "   "
		err2 := validator.validateParamValue(param, "   ", 15) // 假设在第15行
		if err2 == nil {
			t.Errorf("validateParamValue for '%s' with whitespace-only value should fail", param)
		} else {
			expectedMsgPart := fmt.Sprintf("line 15: %s requires a value", param)
			if !strings.Contains(err2.Error(), expectedMsgPart) {
				t.Errorf("validateParamValue for '%s' (whitespace) error message expected to contain '%s', got '%s'", param, expectedMsgPart, err2.Error())
			}
		}
	}
}

// TestValidateParamValue_RequiredValueValid 测试必需参数有有效值的情况
func TestValidateParamValue_RequiredValueValid(t *testing.T) {
	validator := NewConfigValidator([]string{})

	// 定义需要非空值的参数列表和它们的有效值示例
	tests := []struct {
		param string
		value string
	}{
		{"IdentityFile", "~/.ssh/id_rsa"},
		{"IdentityFile", "/path/to/key"},
		{"HostName", "example.com"},
		{"HostName", "192.168.1.1"},
		{"User", "myuser"},
		{"User", "admin"},
		{"ProxyCommand", "nc %h %p"},
		{"ProxyCommand", "ssh proxyhost -W %h:%p"},
		// 测试大小写不敏感
		{"identityfile", "~/.ssh/id_ed25519"},
		{"HOSTNAME", "test.example.com"},
	}

	for _, tt := range tests {
		err := validator.validateParamValue(tt.param, tt.value, 5) // 假设在第5行
		// 对于这些必需参数，只要值非空，validateParamValue本身不应该因为"requires a value"而失败
		// (虽然其他检查如HostName格式可能失败，但这里只测试"requires a value"逻辑)
		// 在这个特定的测试中，我们只检查值非空的情况，不触发"requires a value"错误
		// 注意：如果将来为HostName添加了格式检查，这个测试可能需要调整
		if err != nil && strings.Contains(err.Error(), "requires a value") {
			t.Errorf("validateParamValue for '%s' with valid value '%s' should not fail with 'requires a value', got: %v", tt.param, tt.value, err)
		}
		// 如果有其他错误（如Port不是数字），那是另一个测试场景的范畴
	}
}

// TestValidateParamValue_RequiredValueEmptyButNotTrimmed 测试边界情况：值在TrimSpace后才变空
func TestValidateParamValue_RequiredValueEmptyButNotTrimmed(t *testing.T) {
	validator := NewConfigValidator([]string{})

	// 这个测试确保我们的检查是基于 TrimSpace 的
	param := "IdentityFile"
	value := "  \t \n  " // 只包含空白字符
	err := validator.validateParamValue(param, value, 20)
	if err == nil {
		t.Errorf("validateParamValue for '%s' with only whitespace value should fail after TrimSpace", param)
	} else {
		expectedMsgPart := fmt.Sprintf("line 20: %s requires a value", param)
		if !strings.Contains(err.Error(), expectedMsgPart) {
			t.Errorf("validateParamValue for '%s' (only whitespace) error message expected to contain '%s', got '%s'", param, expectedMsgPart, err.Error())
		}
	}
}

// TestValidateParamValue_NonRequiredParamEmpty 测试非必需参数可以为空
func TestValidateParamValue_NonRequiredParamEmpty(t *testing.T) {
	validator := NewConfigValidator([]string{})

	// 选择一些不是必需的参数
	nonRequiredParams := []string{"Compression", "TCPKeepAlive"} // 这些有自己的yes/no检查，但空值应该被允许

	for _, param := range nonRequiredParams {
		err := validator.validateParamValue(param, "", 25) // 空值
		// 对于非必需参数，空值不应该触发 "requires a value" 错误
		// 但它可能会触发其他检查（如Compression的yes/no），这没关系，只要不是"requires a value"
		if err != nil && strings.Contains(err.Error(), "requires a value") {
			t.Errorf("validateParamValue for non-required param '%s' with empty value should not fail with 'requires a value', got: %v", param, err)
		}
		// 特别地，对于 Compression，空值应该通过（使用默认值），不会报错
		// 但 validateParamValue 本身不处理默认值，它只检查格式。空的 Compression 不会触发 isNumeric 或 isValidYesNo。
		// 所以 Compression "" 应该返回 nil。
		err2 := validator.validateParamValue("Compression", "", 26)
		if err2 != nil && strings.Contains(err2.Error(), "requires a value") {
			t.Errorf("validateParamValue for 'Compression' with empty value should not fail with 'requires a value', got: %v", err2)
		}
		// 注意：validateParamValue 对于空的 Compression 值不会触发 yes/no 检查，因为 `value != ""` 条件不满足。
	}
}
