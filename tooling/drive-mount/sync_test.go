package main

import (
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

func TestDirectoryFsyncAsksTheHub(t *testing.T) {
	r := newWbRig(t)
	r.online()
	if err := r.w.Fsync(wbCtx, 1, true); err != nil {
		t.Fatal(err)
	}
	if r.hub.fsyncs != 1 {
		t.Fatalf("fsyncs %d", r.hub.fsyncs)
	}
}

func TestFsyncOfAFileWithoutAHandleCommitsAndSyncs(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("x")
	wbPut(t, h, 0, "data")
	if err := r.w.Fsync(wbCtx, entry.Ino, false); err != nil {
		t.Fatal(err)
	}
	if r.hub.content(entry.Ino) != "data" {
		t.Fatal("fsync returned before the commit")
	}
	h.Close()
}

func TestFsyncReturnsTheFailureOfItsCommit(t *testing.T) {
	r := newWbRig(t)
	r.online()
	_, h := r.create("x")
	wbPut(t, h, 0, "data")
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpPut || op == wire.OpCreate {
			return wbRemote(wire.ErrEIO)
		}
		return nil
	}
	if err := h.Sync(); err == nil {
		t.Fatal("fsync hid the failed commit")
	}
	if r.w.Pending("") != 1 {
		t.Fatalf("pending %d", r.w.Pending(""))
	}
	r.hub.before = nil
	if err := h.Flush(); err == nil {
		t.Fatal("flush did not report the earlier failure")
	}
	if err := h.Flush(); err != nil {
		t.Fatal(err)
	}
	r.drain()
	if err := h.Close(); err != nil {
		t.Fatal(err)
	}
	wbEventually(t, "retried commit lands", func() bool { return r.w.Pending("") == 0 })
}

func TestTransientErrorsRetryUntilTheHubIsBack(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("x")
	wbPut(t, h, 0, "data")
	failures := 0
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpPut && failures < 2 {
			failures++
			return wire.ErrConnLost
		}
		return nil
	}
	h.Close()
	wbEventually(t, "committed after retries", func() bool { return r.hub.content(entry.Ino) == "data" })
	if failures != 2 {
		t.Fatalf("failures %d", failures)
	}
}

func TestFsyncOfflineFallsBackToTheJournalWhenTheRouteDropsMidWait(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("x")
	wbPut(t, h, 0, "data")
	gate := make(chan struct{})
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpPut {
			<-gate
			return wire.ErrNoRoute
		}
		return nil
	}
	done := make(chan error, 1)
	go func() { done <- h.Sync() }()
	time.Sleep(50 * time.Millisecond)
	r.w.SetReachable(false)
	close(gate)
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("fsync hung after the route dropped")
	}
	r.hub.before = nil
	r.online()
	r.drain()
	if r.hub.content(entry.Ino) != "data" {
		t.Fatal("not delivered after the route came back")
	}
	h.Close()
}

func TestPendingCountsByRootAndCommitIdsAreReported(t *testing.T) {
	r := newWbRig(t)
	r.w.rootOf = func(ino uint64) string {
		if ino%2 == 0 {
			return "even"
		}
		return "odd"
	}
	r.online()
	r.w.SetReachable(false)
	r.hub.mu.Lock()
	r.hub.mu.Unlock()
	r.w.SetReachable(true)
	entry, h := r.create("x")
	r.w.SetReachable(false)
	payload := make([]byte, 2<<20)
	h.WriteAt(payload, 0)
	h.Close()
	root := r.w.rootOf(entry.Ino)
	if r.w.Pending(root) != 1 {
		t.Fatalf("pending %d", r.w.Pending(root))
	}
	other := "odd"
	if root == "odd" {
		other = "even"
	}
	if r.w.Pending(other) != 0 {
		t.Fatal("counted in the wrong root")
	}
	if len(r.w.CommitIDs()) != 0 {
		t.Fatal("commit id before BEGIN")
	}
	r.w.SetReachable(true)
	r.drain()
}

func TestShutdownSealsOpenWritesAndTheNextHelperReplaysThem(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("x")
	r.w.SetReachable(false)
	wbPut(t, h, 0, "open when the desktop went away")
	r.w.SealAll()
	r.crash()
	r.w = r.open()
	r.online()
	r.drain()
	if got := r.hub.content(entry.Ino); got != "open when the desktop went away" {
		t.Fatalf("hub %q", got)
	}
}
