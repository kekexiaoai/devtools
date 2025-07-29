#!/bin/bash

# Check if command-line arguments are provided
if [[ $# -lt 2 ]]; then
    echo "Usage: $0 <process-name> <port-number>" >&2
    echo "Example: $0 mywailsapp 2345" >&2
    exit 1
fi

# Get configuration from command-line arguments
PROCESS_NAME="$1"
PORT="$2"

echo "Detected OS: $OSTYPE"
echo "Searching for process '$PROCESS_NAME'..."

# Find the process ID (PID) based on OS type
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    # Windows (Git Bash)
    PID=$(tasklist /FI "IMAGENAME eq ${PROCESS_NAME}.exe" /FO CSV /NH | awk -F ',' '{print $2}' | tr -d '"')
elif [[ "$OSTYPE" == "win32" ]]; then
    # Windows (native PowerShell)
    PID=$(powershell -Command "& {Get-Process | Where-Object {$_.Name -like '${PROCESS_NAME}*'} | Select-Object -First 1 -ExpandProperty Id}")
else
    # Linux/macOS
    if command -v pgrep &>/dev/null; then
        PID=$(pgrep -f "${PROCESS_NAME}")
    else
        PID=$(ps -ef | grep "${PROCESS_NAME}" | grep -v grep | awk '{print $2}' | head -n 1)
    fi
fi

# Check if process was found
if [[ -z "$PID" ]]; then
    echo "Error: Process '${PROCESS_NAME}' not found" >&2
    exit 1
fi

echo "Found process ${PROCESS_NAME} with PID: ${PID}"

# Start Delve debugger server
echo "Starting Delve debugger server on port ${PORT}..."
dlv --listen=:${PORT} --headless=true --api-version=2 --check-go-version=false --only-same-user=false attach ${PID}