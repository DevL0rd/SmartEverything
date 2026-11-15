package wire

import (
	"bytes"
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func TestCallSendsTheTokenHelloFirstAndMatchesReplyByID(t *testing.T) {
	hub := newFakeHub(t)
	client := startClient(t, hub.route(), &recordingHandler{}, nil)
	conn := hub.accept(t)
	if auth := (<-hub.headers).Get("Authorization"); auth != "Bearer computer-token" {
		t.Fatalf("Authorization = %q", auth)
	}
	resumed, hello := hub.handshake(t, conn)
	if resumed || hello[KeySession] != nil {
		t.Fatalf("a first hello is new: resumed %v session %v", resumed, hello[KeySession])
	}
	first := callAsync(within(t), client, OpRead, Meta{KeyHandle: uint64(1), KeyOffset: uint64(0), KeyLength: uint64(4)}, nil)
	second := callAsync(within(t), client, OpLookup, Meta{KeyParent: uint64(1), KeyName: "a"}, nil)
	reqA, _ := conn.read(t)
	reqB, _ := conn.read(t)
	if reqA.RequestID == reqB.RequestID || reqA.RequestID == 0 {
		t.Fatalf("request ids %d %d", reqA.RequestID, reqB.RequestID)
	}
	for _, req := range []Frame{reqB, reqA} {
		if req.Op == OpRead {
			conn.reply(t, req, Meta{}, []byte("abcd"))
		} else {
			conn.reply(t, req, Meta{KeyIno: uint64(2)}, nil)
		}
	}
	if r := await(t, first); r.err != nil || !bytes.Equal(r.reply.Payload, []byte("abcd")) {
		t.Fatalf("read = %+v / %v", r, r.err)
	}
	if r := await(t, second); r.err != nil || r.reply.Meta[KeyIno] != uint64(2) {
		t.Fatalf("lookup = %+v", r)
	}
}

func TestErrorRepliesBecomeRemoteErrors(t *testing.T) {
	hub := newFakeHub(t)
	client := startClient(t, hub.route(), &recordingHandler{}, nil)
	conn := hub.accept(t)
	hub.handshake(t, conn)
	done := callAsync(within(t), client, OpUnlink, Meta{KeyParent: uint64(1), KeyName: "x", KeyOpKey: NewOpKey()}, nil)
	req, _ := conn.read(t)
	conn.fail(t, req, ErrENOENT, "no such name")
	r := await(t, done)
	code, ok := CodeOf(r.err)
	if !ok || code != ErrENOENT || r.err.Error() == "" {
		t.Fatalf("err = %v", r.err)
	}
	if !errors.Is(r.err, &RemoteError{Code: ErrENOENT}) {
		t.Fatal("errors.Is must match by code")
	}
	staleDone := callAsync(within(t), client, OpEnd, Meta{}, nil)
	stale, _ := conn.read(t)
	conn.write(t, Frame{Type: FrameError, Op: stale.Op, RequestID: stale.RequestID}, Meta{KeyCode: uint64(ErrESTALE), KeyMessage: "base moved", KeyRev: uint64(9)})
	var remote *RemoteError
	if r := await(t, staleDone); !errors.As(r.err, &remote) || remote.Rev != 9 || !remote.HasRev {
		t.Fatalf("stale err = %v", r.err)
	}
}

func TestMultipleRepliesAreCollectedUntilTheLastOne(t *testing.T) {
	hub := newFakeHub(t)
	client := startClient(t, hub.route(), &recordingHandler{}, nil)
	conn := hub.accept(t)
	hub.handshake(t, conn)
	type result struct {
		replies []Reply
		err     error
	}
	out := make(chan result, 1)
	go func() {
		replies, err := client.Do(within(t), OpReaddir, Meta{KeyIno: uint64(1), KeyCursor: uint64(0)}, nil)
		out <- result{replies, err}
	}()
	req, _ := conn.read(t)
	conn.replyMore(t, req, Meta{KeyEntries: []any{}, KeyNext: uint64(1)})
	conn.reply(t, req, Meta{KeyEntries: []any{}, KeyNext: nil}, nil)
	r := <-out
	if r.err != nil || len(r.replies) != 2 {
		t.Fatalf("replies = %d, %v", len(r.replies), r.err)
	}
	callDone := callAsync(within(t), client, OpReaddir, Meta{KeyIno: uint64(1), KeyCursor: uint64(0)}, nil)
	again, _ := conn.read(t)
	conn.replyMore(t, again, Meta{KeyEntries: []any{}, KeyNext: uint64(1)})
	conn.reply(t, again, Meta{KeyEntries: []any{}, KeyNext: nil}, nil)
	if r := await(t, callDone); !errors.Is(r.err, ErrUnexpected) {
		t.Fatalf("Call must refuse a streamed answer: %v", r.err)
	}
}

func TestPushesAreDispatchedInOrderAndNeverBlockTheReadLoop(t *testing.T) {
	hub := newFakeHub(t)
	handler := &recordingHandler{pushed: make(chan struct{}, 8)}
	client := startClient(t, hub.route(), handler, nil)
	conn := hub.accept(t)
	hub.handshake(t, conn)
	root := "3f6f1a52-7c5b-4a77-9d5c-0a1f2d3e4b5c"
	conn.push(t, PushChanged, Meta{KeyRoot: root, KeySeq: uint64(1), KeyInodes: []any{uint64(5)}, KeyEntries: []any{[]any{uint64(2), "n"}}, KeyRemoved: []any{}})
	conn.push(t, PushChanged, Meta{KeyRoot: root, KeySeq: uint64(2), KeyInodes: []any{}, KeyEntries: []any{}, KeyRemoved: []any{uint64(5)}})
	conn.push(t, PushReset, Meta{KeyRoot: root, KeySeq: uint64(9)})
	conn.push(t, PushLockLost, Meta{KeyIno: uint64(5), KeyOwner: uint64(77)})
	for i := 0; i < 4; i++ {
		select {
		case <-handler.pushed:
		case <-time.After(10 * time.Second):
			t.Fatal("push not delivered")
		}
	}
	if len(handler.changed) != 2 || handler.changed[0].Seq != 1 || handler.changed[1].Seq != 2 ||
		handler.changed[0].Entries[0] != (NameRef{Parent: 2, Name: "n"}) || handler.changed[1].Removed[0] != 5 {
		t.Fatalf("changed = %+v", handler.changed)
	}
	if handler.reset[0].Seq != 9 || handler.lost[0] != (LockLost{Ino: 5, Owner: 77}) {
		t.Fatalf("reset %+v lost %+v", handler.reset, handler.lost)
	}
	_ = client
}

func TestDroppedConnectionResumesTheSessionAndResendsWithTheSameIDs(t *testing.T) {
	hub := newFakeHub(t)
	handler := &recordingHandler{resume: Resume{Seqs: []RootSeq{{Root: "3f6f1a52-7c5b-4a77-9d5c-0a1f2d3e4b5c", Seq: 4}}}}
	client := startClient(t, hub.route(), handler, nil)
	conn := hub.accept(t)
	hub.handshake(t, conn)
	read := callAsync(within(t), client, OpRead, Meta{KeyHandle: uint64(3), KeyOffset: uint64(0), KeyLength: uint64(2)}, nil)
	setattr := callAsync(within(t), client, OpUnlink, Meta{KeyParent: uint64(1), KeyName: "n", KeyOpKey: NewOpKey()}, nil)
	first := map[uint64]Op{}
	for i := 0; i < 2; i++ {
		req, _ := conn.read(t)
		first[req.RequestID] = req.Op
	}
	conn.close()
	second := hub.accept(t)
	resumed, hello := hub.handshake(t, second)
	if !resumed {
		t.Fatal("the hub must resume a session it still holds")
	}
	if sent, _ := hello.Bytes(KeySession); len(sent) != SessionBytes {
		t.Fatalf("session sent back = %v", hello[KeySession])
	}
	seqs, _ := hello.Array(KeySeqs)
	if len(seqs) != 1 {
		t.Fatalf("seqs = %v", hello[KeySeqs])
	}
	for i := 0; i < 2; i++ {
		req, _ := second.read(t)
		if first[req.RequestID] != req.Op {
			t.Fatalf("resent %s with id %d, first time %v", req.Op.Name(), req.RequestID, first)
		}
		if req.Op == OpRead {
			second.reply(t, req, Meta{}, []byte("ok"))
		} else {
			second.reply(t, req, Meta{}, nil)
		}
	}
	if r := await(t, read); r.err != nil || string(r.reply.Payload) != "ok" {
		t.Fatalf("read = %+v / %v", r, r.err)
	}
	if r := await(t, setattr); r.err != nil {
		t.Fatalf("unlink = %+v", r)
	}
	if got := handler.establishedList(); len(got) != 2 || got[0] || !got[1] {
		t.Fatalf("established = %v", got)
	}
}

func TestExpiredSessionFailsHandleRequestsRunsRecoveryAndResendsTheRest(t *testing.T) {
	hub := newFakeHub(t)
	handler := &recordingHandler{}
	handler.onReady = func(ctx context.Context, c Caller, resumed bool) error {
		if resumed || len(handler.establishedList()) < 2 {
			return nil
		}
		reply, err := c.Call(ctx, OpOpen, Meta{KeyIno: uint64(42)}, nil)
		if err != nil {
			return err
		}
		if reply.Meta[KeyHandle] != uint64(100) {
			t.Errorf("reopened handle = %v", reply.Meta[KeyHandle])
		}
		return nil
	}
	client := startClient(t, hub.route(), handler, nil)
	conn := hub.accept(t)
	hub.handshake(t, conn)
	read := callAsync(within(t), client, OpRead, Meta{KeyHandle: uint64(3), KeyOffset: uint64(0), KeyLength: uint64(2)}, nil)
	lookup := callAsync(within(t), client, OpLookup, Meta{KeyParent: uint64(1), KeyName: "n"}, nil)
	for i := 0; i < 2; i++ {
		conn.read(t)
	}
	hub.forget()
	conn.close()
	second := hub.accept(t)
	resumed, _ := hub.handshake(t, second)
	if resumed {
		t.Fatal("the hub forgot the session")
	}
	open, _ := second.read(t)
	if open.Op != OpOpen {
		t.Fatalf("recovery must run before the resend, got %s", open.Op.Name())
	}
	second.reply(t, open, Meta{KeyHandle: uint64(100)}, nil)
	again, _ := second.read(t)
	if again.Op != OpLookup {
		t.Fatalf("the resend carries %s, want LOOKUP", again.Op.Name())
	}
	second.reply(t, again, Meta{KeyIno: uint64(7)}, nil)
	if r := await(t, read); !errors.Is(r.err, ErrSessionLost) {
		t.Fatalf("read err = %v, want the session lost", r.err)
	}
	if r := await(t, lookup); r.err != nil {
		t.Fatalf("lookup = %+v", r)
	}
	if got := handler.establishedList(); len(got) != 2 || got[1] {
		t.Fatalf("established = %v", got)
	}
}

func TestFailedRecoveryForgetsTheSessionAndTriesAgain(t *testing.T) {
	hub := newFakeHub(t)
	var mu sync.Mutex
	attempts := 0
	handler := &recordingHandler{}
	handler.onReady = func(context.Context, Caller, bool) error {
		mu.Lock()
		defer mu.Unlock()
		attempts++
		if attempts == 1 {
			return errors.New("recovery failed")
		}
		return nil
	}
	client := startClient(t, hub.route(), handler, nil)
	first := hub.accept(t)
	hub.handshake(t, first)
	second := hub.accept(t)
	resumed, hello := hub.handshake(t, second)
	if resumed || hello[KeySession] != nil {
		t.Fatalf("a failed recovery must start a fresh session: resumed %v session %v", resumed, hello[KeySession])
	}
	call := callAsync(within(t), client, OpLookup, Meta{KeyParent: uint64(1), KeyName: "n"}, nil)
	req, _ := second.read(t)
	second.reply(t, req, Meta{KeyIno: uint64(1)}, nil)
	if r := await(t, call); r.err != nil {
		t.Fatal(r.err)
	}
}

func TestCancelledCallSendsCancelAndReturnsTheContextError(t *testing.T) {
	hub := newFakeHub(t)
	client := startClient(t, hub.route(), &recordingHandler{}, nil)
	conn := hub.accept(t)
	hub.handshake(t, conn)
	ctx, cancel := context.WithCancel(context.Background())
	done := callAsync(ctx, client, OpSetlk, Meta{KeyIno: uint64(1), KeyOwner: uint64(1), KeyType: uint64(LockTypeWrite), KeyStart: uint64(0), KeyEnd: EndOfFile, KeyPid: uint64(1), KeyWait: true, KeyFlock: false}, nil)
	req, _ := conn.read(t)
	cancel()
	cancelFrame, meta := conn.read(t)
	if cancelFrame.Op != OpCancel || meta[KeyRequestId] != req.RequestID {
		t.Fatalf("cancel = %s %v, want the id %d", cancelFrame.Op.Name(), meta, req.RequestID)
	}
	if r := await(t, done); !errors.Is(r.err, context.Canceled) {
		t.Fatalf("err = %v", r.err)
	}
	conn.fail(t, req, ErrEINTR, "cancelled")
	next := callAsync(within(t), client, OpLookup, Meta{KeyParent: uint64(1), KeyName: "n"}, nil)
	nextReq, _ := conn.read(t)
	conn.reply(t, nextReq, Meta{KeyIno: uint64(2)}, nil)
	if r := await(t, next); r.err != nil {
		t.Fatalf("the late answer of a cancelled request must be ignored: %v", r.err)
	}
}

func TestRouteSwitchClosesTheSocketDialsTheNewRouteAndResends(t *testing.T) {
	hubA, hubB := newFakeHub(t), newFakeHub(t)
	client := startClient(t, hubA.route(), &recordingHandler{}, nil)
	connA := hubA.accept(t)
	hubA.handshake(t, connA)
	call := callAsync(within(t), client, OpLookup, Meta{KeyParent: uint64(1), KeyName: "n"}, nil)
	reqA, _ := connA.read(t)
	if err := client.SwitchRoute(hubB.route()); err != nil {
		t.Fatal(err)
	}
	if _, _, err := connA.tryRead(); err == nil {
		t.Fatal("the old socket must be closed")
	}
	connB := hubB.accept(t)
	resumed, hello := hubB.handshake(t, connB)
	if resumed || hello[KeySession] == nil {
		t.Fatalf("the new hub does not know the session: resumed %v, hello session %v", resumed, hello[KeySession])
	}
	reqB, _ := connB.read(t)
	if reqB.RequestID != reqA.RequestID || reqB.Op != OpLookup {
		t.Fatalf("resend = %s %d, want %d", reqB.Op.Name(), reqB.RequestID, reqA.RequestID)
	}
	connB.reply(t, reqB, Meta{KeyIno: uint64(9)}, nil)
	if r := await(t, call); r.err != nil || r.reply.Meta[KeyIno] != uint64(9) {
		t.Fatalf("lookup = %+v", r)
	}
}

func TestRouteSwitchBackToTheSameHubResumesTheSession(t *testing.T) {
	hub := newFakeHub(t)
	client := startClient(t, hub.route(), &recordingHandler{}, nil)
	first := hub.accept(t)
	hub.handshake(t, first)
	waitConnected(t, client)
	if err := client.SwitchRoute(hub.route()); err != nil {
		t.Fatal(err)
	}
	second := hub.accept(t)
	resumed, _ := hub.handshake(t, second)
	if !resumed {
		t.Fatal("a route switch inside the lease resumes")
	}
}

func TestNoRouteAnswersAtOnceAndDropsWhatWaits(t *testing.T) {
	hub := newFakeHub(t)
	client := startClient(t, hub.route(), &recordingHandler{}, nil)
	conn := hub.accept(t)
	hub.handshake(t, conn)
	waiting := callAsync(within(t), client, OpLookup, Meta{KeyParent: uint64(1), KeyName: "n"}, nil)
	conn.read(t)
	if err := client.SwitchRoute(Route{}); err != nil {
		t.Fatal(err)
	}
	if r := await(t, waiting); !errors.Is(r.err, ErrNoRoute) {
		t.Fatalf("waiting call err = %v", r.err)
	}
	if _, err := client.Call(within(t), OpGetattr, Meta{KeyIno: uint64(1)}, nil); !errors.Is(err, ErrNoRoute) {
		t.Fatalf("err = %v", err)
	}
	if err := client.SwitchRoute(hub.route()); err != nil {
		t.Fatal(err)
	}
	next := hub.accept(t)
	hub.handshake(t, next)
	done := callAsync(within(t), client, OpGetattr, Meta{KeyIno: uint64(1)}, nil)
	req, _ := next.read(t)
	next.reply(t, req, Meta{}, nil)
	if r := await(t, done); r.err != nil {
		t.Fatal(r.err)
	}
}

func TestCallsWaitWhileTheSocketReconnects(t *testing.T) {
	hub := newFakeHub(t)
	client := startClient(t, hub.route(), &recordingHandler{}, nil)
	conn := hub.accept(t)
	hub.handshake(t, conn)
	conn.close()
	call := callAsync(within(t), client, OpLookup, Meta{KeyParent: uint64(1), KeyName: "n"}, nil)
	next := hub.accept(t)
	hub.handshake(t, next)
	req, _ := next.read(t)
	next.reply(t, req, Meta{KeyIno: uint64(3)}, nil)
	if r := await(t, call); r.err != nil {
		t.Fatal(r.err)
	}
}

type stallingDialer struct {
	inner Dialer
	mu    sync.Mutex
	conns []*stallingConn
}

type stallingConn struct {
	Conn
	pings  chan struct{}
	stalls bool
}

func (d *stallingDialer) Dial(ctx context.Context, route Route, token string) (Conn, error) {
	conn, err := d.inner.Dial(ctx, route, token)
	if err != nil {
		return nil, err
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	wrapped := &stallingConn{Conn: conn, pings: make(chan struct{}, 64), stalls: len(d.conns) == 0}
	d.conns = append(d.conns, wrapped)
	return wrapped, nil
}

func (c *stallingConn) Ping(ctx context.Context) error {
	c.pings <- struct{}{}
	if c.stalls {
		<-ctx.Done()
		return ctx.Err()
	}
	return c.Conn.Ping(ctx)
}

func TestMissingPongClosesTheSocketAndReconnects(t *testing.T) {
	hub := newFakeHub(t)
	dialer := &stallingDialer{inner: WebsocketDialer{}}
	startClient(t, hub.route(), &recordingHandler{}, func(c *Config) {
		c.Dialer = dialer
		c.PingInterval = 20 * time.Millisecond
		c.PongTimeout = 60 * time.Millisecond
	})
	first := hub.accept(t)
	hub.handshake(t, first)
	go func() {
		for {
			if _, _, err := first.tryRead(); err != nil {
				return
			}
		}
	}()
	second := hub.accept(t)
	hub.handshake(t, second)
	dialer.mu.Lock()
	defer dialer.mu.Unlock()
	select {
	case <-dialer.conns[0].pings:
	default:
		t.Fatal("the first socket never pinged")
	}
}

func TestHealthyPingsKeepTheSocket(t *testing.T) {
	hub := newFakeHub(t)
	client := startClient(t, hub.route(), &recordingHandler{}, func(c *Config) {
		c.PingInterval = 10 * time.Millisecond
		c.PongTimeout = time.Second
	})
	conn := hub.accept(t)
	hub.handshake(t, conn)
	go func() {
		for {
			if _, _, err := conn.tryRead(); err != nil {
				return
			}
		}
	}()
	time.Sleep(150 * time.Millisecond)
	select {
	case <-hub.accepted:
		t.Fatal("the client reconnected although pongs arrived")
	default:
	}
	if !client.Connected() {
		t.Fatal("the client must stay connected")
	}
}

func TestHelloFailureBacksOffAndRetriesWithAFreshSession(t *testing.T) {
	hub := newFakeHub(t)
	startClient(t, hub.route(), &recordingHandler{}, nil)
	conn := hub.accept(t)
	frame, _ := conn.read(t)
	conn.fail(t, frame, ErrEIO, "not ready")
	next := hub.accept(t)
	resumed, _ := hub.handshake(t, next)
	if resumed {
		t.Fatal("no session was granted yet")
	}
}

func TestHelloWithAnotherFrameLimitIsRefused(t *testing.T) {
	hub := newFakeHub(t)
	startClient(t, hub.route(), &recordingHandler{}, nil)
	conn := hub.accept(t)
	frame, _ := conn.read(t)
	conn.reply(t, frame, Meta{KeySession: make([]byte, SessionBytes), KeyResumed: false, KeyLeaseMs: uint64(LeaseMs), KeyFrameLimit: uint64(1 << 20)}, nil)
	hub.accept(t)
}

func TestAnAnswerForTheWrongOpClosesTheSocket(t *testing.T) {
	hub := newFakeHub(t)
	client := startClient(t, hub.route(), &recordingHandler{}, nil)
	conn := hub.accept(t)
	hub.handshake(t, conn)
	call := callAsync(within(t), client, OpLookup, Meta{KeyParent: uint64(1), KeyName: "n"}, nil)
	req, _ := conn.read(t)
	conn.write(t, Frame{Type: FrameReply, Op: OpGetattr, RequestID: req.RequestID}, Meta{})
	next := hub.accept(t)
	hub.handshake(t, next)
	again, _ := next.read(t)
	next.reply(t, again, Meta{KeyIno: uint64(1)}, nil)
	if r := await(t, call); r.err != nil {
		t.Fatal(r.err)
	}
}

func TestCloseFailsWhatWaitsAndStopsTheSocket(t *testing.T) {
	hub := newFakeHub(t)
	client, err := NewClient(Config{Token: "t", Route: hub.route(), Handler: &recordingHandler{}})
	if err != nil {
		t.Fatal(err)
	}
	conn := hub.accept(t)
	hub.handshake(t, conn)
	call := callAsync(within(t), client, OpLookup, Meta{KeyParent: uint64(1), KeyName: "n"}, nil)
	conn.read(t)
	if err := client.Close(); err != nil {
		t.Fatal(err)
	}
	if r := await(t, call); !errors.Is(r.err, ErrClosed) {
		t.Fatalf("err = %v", r.err)
	}
	if _, err := client.Call(within(t), OpLookup, Meta{}, nil); !errors.Is(err, ErrClosed) {
		t.Fatalf("err = %v", err)
	}
	if err := client.SwitchRoute(hub.route()); !errors.Is(err, ErrClosed) {
		t.Fatalf("err = %v", err)
	}
	if err := client.Close(); err != nil {
		t.Fatal(err)
	}
	if _, _, err := conn.tryRead(); err == nil {
		t.Fatal("the socket must be closed")
	}
}

func TestPayloadAtTheFrameLimitTravelsBothWays(t *testing.T) {
	hub := newFakeHub(t)
	client := startClient(t, hub.route(), &recordingHandler{}, nil)
	conn := hub.accept(t)
	hub.handshake(t, conn)
	data := bytes.Repeat([]byte{0xab}, MaxPayloadBytes)
	call := callAsync(within(t), client, OpWrite, Meta{KeyCommit: uint64(1), KeyOffset: uint64(0)}, data)
	req, _ := conn.read(t)
	if !bytes.Equal(req.Payload, data) {
		t.Fatal("the payload changed on the way")
	}
	conn.reply(t, req, Meta{}, nil)
	if r := await(t, call); r.err != nil {
		t.Fatal(r.err)
	}
	read := callAsync(within(t), client, OpRead, Meta{KeyHandle: uint64(1), KeyOffset: uint64(0), KeyLength: uint64(MaxPayloadBytes)}, nil)
	readReq, _ := conn.read(t)
	conn.reply(t, readReq, Meta{}, data)
	if r := await(t, read); r.err != nil || !bytes.Equal(r.reply.Payload, data) {
		t.Fatalf("read = %v", r.err)
	}
	if _, err := client.Call(within(t), OpWrite, Meta{KeyCommit: uint64(1), KeyOffset: uint64(0)}, make([]byte, MaxPayloadBytes+1)); err == nil {
		t.Fatal("an oversize payload must be refused before it is sent")
	}
}

func TestNewClientValidatesItsInput(t *testing.T) {
	if _, err := NewClient(Config{Route: Route{URL: "https://hub"}}); err == nil {
		t.Fatal("a handler is required")
	}
	if _, err := NewClient(Config{Handler: &recordingHandler{}, Route: Route{URL: "no-scheme"}}); err == nil {
		t.Fatal("a route needs a scheme and a host")
	}
	client, err := NewClient(Config{Handler: &recordingHandler{}})
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	if err := client.SwitchRoute(Route{URL: "::bad"}); err == nil {
		t.Fatal("a malformed route must be refused")
	}
	if _, err := client.Call(context.Background(), OpGetattr, Meta{}, nil); !errors.Is(err, ErrNoRoute) {
		t.Fatalf("err = %v", err)
	}
}
