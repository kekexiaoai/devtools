package syncer

import (
	"bytes"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"

	"devtools/backend/internal/types"
)

func getSSHAuthMethod(cfg types.SSHConfig) (ssh.AuthMethod, error) {
	if cfg.AuthMethod == "password" {
		return ssh.Password(cfg.Password), nil
	}
	key, err := os.ReadFile(cfg.KeyPath)
	if err != nil {
		return nil, fmt.Errorf("无法读取私钥文件: %w", err)
	}
	signer, err := ssh.ParsePrivateKey(key)
	if err != nil {
		return nil, fmt.Errorf("无法解析私钥: %w", err)
	}
	return ssh.PublicKeys(signer), nil
}

func NewSFTPClient(cfg types.SSHConfig) (*sftp.Client, error) {
	auth, err := getSSHAuthMethod(cfg)
	if err != nil {
		return nil, err
	}

	sshConfig := &ssh.ClientConfig{
		User:            cfg.User,
		Auth:            []ssh.AuthMethod{auth},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // 生产环境建议替换
		Timeout:         10 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	conn, err := ssh.Dial("tcp", addr, sshConfig)
	if err != nil {
		return nil, fmt.Errorf("SSH拨号失败: %w", err)
	}

	client, err := sftp.NewClient(conn)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("SFTP客户端创建失败: %w", err)
	}

	return client, nil
}

func TestSSHConnection(cfg types.SSHConfig) (string, error) {
	auth, err := getSSHAuthMethod(cfg)
	if err != nil {
		return "", err
	}

	sshConfig := &ssh.ClientConfig{
		User:            cfg.User,
		Auth:            []ssh.AuthMethod{auth},
		HostKeyCallback: func(hostname string, remote net.Addr, key ssh.PublicKey) error { return nil }, // 允许任何host key
		Timeout:         5 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	client, err := ssh.Dial("tcp", addr, sshConfig)
	if err != nil {
		return "", fmt.Errorf("连接失败: %w", err)
	}
	defer client.Close()
	return "连接成功!", nil
}

// defaultHTMLTemplate 包含了用于展示剪贴板内容的默认HTML模板。
// 它提供了一个“复制”按钮，并使用了基本的样式。
const defaultHTMLTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pasted Content</title>
    <style>
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: #f8f9fa; color: #212529; }
        .container { max-width: 1000px; margin: 2rem auto; padding: 2rem; }
		.header { display: flex; justify-content: flex-end; margin-bottom: 1rem; }
        #copy-btn { font-size: 14px; padding: 8px 16px; cursor: pointer; border: 1px solid #ccc; border-radius: 6px; background-color: #fff; }
        #copy-btn:hover { background-color: #f1f3f5; }
        pre { white-space: pre-wrap; word-wrap: break-word; background-color: #fff; padding: 1.5em; border-radius: 6px; border: 1px solid #dee2e6; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <button id="copy-btn">Copy to Clipboard</button>
        </div>
        <pre id="content-block">{{.}}</pre>
    </div>
    <script>
        document.getElementById('copy-btn').addEventListener('click', function() {
            const btn = this;
            const content = document.getElementById('content-block').innerText;
            
            // Create a temporary textarea element to hold the text
            const textarea = document.createElement('textarea');
            textarea.value = content;
            textarea.style.position = 'fixed';  // Prevent scrolling to bottom of page in MS Edge.
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            
            // Select and copy the text
            textarea.select();
            try {
                document.execCommand('copy');
                btn.innerText = 'Copied!';
            } catch (err) {
                console.error('Failed to copy text: ', err);
                btn.innerText = 'Error!';
            } finally {
                // Clean up the temporary element
                document.body.removeChild(textarea);
                setTimeout(() => { btn.innerText = 'Copy to Clipboard'; }, 2000);
            }
        });
    </` + `script>
</body>
</html>`

// GetDefaultHTMLTemplate 返回用于剪贴板查看器的内置默认HTML模板。
func GetDefaultHTMLTemplate() string {
	return defaultHTMLTemplate
}

// UpdateRemoteFile contains the updated HTML template with corrected JavaScript.
func UpdateRemoteFile(config types.SSHConfig, remotePath string, content string, asHTML bool) error {
	client, err := NewSFTPClient(config)
	if err != nil {
		return err
	}
	defer client.Close()

	remoteDir := filepath.Dir(remotePath)
	if err := client.MkdirAll(remoteDir); err != nil {
		return fmt.Errorf("创建远程目录失败: %w", err)
	}

	f, err := client.Create(remotePath)
	if err != nil {
		return fmt.Errorf("创建远程文件失败: %w", err)
	}
	defer f.Close()

	var contentToWrite []byte
	if asHTML {
		// 优先使用用户在配置中定义的模板
		tmpl := config.Clipboard.HTMLTemplate
		if tmpl == "" {
			// 如果用户没有定义，则使用内置的默认模板
			tmpl = defaultHTMLTemplate
		}

		// 解析并执行模板
		t := template.Must(template.New("webpage").Parse(tmpl))
		var buf bytes.Buffer
		if err := t.Execute(&buf, content); err != nil {
			return fmt.Errorf("HTML模板执行失败: %w", err)
		}
		contentToWrite = buf.Bytes()
	} else {
		contentToWrite = []byte(content)
	}

	if _, err := f.Write(contentToWrite); err != nil {
		return fmt.Errorf("写入远程文件失败: %w", err)
	}
	return nil
}

// syncFile handles uploading a single file.
func syncFile(client *sftp.Client, localPath, remotePath string) error {
	srcFile, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("无法打开本地文件: %w", err)
	}
	defer srcFile.Close()

	// 确保远程目录存在
	remoteDir := filepath.Dir(remotePath)
	if err := client.MkdirAll(remoteDir); err != nil {
		return fmt.Errorf("创建远程目录失败: %w", err)
	}

	dstFile, err := client.Create(remotePath)
	if err != nil {
		return fmt.Errorf("创建远程文件失败: %w", err)
	}
	defer dstFile.Close()

	_, err = io.Copy(dstFile, srcFile)
	if err != nil {
		return fmt.Errorf("复制文件内容失败: %w", err)
	}

	log.Printf("SYNCED: %s -> %s", localPath, remotePath)
	return nil
}

// deleteRemote handles deleting a remote file or directory.
func deleteRemote(client *sftp.Client, remotePath string) error {
	// 尝试作为文件删除
	err := client.Remove(remotePath)
	if err == nil {
		log.Printf("DELETED FILE: %s", remotePath)
		return nil
	}

	// 如果作为文件删除失败，尝试作为目录删除
	// 注意：sftp.RemoveDirectory 通常要求目录为空
	// 对于递归删除，需要更复杂的逻辑，这里简化处理
	err = client.RemoveDirectory(remotePath)
	if err == nil {
		log.Printf("DELETED DIR: %s", remotePath)
		return nil
	}

	// 如果两者都失败，但错误是"not found"，则忽略
	if strings.Contains(err.Error(), "not found") {
		return nil
	}

	return fmt.Errorf("删除远程路径失败: %w", err)
}

// ReconcileDirectory 递归地比对和同步本地目录与远程目录
func ReconcileDirectory(client *sftp.Client, pair types.SyncPair, emitLog func(level, message string)) {
	emitLog("INFO", fmt.Sprintf("Starting full sync for: %s", pair.LocalPath))

	// 使用 filepath.WalkDir 遍历本地目录 (Go 1.16+ 推荐)
	walkErr := filepath.WalkDir(pair.LocalPath, func(localPath string, d fs.DirEntry, err error) error {
		if err != nil {
			return err // 传递遍历过程中的错误
		}

		// 计算相对路径和远程路径
		relativePath, err := filepath.Rel(pair.LocalPath, localPath)
		if err != nil {
			return err
		}
		remotePath := filepath.ToSlash(filepath.Join(pair.RemotePath, relativePath))

		if d.IsDir() {
			// 确保远程也创建对应的目录结构，即使是空目录
			if err := client.MkdirAll(remotePath); err != nil {
				emitLog("ERROR", fmt.Sprintf("Failed to create remote dir %s: %v", remotePath, err))
				// Don't return the error, just log it and continue walking.
			}
			return nil
		}

		// --- 以下是文件比对逻辑 ---
		localInfo, err := d.Info()
		if err != nil {
			emitLog("ERROR", fmt.Sprintf("Failed to get local file info for %s: %v", localPath, err))
			return nil // 跳过这个文件，继续下一个
		}

		// 检查远程文件状态
		remoteInfo, err := client.Stat(remotePath)

		// 检查点1: 远程文件不存在
		if os.IsNotExist(err) {
			// 修改日志格式，下同
			emitLog("INFO", fmt.Sprintf("Remote missing, syncing: %s -> %s", localPath, remotePath))
			if syncErr := syncFile(client, localPath, remotePath); syncErr != nil {
				emitLog("ERROR", fmt.Sprintf("Failed sync: %s -> %s (%v)", localPath, remotePath, syncErr))
			} else {
				emitLog("SUCCESS", fmt.Sprintf("Synced: %s -> %s", localPath, remotePath))
			}
			return nil
		}

		// 其他获取远程文件信息的错误
		if err != nil {
			emitLog("ERROR", fmt.Sprintf("Failed to get remote file info for %s: %v", remotePath, err))
			return nil
		}

		// 检查点2: 远程文件存在，但大小不一致
		if localInfo.Size() != remoteInfo.Size() {
			emitLog("INFO", fmt.Sprintf("Size differs, syncing: %s -> %s", localPath, remotePath))
			if syncErr := syncFile(client, localPath, remotePath); syncErr != nil {
				emitLog("ERROR", fmt.Sprintf("Failed sync: %s -> %s (%v)", localPath, remotePath, syncErr))
			} else {
				emitLog("SUCCESS", fmt.Sprintf("Synced: %s -> %s", localPath, remotePath))
			}
			return nil
		}

		// 如果远程文件存在且大小一致，则认为它是同步的
		return nil
	})

	if walkErr != nil {
		emitLog("ERROR", fmt.Sprintf("Error during full sync for %s: %v", pair.LocalPath, walkErr))
	} else {
		emitLog("SUCCESS", fmt.Sprintf("Full sync completed for: %s", pair.LocalPath))
	}
}
