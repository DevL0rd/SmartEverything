package main

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

func (r *wbRig) times(ino uint64) (int64, int64) {
	r.hub.mu.Lock()
	defer r.hub.mu.Unlock()
	n := r.hub.nodes[ino]
	return n.atime, n.mtime
}

func TestExtractedFileCommitsTimesWithItsContentInOneCall(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("t")
	r.w.SetReachable(false)
	wbPut(t, h, 0, "body")
	flushed := time.Now()
	if _, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: entry.Ino, Mtime: TimeSpec{Set: true, At: flushed}}); err != nil {
		t.Fatal(err)
	}
	h.Close()
	atime, mtime := time.Unix(1_000, 0), time.Unix(2_000, 0)
	attr, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: entry.Ino, Atime: TimeSpec{Set: true, At: atime}, Mtime: TimeSpec{Set: true, At: mtime}})
	if err != nil {
		t.Fatal(err)
	}
	if attr.MtimeNs != mtime.UnixNano() || attr.AtimeNs != atime.UnixNano() || attr.Size != 4 {
		t.Fatalf("attr shown %+v", attr)
	}
	r.online()
	r.drain()
	if got := r.hub.count("SETATTR"); got != 0 {
		t.Fatalf("%d SETATTR calls", got)
	}
	if got := r.hub.count("PUT"); got != 1 {
		t.Fatalf("%d PUT calls", got)
	}
	if a, m := r.times(entry.Ino); a != atime.UnixNano() || m != mtime.UnixNano() {
		t.Fatalf("hub times %d %d", a, m)
	}
	if r.hub.content(entry.Ino) != "body" {
		t.Fatal("content")
	}
}

func TestWriteAfterUtimesTakesTheWriteTime(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("t")
	wbPut(t, h, 0, "a")
	old := time.Unix(5_000, 0)
	if _, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: entry.Ino, Mtime: TimeSpec{Set: true, At: old}}); err != nil {
		t.Fatal(err)
	}
	before := time.Now().UnixNano()
	wbPut(t, h, 1, "b")
	h.Close()
	r.drain()
	if _, m := r.times(entry.Ino); m < before {
		t.Fatalf("mtime %d kept the utimes value after a write", m)
	}
}

func TestTimesOnACommittedFileGoStraightToTheHub(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "t", "abc")
	stamp := time.Unix(7_000, 0)
	if _, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: ino, Mtime: TimeSpec{Set: true, At: stamp}}); err != nil {
		t.Fatal(err)
	}
	if _, m := r.times(ino); m != stamp.UnixNano() {
		t.Fatalf("mtime %d", m)
	}
}

func TestTimesSetWhileTheCommitIsInFlightFollowIt(t *testing.T) {
	r := newWbRig(t)
	r.online()
	gate := make(chan struct{})
	started := make(chan struct{}, 1)
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpPut {
			select {
			case started <- struct{}{}:
			default:
			}
			<-gate
		}
		return nil
	}
	entry, h := r.create("t")
	wbPut(t, h, 0, "x")
	h.Close()
	<-started
	stamp := time.Unix(9_000, 0)
	done := make(chan error, 1)
	go func() {
		_, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: entry.Ino, Mtime: TimeSpec{Set: true, At: stamp}})
		done <- err
	}()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	close(gate)
	r.drain()
	if _, m := r.times(entry.Ino); m != stamp.UnixNano() {
		t.Fatalf("mtime %d", m)
	}
	if r.hub.count("SETATTR") != 1 {
		t.Fatalf("%d SETATTR", r.hub.count("SETATTR"))
	}
}

func TestFoldedTimesSurviveAHelperCrash(t *testing.T) {
	r := newWbRig(t)
	r.online()
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpPut {
			return wire.ErrConnLost
		}
		return nil
	}
	entry, h := r.create("t")
	wbPut(t, h, 0, "x")
	h.Close()
	stamp := time.Unix(11_000, 0)
	if _, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: entry.Ino, Mtime: TimeSpec{Set: true, At: stamp}}); err != nil {
		t.Fatal(err)
	}
	r.reopen()
	r.hub.mu.Lock()
	r.hub.before = nil
	r.hub.mu.Unlock()
	r.online()
	r.drain()
	if _, m := r.times(entry.Ino); m != stamp.UnixNano() {
		t.Fatalf("mtime %d", m)
	}
}

func TestAFileOpenedForWritingOfflineStartsFromTheKnownRevision(t *testing.T) {
	r := newWbRig(t)
	ino := r.hub.addFile(1, "t", "old")
	r.w.SetReachable(false)
	h := r.openExisting(ino, true)
	wbPut(t, h, 0, "offline")
	h.Close()
	r.hub.mu.Lock()
	r.hub.nodes[ino].rev++
	r.hub.mu.Unlock()
	r.online()
	deadline := time.Now().Add(5 * time.Second)
	for r.hub.count("PUT") == 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if r.hub.count("PUT") == 0 {
		t.Fatal("the offline edit was never sent")
	}
	if r.hub.content(ino) != "old" {
		t.Fatalf("the offline edit overwrote a newer revision: %q", r.hub.content(ino))
	}
}

func TestTakingALockRebasesAnIdleOpenFileOnTheLatestRevision(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "db", "aaaa")
	h := r.openExisting(ino, false)
	wbPut(t, h, 0, "b")
	if err := h.Sync(); err != nil {
		t.Fatal(err)
	}
	r.hub.change(ino, "bcde")
	lock := LockArgs{Ino: ino, Owner: 7, Lock: wire.Lock{Type: wire.LockTypeWrite, Start: 0, End: wire.EndOfFile, Pid: 1}}
	if err := r.w.Setlk(wbCtx, lock); err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 4)
	if n, err := h.ReadAt(buf, 0); err != nil || string(buf[:n]) != "bcde" {
		t.Fatalf("read %q %v after the lock", buf[:n], err)
	}
	wbPut(t, h, 3, "Z")
	if err := h.Sync(); err != nil {
		t.Fatal(err)
	}
	h.Close()
	r.drain()
	if got := r.hub.content(ino); got != "bcdZ" {
		t.Fatalf("hub %q", got)
	}
}

func TestAModeChangeBeforeTheTimesIsWhatTheTimesReplyShows(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("t")
	wbPut(t, h, 0, "x")
	if _, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: entry.Ino, Valid: wire.SetattrValidMode, Mode: 0o600}); err != nil {
		t.Fatal(err)
	}
	attr, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: entry.Ino, Mtime: TimeSpec{Set: true, At: time.Unix(3_000, 0)}})
	if err != nil {
		t.Fatal(err)
	}
	if attr.Mode&0o777 != 0o600 {
		t.Fatalf("mode %o after the times were set", attr.Mode)
	}
	h.Close()
	r.drain()
}

type wbSeenBase struct {
	baseSource
	seen wire.Attr
}

func (b wbSeenBase) Getattr(context.Context, uint64) (wire.Attr, error) { return b.seen, nil }

func TestAnEditOnASilentlyDeadLinkStartsFromTheRevisionThisComputerSaw(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "plan.txt", "base")
	seen, err := wbBase{r.hub}.Getattr(wbCtx, ino)
	if err != nil {
		t.Fatal(err)
	}
	r.w.base = wbSeenBase{baseSource: wbBase{r.hub}, seen: seen}
	r.w.nameOf = func(uint64) (uint64, string, bool) { return 1, "plan.txt", true }
	r.hub.change(ino, "edited on the other computer")
	h := r.openExisting(ino, true)
	wbPut(t, h, 0, "edited here")
	h.Close()
	r.drain()
	if got := r.hub.content(ino); got != "edited on the other computer" {
		t.Fatalf("the edit replaced the newer revision it never saw: %q", got)
	}
	r.hub.mu.Lock()
	defer r.hub.mu.Unlock()
	kept := false
	for name, other := range r.hub.nodes[1].names {
		if other != ino && strings.Contains(name, "sync-conflict") && string(r.hub.nodes[other].data) == "edited here" {
			kept = true
		}
	}
	if !kept {
		t.Fatal("no conflict copy holds this computer's edit")
	}
}

func TestAKernelTimeFlushOfAnUnchangedOrRemovedFileStaysOnThisComputer(t *testing.T) {
	r := newWbRig(t)
	r.online()
	kept := r.hub.addFile(1, "kept", "abc")
	gone := r.hub.addFile(1, "gone", "xyz")
	_, mtime := r.times(kept)
	attr, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: kept, Mtime: TimeSpec{Set: true, At: time.Unix(0, mtime)}})
	if err != nil {
		t.Fatal(err)
	}
	if attr.MtimeNs != mtime || attr.Ino != kept {
		t.Fatalf("the unchanged flush answered %+v", attr)
	}
	if err := r.w.Unlink(wbCtx, 1, "gone"); err != nil {
		t.Fatal(err)
	}
	if _, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: gone, Mtime: TimeSpec{Set: true, At: time.Unix(9_000, 0)}}); err != nil {
		if code, ok := wire.CodeOf(err); !ok || code != wire.ErrENOENT {
			t.Fatal(err)
		}
	}
	r.drain()
	if n := r.hub.count("SETATTR"); n != 0 {
		t.Fatalf("%d time flushes went to the hub", n)
	}
	stamp := time.Unix(7_000, 0)
	if _, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: kept, Mtime: TimeSpec{Set: true, At: stamp}}); err != nil {
		t.Fatal(err)
	}
	if _, m := r.times(kept); m != stamp.UnixNano() {
		t.Fatalf("a changed mtime must still reach the hub, mtime %d", m)
	}
}
