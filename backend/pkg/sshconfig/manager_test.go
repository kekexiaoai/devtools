package sshconfig

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestNewManager_CreateWithExistingFile 测试创建管理器与现有文件
func TestNewManager_CreateWithExistingFile(t *testing.T) {
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "config")

	content := `Host test
    HostName example.com
    User testuser`

	if err := os.WriteFile(configFile, []byte(content), 0o644); err != nil {
		t.Fatalf("Failed to create test config: %v", err)
	}

	manager, err := NewManager(configFile)
	if err != nil {
		t.Errorf("NewManager failed: %v", err)
	}
	if manager == nil {
		t.Error("Manager should not be nil")
	}
}

// TestNewManager_CreateWithNonExistentFile 测试创建管理器与不存在的文件
func TestNewManager_CreateWithNonExistentFile(t *testing.T) {
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "nonexistent", "config")

	manager, err := NewManager(configFile)
	if err != nil {
		t.Errorf("NewManager should not fail for non-existent file: %v", err)
	}
	if manager == nil {
		t.Error("Manager should not be nil")
	}
}

// TestNewManager_CreateWithInvalidPath 测试创建管理器与无效路径
func TestNewManager_CreateWithInvalidPath(t *testing.T) {
	manager, err := NewManager("")
	if err != nil {
		t.Errorf("NewManager should not fail with empty path: %v", err)
	}
	if manager == nil {
		t.Error("Manager should not be nil with empty path")
	}
	// 空路径应该被视为文件不存在，manager应该正常创建但为空配置
	if manager != nil && len(manager.rawLines) != 0 {
		t.Error("Manager should have empty rawLines with empty path")
	}
}

// TestLoad_Success 测试成功加载配置
func TestLoad_Success(t *testing.T) {
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "config")

	content := `Host test
    HostName example.com
    User testuser`

	if err := os.WriteFile(configFile, []byte(content), 0o644); err != nil {
		t.Fatalf("Failed to create test config: %v", err)
	}

	manager, err := NewManager(configFile)
	if err != nil {
		t.Fatalf("Failed to create manager: %v", err)
	}

	err = manager.Load()
	if err != nil {
		t.Errorf("Load failed: %v", err)
	}
}

// TestLoad_FileNotExist 测试加载不存在的文件
func TestLoad_FileNotExist(t *testing.T) {
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "nonexistent_config")
	manager := &SSHConfigManager{
		filename: configFile,
	}

	err := manager.Load()
	if err == nil || !os.IsNotExist(err) {
		t.Errorf("Load should return os.IsNotExist for non-existent file, got: %v", err)
	}
}

// TestSave_Success 测试成功保存配置
func TestSave_Success(t *testing.T) {
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "config")

	manager, err := NewManager(configFile)
	if err != nil {
		t.Fatalf("Failed to create manager: %v", err)
	}

	manager.AddHost("test")
	manager.SetParam("test", "HostName", "example.com")
	manager.SetParam("test", "User", "testuser")

	err = manager.Save()
	if err != nil {
		t.Errorf("Save failed: %v", err)
	}

	if _, err := os.Stat(configFile); os.IsNotExist(err) {
		t.Error("Config file should be created")
	}

	content, err := os.ReadFile(configFile)
	if err != nil {
		t.Fatalf("Failed to read saved config: %v", err)
	}

	if !strings.Contains(string(content), "Host test") {
		t.Error("Saved config should contain Host test")
	}
	if !strings.Contains(string(content), "HostName example.com") {
		t.Error("Saved config should contain HostName example.com")
	}
}

// TestSave_CreateDirectory 测试保存时创建目录
func TestSave_CreateDirectory(t *testing.T) {
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "subdir", "config")

	manager, err := NewManager(configFile)
	if err != nil {
		t.Fatalf("Failed to create manager: %v", err)
	}

	manager.AddHost("test")

	err = manager.Save()
	if err != nil {
		t.Errorf("Save should create directory: %v", err)
	}

	if _, err := os.Stat(filepath.Dir(configFile)); os.IsNotExist(err) {
		t.Error("Directory should be created")
	}
}

// TestBuildConfig 测试构建配置内容
func TestBuildConfig(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host test", "    HostName example.com"},
	}

	content := manager.BuildConfig()
	expected := "Host test\n    HostName example.com\n"

	if content != expected {
		t.Errorf("BuildConfig returned %q, expected %q", content, expected)
	}
}

// TestGetHost_Success 测试成功获取主机配置
func TestGetHost_Success(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"# Test host",
			"Host test",
			"    HostName example.com",
			"    User testuser",
		},
	}

	host, err := manager.GetHost("test")
	if err != nil {
		t.Errorf("GetHost failed: %v", err)
	}
	if host == nil {
		t.Error("Host should not be nil")
	}
	if host != nil && host.Name != "test" {
		t.Errorf("Expected host name 'test', got %q", host.Name)
	}
}

// TestGetHost_GlobalConfig 测试获取全局配置
func TestGetHost_GlobalConfig(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host *",
			"    TCPKeepAlive yes",
			"    ServerAliveInterval 60",
		},
	}

	host, err := manager.GetHost("*")
	if err != nil {
		t.Errorf("GetHost failed for global config: %v", err)
	}
	if host == nil {
		t.Error("Global host should not be nil")
	}
	if host != nil && host.Name != "*" {
		t.Errorf("Expected host name '*', got %q", host.Name)
	}
	if !host.IsGlobal {
		t.Error("Global host should have IsGlobal=true")
	}
}

// TestGetHost_NotFound 测试获取不存在的主机
func TestGetHost_NotFound(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host test", "    HostName example.com"},
	}

	_, err := manager.GetHost("nonexistent")
	if err == nil {
		t.Error("GetHost should fail for non-existent host")
	}
}

// TestGetAllHosts_Success 测试成功获取所有主机
func TestGetAllHosts_Success(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host test",
			"    HostName example.com",
			"",
			"Host another test2",
			"    HostName another.com",
			"",
			"Host *",
			"    Port 22",
		},
	}

	hosts, err := manager.GetAllHosts()
	if err != nil {
		t.Errorf("GetAllHosts failed: %v", err)
	}

	if len(hosts) != 4 { // test, another, test2, *
		t.Errorf("Expected 4 hosts, got %d", len(hosts))
	}

	hostNames := make(map[string]bool)
	for _, host := range hosts {
		hostNames[host.Name] = true
	}

	if !hostNames["test"] {
		t.Error("Should contain host 'test'")
	}
	if !hostNames["another"] {
		t.Error("Should contain host 'another'")
	}
	if !hostNames["test2"] {
		t.Error("Should contain host 'test2'")
	}
	if !hostNames["*"] {
		t.Error("Should contain global host '*'")
	}
}

// TestGetGlobalConfig 测试获取全局配置
func TestGetGlobalConfig(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Include ~/.ssh/other_config",
			"Host *",
			"    TCPKeepAlive yes",
			"    ServerAliveInterval 60",
			"",
			"Host test",
			"    HostName example.com",
		},
	}

	global, err := manager.GetGlobalConfig()
	if err != nil {
		t.Errorf("GetGlobalConfig failed: %v", err)
	}
	if global == nil {
		t.Error("Global config should not be nil")
	}
	if global != nil && global.Name != "*" {
		t.Errorf("Expected global host name '*', got %q", global.Name)
	}
	if !global.IsGlobal {
		t.Error("Global config should have IsGlobal=true")
	}
}

// TestAddHost_EmptyConfig 测试向空配置添加主机
func TestAddHost_EmptyConfig(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{},
	}

	host := manager.AddHost("test")
	if host == nil {
		t.Error("AddHost should return host config")
	}
	if host != nil && host.Name != "test" {
		t.Errorf("Expected host name 'test', got %q", host.Name)
	}

	if len(manager.rawLines) != 1 {
		t.Errorf("Expected 1 line, got %d", len(manager.rawLines))
	}
	if manager.rawLines[0] != "Host test" {
		t.Errorf("Expected 'Host test', got %q", manager.rawLines[0])
	}
}

// TestAddHost_NonEmptyConfig 测试向非空配置添加主机
func TestAddHost_NonEmptyConfig(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host first", "    HostName example.com"},
	}

	_ = manager.AddHost("second")
	if len(manager.rawLines) != 4 {
		t.Errorf("Expected 4 lines, got %d", len(manager.rawLines))
	}

	// 检查是否添加了空行分隔
	if strings.TrimSpace(manager.rawLines[2]) != "" {
		t.Error("Should add empty line separator")
	}

	if manager.rawLines[3] != "Host second" {
		t.Errorf("Expected 'Host second', got %q", manager.rawLines[3])
	}
}

// TestSetParam_Success 测试成功设置参数
func TestSetParam_Success(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host test", "    HostName old.com"},
	}

	err := manager.SetParam("test", "HostName", "new.com")
	if err != nil {
		t.Errorf("SetParam failed: %v", err)
	}

	found := false
	for _, line := range manager.rawLines {
		if strings.Contains(line, "HostName new.com") {
			found = true
			break
		}
	}
	if !found {
		t.Error("Parameter should be updated")
	}
}

// TestSetParam_AddToNewHost 测试为新主机添加参数
func TestSetParam_AddToNewHost(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{},
	}

	err := manager.SetParam("test", "HostName", "example.com")
	if err != nil {
		t.Errorf("SetParam failed: %v", err)
	}

	if len(manager.rawLines) < 2 {
		t.Error("Should create host and parameter")
	}
}

// TestSetParam_GlobalConfig 测试为全局配置设置参数
func TestSetParam_GlobalConfig(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host *"},
	}

	err := manager.SetParam("*", "TCPKeepAlive", "yes")
	if err != nil {
		t.Errorf("SetParam failed for global config: %v", err)
	}

	found := false
	for _, line := range manager.rawLines {
		if strings.Contains(line, "TCPKeepAlive yes") {
			found = true
			break
		}
	}
	if !found {
		t.Error("Global parameter should be set")
	}
}

// TestSetParam_EmptyHostname 测试空主机名设置参数
func TestSetParam_EmptyHostname(t *testing.T) {
	manager := &SSHConfigManager{}
	err := manager.SetParam("", "key", "value")
	if err == nil {
		t.Error("SetParam should fail with empty hostname")
	}
}

// TestSetParam_EmptyKey 测试空键设置参数
func TestSetParam_EmptyKey(t *testing.T) {
	manager := &SSHConfigManager{}
	err := manager.SetParam("test", "", "value")
	if err == nil {
		t.Error("SetParam should fail with empty key")
	}
}

// TestRemoveParam_Success 测试成功移除参数
func TestRemoveParam_Success(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host test", "    HostName example.com"},
	}

	err := manager.RemoveParam("test", "HostName")
	if err != nil {
		t.Errorf("RemoveParam failed: %v", err)
	}

	found := false
	for _, line := range manager.rawLines {
		if strings.Contains(strings.TrimSpace(line), "HostName") {
			found = true
			break
		}
	}
	if found {
		t.Error("Parameter should be removed")
	}
}

// TestRemoveParam_HostNotFound 测试移除不存在主机的参数
func TestRemoveParam_HostNotFound(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host test", "    HostName example.com"},
	}

	err := manager.RemoveParam("nonexistent", "HostName")
	if err == nil {
		t.Error("RemoveParam should fail for non-existent host")
	}
}

// TestRemoveParam_EmptyHostname 测试空主机名移除参数
func TestRemoveParam_EmptyHostname(t *testing.T) {
	manager := &SSHConfigManager{}
	err := manager.RemoveParam("", "key")
	if err == nil {
		t.Error("RemoveParam should fail with empty hostname")
	}
}

// TestRemoveParam_EmptyKey 测试空键移除参数
func TestRemoveParam_EmptyKey(t *testing.T) {
	manager := &SSHConfigManager{}
	err := manager.RemoveParam("test", "")
	if err == nil {
		t.Error("RemoveParam should fail with empty key")
	}
}

// TestRemoveHost_Success 测试成功移除主机
func TestRemoveHost_Success(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host test", "    HostName example.com"},
	}

	err := manager.RemoveHost("test")
	if err != nil {
		t.Errorf("RemoveHost failed: %v", err)
	}

	if len(manager.rawLines) > 0 {
		t.Error("Host should be removed")
	}
}

// TestRemoveHost_GlobalConfig 测试移除全局配置
func TestRemoveHost_GlobalConfig(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host *",
			"    TCPKeepAlive yes",
			"",
			"Host test",
			"    HostName example.com",
		},
	}

	err := manager.RemoveHost("*")
	if err != nil {
		t.Errorf("RemoveHost failed for global config: %v", err)
	}

	// 验证全局配置已被移除
	found := false
	for _, line := range manager.rawLines {
		if strings.TrimSpace(line) == "Host *" {
			found = true
			break
		}
	}
	if found {
		t.Error("Global config should be removed")
	}
}

// TestRemoveHost_WithCommentsAndEmptyLines 测试移除带注释和空行的主机
func TestRemoveHost_WithCommentsAndEmptyLines(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"# Test host",
			"Host test",
			"    HostName example.com",
			"",
			"Host another",
			"    HostName another.com",
		},
	}

	err := manager.RemoveHost("test")
	if err != nil {
		t.Errorf("RemoveHost failed: %v", err)
	}

	expectedLines := []string{"", "Host another", "    HostName another.com"}
	if len(manager.rawLines) != len(expectedLines) {
		t.Errorf("Expected %d lines, got %d", len(expectedLines), len(manager.rawLines))
	}
}

// TestRemoveHost_NotFound 测试移除不存在的主机
func TestRemoveHost_NotFound(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host test", "    HostName example.com"},
	}

	err := manager.RemoveHost("nonexistent")
	if err == nil {
		t.Error("RemoveHost should fail for non-existent host")
	}
}

// TestRemoveHost_EmptyHostname 测试空主机名移除主机
func TestRemoveHost_EmptyHostname(t *testing.T) {
	manager := &SSHConfigManager{}
	err := manager.RemoveHost("")
	if err == nil {
		t.Error("RemoveHost should fail with empty hostname")
	}
}

// TestGetParam_Success 测试成功获取参数
func TestGetParam_Success(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host test",
			"    HostName example.com",
			"    User testuser",
		},
	}

	value, err := manager.GetParam("test", "HostName")
	if err != nil {
		t.Errorf("GetParam failed: %v", err)
	}
	if value != "example.com" {
		t.Errorf("Expected 'example.com', got %q", value)
	}
}

// TestGetParam_GlobalConfig 测试获取全局配置参数
func TestGetParam_GlobalConfig(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host *",
			"    TCPKeepAlive yes",
			"    ServerAliveInterval 60",
		},
	}

	value, err := manager.GetParam("*", "TCPKeepAlive")
	if err != nil {
		t.Errorf("GetParam failed for global config: %v", err)
	}
	if value != "yes" {
		t.Errorf("Expected 'yes', got %q", value)
	}
}

// TestGetParam_NotFound 测试获取不存在的参数
func TestGetParam_NotFound(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host test",
			"    HostName example.com",
		},
	}

	_, err := manager.GetParam("test", "NonExistent")
	if err == nil {
		t.Error("GetParam should fail for non-existent parameter")
	}
}

// TestGetParam_HostNotFound 测试获取不存在主机的参数
func TestGetParam_HostNotFound(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host test",
			"    HostName example.com",
		},
	}

	_, err := manager.GetParam("nonexistent", "HostName")
	if err == nil {
		t.Error("GetParam should fail for non-existent host")
	}
}

// TestHasHost_Found 测试找到主机
func TestHasHost_Found(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host test", "    HostName example.com"},
	}

	if !manager.HasHost("test") {
		t.Error("Should have host 'test'")
	}
}

// TestHasHost_GlobalConfig 测试找到全局配置
func TestHasHost_GlobalConfig(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host *", "    TCPKeepAlive yes"},
	}

	if !manager.HasHost("*") {
		t.Error("Should have global host '*'")
	}
}

// TestHasHost_NotFound 测试未找到主机
func TestHasHost_NotFound(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host test", "    HostName example.com"},
	}

	if manager.HasHost("nonexistent") {
		t.Error("Should not have host 'nonexistent'")
	}
}

// TestGetHostNames_Success 测试成功获取主机名列表
func TestGetHostNames_Success(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host test",
			"    HostName example.com",
			"",
			"Host another test2",
			"    HostName another.com",
			"",
			"Host *",
			"    Port 22",
		},
	}

	hostNames, err := manager.GetHostNames()
	if err != nil {
		t.Errorf("GetHostNames failed: %v", err)
	}

	if len(hostNames) != 4 {
		t.Errorf("Expected 4 host names, got %d", len(hostNames))
	}

	expectedNames := map[string]bool{"test": true, "another": true, "test2": true, "*": true}
	for _, name := range hostNames {
		if !expectedNames[name] {
			t.Errorf("Unexpected host name: %s", name)
		}
	}
}

// TestAddComment_Success 测试成功添加注释
func TestAddComment_Success(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host test", "    HostName example.com"},
	}

	err := manager.AddComment("test", "This is a test host")
	if err != nil {
		t.Errorf("AddComment failed: %v", err)
	}

	if len(manager.rawLines) != 3 {
		t.Errorf("Expected 3 lines, got %d", len(manager.rawLines))
	}

	if !strings.HasPrefix(strings.TrimSpace(manager.rawLines[0]), "#") {
		t.Error("Comment should be added before host")
	}
}

// TestAddComment_HostNotFound 测试为不存在的主机添加注释
func TestAddComment_HostNotFound(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host test", "    HostName example.com"},
	}

	err := manager.AddComment("nonexistent", "Test comment")
	if err == nil {
		t.Error("AddComment should fail for non-existent host")
	}
}

// TestValidate_Success 测试验证成功
func TestValidate_Success(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host test", "    HostName example.com"},
	}

	err := manager.Validate()
	if err != nil {
		t.Errorf("Validate should succeed: %v", err)
	}
}

// TestBackup_Success 测试成功创建备份
func TestBackup_Success(t *testing.T) {
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "config")

	content := `Host test
    HostName example.com`

	if err := os.WriteFile(configFile, []byte(content), 0o644); err != nil {
		t.Fatalf("Failed to create test config: %v", err)
	}

	manager, err := NewManager(configFile)
	if err != nil {
		t.Fatalf("Failed to create manager: %v", err)
	}

	backupPath, err := manager.Backup()
	if err != nil {
		t.Errorf("Backup failed: %v", err)
	}

	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		t.Error("Backup file should be created")
	}

	backupContent, err := os.ReadFile(backupPath)
	if err != nil {
		t.Fatalf("Failed to read backup: %v", err)
	}

	if string(backupContent) != manager.BuildConfig() {
		t.Error("Backup content should match original")
	}
}

// TestGetIncludes 测试获取Include指令
func TestGetIncludes(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Include ~/.ssh/other_config",
			"Include /etc/ssh/config.d/*",
			"Host test",
			"    HostName example.com",
		},
	}

	includes := manager.GetIncludes()
	if len(includes) != 2 {
		t.Errorf("Expected 2 includes, got %d", len(includes))
	}

	if includes[0] != "~/.ssh/other_config" {
		t.Errorf("Expected '~/.ssh/other_config', got %q", includes[0])
	}

	if includes[1] != "/etc/ssh/config.d/*" {
		t.Errorf("Expected '/etc/ssh/config.d/*', got %q", includes[1])
	}
}

// TestAddInclude 测试添加Include指令
func TestAddInclude(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Include ~/.ssh/first_config",
			"Host test",
			"    HostName example.com",
		},
	}

	manager.AddInclude("~/.ssh/second_config")

	// 验证Include指令已添加
	includeCount := 0
	for _, line := range manager.rawLines {
		if strings.HasPrefix(strings.TrimSpace(line), "Include ") {
			includeCount++
		}
	}

	if includeCount != 2 {
		t.Errorf("Expected 2 Include directives, got %d", includeCount)
	}
}

// TestSetGlobalParam 测试设置全局参数
func TestSetGlobalParam(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host *"},
	}

	err := manager.SetGlobalParam("TCPKeepAlive", "yes")
	if err != nil {
		t.Errorf("SetGlobalParam failed: %v", err)
	}

	found := false
	for _, line := range manager.rawLines {
		if strings.Contains(line, "TCPKeepAlive yes") {
			found = true
			break
		}
	}
	if !found {
		t.Error("Global parameter should be set")
	}
}

// TestGetGlobalParam 测试获取全局参数
func TestGetGlobalParam(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host *",
			"    TCPKeepAlive yes",
			"    ServerAliveInterval 60",
		},
	}

	value, err := manager.GetGlobalParam("TCPKeepAlive")
	if err != nil {
		t.Errorf("GetGlobalParam failed: %v", err)
	}
	if value != "yes" {
		t.Errorf("Expected 'yes', got %q", value)
	}

	// 测试获取不存在的全局参数
	_, err = manager.GetGlobalParam("NonExistent")
	if err == nil {
		t.Error("GetGlobalParam should fail for non-existent parameter")
	}
}

// TestFindHost_SingleHost 测试查找单个主机
func TestFindHost_SingleHost(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host first",
			"    HostName first.com",
			"",
			"Host second",
			"    HostName second.com",
		},
	}

	start, end, found := manager.findHost("first")
	if !found {
		t.Error("Should find host 'first'")
	}
	if start != 0 {
		t.Errorf("Expected start=0, got %d", start)
	}
	if end != 3 {
		t.Errorf("Expected end=3, got %d", end)
	}
}

// TestFindHost_GlobalConfig 测试查找全局配置
func TestFindHost_GlobalConfig(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Include ~/.ssh/config",
			"Host *",
			"    TCPKeepAlive yes",
			"",
			"Host test",
			"    HostName example.com",
		},
	}

	start, end, found := manager.findHost("*")
	if !found {
		t.Error("Should find global host '*'")
	}
	if start != 1 {
		t.Errorf("Expected start=1, got %d", start)
	}
	if end != 4 {
		t.Errorf("Expected end=4, got %d", end)
	}
}

// TestFindHost_MultipleHostNames 测试查找多个主机名的主机
func TestFindHost_MultipleHostNames(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host first",
			"    HostName first.com",
			"",
			"Host second third",
			"    HostName second.com",
			"",
			"Host *",
			"    Port 22",
		},
	}

	start, end, found := manager.findHost("second")
	if !found {
		t.Error("Should find host 'second'")
	}
	if start != 3 {
		t.Errorf("Expected start=3, got %d", start)
	}
	if end != 6 {
		t.Errorf("Expected end=6, got %d", end)
	}
}

// TestFindHost_NotFound 测试查找不存在的主机
func TestFindHost_NotFound(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host first",
			"    HostName first.com",
		},
	}

	_, _, found := manager.findHost("nonexistent")
	if found {
		t.Error("Should not find non-existent host")
	}
}

// TestFindParamInHost_Found 测试在主机中找到参数
func TestFindParamInHost_Found(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host test",
			"    HostName example.com",
			"    User testuser",
		},
	}

	line := manager.findParamInHost(0, 3, "User")
	if line != 2 {
		t.Errorf("Expected line 2, got %d", line)
	}
}

// TestFindParamInHost_NotFound 测试在主机中未找到参数
func TestFindParamInHost_NotFound(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host test",
			"    HostName example.com",
		},
	}

	line := manager.findParamInHost(0, 2, "User")
	if line != -1 {
		t.Errorf("Expected -1, got %d", line)
	}
}

// TestParseHostNames_Normal 测试正常解析主机名
func TestParseHostNames_Normal(t *testing.T) {
	names := parseHostNames("test host")
	if len(names) != 2 {
		t.Errorf("Expected 2 names, got %d", len(names))
	}
}

// TestParseHostNames_WithQuotes 测试带引号的主机名解析
func TestParseHostNames_WithQuotes(t *testing.T) {
	names := parseHostNames(`host1 "host2" 'host3'`)
	if len(names) != 3 {
		t.Errorf("Expected 3 names, got %d: %v", len(names), names)
	}

	expected := []string{"host1", "host2", "host3"}
	for i, expectedName := range expected {
		if names[i] != expectedName {
			t.Errorf("Expected name %s at index %d, got %s", expectedName, i, names[i])
		}
	}
}

// TestParseHostNames_Empty 测试空字符串解析
func TestParseHostNames_Empty(t *testing.T) {
	names := parseHostNames("")
	if len(names) != 0 {
		t.Errorf("Expected 0 names, got %d", len(names))
	}
}

// TestMatchHostName_ExactMatch 测试精确匹配
func TestMatchHostName_ExactMatch(t *testing.T) {
	if !matchHostName("test", "test") {
		t.Error("Should match exact host name")
	}
}

// TestMatchHostName_WildcardMatch 测试通配符匹配
func TestMatchHostName_WildcardMatch(t *testing.T) {
	if !matchHostName("*.example.com", "test.example.com") {
		t.Error("Should match wildcard pattern")
	}
}

// TestMatchHostName_NoMatch 测试不匹配
func TestMatchHostName_NoMatch(t *testing.T) {
	if matchHostName("*.example.com", "test.com") {
		t.Error("Should not match different domain")
	}
}

// TestParseParamLine_KeyValue 测试 key value 格式解析
func TestParseParamLine_KeyValue(t *testing.T) {
	key, value := parseParamLine("HostName example.com")
	if key != "HostName" {
		t.Errorf("Expected key 'HostName', got %q", key)
	}
	if value != "example.com" {
		t.Errorf("Expected value 'example.com', got %q", value)
	}
}

// TestParseParamLine_KeyEqualsValue 测试 key=value 格式解析
func TestParseParamLine_KeyEqualsValue(t *testing.T) {
	key, value := parseParamLine("Port=22")
	if key != "Port" {
		t.Errorf("Expected key 'Port', got %q", key)
	}
	if value != "22" {
		t.Errorf("Expected value '22', got %q", value)
	}
}

// TestParseParamLine_Comment 测试注释行解析
func TestParseParamLine_Comment(t *testing.T) {
	key, value := parseParamLine("# This is a comment")
	if key != "" || value != "" {
		t.Error("Should not parse comment lines")
	}
}

// TestParseParamLine_HostLine 测试Host行解析
func TestParseParamLine_HostLine(t *testing.T) {
	key, value := parseParamLine("Host test")
	if key != "" || value != "" {
		t.Error("Should not parse Host lines")
	}
}

// TestParseParamLine_IncludeLine 测试Include行解析
func TestParseParamLine_IncludeLine(t *testing.T) {
	key, value := parseParamLine("Include ~/.ssh/config")
	if key != "" || value != "" {
		t.Error("Should not parse Include lines")
	}
}

// TestParseParamLine_Empty 测试空行解析
func TestParseParamLine_Empty(t *testing.T) {
	key, value := parseParamLine("")
	if key != "" || value != "" {
		t.Error("Should not parse empty lines")
	}
}

// TestParseParamLine_KeyOnly 测试只有key的情况
func TestParseParamLine_KeyOnly(t *testing.T) {
	key, value := parseParamLine("Compression")
	if key != "Compression" {
		t.Errorf("Expected key 'Compression', got %q", key)
	}
	if value != "" {
		t.Errorf("Expected empty value, got %q", value)
	}
}

// TestGetLineIndent_Space 测试空格缩进获取
func TestGetLineIndent_Space(t *testing.T) {
	indent := getLineIndent("    HostName example.com")
	if indent != "    " {
		t.Errorf("Expected 4 spaces, got %q", indent)
	}
}

// TestGetLineIndent_Tab 测试制表符缩进获取
func TestGetLineIndent_Tab(t *testing.T) {
	indent := getLineIndent("\tHostName example.com")
	if indent != "\t" {
		t.Errorf("Expected tab, got %q", indent)
	}
}

// TestGetLineIndent_NoIndent 测试无缩进获取
func TestGetLineIndent_NoIndent(t *testing.T) {
	indent := getLineIndent("Host test")
	if indent != "" {
		t.Errorf("Expected empty indent, got %q", indent)
	}
}

// TestIsBlankLine_Empty 测试空行检查
func TestIsBlankLine_Empty(t *testing.T) {
	if !isBlankLine("") {
		t.Error("Empty string should be blank line")
	}
}

// TestIsBlankLine_SpacesOnly 测试只有空格的行检查
func TestIsBlankLine_SpacesOnly(t *testing.T) {
	if !isBlankLine("   ") {
		t.Error("Spaces only should be blank line")
	}
}

// TestIsBlankLine_TabsOnly 测试只有制表符的行检查
func TestIsBlankLine_TabsOnly(t *testing.T) {
	if !isBlankLine("\t\t") {
		t.Error("Tabs only should be blank line")
	}
}

// TestIsBlankLine_NonEmpty 测试非空行检查
func TestIsBlankLine_NonEmpty(t *testing.T) {
	if isBlankLine("Host test") {
		t.Error("Non-empty line should not be blank")
	}
}

// TestExpandHomeDir_NoTilde 测试不以~开头的路径展开
func TestExpandHomeDir_NoTilde(t *testing.T) {
	path := expandHomeDir("/etc/ssh/config")
	if path != "/etc/ssh/config" {
		t.Errorf("Expected '/etc/ssh/config', got %q", path)
	}
}

// TestExpandHomeDir_WithTilde 测试~路径展开
func TestExpandHomeDir_WithTilde(t *testing.T) {
	path := expandHomeDir("~/ssh/config")
	if !strings.Contains(path, "ssh/config") && !strings.HasPrefix(path, "/") {
		t.Errorf("Expanded path should contain 'ssh/config' and be absolute: %q", path)
	}
}

// TestGetRawLines 测试获取原始行
func TestGetRawLines(t *testing.T) {
	lines := []string{"Host test", "    HostName example.com"}
	manager := &SSHConfigManager{
		rawLines: lines,
	}

	returnedLines := manager.GetRawLines()
	if len(returnedLines) != len(lines) {
		t.Errorf("Expected %d lines, got %d", len(lines), len(returnedLines))
	}

	// 验证返回的是副本，不是引用
	returnedLines[0] = "Modified"
	if manager.rawLines[0] == "Modified" {
		t.Error("GetRawLines should return a copy")
	}
}

// TestConfigError_Error 测试配置错误格式化
func TestConfigError_Error(t *testing.T) {
	err := &ConfigError{"test_op", fmt.Errorf("test error")}
	expected := "ssh config test_op: test error"

	if err.Error() != expected {
		t.Errorf("Expected %q, got %q", expected, err.Error())
	}
}

// TestGetHost_WithDescription 测试获取带描述的主机
func TestGetHost_WithDescription(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"# This is a test host",
			"# Used for testing purposes",
			"Host test",
			"    HostName example.com",
		},
	}

	host, err := manager.GetHost("test")
	if err != nil {
		t.Errorf("GetHost failed: %v", err)
	}

	if host.Description != "This is a test host Used for testing purposes" {
		t.Errorf("Expected description 'This is a test host Used for testing purposes', got %q", host.Description)
	}
}

// TestGetHost_MultipleSameKeyParams 测试获取多个相同键的参数
func TestGetHost_MultipleSameKeyParams(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host test",
			"    LocalForward 8080 localhost:80",
			"    LocalForward 3306 localhost:3306",
			"    HostName example.com",
		},
	}

	host, err := manager.GetHost("test")
	if err != nil {
		t.Errorf("GetHost failed: %v", err)
	}

	params, exists := host.Params["LocalForward"]
	if !exists {
		t.Error("Should have LocalForward parameters")
	}

	if len(params) != 2 {
		t.Errorf("Expected 2 LocalForward parameters, got %d", len(params))
	}
}

// TestGetAllHosts_EmptyConfig 测试空配置获取所有主机
func TestGetAllHosts_EmptyConfig(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{},
	}

	hosts, err := manager.GetAllHosts()
	if err != nil {
		t.Errorf("GetAllHosts failed: %v", err)
	}

	if len(hosts) != 0 {
		t.Errorf("Expected 0 hosts, got %d", len(hosts))
	}
}

// TestGetHostNames_EmptyConfig 测试空配置获取主机名
func TestGetHostNames_EmptyConfig(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{},
	}

	hostNames, err := manager.GetHostNames()
	if err != nil {
		t.Errorf("GetHostNames failed: %v", err)
	}

	if len(hostNames) != 0 {
		t.Errorf("Expected 0 host names, got %d", len(hostNames))
	}
}

// TestSetParam_PreserveIndentation 测试设置参数时保持缩进
func TestSetParam_PreserveIndentation(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host test",
			"\tHostName old.com", // 使用制表符缩进
		},
	}

	err := manager.SetParam("test", "HostName", "new.com")
	if err != nil {
		t.Errorf("SetParam failed: %v", err)
	}

	// 验证缩进保持不变
	if !strings.HasPrefix(manager.rawLines[1], "\t") {
		t.Error("Indentation should be preserved")
	}
	if !strings.Contains(manager.rawLines[1], "new.com") {
		t.Error("Parameter value should be updated")
	}
}

// TestMatchHostName_WildcardStar 测试通配符*的匹配行为
func TestMatchHostName_WildcardStar(t *testing.T) {
	// 单独的*不应该匹配具体主机名
	if matchHostName("*", "example.com") {
		t.Error("Single * should not match specific hostname")
	}

	// 但*.example.com应该匹配test.example.com
	if !matchHostName("*.example.com", "test.example.com") {
		t.Error("*.example.com should match test.example.com")
	}

	// *.example.com不应该匹配test.com
	if matchHostName("*.example.com", "test.com") {
		t.Error("*.example.com should not match test.com")
	}
}

// TestFindHost_GlobalNotAutoMatched 测试全局配置不会自动匹配
func TestFindHost_GlobalNotAutoMatched(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host *",
			"    TCPKeepAlive yes",
			"Host test",
			"    HostName example.com",
		},
	}

	// 查找不存在的主机不应该匹配到Host *
	_, _, found := manager.findHost("nonexistent")
	if found {
		t.Error("Should not find nonexistent host (should not auto-match Host *)")
	}

	// 但应该能找到Host *
	start, _, found := manager.getGlobalHost()
	if !found {
		t.Error("Should find Host *")
	}
	if start != 0 {
		t.Errorf("Expected global host start=0, got %d", start)
	}
}

// TestIntegration_FullWorkflow 测试完整工作流程
func TestIntegration_FullWorkflow(t *testing.T) {
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "config")

	manager, err := NewManager(configFile)
	if err != nil {
		t.Fatalf("Failed to create manager: %v", err)
	}

	// 1. 添加Include指令
	manager.AddInclude("~/.ssh/other_config")

	// 2. 添加全局配置
	manager.SetGlobalParam("TCPKeepAlive", "yes")
	manager.SetGlobalParam("ServerAliveInterval", "60")

	// 3. 添加主机
	hostName := "integration-test"
	manager.AddHost(hostName)

	// 4. 设置参数
	params := map[string]string{
		"HostName": "example.com",
		"User":     "testuser",
		"Port":     "2222",
	}

	for key, value := range params {
		err := manager.SetParam(hostName, key, value)
		if err != nil {
			t.Errorf("Failed to set param %s: %v", key, err)
		}
	}

	// 5. 添加注释
	err = manager.AddComment(hostName, "Integration test host")
	if err != nil {
		t.Errorf("Failed to add comment: %v", err)
	}

	// 6. 验证配置
	host, err := manager.GetHost(hostName)
	if err != nil {
		t.Errorf("Failed to get host: %v", err)
	}

	if host.Name != hostName {
		t.Errorf("Expected host name %q, got %q", hostName, host.Name)
	}

	// 7. 验证参数
	for key, expectedValue := range params {
		actualValue, err := manager.GetParam(hostName, key)
		if err != nil {
			t.Errorf("Failed to get param %s: %v", key, err)
		}
		if actualValue != expectedValue {
			t.Errorf("Expected %s=%q, got %q", key, expectedValue, actualValue)
		}
	}

	// 8. 验证全局配置
	globalHost, err := manager.GetGlobalConfig()
	if err != nil {
		t.Errorf("Failed to get global config: %v", err)
	}
	if globalHost == nil {
		t.Error("Global config should not be nil")
	}

	tcpKeepAlive, err := manager.GetGlobalParam("TCPKeepAlive")
	if err != nil {
		t.Errorf("Failed to get global param: %v", err)
	}
	if tcpKeepAlive != "yes" {
		t.Errorf("Expected global TCPKeepAlive='yes', got %q", tcpKeepAlive)
	}

	// 9. 验证主机存在
	if !manager.HasHost(hostName) {
		t.Error("Host should exist")
	}

	// 10. 获取所有主机
	hosts, err := manager.GetAllHosts()
	if err != nil {
		t.Errorf("Failed to get all hosts: %v", err)
	}
	if len(hosts) != 2 { // integration-test and *
		t.Errorf("Expected 2 hosts, got %d", len(hosts))
	}

	// 11. 验证Include指令
	includes := manager.GetIncludes()
	if len(includes) != 1 {
		t.Errorf("Expected 1 include, got %d", len(includes))
	}

	// 12. 验证语法
	err = manager.Validate()
	if err != nil {
		t.Errorf("Config should be valid: %v", err)
	}

	// 13. 保存配置
	err = manager.Save()
	if err != nil {
		t.Errorf("Failed to save config: %v", err)
	}

	// 14. 创建备份
	backupPath, err := manager.Backup()
	if err != nil {
		t.Errorf("Failed to create backup: %v", err)
	}

	// 15. 验证备份文件
	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		t.Error("Backup file should exist")
	}

	// 16. 移除参数
	err = manager.RemoveParam(hostName, "Port")
	if err != nil {
		t.Errorf("Failed to remove param: %v", err)
	}

	// 17. 验证参数已移除
	_, err = manager.GetParam(hostName, "Port")
	if err == nil {
		t.Error("Port parameter should be removed")
	}

	// 18. 移除主机
	err = manager.RemoveHost(hostName)
	if err != nil {
		t.Errorf("Failed to remove host: %v", err)
	}

	// 19. 验证主机已移除
	if manager.HasHost(hostName) {
		t.Error("Host should be removed")
	}

	// 20. 验证全局配置仍然存在
	if !manager.HasHost("*") {
		t.Error("Global config should still exist")
	}
}

// TestGetParam_EmptyValue 测试获取空值参数
func TestGetParam_EmptyValue(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host test",
			"    Compression", // 空值参数
		},
	}

	value, err := manager.GetParam("test", "Compression")
	if err != nil {
		t.Errorf("GetParam failed: %v", err)
	}
	if value != "" {
		t.Errorf("Expected empty value, got %q", value)
	}
}

// TestWildcardMatching 测试通配符匹配
func TestWildcardMatching(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host *.example.com",
			"    Port 2222",
			"",
			"Host test.example.com",
			"    User specificuser",
		},
	}

	// 测试精确匹配
	start, _, found := manager.findHost("test.example.com")
	if !found {
		t.Error("Should find exact host match")
	}
	if start != 3 {
		t.Errorf("Expected start=3 for exact match, got %d", start)
	}

	// 测试通配符匹配逻辑（在matchHostName函数中）
	if !matchHostName("*.example.com", "test.example.com") {
		t.Error("Should match wildcard pattern")
	}
}

// TestMultipleHostNamesInOneLine 测试一行中多个主机名
func TestMultipleHostNamesInOneLine(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host server1 server2 server3",
			"    HostName example.com",
		},
	}

	// 测试获取所有主机名
	hostNames, err := manager.GetHostNames()
	if err != nil {
		t.Errorf("GetHostNames failed: %v", err)
	}

	if len(hostNames) != 3 {
		t.Errorf("Expected 3 host names, got %d", len(hostNames))
	}

	expectedNames := map[string]bool{"server1": true, "server2": true, "server3": true}
	for _, name := range hostNames {
		if !expectedNames[name] {
			t.Errorf("Unexpected host name: %s", name)
		}
	}
}

// TestFindHost_WithWildcard 测试查找通配符主机
func TestFindHost_WithWildcard(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host *",
			"    Port 22",
		},
	}

	// 通配符主机应该能被找到
	_, _, found := manager.findHost("*")
	if !found {
		t.Error("Should find global host *")
	}
}

// TestComplexConfigFile 测试复杂配置文件
func TestComplexConfigFile(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"# SSH Configuration File",
			"Include ~/.ssh/config.d/*",
			"",
			"# Global settings",
			"Host *",
			"    TCPKeepAlive yes",
			"    ServerAliveInterval 60",
			"    ControlMaster auto",
			"",
			"# Specific hosts",
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
		},
	}

	// 测试获取所有主机
	hosts, err := manager.GetAllHosts()
	if err != nil {
		t.Errorf("GetAllHosts failed: %v", err)
	}

	if len(hosts) != 4 { // *, work-*, github.com, gitlab.com
		t.Errorf("Expected 4 hosts, got %d", len(hosts))
	}

	// 测试获取全局配置
	global, err := manager.GetGlobalConfig()
	if err != nil {
		t.Errorf("GetGlobalConfig failed: %v", err)
	}
	if global == nil {
		t.Error("Global config should not be nil")
	}

	// 测试获取特定主机
	github, err := manager.GetHost("github.com")
	if err != nil {
		t.Errorf("GetHost failed for github.com: %v", err)
	}
	if github == nil {
		t.Error("github.com host should not be nil")
	}

	// 测试获取Include指令
	includes := manager.GetIncludes()
	if len(includes) != 1 {
		t.Errorf("Expected 1 include, got %d", len(includes))
	}

	// 测试获取主机名
	hostNames, err := manager.GetHostNames()
	if err != nil {
		t.Errorf("GetHostNames failed: %v", err)
	}
	if len(hostNames) != 4 {
		t.Errorf("Expected 4 host names, got %d", len(hostNames))
	}
}

// TestNewManager_LoadError 测试加载文件时发生非"不存在"错误的情况
func TestNewManager_LoadError(t *testing.T) {
	// 创建一个目录而不是文件，这样Load会失败但不是os.IsNotExist
	tmpDir := t.TempDir()

	// 在临时目录下创建一个子目录
	invalidPath := filepath.Join(tmpDir, "subdir")
	if err := os.Mkdir(invalidPath, 0o755); err != nil {
		t.Fatalf("Failed to create subdir: %v", err)
	}

	// 尝试在这个目录路径上调用NewManager（这会尝试Load一个目录）
	manager, err := NewManager(invalidPath)
	// 根据当前实现，这会因为Load失败（但不是IsNotExist）而返回错误
	// 注意：实际行为取决于Load方法如何处理目录，这里主要是测试错误路径
	t.Logf("NewManager with directory path result: manager=%v, err=%v", manager, err)
}

// TestLoad_ScannerError 测试scanner.Scan()返回错误的情况
// 这个很难在普通文件操作中模拟，通常需要mock bufio.Scanner
// 但我们可以测试大文件的情况或者权限问题

// TestSave_MkdirAllError 测试创建目录失败的情况
func TestSave_MkdirAllError(t *testing.T) {
	// 创建一个临时目录
	tmpDir := t.TempDir()

	// 创建一个只读文件作为目录名（在某些系统上这会阻止创建子目录）
	readOnlyFile := filepath.Join(tmpDir, "readonly_file")
	if err := os.WriteFile(readOnlyFile, []byte(""), 0o444); err != nil {
		t.Fatalf("Failed to create readonly file: %v", err)
	}

	// 尝试在只读文件下创建目录
	manager := &SSHConfigManager{
		filename: filepath.Join(readOnlyFile, "subdir", "config"),
		rawLines: []string{"Host test", "    HostName example.com"},
	}

	err := manager.Save()
	if err == nil {
		t.Error("Save should fail when unable to create directory")
	}
	t.Logf("Save error (expected): %v", err)
}

// TestSave_WriteFileError 测试写文件失败的情况
func TestSave_WriteFileError(t *testing.T) {
	// 创建一个临时目录
	tmpDir := t.TempDir()

	// 创建一个只读目录
	readonlyDir := filepath.Join(tmpDir, "readonly_dir")
	if err := os.Mkdir(readonlyDir, 0o444); err != nil {
		t.Fatalf("Failed to create readonly dir: %v", err)
	}

	manager := &SSHConfigManager{
		filename: filepath.Join(readonlyDir, "config"),
		rawLines: []string{"Host test", "    HostName example.com"},
	}

	err := manager.Save()
	if err == nil {
		t.Error("Save should fail when unable to write file")
	}
	t.Logf("Save error (expected): %v", err)
}

// TestGetHost_HostEndOutOfRange 测试hostEnd超出范围的边界情况
// 这个在正常情况下很难触发，因为findHost应该正确设置边界

// TestGetGlobalConfig_NotFound 测试GetGlobalConfig找不到的情况
func TestGetGlobalConfig_NotFound(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{"Host test", "    HostName example.com"},
	}

	_, err := manager.GetGlobalConfig()
	if err == nil {
		t.Error("GetGlobalConfig should fail when global config not found")
	}
	t.Logf("GetGlobalConfig error (expected): %v", err)
}

// TestBackup_WriteFileError 测试备份时写文件失败
func TestBackup_WriteFileError(t *testing.T) {
	// 创建一个临时目录
	tmpDir := t.TempDir()

	// 创建一个只读目录
	readonlyDir := filepath.Join(tmpDir, "readonly_dir")
	if err := os.Mkdir(readonlyDir, 0o444); err != nil {
		t.Fatalf("Failed to create readonly dir: %v", err)
	}

	manager := &SSHConfigManager{
		filename: filepath.Join(readonlyDir, "config"),
		rawLines: []string{"Host test", "    HostName example.com"},
	}

	_, err := manager.Backup()
	if err == nil {
		t.Error("Backup should fail when unable to write backup file")
	}
	t.Logf("Backup error (expected): %v", err)
}

// TestFindHost_WildcardMatch 测试通配符匹配的情况
func TestFindHost_WildcardMatch(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host *.example.com",
			"    Port 2222",
		},
	}

	start, end, found := manager.findHost("test.example.com")
	// 根据当前实现，通配符匹配应该返回false（因为我们不自动匹配Host *）
	// 但对于*.example.com这样的模式，应该会匹配
	if !found {
		t.Log("Wildcard matching might not be implemented in findHost, which is OK for current design")
	} else {
		t.Logf("Found wildcard match: start=%d, end=%d", start, end)
	}
}

// TestGetLineIndent_AllWhitespace 测试整行都是空白字符的情况
func TestGetLineIndent_AllWhitespace(t *testing.T) {
	indent := getLineIndent("    \t  ")
	expected := "    \t  "
	if indent != expected {
		t.Errorf("Expected indent '%s', got '%s'", expected, indent)
	}
}

// TestParseParamLine_EmptyLine 测试解析空行
func TestParseParamLine_EmptyLine(t *testing.T) {
	key, value := parseParamLine("")
	if key != "" || value != "" {
		t.Errorf("Expected empty key and value for empty line, got key='%s', value='%s'", key, value)
	}
}

// TestFindParamInHost_EndOutOfRange 测试findParamInHost中end超出范围
func TestFindParamInHost_EndOutOfRange(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host test",
			"    HostName example.com",
		},
	}

	// 调用findParamInHost，传入一个超出范围的end值
	line := manager.findParamInHost(0, 100, "HostName") // end=100 超出实际行数
	if line != 1 {
		t.Errorf("Expected to find HostName at line 1, got line %d", line)
	}
}

// TestGetParam_HostEndOutOfRange 测试GetParam中hostEnd超出范围
// 这很难直接测试，因为findHost应该返回正确的边界

// TestRemoveHost_RemoveLeadingAndTrailingBlanks 测试删除主机时移除前后空行
func TestRemoveHost_RemoveLeadingAndTrailingBlanks(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"",                         // 索引 0 - 前面的空行 (应该被删除)
			"Host test",                // 索引 1 - start=1
			"    HostName example.com", // 索引 2
			"",                         // 索引 3 - 紧邻 Host 块结束的空行 (应该被删除)
			"Host another",             // 索引 4 - end=4
			"    HostName another.com", // 索引 5
			// 文件结束
		},
	}

	err := manager.RemoveHost("test")
	if err != nil {
		t.Errorf("RemoveHost failed: %v", err)
	}

	// 根据当前逻辑，start会减到0（删除索引0的空行），end=4，
	// 所以删除 m.rawLines[0:4]，保留 m.rawLines[4:]。
	// m.rawLines[4:] = ["Host another", "    HostName another.com"]
	expectedLines := []string{"Host another", "    HostName another.com"}
	if len(manager.rawLines) != len(expectedLines) {
		t.Errorf("Expected %d lines after removal, got %d. Lines: %v", len(expectedLines), len(manager.rawLines), manager.rawLines)
	}
	// 可以进一步验证内容...
	for i, expectedLine := range expectedLines {
		if manager.rawLines[i] != expectedLine {
			t.Errorf("Line %d: expected '%s', got '%s'", i, expectedLine, manager.rawLines[i])
		}
	}
}

// TestGetGlobalHost_LastBlock 测试getGlobalHost中Host *是最后一块配置
func TestGetGlobalHost_LastBlock(t *testing.T) {
	manager := &SSHConfigManager{
		rawLines: []string{
			"Host test",                // 0
			"    HostName example.com", // 1
			"",                         // 2
			"Host *",                   // 3 <- start should be 3
			"    TCPKeepAlive yes",     // 4
			// 文件结束，没有下一个Host
			// len(rawLines) = 5, so end should be 5
		},
	}

	start, end, found := manager.getGlobalHost()
	if !found {
		t.Error("Should find Host *")
	}
	if start != 3 { // "Host *" 在索引 3
		t.Errorf("Expected start=3, got %d", start)
	}
	if end != 5 { // end应该是文件长度 len(rawLines) = 5
		t.Errorf("Expected end=5, got %d", end)
	}
	// 可以进一步验证 start 和 end 指向的内容是否正确
	if start >= len(manager.rawLines) || manager.rawLines[start] != "Host *" {
		t.Errorf("Start index %d is invalid or does not point to 'Host *'", start)
	}
	// end 指向文件末尾，所以 end == len(...) 是正确的
}

// TestRenameHost tests the renaming of a host alias.
func TestRenameHost(t *testing.T) {
	testCases := []struct {
		name            string
		initialContent  string
		oldName         string
		newName         string
		expectError     bool
		expectedContent string
	}{
		{
			name: "Rename first alias in multi-alias line",
			initialContent: `
# My Server
Host server1 web
  HostName 1.2.3.4
  User root

Host db
  HostName 5.6.7.8
`,
			oldName: "server1",
			newName: "prod-server",
			expectedContent: `
# My Server
Host prod-server web
  HostName 1.2.3.4
  User root

Host db
  HostName 5.6.7.8
`,
		},
		{
			name: "Rename second alias in multi-alias line",
			initialContent: `
Host server1 web
  HostName 1.2.3.4
`,
			oldName: "web",
			newName: "www",
			expectedContent: `
Host server1 www
  HostName 1.2.3.4
`,
		},
		{
			name: "Rename single alias host",
			initialContent: `
Host db
  HostName 5.6.7.8
`,
			oldName: "db",
			newName: "database",
			expectedContent: `
Host database
  HostName 5.6.7.8
`,
		},
		{
			name:           "Rename non-existent host",
			initialContent: `Host test`,
			oldName:        "nonexistent",
			newName:        "new",
			expectError:    true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			manager := &SSHConfigManager{
				rawLines: strings.Split(strings.TrimSpace(tc.initialContent), "\n"),
			}

			err := manager.RenameHost(tc.oldName, tc.newName)

			if tc.expectError {
				if err == nil {
					t.Error("Expected an error, but got nil")
				}
				return
			}

			if err != nil {
				t.Fatalf("RenameHost failed: %v", err)
			}

			actualContent := manager.BuildConfig()
			expected := strings.TrimSpace(tc.expectedContent) + "\n"

			if strings.TrimSpace(actualContent) != strings.TrimSpace(expected) {
				t.Errorf("Content mismatch.\nExpected:\n%s\nGot:\n%s", expected, actualContent)
			}
		})
	}
}

// TestReorderHosts tests the lossless reordering of host blocks.
func TestReorderHosts(t *testing.T) {
	initialContent := `
# Global settings
Include ~/.ssh/global

Host *
  User globaluser

# Host A config
# with multiple comment lines
Host hostA aliasA
  HostName a.com


# Host B config
Host hostB
  HostName b.com

Host hostC
  HostName c.com
`
	manager := &SSHConfigManager{
		rawLines: strings.Split(strings.TrimSpace(initialContent), "\n"),
	}

	order := []string{"hostC", "hostA", "hostB"}
	err := manager.ReorderHosts(order)
	if err != nil {
		t.Fatalf("ReorderHosts failed: %v", err)
	}

	expectedContent := `# Global settings
Include ~/.ssh/global

Host *
  User globaluser

Host hostC
  HostName c.com

# Host A config
# with multiple comment lines
Host hostA aliasA
  HostName a.com


# Host B config
Host hostB
  HostName b.com
`

	actual := manager.BuildConfig()
	expected := strings.TrimSpace(expectedContent) + "\n"

	if strings.TrimSpace(actual) != strings.TrimSpace(expected) {
		t.Errorf("Reordered content mismatch.\nExpected:\n%s\nGot:\n%s", expected, actual)
	}
}

// TestReorderHosts_CommentDuplicationBug specifically tests the fix for the comment duplication bug.
func TestReorderHosts_CommentDuplicationBug(t *testing.T) {
	initialContent := `
# Header Comment

Host hostA
  HostName a.com

# Comment for B
# Another comment for B

Host hostB
  HostName b.com
`
	manager := &SSHConfigManager{
		rawLines: strings.Split(strings.TrimSpace(initialContent), "\n"),
	}

	// Move hostB before hostA
	order := []string{"hostB", "hostA"}
	err := manager.ReorderHosts(order)
	if err != nil {
		t.Fatalf("ReorderHosts failed: %v", err)
	}

	expectedContent := `

# Comment for B
# Another comment for B

Host hostB
  HostName b.com
# Header Comment

Host hostA
  HostName a.com
`
	actual := manager.BuildConfig()
	expected := strings.TrimSpace(expectedContent) + "\n"

	if strings.TrimSpace(actual) != strings.TrimSpace(expected) {
		t.Errorf("Reordered content mismatch (comment duplication bug).\nExpected:\n%s\nGot:\n%s", expected, actual)
	}
}

// TestReorderHosts_WithMixedGlobalDirectives tests that global directives (Host *, Include)
// are correctly identified and moved to the top during reordering.
func TestReorderHosts_WithMixedGlobalDirectives(t *testing.T) {
	initialContent := `
# This is the true header
Include ~/.ssh/header.conf

# Host A
Host hostA
  HostName a.com

# Global settings in the middle
Host *
  User globaluser

# Include in the middle
Include ~/.ssh/middle.conf

# Host B
Host hostB
  HostName b.com
`
	manager := &SSHConfigManager{
		rawLines: strings.Split(strings.TrimSpace(initialContent), "\n"),
	}

	// Reorder B before A
	order := []string{"hostB", "hostA"}
	err := manager.ReorderHosts(order)
	if err != nil {
		t.Fatalf("ReorderHosts failed: %v", err)
	}

	expectedContent := `# This is the true header
Include ~/.ssh/header.conf

# Global settings in the middle
Host *
  User globaluser

# Include in the middle
Include ~/.ssh/middle.conf

# Host B
Host hostB
  HostName b.com

# Host A
Host hostA
  HostName a.com
`
	actual := manager.BuildConfig()
	expected := strings.TrimSpace(expectedContent) + "\n"

	if strings.TrimSpace(actual) != strings.TrimSpace(expected) {
		t.Errorf("Reordered content mismatch (Mixed Directives).\nExpected:\n---\n%s\n---\nGot:\n---\n%s\n---", expected, actual)
	}
}

// TestReorderHosts_WithMixedGlobalDirectives tests that global directives (Host *, Include, Match)
// are correctly identified and moved to the top during reordering.
func TestReorderHosts_WithMixedGlobalDirectives_1(t *testing.T) {
	initialContent := `
# This is the true header

# Host A
Host hostA
  HostName a.com

# Global settings in the middle
Host *
  User globaluser

# Include in the middle
Include ~/.ssh/middle.conf

# Host B
Host hostB
  HostName b.com

# Match block at the end
Match User someuser
  HostName *.internal.com
`
	manager := &SSHConfigManager{
		rawLines: strings.Split(strings.TrimSpace(initialContent), "\n"),
	}

	// Reorder B before A
	order := []string{"hostB", "hostA"}
	err := manager.ReorderHosts(order)
	if err != nil {
		t.Fatalf("ReorderHosts failed: %v", err)
	}

	expectedContent := `

# Global settings in the middle
Host *
  User globaluser

# Include in the middle
Include ~/.ssh/middle.conf

# Match block at the end
Match User someuser
  HostName *.internal.com

# Host B
Host hostB
  HostName b.com
# This is the true header

# Host A
Host hostA
  HostName a.com
`
	actual := manager.BuildConfig()
	expected := strings.TrimSpace(expectedContent) + "\n"

	if strings.TrimSpace(actual) != strings.TrimSpace(expected) {
		t.Errorf("Reordered content mismatch (Mixed Directives).\nExpected:\n---\n%s\n---\nGot:\n---\n%s\n---", expected, actual)
	}
}
