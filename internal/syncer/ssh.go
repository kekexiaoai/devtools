package syncer

import (
	"fmt"
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

	"devtools/internal/types"
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

func UpdateRemoteFile(cfg types.SSHConfig, remotePath string, content string) error {
	client, err := NewSFTPClient(cfg)
	if err != nil {
		return err
	}
	defer client.Close()

	// 确保远程目录存在
	remoteDir := filepath.Dir(remotePath)
	if err := client.MkdirAll(remoteDir); err != nil {
		return fmt.Errorf("创建远程目录失败: %w", err)
	}

	f, err := client.Create(remotePath)
	if err != nil {
		return fmt.Errorf("创建远程文件失败: %w", err)
	}
	defer f.Close()

	if _, err := f.Write([]byte(content)); err != nil {
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
	emitLog("INFO", fmt.Sprintf("Starting initial sync check for: %s", pair.LocalPath))

	// 使用 filepath.WalkDir 遍历本地目录 (Go 1.16+ 推荐)
	err := filepath.WalkDir(pair.LocalPath, func(localPath string, d fs.DirEntry, err error) error {
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
			// 如果是目录，只需确保远程目录存在
			// 我们可以在上传文件时通过 client.MkdirAll 自动创建，这里可以简化
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
			emitLog("INFO", fmt.Sprintf("Remote file not found, syncing: %s", localPath))
			if syncErr := syncFile(client, localPath, remotePath); syncErr != nil {
				emitLog("ERROR", fmt.Sprintf("Failed to sync new file %s: %v", localPath, syncErr))
			} else {
				emitLog("SUCCESS", fmt.Sprintf("Synced new file: %s", localPath))
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
			emitLog("INFO", fmt.Sprintf("File sizes differ, syncing: %s (%d bytes vs %d bytes)", localPath, localInfo.Size(), remoteInfo.Size()))
			if syncErr := syncFile(client, localPath, remotePath); syncErr != nil {
				emitLog("ERROR", fmt.Sprintf("Failed to sync modified file %s: %v", localPath, syncErr))
			} else {
				emitLog("SUCCESS", fmt.Sprintf("Synced modified file: %s", localPath))
			}
			return nil
		}

		// 如果远程文件存在且大小一致，则认为它是同步的
		return nil
	})

	if err != nil {
		emitLog("ERROR", fmt.Sprintf("Error during initial sync walk for %s: %v", pair.LocalPath, err))
	} else {
		emitLog("SUCCESS", fmt.Sprintf("Initial sync check completed for: %s", pair.LocalPath))
	}
}
