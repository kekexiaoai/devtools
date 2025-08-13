package sshtunnel

import (
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net"
	"sync"

	"devtools/backend/internal/sshmanager"
	"devtools/backend/pkg/utils"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
)

// SOCKS5 protocol constants
const (
	socks5Version = 0x05
	cmdConnect    = 0x01
	atypIPv4      = 0x01
	atypDomain    = 0x03
	atypIPv6      = 0x04
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
func (m *Manager) StartLocalForward(alias string, localPort int, remoteHost string, remotePort int, password string, gatewayPorts bool) (string, error) {
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

	// 根据 gatewayPorts 决定绑定的地址
	bindAddr := "127.0.0.1"
	if gatewayPorts {
		bindAddr = "0.0.0.0"
	}
	// 在本地启动一个 TCP 监听器
	localAddr := fmt.Sprintf("%s:%d", bindAddr, localPort)
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

	// 启动一个独立的 Goroutine 来监控底层 SSH 连接的健康状况。
	// 当连接因任何原因（网络问题、服务器关闭等）断开时，Wait() 会返回。
	go func() {
		err := tunnel.sshClient.Wait()
		log.Printf("SSH connection for tunnel %s (alias: %s) closed: %v. Initiating cleanup.", tunnel.ID, tunnel.Alias, err)
		// 连接断开后，我们调用 cancelFunc 来优雅地关闭 runTunnel 循环，
		// 这会触发 defer 中的 cleanupTunnel，从而清理所有资源。
		tunnel.cancelFunc()
	}()

	return tunnelID, nil
}

// --- 核心功能实现 - 动态端口转发 (-D) ---

// StartDynamicForward 启动一个动态 SOCKS5 代理隧道
func (m *Manager) StartDynamicForward(alias string, localPort int, password string, gatewayPorts bool) (string, error) {
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

	// 根据 gatewayPorts 决定绑定的地址
	bindAddr := "127.0.0.1"
	if gatewayPorts {
		bindAddr = "0.0.0.0"
	}
	localAddr := fmt.Sprintf("%s:%d", bindAddr, localPort)
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

	go m.runTunnel(tunnel, ctx)

	// 同样，为动态转发隧道也启动一个健康监控 Goroutine。
	go func() {
		err := tunnel.sshClient.Wait()
		log.Printf("SSH connection for tunnel %s (alias: %s) closed: %v. Initiating cleanup.", tunnel.ID, tunnel.Alias, err)
		// 连接断开后，我们调用 cancelFunc 来优雅地关闭 runTunnel 循环，
		// 这会触发 defer 中的 cleanupTunnel，从而清理所有资源。
		tunnel.cancelFunc()
	}()

	return tunnelID, nil
}

func (m *Manager) runTunnel(tunnel *Tunnel, ctx context.Context) {
	defer m.cleanupTunnel(tunnel.ID) // 确保隧道退出时被清理
	log.Printf("Tunnel %s: runTunnel loop started.", tunnel.ID)

	// 启动一个 goroutine，它的唯一作用是在 context 被取消时关闭 listener。
	// 这样可以解除下面 listener.Accept() 的阻塞。
	// go func() {
	// 	<-ctx.Done()
	// 	log.Printf("Tunnel %s: Context cancelled, closing listener to unblock Accept().", tunnel.ID)
	// 	tunnel.listener.Close()
	// }()

	utils.SafeGo(log.Default(), func() {
		<-ctx.Done()
		log.Printf("Tunnel %s: Context cancelled, closing listener to unblock Accept().", tunnel.ID)
		tunnel.listener.Close()
	})

	for {
		// 等待并接受来自本地的连接
		localConn, err := tunnel.listener.Accept()
		if err != nil {
			// 当 listener 被关闭时，Accept() 会返回一个错误。
			// 我们检查 context 是否已 "done" 来判断这是不是一次正常的关闭。
			select {
			case <-ctx.Done():
				// context 被取消，是预期的关闭流程。
				log.Printf("Tunnel %s: Listener closed as part of graceful shutdown.", tunnel.ID)
				return
			default:
				// context 没有被取消，这是一个意外的错误。
				log.Printf("Tunnel %s: Error accepting connection: %v. Shutting down.", tunnel.ID, err)
				return
			}
		}

		log.Printf("Tunnel %s: Accepted new local connection from %s", tunnel.ID, localConn.RemoteAddr())
		// 根据隧道类型，分派到不同的处理器
		switch tunnel.Type {
		case "local":
			go m.forwardLocalConnection(localConn, tunnel)
		case "dynamic":
			go m.handleSocks5Connection(localConn, tunnel)
		default:
			log.Printf("Unknown tunnel type '%s' for tunnel ID %s. Closing connection.", tunnel.Type, tunnel.ID)
			localConn.Close()
		}
	}
}

// forwardLocalConnection 在本地连接和远程SSH通道之间为本地转发(-L)双向复制数据
func (m *Manager) forwardLocalConnection(localConn net.Conn, tunnel *Tunnel) {
	defer localConn.Close()
	log.Printf("Tunnel %s: Starting forwardLocalConnection for %s", tunnel.ID, localConn.RemoteAddr())

	// 通过已建立的 SSH 客户端，连接到最终的目标服务器
	remoteConn, err := tunnel.sshClient.Dial("tcp", tunnel.RemoteAddr)
	if err != nil {
		log.Printf("Tunnel %s failed to dial remote addr %s: %v", tunnel.ID, tunnel.RemoteAddr, err)
		return
	}
	defer remoteConn.Close()

	log.Printf("Tunnel %s: Forwarding connection for %s", tunnel.ID, localConn.RemoteAddr())

	m.proxyData(localConn, remoteConn)
}

// handleSocks5Connection 处理一个 SOCKS5 代理请求
func (m *Manager) handleSocks5Connection(localConn net.Conn, tunnel *Tunnel) {
	defer localConn.Close()
	log.Printf("Tunnel %s: Starting handleSocks5Connection for %s", tunnel.ID, localConn.RemoteAddr())

	// 1. SOCKS5 Greeting
	buf := make([]byte, 256)
	// Read VER, NMETHODS
	if _, err := io.ReadFull(localConn, buf[:2]); err != nil {
		log.Printf("SOCKS5: failed to read greeting: %v", err)
		return
	}

	ver, nMethods := buf[0], buf[1]
	if ver != socks5Version {
		log.Printf("SOCKS5: unsupported version: %d", ver)
		return
	}

	// Read METHODS
	if _, err := io.ReadFull(localConn, buf[:nMethods]); err != nil {
		log.Printf("SOCKS5: failed to read methods: %v", err)
		return
	}

	// 2. Server Choice - We only support NO AUTHENTICATION REQUIRED (0x00)
	if _, err := localConn.Write([]byte{socks5Version, 0x00}); err != nil {
		log.Printf("SOCKS5: failed to write server choice: %v", err)
		return
	}

	// 3. Client Request
	// Read VER, CMD, RSV, ATYP
	if _, err := io.ReadFull(localConn, buf[:4]); err != nil {
		log.Printf("SOCKS5: failed to read request header: %v", err)
		return
	}

	if buf[0] != socks5Version {
		log.Printf("SOCKS5: unsupported version in request: %d", buf[0])
		return
	}
	if buf[1] != cmdConnect {
		log.Printf("SOCKS5: unsupported command: %d", buf[1])
		localConn.Write([]byte{0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0}) // Command not supported
		return
	}

	var host string
	switch buf[3] { // ATYP
	case atypIPv4:
		if _, err := io.ReadFull(localConn, buf[:4]); err != nil {
			log.Printf("SOCKS5: failed to read IPv4 address: %v", err)
			return
		}
		host = net.IP(buf[:4]).String()
	case atypDomain:
		if _, err := io.ReadFull(localConn, buf[:1]); err != nil {
			log.Printf("SOCKS5: failed to read domain length: %v", err)
			return
		}
		domainLen := buf[0]
		if _, err := io.ReadFull(localConn, buf[:domainLen]); err != nil {
			log.Printf("SOCKS5: failed to read domain: %v", err)
			return
		}
		host = string(buf[:domainLen])
	case atypIPv6:
		if _, err := io.ReadFull(localConn, buf[:16]); err != nil {
			log.Printf("SOCKS5: failed to read IPv6 address: %v", err)
			return
		}
		host = net.IP(buf[:16]).String()
	default:
		log.Printf("SOCKS5: unsupported address type: %d", buf[3])
		localConn.Write([]byte{0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0}) // Address type not supported
		return
	}

	// Read port
	if _, err := io.ReadFull(localConn, buf[:2]); err != nil {
		log.Printf("SOCKS5: failed to read port: %v", err)
		return
	}
	port := binary.BigEndian.Uint16(buf[:2])
	destAddr := fmt.Sprintf("%s:%d", host, port)

	// 4. Dial through SSH tunnel
	remoteConn, err := tunnel.sshClient.Dial("tcp", destAddr)
	if err != nil {
		log.Printf("SOCKS5: failed to dial remote addr %s via tunnel %s: %v", destAddr, tunnel.ID, err)
		localConn.Write([]byte{0x05, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0}) // Host unreachable
		return
	}
	defer remoteConn.Close()

	// 5. Server Reply - Success
	if _, err := localConn.Write([]byte{0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0}); err != nil {
		log.Printf("SOCKS5: failed to write success reply: %v", err)
		return
	}

	log.Printf("Tunnel %s: SOCKS5 connection established for %s to %s", tunnel.ID, localConn.RemoteAddr(), destAddr)

	// 6. Forward data
	m.proxyData(localConn, remoteConn)
}

// proxyData 在两个连接之间双向地、并发地复制数据
func (m *Manager) proxyData(conn1, conn2 net.Conn) {
	var wg sync.WaitGroup
	wg.Add(2)
	log.Printf("Proxying data between %s and %s", conn1.RemoteAddr(), conn2.RemoteAddr())

	copier := func(dst io.Writer, src io.Reader) {
		defer utils.Recover(log.Default())
		defer wg.Done()
		if _, err := io.Copy(dst, src); err != nil {
			if err != io.EOF {
				log.Printf("io.Copy error: %v", err)
			}
		}
	}

	go copier(conn1, conn2)
	go copier(conn2, conn1)

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
	tunnel.cancelFunc() // 发出取消信号，将触发 runTunnel 的优雅退出

	log.Printf("Stopping tunnel %s: %s -> %s", tunnelID, tunnel.LocalAddr, tunnel.RemoteAddr)
	return nil
}

// cleanupTunnel 关闭所有资源并从map中移除
func (m *Manager) cleanupTunnel(tunnelID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	tunnel, ok := m.activeTunnels[tunnelID]
	if !ok {
		return // Already cleaned up or never existed.
	}

	log.Printf("Starting cleanup for tunnel %s...", tunnelID)

	// Safely close the listener, recovering from any potential panics.
	// This ensures that even if one Close() fails, the others are still attempted.
	func() {
		defer utils.Recover(log.Default())
		if tunnel.listener != nil {
			tunnel.listener.Close()
			log.Printf("Tunnel %s: Listener closed successfully.", tunnelID)
		}
	}()

	// Safely close the SSH client.
	func() {
		defer utils.Recover(log.Default())
		if tunnel.sshClient != nil {
			tunnel.sshClient.Close()
			log.Printf("Tunnel %s: SSH client closed successfully.", tunnelID)
		}
	}()

	// Now that resources are closed, remove the tunnel from the active list.
	delete(m.activeTunnels, tunnelID)
	log.Printf("Cleaned up tunnel %s", tunnelID)
	// Tunnel status has changed, notify the frontend to refresh the list.
	// This is also wrapped for safety, although panics here are highly unlikely.
	func() {
		defer utils.Recover(log.Default())
		runtime.EventsEmit(m.appCtx, "tunnels:changed")
		log.Printf("Tunnel %s: Frontend event 'tunnels:changed' emitted successfully.", tunnelID)
	}()
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
