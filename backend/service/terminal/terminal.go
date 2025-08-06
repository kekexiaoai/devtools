package terminal

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"sync"

	"devtools/backend/internal/sshmanager"
	"devtools/backend/internal/types"

	"github.com/creack/pty"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

// Session 代表一个活动的终端会话
type Session struct {
	ID         string
	Alias      string
	sshConn    *ssh.Client
	sshSession *ssh.Session
	ptyIn      io.WriteCloser
	ptyOut     io.Reader
}

// Service 负责管理所有活动的终端会话
type Service struct {
	ctx        context.Context
	sessions   map[string]*Session
	mu         sync.RWMutex
	sshManager *sshmanager.Manager
	upgrader   websocket.Upgrader
}

// NewService 是终端服务的构造函数
func NewService(ctx context.Context, sshMgr *sshmanager.Manager) *Service {
	svc := &Service{
		ctx:        ctx,
		sessions:   make(map[string]*Session),
		sshManager: sshMgr,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
	go svc.startWebSocketServer()
	return svc
}

// StartLocalSession 启动一个本地的 shell 会话
func (s *Service) StartLocalSession() (*types.TerminalSessionInfo, error) {
	// 决定要启动哪个 shell
	var shell string
	if runtime.GOOS == "windows" {
		shell = "powershell.exe"
	} else {
		// 在 macOS/Linux 上，从环境变量获取用户的默认 shell
		shell = os.Getenv("SHELL")
		if shell == "" {
			shell = "bash" // 作为备用
		}
	}

	// 创建一个执行本地 shell 的命令
	cmd := exec.Command(shell)

	// 使用 pty 库来在一个伪终端中启动这个命令
	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, fmt.Errorf("failed to start local pty: %w", err)
	}

	sessionID := uuid.NewString()
	session := &Session{
		ID: sessionID,
		// 对于本地会话，sshConn 和 sshSession 是 nil
		sshConn:    nil,
		sshSession: nil,
		// ptyIn 和 ptyOut 现在直接就是 ptmx
		ptyIn:  ptmx,
		ptyOut: ptmx,
	}

	s.mu.Lock()
	s.sessions[sessionID] = session
	s.mu.Unlock()

	log.Printf("Started new local terminal session %s", sessionID)

	// 监控进程是否结束，以便自动清理
	go func() {
		defer s.cleanupSession(sessionID)
		_ = cmd.Wait()
		log.Printf("Local terminal session %s exited.", sessionID)
	}()

	// 返回一个结构化的对象
	return &types.TerminalSessionInfo{
		ID:    sessionID,
		Alias: "local",
		URL:   fmt.Sprintf("ws://localhost:45678/ws/terminal/%s", sessionID),
	}, nil
}

// StartSession 使用 Go 原生 SSH 库创建一个新的终端会话
func (s *Service) StartSession(alias string, password string) (*types.TerminalSessionInfo, error) {
	// 获取 SSH 配置
	config, _, err := s.sshManager.GetConnectionConfig(alias, password)
	if err != nil {
		return nil, fmt.Errorf("could not get ssh config for %s: %w", alias, err)
	}

	// 建立 SSH 连接
	serverAddr := fmt.Sprintf("%s:%s", config.HostName, config.Port)
	sshConn, err := ssh.Dial("tcp", serverAddr, config.ClientConfig)
	if err != nil {
		return nil, fmt.Errorf("SSH dial to %s failed: %w", alias, err)
	}

	// 创建 SSH 会话
	sshSession, err := sshConn.NewSession()
	if err != nil {
		sshConn.Close()
		return nil, fmt.Errorf("failed to create SSH session: %w", err)
	}

	// 请求 PTY
	if err := sshSession.RequestPty("xterm-256color", 40, 80, ssh.TerminalModes{}); err != nil {
		sshSession.Close()
		sshConn.Close()
		return nil, fmt.Errorf("failed to request PTY: %w", err)
	}

	// 获取 PTY 的输入输出流
	ptyIn, err := sshSession.StdinPipe()
	if err != nil {
		sshSession.Close()
		sshConn.Close()
		return nil, err
	}
	ptyOut, err := sshSession.StdoutPipe()
	if err != nil {
		sshSession.Close()
		sshConn.Close()
		return nil, err
	}

	// 启动远程 Shell
	if err := sshSession.Shell(); err != nil {
		sshSession.Close()
		sshConn.Close()
		return nil, fmt.Errorf("failed to start shell: %w", err)
	}

	sessionID := uuid.NewString()
	session := &Session{
		ID:         sessionID,
		Alias:      alias,
		sshConn:    sshConn,
		sshSession: sshSession,
		ptyIn:      ptyIn,
		ptyOut:     ptyOut,
	}

	s.mu.Lock()
	s.sessions[sessionID] = session
	s.mu.Unlock()

	log.Printf("Started new terminal session %s for host %s", sessionID, alias)

	go func() {
		defer s.cleanupSession(sessionID)
		_ = sshSession.Wait() // 等待会话结束
	}()

	// 返回一个结构化的对象
	return &types.TerminalSessionInfo{
		ID:    sessionID,
		Alias: alias,
		URL:   fmt.Sprintf("ws://localhost:45678/ws/terminal/%s", sessionID),
	}, nil
}

// startWebSocketServer 在后台启动一个 HTTP 服务器来处理 WebSocket 连接
func (s *Service) startWebSocketServer() {
	http.HandleFunc("/ws/terminal/", s.handleConnection)
	port := ":45678" // 选择一个不常用的端口，避免冲突
	log.Printf("Starting terminal WebSocket server on %s", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		// 在真实应用中，这里需要更优雅的错误处理，比如通过 Wails 事件通知前端
		log.Fatalf("Failed to start terminal WebSocket server: %v", err)
	}
}

// handleConnection 是一个 HTTP Handler，它会将一个标准的 HTTP 请求升级为 WebSocket 连接
func (s *Service) handleConnection(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Path[len("/ws/terminal/"):]
	s.mu.RLock()
	session, ok := s.sessions[sessionID]
	s.mu.RUnlock()

	if !ok {
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Failed to upgrade connection for session %s: %v", sessionID, err)
		return
	}
	defer conn.Close()

	log.Printf("WebSocket connected for session %s", sessionID)

	// --- 双向数据流绑定 ---
	var wg sync.WaitGroup
	wg.Add(2)

	// Goroutine 1: 将 WebSocket 的输入 (用户键盘敲击) 转发到 PTY (保持不变)
	go func() {
		defer wg.Done()
		defer s.cleanupSession(sessionID)
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if _, err := session.ptyIn.Write(message); err != nil {
				return
			}
		}
	}()

	// Goroutine 2: 将 PTY 的输出 (服务器返回的内容) 转发到 WebSocket
	// 我们不再使用 io.Copy，而是自己创建一个循环
	go func() {
		defer wg.Done()
		buf := make([]byte, 1024) // 创建一个缓冲区
		for {
			// Read 会阻塞，直到 PTY 有输出或被关闭
			n, err := session.ptyOut.Read(buf)
			if err != nil {
				// PTY 关闭时会返回 EOF，这是一个正常的退出信号
				if err != io.EOF {
					log.Printf("Error reading from PTY for session %s: %v", sessionID, err)
				}
				return // 退出循环
			}
			// 将读取到的数据作为二进制消息写入 WebSocket
			if err := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
				log.Printf("Error writing to websocket for session %s: %v", sessionID, err)
				return // 退出循环
			}
		}
	}()

	wg.Wait()
}

// cleanupSession 关闭所有资源并从map中移除
func (s *Service) cleanupSession(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if session, ok := s.sessions[sessionID]; ok {
		session.sshSession.Close()
		session.sshConn.Close()
		delete(s.sessions, sessionID)
		log.Printf("Cleaned up terminal session %s", sessionID)
	}
}
