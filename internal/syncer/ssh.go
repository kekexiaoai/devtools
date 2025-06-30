package syncer

import (
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"

	"DevTools/internal/config"
)

func getSSHAuthMethod(config config.SSHConfig) (ssh.AuthMethod, error) {
	if config.AuthMethod == "password" {
		return ssh.Password(config.Password), nil
	}
	key, err := os.ReadFile(config.KeyPath)
	if err != nil {
		return nil, fmt.Errorf("无法读取私钥文件: %w", err)
	}
	signer, err := ssh.ParsePrivateKey(key)
	if err != nil {
		return nil, fmt.Errorf("无法解析私钥: %w", err)
	}
	return ssh.PublicKeys(signer), nil
}

func newSFTPClient(config config.SSHConfig) (*sftp.Client, error) {
	auth, err := getSSHAuthMethod(config)
	if err != nil {
		return nil, err
	}

	sshConfig := &ssh.ClientConfig{
		User:            config.User,
		Auth:            []ssh.AuthMethod{auth},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // 生产环境建议替换
		Timeout:         10 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", config.Host, config.Port)
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

func TestSSHConnection(config config.SSHConfig) (string, error) {
	auth, err := getSSHAuthMethod(config)
	if err != nil {
		return "", err
	}

	sshConfig := &ssh.ClientConfig{
		User:            config.User,
		Auth:            []ssh.AuthMethod{auth},
		HostKeyCallback: func(hostname string, remote net.Addr, key ssh.PublicKey) error { return nil }, // 允许任何host key
		Timeout:         5 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", config.Host, config.Port)
	client, err := ssh.Dial("tcp", addr, sshConfig)
	if err != nil {
		return "", fmt.Errorf("连接失败: %w", err)
	}
	defer client.Close()
	return "连接成功!", nil
}

func UpdateRemoteFile(config config.SSHConfig, remotePath string, content string) error {
	client, err := newSFTPClient(config)
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
