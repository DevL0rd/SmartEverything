package wire

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
)

type recordingHandler struct {
	mu          sync.Mutex
	resume      Resume
	changed     []Changed
	reset       []Reset
	lost        []LockLost
	established []bool
	onReady     func(ctx context.Context, c Caller, resumed bool) error
	pushed      chan struct{}
}

func (h *recordingHandler) Resume() Resume {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.resume
}

func (h *recordingHandler) Established(ctx context.Context, c Caller, resumed bool) error {
	h.mu.Lock()
	h.established = append(h.established, resumed)
	hook := h.onReady
	h.mu.Unlock()
	if hook != nil {
		return hook(ctx, c, resumed)
	}
	return nil
}

func (h *recordingHandler) notify() {
	if h.pushed != nil {
		h.pushed <- struct{}{}
	}
}

func (h *recordingHandler) Changed(c Changed) {
	h.mu.Lock()
	h.changed = append(h.changed, c)
	h.mu.Unlock()
	h.notify()
}

func (h *recordingHandler) Reset(r Reset) {
	h.mu.Lock()
	h.reset = append(h.reset, r)
	h.mu.Unlock()
	h.notify()
}

func (h *recordingHandler) LockLost(l LockLost) {
	h.mu.Lock()
	h.lost = append(h.lost, l)
	h.mu.Unlock()
	h.notify()
}

func (h *recordingHandler) establishedList() []bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]bool(nil), h.established...)
}

type hubConn struct {
	conn *websocket.Conn
	ctx  context.Context
}

func (h *hubConn) read(t *testing.T) (Frame, Meta) {
	t.Helper()
	frame, meta, err := h.tryRead()
	if err != nil {
		t.Fatalf("fake hub read: %v", err)
	}
	return frame, meta
}

func (h *hubConn) tryRead() (Frame, Meta, error) {
	_, raw, err := h.conn.Read(h.ctx)
	if err != nil {
		return Frame{}, nil, err
	}
	frame, err := DecodeFrame(raw)
	if err != nil {
		return Frame{}, nil, err
	}
	meta, err := DecodeMeta(frame.Meta)
	return frame, meta, err
}

func (h *hubConn) write(t *testing.T, frame Frame, meta Meta) {
	t.Helper()
	var err error
	if frame.Meta, err = EncodeMeta(meta); err != nil {
		t.Fatal(err)
	}
	raw, err := EncodeFrame(frame)
	if err != nil {
		t.Fatal(err)
	}
	if err := h.conn.Write(h.ctx, websocket.MessageBinary, raw); err != nil {
		t.Fatalf("fake hub write: %v", err)
	}
}

func (h *hubConn) reply(t *testing.T, req Frame, meta Meta, payload []byte) {
	t.Helper()
	h.write(t, Frame{Type: FrameReply, Op: req.Op, RequestID: req.RequestID, Payload: payload}, meta)
}

func (h *hubConn) replyMore(t *testing.T, req Frame, meta Meta) {
	t.Helper()
	h.write(t, Frame{Type: FrameReply, Op: req.Op, RequestID: req.RequestID, More: true}, meta)
}

func (h *hubConn) fail(t *testing.T, req Frame, code ErrorCode, message string) {
	t.Helper()
	h.write(t, Frame{Type: FrameError, Op: req.Op, RequestID: req.RequestID}, Meta{KeyCode: uint64(code), KeyMessage: message})
}

func (h *hubConn) push(t *testing.T, op Op, meta Meta) {
	t.Helper()
	h.write(t, Frame{Type: FramePush, Op: op}, meta)
}

func (h *hubConn) close() { _ = h.conn.CloseNow() }

type fakeHub struct {
	t        *testing.T
	server   *httptest.Server
	mu       sync.Mutex
	sessions map[string]bool
	counter  byte
	accepted chan *hubConn
	headers  chan http.Header
}

func newFakeHub(t *testing.T) *fakeHub {
	t.Helper()
	hub := &fakeHub{t: t, sessions: map[string]bool{}, accepted: make(chan *hubConn, 16), headers: make(chan http.Header, 16)}
	hub.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != MountPath {
			http.NotFound(w, r)
			return
		}
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{Subprotocol}, CompressionMode: websocket.CompressionDisabled})
		if err != nil {
			return
		}
		conn.SetReadLimit(MaxFrameBytes)
		hub.headers <- r.Header.Clone()
		hub.accepted <- &hubConn{conn: conn, ctx: r.Context()}
		<-r.Context().Done()
	}))
	t.Cleanup(hub.server.Close)
	return hub
}

func (f *fakeHub) route() Route { return Route{URL: f.server.URL} }

func (f *fakeHub) accept(t *testing.T) *hubConn {
	t.Helper()
	select {
	case conn := <-f.accepted:
		return conn
	case <-time.After(10 * time.Second):
		t.Fatal("no connection reached the fake hub")
		return nil
	}
}

func (f *fakeHub) handshake(t *testing.T, conn *hubConn) (resumed bool, hello Meta) {
	t.Helper()
	frame, meta := conn.read(t)
	if frame.Op != OpHello || frame.Type != FrameRequest {
		t.Fatalf("first frame is %s, want HELLO", frame.Op.Name())
	}
	f.mu.Lock()
	var session []byte
	if sent, ok := meta[KeySession].([]byte); ok && f.sessions[string(sent)] {
		session, resumed = sent, true
	} else {
		f.counter++
		session = make([]byte, SessionBytes)
		session[0] = f.counter
		f.sessions[string(session)] = true
	}
	f.mu.Unlock()
	conn.reply(t, frame, Meta{KeySession: session, KeyResumed: resumed, KeyLeaseMs: uint64(LeaseMs), KeyFrameLimit: uint64(MaxFrameBytes)}, nil)
	return resumed, meta
}

func (f *fakeHub) forget() {
	f.mu.Lock()
	f.sessions = map[string]bool{}
	f.mu.Unlock()
}

func startClient(t *testing.T, route Route, handler Handler, tune func(*Config)) *Client {
	t.Helper()
	cfg := Config{Token: "computer-token", Route: route, Handler: handler, BackoffMin: 5 * time.Millisecond, BackoffMax: 20 * time.Millisecond}
	if tune != nil {
		tune(&cfg)
	}
	client, err := NewClient(cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Close() })
	return client
}

func within(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	t.Cleanup(cancel)
	return ctx
}

type callResult struct {
	reply Reply
	err   error
}

func callAsync(ctx context.Context, c *Client, op Op, meta Meta, payload []byte) <-chan callResult {
	out := make(chan callResult, 1)
	go func() {
		reply, err := c.Call(ctx, op, meta, payload)
		out <- callResult{reply, err}
	}()
	return out
}

func await(t *testing.T, ch <-chan callResult) callResult {
	t.Helper()
	select {
	case r := <-ch:
		return r
	case <-time.After(10 * time.Second):
		t.Fatal("the call did not finish")
		return callResult{}
	}
}

func waitConnected(t *testing.T, c *Client) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for !c.Connected() {
		if time.Now().After(deadline) {
			t.Fatal("the client never became ready")
		}
		time.Sleep(2 * time.Millisecond)
	}
}
