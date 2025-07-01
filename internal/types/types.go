package types

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
