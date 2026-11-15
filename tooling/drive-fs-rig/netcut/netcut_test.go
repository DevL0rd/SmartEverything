package main

import (
	"bufio"
	"io"
	"net"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

type rig struct {
	t       *testing.T
	proxy   *proxy
	address string
	control string
}

func echoServer(t *testing.T) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				defer conn.Close()
				io.Copy(conn, conn)
			}()
		}
	}()
	return ln.Addr().String()
}

func freeAddress(t *testing.T) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	return ln.Addr().String()
}

func newRig(t *testing.T) *rig {
	t.Helper()
	target := echoServer(t)
	listen := freeAddress(t)
	socket := filepath.Join(t.TempDir(), "c.sock")
	p, control, err := start([]string{"A-lan=" + listen + "=" + target}, socket)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		control.Close()
		p.shutdown()
	})
	return &rig{t: t, proxy: p, address: listen, control: socket}
}

func (r *rig) command(line string) string {
	r.t.Helper()
	conn, err := net.Dial("unix", r.control)
	if err != nil {
		r.t.Fatal(err)
	}
	defer conn.Close()
	if _, err := conn.Write([]byte(line + "\n")); err != nil {
		r.t.Fatal(err)
	}
	reply, err := bufio.NewReader(conn).ReadString('\n')
	if err != nil {
		r.t.Fatal(err)
	}
	return strings.TrimSpace(reply)
}

func (r *rig) dial() net.Conn {
	r.t.Helper()
	conn, err := net.Dial("tcp", r.address)
	if err != nil {
		r.t.Fatal(err)
	}
	r.t.Cleanup(func() { conn.Close() })
	return conn
}

func roundTrip(conn net.Conn, text string, wait time.Duration) (string, error) {
	if _, err := conn.Write([]byte(text)); err != nil {
		return "", err
	}
	buf := make([]byte, len(text))
	conn.SetReadDeadline(time.Now().Add(wait))
	_, err := io.ReadFull(conn, buf)
	return string(buf), err
}

func isTimeout(err error) bool {
	timeout, ok := err.(net.Error)
	return ok && timeout.Timeout()
}

func isReset(err error) bool {
	return err != nil && (strings.Contains(err.Error(), syscall.ECONNRESET.Error()) || err == io.EOF || strings.Contains(err.Error(), "broken pipe"))
}

func TestForwardsBytesBothWays(t *testing.T) {
	r := newRig(t)
	got, err := roundTrip(r.dial(), "hello", time.Second)
	if err != nil || got != "hello" {
		t.Fatalf("echo got %q, %v", got, err)
	}
}

func TestCutDiscardsBothDirectionsAndRestoreResetsTaintedConnections(t *testing.T) {
	r := newRig(t)
	conn := r.dial()
	if got, err := roundTrip(conn, "one", time.Second); err != nil || got != "one" {
		t.Fatalf("before cut got %q, %v", got, err)
	}
	if reply := r.command("cut A"); reply != "ok" {
		t.Fatalf("cut reply %q", reply)
	}
	if _, err := roundTrip(conn, "two", 300*time.Millisecond); !isTimeout(err) {
		t.Fatalf("a cut route must go silent, got %v", err)
	}
	r.command("restore A")
	conn.SetReadDeadline(time.Now().Add(time.Second))
	if _, err := conn.Read(make([]byte, 1)); !isReset(err) {
		t.Fatalf("a connection that lost bytes must be reset on restore, got %v", err)
	}
	fresh := r.dial()
	if got, err := roundTrip(fresh, "three", time.Second); err != nil || got != "three" {
		t.Fatalf("after restore got %q, %v", got, err)
	}
}

func TestCutReplyForwardsRequestsButDropsReplies(t *testing.T) {
	r := newRig(t)
	r.command("cutreply A-lan")
	conn := r.dial()
	if _, err := roundTrip(conn, "ping", 300*time.Millisecond); !isTimeout(err) {
		t.Fatalf("replies must be dropped, got %v", err)
	}
	r.command("restore A-lan")
	conn.SetReadDeadline(time.Now().Add(time.Second))
	if _, err := conn.Read(make([]byte, 1)); !isReset(err) {
		t.Fatalf("a connection that lost a reply must be reset on restore, got %v", err)
	}
}

func TestStallHoldsBytesUntilRestore(t *testing.T) {
	r := newRig(t)
	conn := r.dial()
	r.command("stall A")
	if _, err := roundTrip(conn, "held", 300*time.Millisecond); !isTimeout(err) {
		t.Fatalf("stalled bytes must not arrive, got %v", err)
	}
	r.command("restore A")
	buf := make([]byte, 4)
	conn.SetReadDeadline(time.Now().Add(time.Second))
	if _, err := io.ReadFull(conn, buf); err != nil || string(buf) != "held" {
		t.Fatalf("stalled bytes must arrive after restore, got %q, %v", buf, err)
	}
}

func TestResetBreaksOpenConnectionsAndRefusesNewOnes(t *testing.T) {
	r := newRig(t)
	conn := r.dial()
	if got, err := roundTrip(conn, "up", time.Second); err != nil || got != "up" {
		t.Fatalf("before reset got %q, %v", got, err)
	}
	r.command("reset A")
	conn.SetReadDeadline(time.Now().Add(time.Second))
	if _, err := conn.Read(make([]byte, 1)); !isReset(err) {
		t.Fatalf("an open connection must be reset, got %v", err)
	}
	refused := r.dial()
	if _, err := roundTrip(refused, "x", time.Second); !isReset(err) {
		t.Fatalf("a new connection must be reset while reset is on, got %v", err)
	}
	r.command("restore A")
	if got, err := roundTrip(r.dial(), "back", time.Second); err != nil || got != "back" {
		t.Fatalf("after restore got %q, %v", got, err)
	}
}

func TestStatusAndErrors(t *testing.T) {
	r := newRig(t)
	if reply := r.command("status"); reply != "ok A-lan open" {
		t.Fatalf("status %q", reply)
	}
	r.command("cut all")
	if reply := r.command("status"); reply != "ok A-lan cut" {
		t.Fatalf("status after cut %q", reply)
	}
	for line, want := range map[string]string{
		"bogus A":  "error: unknown command bogus",
		"cut":      "error: cut needs a route name",
		"cut B":    `error: no route "B"`,
		"":         "error: empty command",
		"restore ": "error: restore needs a route name",
	} {
		if reply := r.command(line); reply != want {
			t.Fatalf("%q replied %q, want %q", line, reply, want)
		}
	}
}

func TestPrefixAddressesEveryRouteOfAComputer(t *testing.T) {
	target := echoServer(t)
	socket := filepath.Join(t.TempDir(), "c.sock")
	p, control, err := start([]string{
		"A-lan=" + freeAddress(t) + "=" + target,
		"A-public=" + freeAddress(t) + "=" + target,
		"B-lan=" + freeAddress(t) + "=" + target,
	}, socket)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		control.Close()
		p.shutdown()
	}()
	if reply := p.execute("cut A"); reply != "ok" {
		t.Fatalf("cut reply %q", reply)
	}
	if reply := p.execute("status"); reply != "ok A-lan cut,A-public cut,B-lan open" {
		t.Fatalf("status %q", reply)
	}
}

func TestStartRejectsBadRoutes(t *testing.T) {
	socket := filepath.Join(t.TempDir(), "c.sock")
	if _, _, err := start([]string{"only-name"}, socket); err == nil {
		t.Fatal("a route without addresses must be rejected")
	}
	if _, _, err := start([]string{"x=not an address=127.0.0.1:1"}, socket); err == nil {
		t.Fatal("an unusable listen address must be rejected")
	}
}
