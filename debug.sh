#!/bin/bash

# Set process name and port from arguments
PROCESS_NAME="$1"
PORT="$2"

if [ -z "$PROCESS_NAME" ] || [ -z "$PORT" ]; then
    echo "Usage: $0 <process_name> <debug_port>"
    exit 1
fi

# Function to get process ID using PowerShell (for Windows/WSL)
get_pid_powershell() {
    local process_name=$1
    powershell.exe -Command "& { \
        \$process = Get-Process -Name ${process_name}-dev -ErrorAction SilentlyContinue | Select-Object -First 1; \
        if (-not \$process) { \$process = Get-Process -Name *${process_name}* -ErrorAction SilentlyContinue | Select-Object -First 1; } \
        if (\$process) { \$process.Id } else { Write-Error \"Process not found: ${process_name}-dev or *${process_name}*\" } \
    }" 2>&1 | tr -d '\r'
}

# Function to get process ID using pgrep (for macOS/Linux)
get_pid_pgrep() {
    local process_name=$1
    local pid=""
    if command -v pgrep &>/dev/null; then
        pid=$(pgrep -f "${process_name}")
    else
        pid=$(ps -ef | grep "${process_name}" | grep -v grep | awk '{print $2}' | head -n 1)
    fi
    echo "$pid"
}

# Determine operating system and set appropriate values
if [[ -f /proc/sys/fs/binfmt_misc/WSLInterop ]]; then
    OS="wsl"
    DLV_CMD="dlv.exe"
    PID=$(get_pid_powershell "$PROCESS_NAME")
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "mingw"* ]]; then
    OS="windows"
    DLV_CMD="dlv.exe"
    PID=$(get_pid_powershell "$PROCESS_NAME")
elif [[ "$OSTYPE" == "darwin"* || "$OSTYPE" == "linux"* ]]; then
    # Unix-based systems (macOS/Linux)
    OS=$(echo "$OSTYPE" | cut -d'_' -f1)
    DLV_CMD="dlv"
    PID=$(get_pid_pgrep "$PROCESS_NAME")
    echo "PID=${PID}"
else
    echo "Unsupported operating system: $OSTYPE"
    exit 1
fi

# Validate PID
if [ -z "$PID" ] || ! [[ "$PID" =~ ^[0-9]+$ ]]; then
    echo "Error: Failed to retrieve valid PID for process '${PROCESS_NAME}'"
    exit 1
fi

echo "Debugging process ${PROCESS_NAME} (PID: ${PID}) on port ${PORT}..."

# Start debug session with appropriate command
${DLV_CMD} attach ${PID} --headless --log --listen=:${PORT} --api-version=2

if [ $? -ne 0 ]; then
    echo "Error: Failed to start debug session with ${DLV_CMD}"
    exit 1
fi