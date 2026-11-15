package main

import (
	"io"
	"net"
	"sync"
)

type mode int

const (
	modeOpen mode = iota
	modeCut
	modeCutReply
	modeStall
	modeReset
)

var modeNames = map[mode]string{
	modeOpen:     "open",
	modeCut:      "cut",
	modeCutReply: "cutreply",
	modeStall:    "stall",
	modeReset:    "reset",
}

type direction int

const (
	toServer direction = iota
	toClient
)

type link struct {
	client  net.Conn
	server  net.Conn
	tainted bool
}

type route struct {
	name   string
	target string
	ln     net.Listener
	mu     sync.Mutex
	cond   *sync.Cond
	mode   mode
	links  map[*link]struct{}
	closed bool
}

func newRoute(name, target string, ln net.Listener) *route {
	r := &route{name: name, target: target, ln: ln, links: map[*link]struct{}{}}
	r.cond = sync.NewCond(&r.mu)
	return r
}

func abort(conn net.Conn) {
	if tcp, ok := conn.(*net.TCPConn); ok {
		tcp.SetLinger(0)
	}
	conn.Close()
}

func (r *route) serve() {
	for {
		client, err := r.ln.Accept()
		if err != nil {
			return
		}
		go r.accept(client)
	}
}

func (r *route) accept(client net.Conn) {
	r.mu.Lock()
	refuse := r.mode == modeReset || r.closed
	r.mu.Unlock()
	if refuse {
		abort(client)
		return
	}
	server, err := net.Dial("tcp", r.target)
	if err != nil {
		abort(client)
		return
	}
	l := &link{client: client, server: server}
	r.mu.Lock()
	r.links[l] = struct{}{}
	r.mu.Unlock()
	done := make(chan struct{}, 2)
	go func() { r.pipe(l, server, client, toServer); done <- struct{}{} }()
	go func() { r.pipe(l, client, server, toClient); done <- struct{}{} }()
	<-done
	client.Close()
	server.Close()
	<-done
	r.mu.Lock()
	delete(r.links, l)
	r.mu.Unlock()
}

type verdict int

const (
	forward verdict = iota
	discard
)

func (r *route) gate(l *link, dir direction) verdict {
	r.mu.Lock()
	defer r.mu.Unlock()
	for {
		switch r.mode {
		case modeCut:
			l.tainted = true
			return discard
		case modeCutReply:
			if dir == toClient {
				l.tainted = true
				return discard
			}
			return forward
		case modeStall:
			r.cond.Wait()
		default:
			return forward
		}
	}
}

func (r *route) pipe(l *link, dst, src net.Conn, dir direction) {
	buf := make([]byte, 64<<10)
	for {
		n, err := src.Read(buf)
		if n > 0 && r.gate(l, dir) == forward {
			if _, werr := dst.Write(buf[:n]); werr != nil {
				return
			}
		}
		if err != nil {
			if err == io.EOF {
				if tcp, ok := dst.(*net.TCPConn); ok {
					tcp.CloseWrite()
				}
			}
			return
		}
	}
}

func (r *route) set(next mode) {
	r.mu.Lock()
	defer r.mu.Unlock()
	previous := r.mode
	r.mode = next
	switch {
	case next == modeReset:
		for l := range r.links {
			abort(l.client)
			abort(l.server)
		}
	case next == modeOpen && (previous == modeCut || previous == modeCutReply):
		for l := range r.links {
			if l.tainted {
				abort(l.client)
				abort(l.server)
			}
		}
	}
	r.cond.Broadcast()
}

func (r *route) status() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.name + " " + modeNames[r.mode]
}

func (r *route) shutdown() {
	r.mu.Lock()
	r.closed = true
	for l := range r.links {
		abort(l.client)
		abort(l.server)
	}
	r.cond.Broadcast()
	r.mu.Unlock()
	r.ln.Close()
}
