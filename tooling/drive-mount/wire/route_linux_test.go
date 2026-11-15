package wire

import (
	"context"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestHubSocketKeepsNoDelayOn(t *testing.T) {
	hub := newFakeHub(t)
	client := httpClientFor(hub.route())
	transport := client.Transport.(*http.Transport)
	inner := transport.DialContext
	captured := make(chan net.Conn, 1)
	transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		conn, err := inner(ctx, network, addr)
		if err == nil {
			captured <- conn
		}
		return conn, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, hub.route().URL+MountPath, &websocket.DialOptions{HTTPClient: client, Subprotocols: []string{Subprotocol}})
	if err != nil {
		t.Fatal(err)
	}
	defer ws.CloseNow()
	tcp, ok := (<-captured).(*net.TCPConn)
	if !ok {
		t.Fatal("the hub socket is not a TCP connection")
	}
	raw, err := tcp.SyscallConn()
	if err != nil {
		t.Fatal(err)
	}
	var value int
	var sockErr error
	if err := raw.Control(func(fd uintptr) {
		value, sockErr = syscall.GetsockoptInt(int(fd), syscall.IPPROTO_TCP, syscall.TCP_NODELAY)
	}); err != nil {
		t.Fatal(err)
	}
	if sockErr != nil {
		t.Fatal(sockErr)
	}
	if value == 0 {
		t.Fatal("TCP_NODELAY must be on for the hub socket")
	}
}

func TestWireNeverSetsSocketBufferSizes(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	forbidden := []string{"SetReadBuffer", "SetWriteBuffer", "SO_RCVBUF", "SO_SNDBUF"}
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		source, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		for _, word := range forbidden {
			if strings.Contains(string(source), word) {
				t.Fatalf("%s sets a socket buffer size with %s; the kernel autotuning must stay on", file, word)
			}
		}
	}
}
