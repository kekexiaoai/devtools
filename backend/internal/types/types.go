package types

import "fmt"

type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"` // e.g., "SUCCESS", "ERROR", "INFO"
	Message   string `json:"message"`
}

type SSHConfig struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	User       string `json:"user"`
	AuthMethod string `json:"authMethod"` // "password" or "key"
	Password   string `json:"password"`   // 注意：生产环境中应加密
	KeyPath    string `json:"keyPath"`

	ClipboardFilePath string `json:"clipboardFilePath,omitempty"`
}

type SyncPair struct {
	ID          string `json:"id"`
	ConfigID    string `json:"configId"`
	LocalPath   string `json:"localPath"`
	RemotePath  string `json:"remotePath"`
	SyncDeletes bool   `json:"syncDeletes"`
}

// SSHHost 代表一个从 ~/.ssh/config 文件中解析出的主机配置
type SSHHost struct {
	Alias        string `json:"alias"`        // Host 别名, e.g., "my-server"
	HostName     string `json:"hostName"`     // HostName, e.g., "192.168.1.100"
	User         string `json:"user"`         // User, e.g., "root"
	Port         string `json:"port"`         // Port, e.g., "22"
	IdentityFile string `json:"identityFile"` // IdentityFile, e.g., "~/.ssh/id_rsa"
}

// PasswordRequiredError 表示连接因为需要密码而失败
type PasswordRequiredError struct {
	Alias string
}

func (e *PasswordRequiredError) Error() string {
	// 这个错误信息字符串，将是我们前端用来判断错误类型的“暗号”
	return fmt.Sprintf("password is required for host %s", e.Alias)
}

// HostKeyVerificationRequiredError 表示需要用户确认一个新的主机指纹
type HostKeyVerificationRequiredError struct {
	Alias       string
	Fingerprint string
	HostAddress string
}

func (e *HostKeyVerificationRequiredError) Error() string {
	return fmt.Sprintf("host key verification required for host %s (%s)", e.Alias, e.HostAddress)
}

type ConnectionResult struct {
	Success                     bool                              `json:"success"`
	ErrorMessage                string                            `json:"errorMessage,omitempty"`
	PasswordRequired            *PasswordRequiredError            `json:"passwordRequired,omitempty"`
	HostKeyVerificationRequired *HostKeyVerificationRequiredError `json:"hostKeyVerificationRequired,omitempty"`
}

// AuthenticationFailedError 表示尝试连接但因凭据错误而失败
type AuthenticationFailedError struct {
	Alias string
}

func (e *AuthenticationFailedError) Error() string {
	return fmt.Sprintf("authentication failed for host %s", e.Alias)
}
