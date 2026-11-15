package wire

import (
	"context"
	"sync"
	"testing"
	"time"
)

func (c *Client) liveSender() *sender {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.out
}

type writeGate struct {
	mu      sync.Mutex
	armed   bool
	open    chan struct{}
	blocked chan struct{}
}

func (g *writeGate) waitBlocked(t *testing.T) {
	t.Helper()
	select {
	case <-g.blocked:
	case <-time.After(10 * time.Second):
		t.Fatal("no frame reached the gated write")
	}
}

func (g *writeGate) release() { close(g.open) }

type gateConn struct {
	Conn
	gate *writeGate
}

func (c *gateConn) Write(ctx context.Context, frame []byte) error {
	c.gate.mu.Lock()
	armed := c.gate.armed
	c.gate.mu.Unlock()
	if armed {
		select {
		case c.gate.blocked <- struct{}{}:
		default:
		}
		select {
		case <-c.gate.open:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return c.Conn.Write(ctx, frame)
}

type gateDialer struct {
	inner Dialer
	gate  writeGate
}

func (d *gateDialer) Dial(ctx context.Context, route Route, token string) (Conn, error) {
	conn, err := d.inner.Dial(ctx, route, token)
	if err != nil {
		return nil, err
	}
	return &gateConn{Conn: conn, gate: &d.gate}, nil
}

func (d *gateDialer) arm() *writeGate {
	d.gate.mu.Lock()
	defer d.gate.mu.Unlock()
	d.gate.open = make(chan struct{})
	d.gate.blocked = make(chan struct{}, 1)
	d.gate.armed = true
	return &d.gate
}

func waitQueued(t *testing.T, s *sender, bulk, control int) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for {
		s.mu.Lock()
		b, c := len(s.bulk), len(s.control)
		s.mu.Unlock()
		if b == bulk && c == control {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("queued bulk %d control %d, want %d and %d", b, c, bulk, control)
		}
		time.Sleep(time.Millisecond)
	}
}
