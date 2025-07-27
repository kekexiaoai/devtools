package sshtunnel

import (
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"devtools/backend/internal/sshmanager"
	"devtools/backend/internal/types"

	"github.com/google/uuid"
	"golang.org/x/crypto/ssh"
)

// Tunnel 代表一个活动的端口转发隧道
type Tunnel struct {
	ID         string
	LocalAddr  string
	RemoteAddr string
	sshClient  *ssh.Client
	listener   net.Listener
	cancelFunc context.CancelFunc // 用于优雅地关闭隧道
}

// Manager 负责管理所有活动的隧道
type Manager struct {
	activeTunnels map[string]*Tunnel
	mu            sync.RWMutex
	sshManager    *sshmanager.Manager // 依赖我们已有的 SSH 管理器来获取配置
	appCtx        context.Context
}

// NewManager 是隧道管理器的构造函数
func NewManager(ctx context.Context, sshMgr *sshmanager.Manager) *Manager {
	return &Manager{
		activeTunnels: make(map[string]*Tunnel),
		sshManager:    sshMgr,
		appCtx:        ctx,
	}
}

// --- 核心功能实现 - 本地端口转发 (-L) ---

// StartLocalForward 启动一个本地端口转发隧道
func (m *Manager) StartLocalForward(alias string, localPort int, remoteHost string, remotePort int, password string) (string, error) {
	// 获取主机的 SSH 配置
	host, err := m.sshManager.GetSSHHost(alias)
	if err != nil {
		return "", fmt.Errorf("could not find host config for alias '%s': %w", alias, err)
	}

	// 使用新的辅助函数来获取认证方法
	authMethods, err := m.getSSHAuthMethods(host, password)
	if err != nil {
		return "", err
	}

	sshConfig := &ssh.ClientConfig{
		User:            host.User,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	serverAddr := fmt.Sprintf("%s:%s", host.HostName, host.Port)
	sshClient, err := ssh.Dial("tcp", serverAddr, sshConfig)
	if err != nil {
		return "", fmt.Errorf("SSH dial to %s failed: %w", alias, err)
	}

	// 在本地启动一个 TCP 监听器
	localAddr := fmt.Sprintf("127.0.0.1:%d", localPort)
	listener, err := net.Listen("tcp", localAddr)
	if err != nil {
		sshClient.Close()
		return "", fmt.Errorf("failed to listen on local port %d: %w", localPort, err)
	}

	// 创建并注册我们的隧道
	tunnelID := uuid.NewString()
	ctx, cancel := context.WithCancel(m.appCtx)
	tunnel := &Tunnel{
		ID:         tunnelID,
		LocalAddr:  localAddr,
		RemoteAddr: fmt.Sprintf("%s:%d", remoteHost, remotePort),
		sshClient:  sshClient,
		listener:   listener,
		cancelFunc: cancel,
	}

	m.mu.Lock()
	m.activeTunnels[tunnelID] = tunnel
	m.mu.Unlock()

	log.Printf("Started local forward tunnel %s: %s -> %s (via %s)", tunnelID, tunnel.LocalAddr, tunnel.RemoteAddr, alias)

	// 在一个新的 Goroutine 中启动“数据转发循环”，防止阻塞
	go m.runTunnel(tunnel, ctx)

	return tunnelID, nil
}

// getSSHAuthMethods 智能地构建认证方法列表
func (m *Manager) getSSHAuthMethods(host *types.SSHHost, password string) ([]ssh.AuthMethod, error) {
	var authMethods []ssh.AuthMethod

	// 如果用户在本次操作中提供了密码，优先使用它
	if password != "" {
		authMethods = append(authMethods, ssh.Password(password))
	}

	// 尝试使用 IdentityFile (密钥文件)
	if host.IdentityFile != "" {
		// 展开路径中的 ~
		identityFilePath := host.IdentityFile
		if strings.HasPrefix(identityFilePath, "~") {
			homeDir, err := os.UserHomeDir()
			if err == nil {
				identityFilePath = filepath.Join(homeDir, identityFilePath[1:])
			}
		}

		key, err := os.ReadFile(identityFilePath)
		if err == nil {
			signer, err := ssh.ParsePrivateKey(key)
			if err == nil {
				authMethods = append(authMethods, ssh.PublicKeys(signer))
			} else {
				log.Printf("Warning: Failed to parse private key %s: %v", host.IdentityFile, err)
			}
		} else {
			log.Printf("Warning: Failed to read private key file %s: %v", host.IdentityFile, err)
		}
	}

	if len(authMethods) == 0 {
		return nil, fmt.Errorf("no valid authentication method available (no password provided and key file is invalid or missing)")
	}

	return authMethods, nil
}

// runTunnel 是每个隧道的主循环，负责接受连接并转发数据
func (m *Manager) runTunnel(tunnel *Tunnel, ctx context.Context) {
	defer m.cleanupTunnel(tunnel.ID) // 确保隧道退出时被清理

	for {
		select {
		case <-ctx.Done(): // 如果隧道被取消，则退出
			return
		default:
			// 6. 等待并接受来自本地的连接
			localConn, err := tunnel.listener.Accept()
			if err != nil {
				// 如果监听器被关闭，这是一个正常的退出信号
				if opErr, ok := err.(*net.OpError); ok && opErr.Err.Error() == "use of closed network connection" {
					return
				}
				log.Printf("Tunnel %s failed to accept connection: %v", tunnel.ID, err)
				return
			}

			// 7. 为每一个进来的连接，在新的 Goroutine 中处理数据转发
			go m.forwardConnection(localConn, tunnel)
		}
	}
}

// forwardConnection 在本地连接和远程SSH通道之间双向复制数据
func (m *Manager) forwardConnection(localConn net.Conn, tunnel *Tunnel) {
	defer localConn.Close()

	// 通过已建立的 SSH 客户端，连接到最终的目标服务器
	remoteConn, err := tunnel.sshClient.Dial("tcp", tunnel.RemoteAddr)
	if err != nil {
		log.Printf("Tunnel %s failed to dial remote addr %s: %v", tunnel.ID, tunnel.RemoteAddr, err)
		return
	}
	defer remoteConn.Close()

	log.Printf("Tunnel %s: Forwarding connection for %s", tunnel.ID, localConn.RemoteAddr())

	// 使用两个 Goroutine，双向地、并发地复制数据
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		_, err := io.Copy(remoteConn, localConn)
		if err != nil && err != io.EOF {
			log.Printf("Error copying from local to remote: %v", err)
		}
	}()
	go func() {
		defer wg.Done()
		_, err := io.Copy(localConn, remoteConn)
		if err != nil && err != io.EOF {
			log.Printf("Error copying from remote to local: %v", err)
		}
	}()

	wg.Wait() // 等待两个方向的数据复制都完成
}

// StopForward 停止一个正在运行的隧道
func (m *Manager) StopForward(tunnelID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	tunnel, ok := m.activeTunnels[tunnelID]
	if !ok {
		return fmt.Errorf("tunnel with ID %s not found", tunnelID)
	}
	tunnel.cancelFunc() // 发出取消信号

	log.Printf("Stopping tunnel %s: %s -> %s", tunnelID, tunnel.LocalAddr, tunnel.RemoteAddr)
	return nil
}

// cleanupTunnel 关闭所有资源并从map中移除
func (m *Manager) cleanupTunnel(tunnelID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if tunnel, ok := m.activeTunnels[tunnelID]; ok {
		tunnel.listener.Close()
		tunnel.sshClient.Close()
		delete(m.activeTunnels, tunnelID)
		log.Printf("Cleaned up tunnel %s", tunnelID)
	}
}
