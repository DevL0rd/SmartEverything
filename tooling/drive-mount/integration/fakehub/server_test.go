package fakehub

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

type recorder struct {
	mu      sync.Mutex
	changes []wire.Changed
	wake    chan struct{}
}

func (r *recorder) Resume() wire.Resume { return wire.Resume{} }

func (r *recorder) Established(context.Context, wire.Caller, bool) error { return nil }

func (r *recorder) Offline() {}

func (r *recorder) Changed(c wire.Changed) {
	r.mu.Lock()
	r.changes = append(r.changes, c)
	r.mu.Unlock()
	select {
	case r.wake <- struct{}{}:
	default:
	}
}

func (r *recorder) Reset(wire.Reset) {}

func (r *recorder) LockLost(wire.LockLost) {}

func connect(t *testing.T, h *Hub) (*wire.Client, *recorder) {
	t.Helper()
	rec := &recorder{wake: make(chan struct{}, 16)}
	c, err := wire.NewClient(wire.Config{Token: Token, Route: wire.Route{URL: h.URL}, Handler: rec})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { c.Close() })
	return c, rec
}

func call(t *testing.T, c *wire.Client, op wire.Op, meta wire.Meta, payload []byte) wire.Reply {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	reply, err := c.Call(ctx, op, meta, payload)
	if err != nil {
		t.Fatalf("%s: %v", op.Name(), err)
	}
	return reply
}

func attach(t *testing.T, c *wire.Client) wire.Root {
	t.Helper()
	reply := call(t, c, wire.OpAttach, wire.Meta{wire.KeyPlacementId: "p"}, nil)
	root, err := wire.ParseRoot(reply.Meta)
	if err != nil {
		t.Fatal(err)
	}
	return root
}

func TestTheWireServerCreatesWritesAndReadsBack(t *testing.T) {
	h := New(t)
	c, _ := connect(t, h)
	root := attach(t, c)
	lease := call(t, c, wire.OpLease, wire.Meta{wire.KeyCount: uint64(4)}, nil)
	start, err := lease.Meta.Uint(wire.KeyStart)
	if err != nil {
		t.Fatal(err)
	}
	created := call(t, c, wire.OpCreate, wire.Meta{wire.KeyParent: root.Ino, wire.KeyName: "a.txt", wire.KeyIno: start, wire.KeyMode: uint64(0o644), wire.KeyUid: nil, wire.KeyGid: nil, wire.KeyMtimeNs: int64(1), wire.KeyFsync: false, wire.KeyOpKey: wire.NewOpKey()}, []byte{})
	entry, err := wire.ParseEntry(created.Meta)
	if err != nil {
		t.Fatal(err)
	}
	call(t, c, wire.OpPut, wire.Meta{wire.KeyIno: entry.Ino, wire.KeyBaseRev: uint64(0), wire.KeySize: uint64(5), wire.KeyFsync: false, wire.KeyOpKey: wire.NewOpKey()}, []byte("hello"))
	open := call(t, c, wire.OpOpen, wire.Meta{wire.KeyIno: entry.Ino}, nil)
	handle, _ := open.Meta.Uint(wire.KeyHandle)
	read := call(t, c, wire.OpRead, wire.Meta{wire.KeyHandle: handle, wire.KeyOffset: uint64(1), wire.KeyLength: uint64(100)}, nil)
	if string(read.Payload) != "ello" {
		t.Fatalf("read %q", read.Payload)
	}
	if got, _ := h.Content("/a.txt"); got != "hello" {
		t.Fatalf("model %q", got)
	}
	listing := call(t, c, wire.OpReaddir, wire.Meta{wire.KeyIno: root.Ino, wire.KeyCursor: uint64(0)}, nil)
	page, err := wire.ParseDirPage(listing.Meta)
	if err != nil || len(page.Entries) != 1 || page.Entries[0].Name != "a.txt" || page.Entries[0].Attr.Size != 5 {
		t.Fatalf("page %+v %v", page, err)
	}
}

func TestTheWireServerPushesOtherSessionsChangesOnly(t *testing.T) {
	h := New(t)
	a, recA := connect(t, h)
	b, recB := connect(t, h)
	root := attach(t, a)
	attach(t, b)
	lease := call(t, a, wire.OpLease, wire.Meta{wire.KeyCount: uint64(1)}, nil)
	start, err := lease.Meta.Uint(wire.KeyStart)
	if err != nil {
		t.Fatal(err)
	}
	call(t, a, wire.OpMkdir, wire.Meta{wire.KeyParent: root.Ino, wire.KeyName: "d", wire.KeyIno: start, wire.KeyMode: uint64(0o755), wire.KeyUid: nil, wire.KeyGid: nil, wire.KeyMtimeNs: int64(1), wire.KeyOpKey: wire.NewOpKey()}, nil)
	select {
	case <-recB.wake:
	case <-time.After(5 * time.Second):
		t.Fatal("the other session got no push")
	}
	recB.mu.Lock()
	defer recB.mu.Unlock()
	if len(recB.changes) != 1 || len(recB.changes[0].Entries) != 1 || recB.changes[0].Entries[0].Name != "d" {
		t.Fatalf("pushes %+v", recB.changes)
	}
	recA.mu.Lock()
	defer recA.mu.Unlock()
	if len(recA.changes) != 0 {
		t.Fatalf("the author was told about its own change: %+v", recA.changes)
	}
}

func TestTheWireServerLocksWaitAndCancel(t *testing.T) {
	h := New(t)
	a, _ := connect(t, h)
	b, _ := connect(t, h)
	root := attach(t, a)
	attach(t, b)
	h.Put("/f", "x")
	ino := h.InodeOf("/f")
	_ = root
	lock := func(c *wire.Client, owner uint64, wait bool) wire.Meta {
		return wire.Meta{wire.KeyIno: ino, wire.KeyOwner: owner, wire.KeyType: uint64(wire.LockTypeWrite), wire.KeyStart: uint64(0), wire.KeyEnd: wire.EndOfFile, wire.KeyPid: uint64(1), wire.KeyWait: wait, wire.KeyFlock: false}
	}
	call(t, a, wire.OpSetlk, lock(a, 1, false), nil)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := b.Call(ctx, wire.OpSetlk, lock(b, 2, false), nil); err == nil || !isCode(err, wire.ErrEAGAIN) {
		t.Fatalf("a conflicting lock should answer EAGAIN, got %v", err)
	}
	granted := make(chan error, 1)
	go func() {
		_, err := b.Call(ctx, wire.OpSetlk, lock(b, 2, true), nil)
		granted <- err
	}()
	select {
	case err := <-granted:
		t.Fatalf("the wait ended before the unlock: %v", err)
	case <-time.After(200 * time.Millisecond):
	}
	call(t, a, wire.OpUnlock, wire.Meta{wire.KeyIno: ino, wire.KeyOwner: uint64(1), wire.KeyStart: uint64(0), wire.KeyEnd: wire.EndOfFile, wire.KeyFlock: false}, nil)
	if err := <-granted; err != nil {
		t.Fatalf("the waiting lock was not granted: %v", err)
	}
	waitCtx, stop := context.WithCancel(context.Background())
	canceled := make(chan error, 1)
	go func() {
		_, err := a.Call(waitCtx, wire.OpSetlk, lock(a, 1, true), nil)
		canceled <- err
	}()
	time.Sleep(200 * time.Millisecond)
	stop()
	if err := <-canceled; err == nil {
		t.Fatal("a cancelled wait answered success")
	}
}

func isCode(err error, want wire.ErrorCode) bool {
	code, ok := wire.CodeOf(err)
	return ok && code == want
}
