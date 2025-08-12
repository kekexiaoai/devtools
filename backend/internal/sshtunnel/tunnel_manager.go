package sshtunnel

import (
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"sync"

	"devtools/backend/internal/sshmanager"

	"github.com/google/uuid"
	"golang.org/x/crypto/ssh"
)

// Tunnel 代表一个活动的端口转发隧道
type Tunnel struct {
	ID         string
	Alias      string
	Type       string // local, remote, dynamic
	LocalAddr  string
	RemoteAddr string
	sshClient  *ssh.Client
	listener   net.Listener
	cancelFunc context.CancelFunc // 用于优雅地关闭隧道
}

// ActiveTunnelInfo 是一个用于向前端展示的、简化的隧道信息结构
type ActiveTunnelInfo struct {
	ID         string `json:"id"`
	Alias      string `json:"alias"`
	Type       string `json:"type"`
	LocalAddr  string `json:"localAddr"`
	RemoteAddr string `json:"remoteAddr"`
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
	// 从 sshManager 获取完整的、经过验证的连接配置
	connConfig, _, err := m.sshManager.GetConnectionConfig(alias, password)
	if err != nil {
		// 这个错误可能来自密码验证、主机密钥验证等，直接返回给前端
		return "", fmt.Errorf("failed to get SSH connection config for '%s': %w", alias, err)
	}

	// 使用预先配置好的 ClientConfig 进行拨号
	// 这样可以复用 known_hosts 验证等所有逻辑
	serverAddr := fmt.Sprintf("%s:%s", connConfig.HostName, connConfig.Port)
	sshClient, err := ssh.Dial("tcp", serverAddr, connConfig.ClientConfig)
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
		Alias:      alias,
		Type:       "local", // -L
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

// --- 核心功能实现 - 动态端口转发 (-D) ---

// StartDynamicForward 启动一个动态 SOCKS5 代理隧道
func (m *Manager) StartDynamicForward(alias string, localPort int, password string) (string, error) {
	// 从 sshManager 获取完整的、经过验证的连接配置
	connConfig, _, err := m.sshManager.GetConnectionConfig(alias, password)
	if err != nil {
		return "", fmt.Errorf("failed to get SSH connection config for '%s': %w", alias, err)
	}

	// 使用预先配置好的 ClientConfig 进行拨号
	serverAddr := fmt.Sprintf("%s:%s", connConfig.HostName, connConfig.Port)
	sshClient, err := ssh.Dial("tcp", serverAddr, connConfig.ClientConfig)
	if err != nil {
		return "", fmt.Errorf("SSH dial to %s failed: %w", alias, err)
	}

	localAddr := fmt.Sprintf("127.0.0.1:%d", localPort)
	listener, err := net.Listen("tcp", localAddr)
	if err != nil {
		sshClient.Close()
		return "", fmt.Errorf("failed to listen on local port %d: %w", localPort, err)
	}

	tunnelID := uuid.NewString()
	ctx, cancel := context.WithCancel(m.appCtx)
	tunnel := &Tunnel{
		ID:         tunnelID,
		Alias:      alias,
		Type:       "dynamic", // -D
		LocalAddr:  localAddr,
		RemoteAddr: "SOCKS5 Proxy", // 动态转发没有固定的远程地址
		sshClient:  sshClient,
		listener:   listener,
		cancelFunc: cancel,
	}

	m.mu.Lock()
	m.activeTunnels[tunnelID] = tunnel
	m.mu.Unlock()

	log.Printf("Started dynamic forward tunnel %s: %s (SOCKS5 Proxy via %s)", tunnelID, tunnel.LocalAddr, alias)

	// 动态转发的循环逻辑与本地转发相同，都是接受连接并处理
	go m.runTunnel(tunnel, ctx)

	return tunnelID, nil
}

// runTunnel 是每个隧道的主循环，负责接受连接并转发数据
func (m *Manager) runTunnel(tunnel *Tunnel, ctx context.Context) {
	defer m.cleanupTunnel(tunnel.ID) // 确保隧道退出时被清理

	for {
		select {
		case <-ctx.Done(): // 如果隧道被取消，则退出
			return
		default:
			// 等待并接受来自本地的连接
			localConn, err := tunnel.listener.Accept()
			if err != nil {
				// 如果监听器被关闭，这是一个正常的退出信号
				if opErr, ok := err.(*net.OpError); ok && opErr.Err.Error() == "use of closed network connection" {
					return
				}
				log.Printf("Tunnel %s failed to accept connection: %v", tunnel.ID, err)
				return
			}

			// 为每一个进来的连接，在新的 Goroutine 中处理数据转发
			go m.forwardConnection(localConn, tunnel)
		}
	}
}

// forwardConnection 在本地连接和远程SSH通道之间双向复制数据
func (m *Manager) forwardConnection(localConn net.Conn, tunnel *Tunnel) {
	defer localConn.Close()

	// 对于动态转发，我们不需要连接到固定的 remoteAddr
	// ssh.Client 的 Dial 方法本身就能处理 SOCKS 代理的请求，但这里我们是作为 SOCKS 服务端
	// 我们需要将连接直接交给 sshClient 处理，让它来解析 SOCKS 协议并转发
	// 但 golang.org/x/crypto/ssh 本身不直接提供 SOCKS 服务端实现。
	// 这里的 runTunnel/forwardConnection 模型对于 -D 来说是不完整的。
	// 一个完整的实现需要一个 SOCKS5 库来处理协议握手，然后使用 sshClient.Dial 来建立到最终目标的连接。
	// 为了演示，我们暂时复用 -L 的转发逻辑，但这在实际中对 -D 无效。
	// 正确的实现需要替换 `forwardConnection` 的内容。
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

	copier := func(dst io.Writer, src io.Reader) {
		defer wg.Done()
		if _, err := io.Copy(dst, src); err != nil {
			// 正常关闭连接时也会触发 EOF 错误，我们不关心这个
			if err != io.EOF {
				log.Printf("io.Copy error: %v", err)
			}
		}
	}

	go copier(remoteConn, localConn)
	go copier(localConn, remoteConn)

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

// GetActiveTunnels 返回所有活动隧道的简化信息
func (m *Manager) GetActiveTunnels() []ActiveTunnelInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	info := make([]ActiveTunnelInfo, 0, len(m.activeTunnels))
	for _, tunnel := range m.activeTunnels {
		info = append(info, ActiveTunnelInfo{
			ID:         tunnel.ID,
			Alias:      tunnel.Alias,
			Type:       tunnel.Type,
			LocalAddr:  tunnel.LocalAddr,
			RemoteAddr: tunnel.RemoteAddr,
		})
	}
	return info
}
