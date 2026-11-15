package main

import (
	"bytes"
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

func setLive(t *testing.T, change func(f *liveFields)) {
	t.Helper()
	before := live.load()
	next := before
	change(&next)
	live.store(next)
	t.Cleanup(func() { live.store(before) })
}

func TestFrameWindowBlocksAtTheLimitAndResizesLive(t *testing.T) {
	w := newFrameWindow(2)
	ctx := context.Background()
	for i := 0; i < 2; i++ {
		if err := w.acquire(ctx); err != nil {
			t.Fatal(err)
		}
	}
	got := make(chan struct{}, 4)
	for i := 0; i < 3; i++ {
		go func() {
			if w.acquire(ctx) == nil {
				got <- struct{}{}
			}
		}()
	}
	select {
	case <-got:
		t.Fatal("acquired past the limit")
	case <-time.After(50 * time.Millisecond):
	}
	w.resize(4)
	for i := 0; i < 2; i++ {
		select {
		case <-got:
		case <-time.After(2 * time.Second):
			t.Fatal("resize did not wake the waiters")
		}
	}
	select {
	case <-got:
		t.Fatal("acquired past the new limit")
	case <-time.After(50 * time.Millisecond):
	}
	w.release()
	select {
	case <-got:
	case <-time.After(2 * time.Second):
		t.Fatal("release did not wake a waiter")
	}
}

func TestFrameWindowAcquireStopsWithItsContext(t *testing.T) {
	w := newFrameWindow(1)
	if err := w.acquire(context.Background()); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.acquire(ctx) }()
	cancel()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("acquired")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("acquire ignored its context")
	}
	w.release()
	if err := w.acquire(context.Background()); err != nil {
		t.Fatal(err)
	}
}

type concurrency struct {
	now  atomic.Int32
	peak atomic.Int32
	gate chan struct{}
	once sync.Once
}

func (c *concurrency) enter() {
	n := c.now.Add(1)
	for {
		p := c.peak.Load()
		if n <= p || c.peak.CompareAndSwap(p, n) {
			break
		}
	}
	<-c.gate
	c.now.Add(-1)
}

func (c *concurrency) open() { c.once.Do(func() { close(c.gate) }) }

func gatedOps(t *testing.T, r *wbRig, ops ...wire.Op) *concurrency {
	c := &concurrency{gate: make(chan struct{})}
	t.Cleanup(c.open)
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		for _, o := range ops {
			if op == o {
				c.enter()
			}
		}
		return nil
	}
	return c
}

func TestUploadFramesInFlightBoundsEveryCommitAndResizesLive(t *testing.T) {
	setLive(t, func(f *liveFields) { f.uploadFramesInFlight = 2 })
	r := newWbRig(t)
	r.online()
	c := gatedOps(t, r, wire.OpWrite)
	entry, h := r.create("big.bin")
	payload := bytes.Repeat([]byte("0123456789abcdef"), 1<<18)
	if _, err := h.WriteAt(payload, 0); err != nil {
		t.Fatal(err)
	}
	h.Close()
	wbEventually(t, "two writes in flight", func() bool { return c.now.Load() == 2 })
	time.Sleep(50 * time.Millisecond)
	if c.now.Load() != 2 {
		t.Fatalf("in flight %d", c.now.Load())
	}
	setLive(t, func(f *liveFields) { f.uploadFramesInFlight = 4 })
	wbEventually(t, "four writes in flight", func() bool { return c.now.Load() == 4 })
	c.open()
	r.drain()
	if r.hub.content(entry.Ino) != string(payload) {
		t.Fatal("content differs")
	}
	if c.peak.Load() != 4 {
		t.Fatalf("peak %d", c.peak.Load())
	}
}

func TestUploadFramesAreSlicedAtTheBulkFrameSize(t *testing.T) {
	setLive(t, func(f *liveFields) { f.bulkFrameBytes = 256 << 10 })
	r := newWbRig(t)
	r.online()
	spy := &sizeSpy{Caller: r.hub}
	r.w.caller = spy
	entry, h := r.create("sliced.bin")
	payload := bytes.Repeat([]byte("0123456789abcdef"), 1<<16)
	if _, err := h.WriteAt(payload, 0); err != nil {
		t.Fatal(err)
	}
	h.Close()
	r.drain()
	if r.hub.content(entry.Ino) != string(payload) {
		t.Fatal("content differs")
	}
	if r.hub.count("PUT") != 0 || r.hub.count("WRITE") != 4 {
		t.Fatalf("ops %v", r.hub.ops)
	}
	for _, n := range spy.sizes() {
		if n != 256<<10 {
			t.Fatalf("frame of %d bytes", n)
		}
	}
}

type sizeSpy struct {
	wire.Caller
	mu    sync.Mutex
	sizeL []int
}

func (s *sizeSpy) Call(ctx context.Context, op wire.Op, meta wire.Meta, payload []byte) (wire.Reply, error) {
	if op == wire.OpWrite {
		s.mu.Lock()
		s.sizeL = append(s.sizeL, len(payload))
		s.mu.Unlock()
	}
	return s.Caller.Call(ctx, op, meta, payload)
}

func (s *sizeSpy) sizes() []int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]int(nil), s.sizeL...)
}

func TestUploadFilesBoundsConcurrentCommitsAndResizesLive(t *testing.T) {
	setLive(t, func(f *liveFields) { f.uploadFiles = 1 })
	r := newWbRig(t)
	r.online()
	c := gatedOps(t, r, wire.OpPut)
	var entries []Entry
	for _, name := range []string{"a", "b", "c"} {
		entry, h := r.create(name)
		wbPut(t, h, 0, "x")
		h.Close()
		entries = append(entries, entry)
	}
	wbEventually(t, "one put in flight", func() bool { return c.now.Load() == 1 })
	time.Sleep(50 * time.Millisecond)
	if c.now.Load() != 1 {
		t.Fatalf("in flight %d", c.now.Load())
	}
	setLive(t, func(f *liveFields) { f.uploadFiles = 3 })
	wbEventually(t, "three puts in flight", func() bool { return c.now.Load() == 3 })
	setLive(t, func(f *liveFields) { f.uploadFiles = 1 })
	c.open()
	r.drain()
	for _, e := range entries {
		if r.hub.content(e.Ino) != "x" {
			t.Fatal("content missing")
		}
	}
}

func TestCloseWaitsForTheUploadOnlyInThatMode(t *testing.T) {
	r := newWbRig(t)
	r.online()
	hold := make(chan struct{})
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpPut {
			<-hold
		}
		return nil
	}
	entry, h := r.create("lazy.txt")
	wbPut(t, h, 0, "lazy")
	if err := h.Flush(); err != nil {
		t.Fatal(err)
	}
	if r.hub.content(entry.Ino) != "" {
		t.Fatal("flush waited for the upload")
	}
	close(hold)
	h.Close()
	r.drain()

	setLive(t, func(f *liveFields) { f.closeWaitsForUpload = true })
	entry, h = r.create("eager.txt")
	wbPut(t, h, 0, "eager")
	if err := h.Flush(); err != nil {
		t.Fatal(err)
	}
	if got := r.hub.content(entry.Ino); got != "eager" {
		t.Fatalf("flush returned before the hub had it: %q", got)
	}
	h.Close()
}

func TestCloseWaitingForTheUploadReportsItsFailure(t *testing.T) {
	setLive(t, func(f *liveFields) { f.closeWaitsForUpload = true })
	r := newWbRig(t)
	r.online()
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpPut {
			return wbRemote(wire.ErrENOSPC)
		}
		return nil
	}
	_, h := r.create("full.txt")
	wbPut(t, h, 0, "x")
	if err := h.Flush(); err == nil {
		t.Fatal("flush hid the failed upload")
	}
}

func TestUploadDelayHoldsTheCommitAndDrainExpedites(t *testing.T) {
	setLive(t, func(f *liveFields) { f.uploadDelay = 10 * time.Second })
	r := newWbRig(t)
	r.online()
	entry, h := r.create("later.txt")
	wbPut(t, h, 0, "later")
	if err := h.Flush(); err != nil {
		t.Fatal(err)
	}
	h.Close()
	time.Sleep(100 * time.Millisecond)
	if r.hub.count("PUT") != 0 {
		t.Fatal("uploaded inside the delay")
	}
	started := time.Now()
	r.drain()
	if time.Since(started) > 5*time.Second || r.hub.content(entry.Ino) != "later" {
		t.Fatalf("drain did not expedite: %q", r.hub.content(entry.Ino))
	}
}

func TestUploadDelayEndsByItself(t *testing.T) {
	setLive(t, func(f *liveFields) { f.uploadDelay = 200 * time.Millisecond })
	r := newWbRig(t)
	r.online()
	entry, h := r.create("timed.txt")
	wbPut(t, h, 0, "timed")
	h.Close()
	if r.hub.count("PUT") != 0 {
		t.Fatal("uploaded before the delay")
	}
	wbEventually(t, "upload after the delay", func() bool { return r.hub.content(entry.Ino) == "timed" })
}

func TestRenameDoesNotWaitOutTheUploadDelay(t *testing.T) {
	setLive(t, func(f *liveFields) { f.uploadDelay = 30 * time.Second })
	r := newWbRig(t)
	r.online()
	entry, h := r.create("tmp.txt")
	wbPut(t, h, 0, "saved")
	h.Close()
	started := time.Now()
	if err := r.w.flushWait(wbCtx, entry.Ino); err != nil {
		t.Fatal(err)
	}
	if time.Since(started) > 5*time.Second || r.hub.content(entry.Ino) != "saved" {
		t.Fatal("the barrier waited out the delay")
	}
}

func TestFsyncDoesNotWaitForTheHubWhenTheModeIsOff(t *testing.T) {
	setLive(t, func(f *liveFields) { f.fsyncWaitsForHub = false })
	r := newWbRig(t)
	r.online()
	hold := make(chan struct{})
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpPut {
			<-hold
		}
		return nil
	}
	t.Cleanup(func() {
		select {
		case <-hold:
		default:
			close(hold)
		}
	})
	entry, h := r.create("j.txt")
	wbPut(t, h, 0, "journaled")
	if err := h.Sync(); err != nil {
		t.Fatal(err)
	}
	if r.hub.content(entry.Ino) != "" {
		t.Fatal("fsync waited for the hub")
	}
	close(hold)
	h.Close()
	r.drain()
	if got := r.hub.content(entry.Ino); got != "journaled" {
		t.Fatalf("hub %q", got)
	}
}

func TestFsyncOfAFileWithoutASessionDoesNotAskTheHubWhenTheModeIsOff(t *testing.T) {
	setLive(t, func(f *liveFields) { f.fsyncWaitsForHub = false })
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "f", "x")
	if err := r.w.Fsync(wbCtx, ino, false); err != nil {
		t.Fatal(err)
	}
	if r.hub.count("FSYNC") != 0 {
		t.Fatalf("ops %v", r.hub.ops)
	}
}
