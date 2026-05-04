package backend

import (
	"reflect"
	"testing"
)

func TestParseLsofListeningPorts(t *testing.T) {
	output := `COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    12345 user   20u  IPv4 0xabc      0t0  TCP 127.0.0.1:5173 (LISTEN)
ssh     23456 user    5u  IPv6 0xdef      0t0  TCP *:8080 (LISTEN)
`

	ports := parseLsofListeningPorts(output)

	expected := []ListeningPort{
		{Command: "node", PID: "12345", Address: "127.0.0.1", Port: "5173", Protocol: "tcp"},
		{Command: "ssh", PID: "23456", Address: "*", Port: "8080", Protocol: "tcp"},
	}
	if !reflect.DeepEqual(ports, expected) {
		t.Fatalf("expected %#v, got %#v", expected, ports)
	}
}

func TestParseWindowsNetstatListeningPorts(t *testing.T) {
	output := `
  Proto  Local Address          Foreign Address        State           PID
  TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       12345
  TCP    [::]:8080              [::]:0                 LISTENING       23456
`

	ports := parseWindowsNetstatListeningPorts(output)

	expected := []ListeningPort{
		{Command: "pid:12345", PID: "12345", Address: "127.0.0.1", Port: "5173", Protocol: "tcp"},
		{Command: "pid:23456", PID: "23456", Address: "::", Port: "8080", Protocol: "tcp"},
	}
	if !reflect.DeepEqual(ports, expected) {
		t.Fatalf("expected %#v, got %#v", expected, ports)
	}
}
