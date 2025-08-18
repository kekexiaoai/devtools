package terminal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
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

const (
	TypeLocal  = "local"
	TypeRemote = "remote"
)

// Session 代表一个活动的终端会话
type Session struct {
	ID         string
	Alias      string
	sshConn    *ssh.Client
	sshSession *ssh.Session
	ptyIn      io.WriteCloser
	ptyOut     io.Reader
	localCmd   *exec.Cmd
	ptmx       *os.File // For local sessions, to handle resize
	cancelFunc context.CancelFunc
}

// Service 负责管理所有活动的终端会话
type Service struct {
	ctx        context.Context
	sessions   map[string]*Session
	mu         sync.RWMutex
	sshManager *sshmanager.Manager
	upgrader   websocket.Upgrader
	serverAddr string // To store the actual address of the WebSocket server
}

// NewService 是终端服务的构造函数
func NewService(sshMgr *sshmanager.Manager) *Service {
	return &Service{
		sessions:   make(map[string]*Session),
		sshManager: sshMgr,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

// Startup 在应用启动时被调用，接收应用上下文并启动后台 WebSocket 服务器。
func (s *Service) Startup(ctx context.Context) error {
	s.ctx = ctx
	// 在此启动服务器，并处理可能发生的错误
	if err := s.startWebSocketServer(); err != nil {
		return fmt.Errorf("failed to start terminal WebSocket server: %w", err)
	}
	return nil
}

// Shutdown 负责在应用退出时，优雅地关闭所有活动的终端会话。
func (s *Service) Shutdown() {
	log.Println("Terminal service shutting down, cleaning up all active sessions...")
	s.cleanupAllSessions()
}

// StartLocalSession 启动一个本地的 shell 会话
func (s *Service) StartLocalSession(sessionID string) (*types.TerminalSessionInfo, error) {
	shell := getDefaultShell()
	log.Printf("Attempting to start local session with shell: %s", shell)

	// 创建一个执行本地 shell 的命令
	cmd := exec.Command(shell)

	cmd.SysProcAttr = sysProcAttr()
	// This is crucial for built applications.
	// When launched from a GUI, the app doesn't inherit TERM, which is essential
	// for correct terminal behavior (e.g., backspace, arrow keys).
	// 'xterm-256color' is a safe and widely supported default.
	// We append it to the existing environment to preserve other important variables.
	homeDir, err := os.UserHomeDir()
	if err != nil {
		log.Printf("ERROR: Failed to get user home directory: %v", err)
		// Optionally, return an error or proceed with a default directory
	} else {
		cmd.Dir = homeDir // Set the working directory to the user's home directory
	}
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	log.Printf("Starting local command with pty...")
	// 使用 pty 库来在一个伪终端中启动这个命令
	ptmx, err := pty.Start(cmd)
	if err != nil {
		log.Printf("ERROR: Failed to start local pty for shell '%s': %v", shell, err)
		return nil, fmt.Errorf("failed to start local pty: %w", err)
	}

	log.Printf("Successfully started local command with pty. PID: %d", cmd.Process.Pid)
	if sessionID == "" {
		sessionID = uuid.NewString()
	}
	session := &Session{
		ID: sessionID,
		// 对于本地会话，sshConn 和 sshSession 是 nil
		sshConn:    nil,
		sshSession: nil,
		// ptyIn 和 ptyOut 现在直接就是 ptmx
		ptyIn:    ptmx,
		ptyOut:   ptmx,
		localCmd: cmd,  // 保存cmd到session中
		ptmx:     ptmx, // 保存 ptmx 以便调整大小
	}

	s.mu.Lock()
	s.sessions[sessionID] = session
	s.mu.Unlock()

	log.Printf("Started new local terminal session %s", sessionID)

	// 监控进程是否结束，以便自动清理
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("Panic in session %s: %v", sessionID, r)
			}
			log.Printf("defer for session %s to ecleanup...", sessionID) // 新增验证进入等待

			s.cleanupSession(sessionID)
		}()
		log.Printf("Waiting for session %s to exit...", sessionID) // 新增验证进入等待
		err = cmd.Wait()
		log.Printf("Session %s wait returned. err: %v", sessionID, err) // 验证Wait返回
		log.Printf("Local terminal session %s exited. err: %s", sessionID, err)
	}()

	// 返回一个结构化的对象
	return &types.TerminalSessionInfo{
		ID:    sessionID,
		Alias: "local",
		URL:   fmt.Sprintf("ws://%s/ws/terminal/%s", s.serverAddr, sessionID),
		Type:  TypeLocal,
	}, nil
}

// StartSession 使用 Go 原生 SSH 库创建一个新的终端会话
func (s *Service) StartRemoteSession(alias, sessionID, password string) (*types.TerminalSessionInfo, error) {
	log.Printf("Attempting to start remote session for alias: %s", alias)
	// 获取 SSH 配置
	config, _, err := s.sshManager.GetConnectionConfig(alias, password)
	if err != nil {
		log.Printf("ERROR: Could not get ssh config for %s: %v", alias, err)
		return nil, fmt.Errorf("could not get ssh config for %s: %w", alias, err)
	}

	// 建立 SSH 连接
	serverAddr := fmt.Sprintf("%s:%s", config.HostName, config.Port)
	log.Printf("Dialing SSH server at %s for alias %s...", serverAddr, alias)
	sshConn, err := ssh.Dial("tcp", serverAddr, config.ClientConfig)
	if err != nil {
		log.Printf("ERROR: SSH dial to %s (%s) failed: %v", alias, serverAddr, err)
		return nil, fmt.Errorf("SSH dial to %s failed: %w", alias, err)
	}
	log.Printf("SSH connection established for alias %s", alias)

	// Create a context for this session's lifecycle (e.g., for keep-alive)
	sessionCtx, cancel := context.WithCancel(s.ctx)

	// 创建 SSH 会话
	log.Printf("Creating new SSH session for alias %s...", alias)
	sshSession, err := sshConn.NewSession()
	if err != nil {
		sshConn.Close()
		cancel()
		return nil, fmt.Errorf("failed to create SSH session: %w", err)
	}

	// 请求 PTY
	log.Printf("Requesting PTY for session %s...", alias)
	if err := sshSession.RequestPty("xterm-256color", 40, 80, ssh.TerminalModes{}); err != nil {
		log.Printf("ERROR: Failed to request PTY for %s: %v", alias, err)
		sshSession.Close()
		cancel()
		sshConn.Close()
		return nil, fmt.Errorf("failed to request PTY: %w", err)
	}

	// 获取 PTY 的输入输出流
	log.Printf("Getting PTY pipes for %s...", alias)
	ptyIn, err := sshSession.StdinPipe()
	if err != nil {
		log.Printf("ERROR: Failed to get stdin pipe for %s: %v", alias, err)
		sshSession.Close()
		cancel()
		sshConn.Close()
		return nil, err
	}
	ptyOut, err := sshSession.StdoutPipe()
	if err != nil {
		log.Printf("ERROR: Failed to get stdout pipe for %s: %v", alias, err)
		sshSession.Close()
		cancel()
		sshConn.Close()
		return nil, err
	}

	// 启动远程 Shell
	log.Printf("Starting remote shell for %s...", alias)
	if err := sshSession.Shell(); err != nil {
		log.Printf("ERROR: Failed to start remote shell for %s: %v", alias, err)
		cancel()
		sshSession.Close()
		sshConn.Close()
		return nil, fmt.Errorf("failed to start shell: %w", err)
	}

	if sessionID == "" {
		sessionID = uuid.NewString()
	}
	session := &Session{
		ID:         sessionID,
		Alias:      alias,
		sshConn:    sshConn,
		sshSession: sshSession,
		ptyIn:      ptyIn,
		ptyOut:     ptyOut,
		cancelFunc: cancel,
	}

	s.mu.Lock()
	s.sessions[sessionID] = session
	s.mu.Unlock()

	log.Printf("Started new terminal session %s for host %s", sessionID, alias)

	// Start keep-alive for the underlying SSH connection
	go sshmanager.StartKeepAlive(sshConn, sessionCtx)

	go func() {
		defer s.cleanupSession(sessionID)
		defer cancel()        // Ensure keep-alive and other context-aware goroutines are stopped
		_ = sshSession.Wait() // 等待会话结束
	}()

	// 返回一个结构化的对象
	return &types.TerminalSessionInfo{
		ID:    sessionID,
		Alias: alias,
		URL:   fmt.Sprintf("ws://%s/ws/terminal/%s", s.serverAddr, sessionID),
		Type:  TypeRemote,
	}, nil
}

// startWebSocketServer 在后台启动一个 HTTP 服务器来处理 WebSocket 连接
func (s *Service) startWebSocketServer() error {
	http.HandleFunc("/ws/terminal/", s.handleConnection)

	// Listen on localhost with port 0 to let the OS choose an available ephemeral port.
	// This is more robust than using a fixed port.
	listener, err := net.Listen("tcp", "localhost:0")
	if err != nil {
		// This is unlikely to fail unless there's a more fundamental networking issue.
		return err
	}

	// Store the actual address, including the chosen port.
	s.serverAddr = listener.Addr().String()

	log.Printf("Starting terminal WebSocket server on %s", s.serverAddr)
	// 在一个 goroutine 中启动服务，这样它就不会阻塞 Startup 过程
	go func() {
		if err := http.Serve(listener, nil); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("FATAL: Terminal WebSocket server crashed unexpectedly: %v", err)
		}
	}()
	return nil
}

// getDefaultShell determines the best default shell to use for local terminals.
// It's more robust than just relying on os.Getenv("SHELL"), which may not be
// set when the app is launched from a GUI.
func getDefaultShell() string {
	if runtime.GOOS == "windows" {
		return "powershell.exe"
	}

	// For macOS/Linux, first try the SHELL environment variable.
	shell := os.Getenv("SHELL")
	if shell != "" {
		if _, err := exec.LookPath(shell); err == nil {
			return shell
		}
	}

	// If SHELL is not set or invalid, try common shells in a preferred order.
	// On modern macOS, zsh is the default.
	commonShells := []string{"/bin/zsh", "/bin/bash"}
	for _, s := range commonShells {
		if _, err := os.Stat(s); err == nil {
			return s
		}
	}

	// As a last resort, just use "bash" and hope it's in the PATH.
	return "bash"
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

	// Goroutine 1: 将 WebSocket 的输入 (用户键盘敲击和尺寸调整命令) 转发到 PTY
	go func() {
		defer wg.Done()
		defer s.cleanupSession(sessionID)

		// 定义一个结构体来解码 resize 消息
		type resizeMessage struct {
			Type string `json:"type"`
			Cols uint16 `json:"cols"`
			Rows uint16 `json:"rows"`
		}

		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				log.Printf("Error reading from websocket for session %s: %v", sessionID, err)
				return
			}

			// 尝试将消息解码为 resize 命令
			var resizeMsg resizeMessage
			if err := json.Unmarshal(message, &resizeMsg); err == nil && resizeMsg.Type == "resize" {
				// 这是一个 resize 命令
				log.Printf("Resizing session %s to %dx%d", sessionID, resizeMsg.Cols, resizeMsg.Rows)

				if session.ptmx != nil {
					// 处理本地 PTY 的尺寸调整
					if err := pty.Setsize(session.ptmx, &pty.Winsize{Rows: resizeMsg.Rows, Cols: resizeMsg.Cols}); err != nil {
						log.Printf("Error resizing local pty for session %s: %v", sessionID, err)
					}
				} else if session.sshSession != nil {
					// 处理远程 SSH 会话的尺寸调整
					if err := session.sshSession.WindowChange(int(resizeMsg.Rows), int(resizeMsg.Cols)); err != nil {
						log.Printf("Error resizing remote ssh session %s: %v", sessionID, err)
					}
				}
				continue // 消息已处理，继续下一个循环
			}

			// 如果不是 resize 命令，则视为原始输入数据
			if _, err := session.ptyIn.Write(message); err != nil {
				log.Printf("Error writing to pty for session %s: %v", sessionID, err)
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
		if session != nil {
			// Cancel context to stop associated goroutines like keep-alive
			if session.cancelFunc != nil {
				session.cancelFunc()
			}

			// 1. 关闭 SSH 资源（仅远程会话有效）
			if session.sshSession != nil {
				session.sshSession.Close()
			}
			if session.sshConn != nil {
				session.sshConn.Close()
			}

			// 2. 处理本地会话：关闭伪终端 + 终止进程组
			if session.localCmd != nil && session.localCmd.Process != nil {
				// Close the pty file descriptor first to unblock any I/O operations.
				if session.ptyIn != nil {
					session.ptyIn.Close()
				}
				// Call the platform-specific termination logic.
				// This will handle killing the process group on Unix and the process tree on Windows.
				terminateProcessGroup(session.localCmd)
			}
		}

		delete(s.sessions, sessionID)
		log.Printf("Cleaned up terminal session %s", sessionID)
	}
}

// cleanupAllSessions 遍历并清理所有会话
func (s *Service) cleanupAllSessions() {
	s.mu.RLock()
	// 创建一个 session ID 的副本，以避免在迭代时持有锁
	// (cleanupSession 会请求写锁)
	sessionIDs := make([]string, 0, len(s.sessions))
	for id := range s.sessions {
		sessionIDs = append(sessionIDs, id)
	}
	s.mu.RUnlock()

	for _, id := range sessionIDs {
		s.cleanupSession(id)
	}
}
