package main

import (
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

func lockArgs(ino, owner, start, end uint64, flock bool) LockArgs {
	return LockArgs{Ino: ino, Owner: owner, Lock: wire.Lock{Type: wire.LockTypeWrite, Start: start, End: end, Pid: 7}, Flock: flock}
}

func TestHeldLocksAreRememberedForTheResumeAndShrinkOnUnlock(t *testing.T) {
	r := newWbRig(t)
	r.online()
	if err := r.w.Setlk(wbCtx, lockArgs(5, 1, 0, 99, false)); err != nil {
		t.Fatal(err)
	}
	if err := r.w.Setlk(wbCtx, lockArgs(6, 2, 0, wire.EndOfFile, true)); err != nil {
		t.Fatal(err)
	}
	held := r.w.HeldLocks()
	if len(held) != 2 || held[0].Ino != 5 || held[0].Flock || held[1].Ino != 6 || !held[1].Flock || held[0].Pid != 7 {
		t.Fatalf("held %+v", held)
	}
	if err := r.w.Unlock(wbCtx, UnlockArgs{Ino: 5, Owner: 1, Start: 40, End: 59}); err != nil {
		t.Fatal(err)
	}
	held = r.w.HeldLocks()
	if len(held) != 3 || held[0].Start != 0 || held[0].End != 39 || held[1].Start != 60 || held[1].End != 99 {
		t.Fatalf("after the partial unlock %+v", held)
	}
	last := r.hub.lockCalls[len(r.hub.lockCalls)-1]
	start, _ := last.Uint(wire.KeyStart)
	end, _ := last.Uint(wire.KeyEnd)
	if start != 40 || end != 59 || !last.Has(wire.KeyFlock) {
		t.Fatalf("the unlock went out as %v", last)
	}
	if err := r.w.Unlock(wbCtx, UnlockArgs{Ino: 6, Owner: 2, Start: 0, End: wire.EndOfFile, Flock: true}); err != nil {
		t.Fatal(err)
	}
	if err := r.w.Unlock(wbCtx, UnlockArgs{Ino: 5, Owner: 1, Start: 0, End: wire.EndOfFile}); err != nil {
		t.Fatal(err)
	}
	if held := r.w.HeldLocks(); len(held) != 0 {
		t.Fatalf("still held %+v", held)
	}
	calls := len(r.hub.lockCalls)
	if err := r.w.Unlock(wbCtx, UnlockArgs{Ino: 5, Owner: 1, Start: 0, End: wire.EndOfFile}); err != nil {
		t.Fatal(err)
	}
	if len(r.hub.lockCalls) != calls {
		t.Fatal("an unlock of nothing reached the hub")
	}
}

func TestALostLockLeavesTheBook(t *testing.T) {
	r := newWbRig(t)
	r.online()
	if err := r.w.Setlk(wbCtx, lockArgs(5, 1, 0, 9, false)); err != nil {
		t.Fatal(err)
	}
	r.w.LockLost(5, 1)
	if held := r.w.HeldLocks(); len(held) != 0 {
		t.Fatalf("held %+v", held)
	}
}

func TestRenameFlushesTheOpenWritesOfTheInodeFirst(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("tmp")
	wbPut(t, h, 0, "still open")
	done := make(chan error, 1)
	go func() {
		done <- r.w.Rename(wbCtx, RenameArgs{Parent: 1, Name: "tmp", NewParent: 1, NewName: "final"})
	}()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("rename never finished")
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		if _, ok := r.hub.lookupName(1, "final"); ok {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the rename never reached the Hub")
		}
		time.Sleep(5 * time.Millisecond)
	}
	if r.hub.content(entry.Ino) != "still open" {
		t.Fatal("rename overtook the content of a file that was still open")
	}
	h.Close()
}

func TestLinkFlushesTheOpenWritesOfTheInodeFirst(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("src")
	wbPut(t, h, 0, "still open")
	if _, err := r.w.Link(wbCtx, entry.Ino, 1, "alias"); err != nil {
		t.Fatal(err)
	}
	if r.hub.content(entry.Ino) != "still open" {
		t.Fatal("link overtook the content of a file that was still open")
	}
	h.Close()
}
