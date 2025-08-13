package sshtunnel

import (
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net"
	"sync"
	"time"

	"devtools/backend/internal/sshmanager"
	"devtools/backend/pkg/utils"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
)

// SOCKS5 protocol constants
const (
	socks5Version = 0x05

	// Commands
	cmdConnect      = 0x01
	cmdBind         = 0x02
	cmdUDPAssociate = 0x03

	// Address types
	atypIPv4   = 0x01
	atypDomain = 0x03
	atypIPv6   = 0x04

	// Reply codes
	repSucceeded               = 0x00
	repHostUnreachable         = 0x04
	repCommandNotSupported     = 0x07
	repAddressTypeNotSupported = 0x08
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

	// For debouncing frontend events
	eventDebouncer        *time.Timer
	eventDebounceDuration time.Duration
	eventMu               sync.Mutex
}

// NewManager 是隧道管理器的构造函数
func NewManager(ctx context.Context, sshMgr *sshmanager.Manager) *Manager {
	return &Manager{
		activeTunnels:         make(map[string]*Tunnel),
		sshManager:            sshMgr,
		appCtx:                ctx,
		eventDebounceDuration: 200 * time.Millisecond, // A sensible default
	}
}

// createTunnel is a generic helper function to set up the common parts of a tunnel.
func (m *Manager) createTunnel(alias string, localPort int, password string, gatewayPorts bool, tunnelType, remoteAddr string) (string, error) {
	// 1. Get connection config
	connConfig, _, err := m.sshManager.GetConnectionConfig(alias, password)
	if err != nil {
		return "", fmt.Errorf("failed to get SSH connection config for '%s': %w", alias, err)
	}

	// 2. Dial SSH server
	serverAddr := fmt.Sprintf("%s:%s", connConfig.HostName, connConfig.Port)
	sshClient, err := ssh.Dial("tcp", serverAddr, connConfig.ClientConfig)
	if err != nil {
		return "", fmt.Errorf("SSH dial to %s failed: %w", alias, err)
	}

	// 3. Create local listener
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

	// 4. Create and register tunnel
	tunnelID := uuid.NewString()
	ctx, cancel := context.WithCancel(m.appCtx)
	tunnel := &Tunnel{
		ID:         tunnelID,
		Alias:      alias,
		Type:       tunnelType,
		LocalAddr:  localAddr,
		RemoteAddr: remoteAddr,
		sshClient:  sshClient,
		listener:   listener,
		cancelFunc: cancel,
	}

	m.mu.Lock()
	m.activeTunnels[tunnelID] = tunnel
	m.mu.Unlock()

	log.Printf("Started %s forward tunnel %s: %s -> %s (via %s)", tunnelType, tunnelID, tunnel.LocalAddr, tunnel.RemoteAddr, alias)

	// 5. Start goroutines
	go m.runTunnel(tunnel, ctx)
	go func() {
		err := tunnel.sshClient.Wait()
		log.Printf("SSH connection for tunnel %s (alias: %s) closed: %v. Initiating cleanup.", tunnel.ID, tunnel.Alias, err)
		tunnel.cancelFunc()
	}()

	// Notify frontend about the change
	m.debounceChangeEvent()

	return tunnelID, nil
}

// --- 核心功能实现 - 本地端口转发 (-L) ---

// StartLocalForward 启动一个本地端口转发隧道
func (m *Manager) StartLocalForward(alias string, localPort int, remoteHost string, remotePort int, password string, gatewayPorts bool) (string, error) {
	remoteAddr := fmt.Sprintf("%s:%d", remoteHost, remotePort)
	return m.createTunnel(alias, localPort, password, gatewayPorts, "local", remoteAddr)
}

// --- 核心功能实现 - 动态端口转发 (-D) ---

// StartDynamicForward 启动一个动态 SOCKS5 代理隧道
func (m *Manager) StartDynamicForward(alias string, localPort int, password string, gatewayPorts bool) (string, error) {
	remoteAddr := "SOCKS5 Proxy" // 动态转发没有固定的远程地址
	return m.createTunnel(alias, localPort, password, gatewayPorts, "dynamic", remoteAddr)
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

	ver, cmd := buf[0], buf[1]
	if ver != socks5Version {
		log.Printf("SOCKS5: unsupported version in request: %d", ver)
		return
	}

	// We only support the CONNECT command. For all others, we reply with "command not supported".
	if cmd != cmdConnect {
		log.Printf("SOCKS5: unsupported command received: %d. Only CONNECT is supported.", cmd)
		sendSocks5ErrorReply(localConn, repCommandNotSupported)
		return
	}

	// --- CONNECT command logic starts here ---
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
		sendSocks5ErrorReply(localConn, repAddressTypeNotSupported)
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
		sendSocks5ErrorReply(localConn, repHostUnreachable)
		return
	}
	defer remoteConn.Close()

	// 5. Server Reply - Success
	// The BND.ADDR and BND.PORT should be the address and port of the server-side of the connection.
	// For simplicity, we send back 0.0.0.0:0 as many clients ignore this field on success.
	if _, err := localConn.Write([]byte{socks5Version, repSucceeded, 0x00, atypIPv4, 0, 0, 0, 0, 0, 0}); err != nil {
		log.Printf("SOCKS5: failed to write success reply: %v", err)
		return
	}

	log.Printf("Tunnel %s: SOCKS5 connection established for %s to %s", tunnel.ID, localConn.RemoteAddr(), destAddr)

	// 6. Forward data
	m.proxyData(localConn, remoteConn)
}

// sendSocks5ErrorReply sends a SOCKS5 error reply with a given reply code.
func sendSocks5ErrorReply(w io.Writer, rep byte) {
	// VER, REP, RSV, ATYP, BND.ADDR, BND.PORT
	// For errors, BND.ADDR and BND.PORT can be zero.
	_, err := w.Write([]byte{socks5Version, rep, 0x00, atypIPv4, 0, 0, 0, 0, 0, 0})
	if err != nil {
		log.Printf("SOCKS5: failed to write error reply: %v", err)
	}
}

// proxyData 在两个连接之间双向地、并发地复制数据
func (m *Manager) proxyData(conn1, conn2 net.Conn) {
	var wg sync.WaitGroup
	wg.Add(2)
	log.Printf("Proxying data between %s and %s", conn1.RemoteAddr(), conn2.RemoteAddr())

	copier := func(dst net.Conn, src net.Conn) {
		defer wg.Done()
		if _, err := io.Copy(dst, src); err != nil {
			// io.EOF is an expected and normal condition when a connection is closed by the other side.
			if err == io.EOF {
				log.Printf("io.Copy completed: %s -> %s (EOF)", src.RemoteAddr(), dst.RemoteAddr())
			} else {
				log.Printf("io.Copy error on %s -> %s: %v", src.RemoteAddr(), dst.RemoteAddr(), err)
			}
		}
	}

	utils.SafeGo(log.Default(), func() {
		copier(conn1, conn2)
	})
	utils.SafeGo(log.Default(), func() {
		copier(conn2, conn1)
	})

	wg.Wait()
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
	// Use a debouncer to avoid event storms if multiple tunnels close at once.
	m.debounceChangeEvent()
}

// debounceChangeEvent schedules a "tunnels:changed" event to be sent to the frontend.
// It waits for a quiet period before sending the event to avoid event storms.
func (m *Manager) debounceChangeEvent() {
	m.eventMu.Lock()
	defer m.eventMu.Unlock()

	// If a timer is already active, reset it to ensure the event is sent after the *last* change.
	if m.eventDebouncer != nil {
		m.eventDebouncer.Stop()
	}

	// Set a new timer that will fire after the quiet period.
	m.eventDebouncer = time.AfterFunc(m.eventDebounceDuration, func() {
		log.Println("Debouncer fired: emitting 'tunnels:changed' event to frontend.")
		// This runs in a new goroutine, so we wrap it for safety.
		utils.SafeGo(log.Default(), func() {
			runtime.EventsEmit(m.appCtx, "tunnels:changed")
		})
	})
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
