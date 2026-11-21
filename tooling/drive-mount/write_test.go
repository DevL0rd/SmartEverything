package main

import (
	"bytes"
	"context"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

var wbCtx = context.Background()

func (r *wbRig) create(name string) (Entry, InodeWriteHandle) {
	r.t.Helper()
	ino := r.hub.addFile(1, name, "")
	attr, err := wbBase{r.hub}.Getattr(wbCtx, ino)
	if err != nil {
		r.t.Fatal(err)
	}
	return Entry{Ino: ino, Attr: attr}, r.openExisting(ino, false)
}

func (r *wbRig) make(name string) (Entry, InodeWriteHandle) {
	r.t.Helper()
	entry, h, err := r.w.Create(wbCtx, CreateArgs{Parent: 1, Name: name, Mode: 0o644})
	if err != nil {
		r.t.Fatal(err)
	}
	return entry, h
}

func (r *wbRig) openExisting(ino uint64, truncate bool) InodeWriteHandle {
	r.t.Helper()
	h, err := r.w.OpenWrite(wbCtx, ino, truncate)
	if err != nil {
		r.t.Fatal(err)
	}
	return h
}

func wbPut(t *testing.T, h InodeWriteHandle, off int64, s string) {
	t.Helper()
	if n, err := h.WriteAt([]byte(s), off); err != nil || n != len(s) {
		t.Fatalf("write: %d %v", n, err)
	}
}

func wbReadAll(t *testing.T, h InodeWriteHandle) string {
	t.Helper()
	buf := make([]byte, h.Size())
	n, err := h.ReadAt(buf, 0)
	if err != nil || n != len(buf) {
		t.Fatalf("read: %d of %d %v", n, len(buf), err)
	}
	return string(buf)
}

func wbJournalFiles(t *testing.T, dir string) []string {
	t.Helper()
	names, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var out []string
	for _, n := range names {
		if n.Name() != namesDir && !strings.HasPrefix(n.Name(), sessionsFile) && !strings.HasSuffix(n.Name(), ".data") {
			out = append(out, n.Name())
		}
	}
	j, err := openJournal(dir)
	if err != nil {
		t.Fatal(err)
	}
	live, err := j.load()
	j.close()
	if err != nil {
		t.Fatal(err)
	}
	for _, rec := range live {
		out = append(out, rec.ID)
	}
	if info, err := os.Stat(filepath.Join(dir, namesDir, namesFile)); err == nil && info.Size() > 0 {
		out = append(out, namesFile)
	}
	return out
}

func TestSmallNewFileCostsOnePut(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("a.txt")
	wbPut(t, h, 0, "hello")
	if err := h.Flush(); err != nil {
		t.Fatal(err)
	}
	if err := h.Close(); err != nil {
		t.Fatal(err)
	}
	r.drain()
	if got := r.hub.content(entry.Ino); got != "hello" {
		t.Fatalf("hub %q", got)
	}
	if r.hub.count("PUT") != 1 || r.hub.count("BEGIN") != 0 || r.hub.count("END") != 0 {
		t.Fatalf("ops %v", r.hub.ops)
	}
	wbEventually(t, "journal gone", func() bool { return len(wbJournalFiles(t, r.dir)) == 0 })
}

func TestLargeFileGoesThroughBeginWriteEndInParallel(t *testing.T) {
	r := newWbRig(t)
	r.online()
	gate := make(chan struct{})
	var waiting atomic.Int32
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpWrite {
			waiting.Add(1)
			<-gate
		}
		return nil
	}
	t.Cleanup(func() {
		select {
		case <-gate:
		default:
			close(gate)
		}
	})
	entry, h := r.create("big.bin")
	payload := bytes.Repeat([]byte("0123456789abcdef"), 1<<18)
	if n, err := h.WriteAt(payload, 0); err != nil || n != len(payload) {
		t.Fatal(n, err)
	}
	h.Close()
	wbEventually(t, "several writes in flight", func() bool { return waiting.Load() >= 2 })
	close(gate)
	r.drain()
	if r.hub.content(entry.Ino) != string(payload) {
		t.Fatal("content differs")
	}
	if r.hub.count("PUT") != 0 || r.hub.count("BEGIN") != 1 || r.hub.count("END") != 1 || r.hub.count("WRITE") != 4 {
		t.Fatalf("ops %v", r.hub.ops)
	}
}

func TestOnlyTheDirtyRangesTravelAndReadsMergeTheBase(t *testing.T) {
	r := newWbRig(t)
	r.online()
	base := strings.Repeat("a", 3<<20)
	ino := r.hub.addFile(1, "f", base)
	h := r.openExisting(ino, false)
	wbPut(t, h, 100, "XYZ")
	wbPut(t, h, 2<<20, "Q")
	buf := make([]byte, 8)
	if _, err := h.ReadAt(buf, 98); err != nil || string(buf) != "aaXYZaaa" {
		t.Fatalf("merged read %q %v", buf, err)
	}
	if r.hub.count("GETATTR") != 1 {
		t.Fatalf("open cost %v", r.hub.ops)
	}
	h.Close()
	r.drain()
	want := []byte(base)
	copy(want[100:], "XYZ")
	want[2<<20] = 'Q'
	if r.hub.content(ino) != string(want) {
		t.Fatal("hub content wrong")
	}
	if r.hub.written != 4 {
		t.Fatalf("sent %d bytes for 4 dirty bytes", r.hub.written)
	}
}

func TestOpenForWriteDoesNotDownloadTheFile(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "f", strings.Repeat("z", 5<<20))
	opens := 0
	r.w.base = wbCountingBase{inner: wbBase{r.hub}, count: &opens}
	h := r.openExisting(ino, false)
	wbPut(t, h, 0, "k")
	h.Close()
	r.drain()
	if opens != 0 {
		t.Fatalf("base opened %d times", opens)
	}
}

type wbCountingBase struct {
	inner baseSource
	count *int
}

func (c wbCountingBase) Open(ctx context.Context, ino uint64) (ReadHandle, error) {
	*c.count++
	return c.inner.Open(ctx, ino)
}

func (c wbCountingBase) Getattr(ctx context.Context, ino uint64) (wire.Attr, error) {
	return c.inner.Getattr(ctx, ino)
}

func (c wbCountingBase) Lookup(ctx context.Context, parent uint64, name string) (Entry, error) {
	return c.inner.Lookup(ctx, parent, name)
}

func (c wbCountingBase) Readdir(ctx context.Context, ino, cursor uint64) (DirPage, error) {
	return c.inner.Readdir(ctx, ino, cursor)
}

func TestTruncateShrinkThenGrowZeroesTheOldTail(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "f", "0123456789")
	h := r.openExisting(ino, false)
	if err := h.Truncate(3); err != nil {
		t.Fatal(err)
	}
	wbPut(t, h, 6, "AB")
	if got := wbReadAll(t, h); got != "012\x00\x00\x00AB" {
		t.Fatalf("view %q", got)
	}
	h.Close()
	r.drain()
	if got := r.hub.content(ino); got != "012\x00\x00\x00AB" {
		t.Fatalf("hub %q", got)
	}
}

func TestAllocateModes(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "f", "0123456789")
	h := r.openExisting(ino, false)
	if err := h.Allocate(wire.AllocatePunchHole, 2, 3); err != nil {
		t.Fatal(err)
	}
	if err := h.Allocate(wire.AllocateZeroRange, 8, 4); err != nil {
		t.Fatal(err)
	}
	if got := wbReadAll(t, h); got != "01\x00\x00\x00567\x00\x00\x00\x00" {
		t.Fatalf("view %q", got)
	}
	h.Close()
	r.drain()
	if got := r.hub.content(ino); got != "01\x00\x00\x00567\x00\x00\x00\x00" {
		t.Fatalf("hub %q", got)
	}
}

func TestOfflineWritesWaitForTheHubAndFsyncJournalsThem(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("o.txt")
	r.w.SetReachable(false)
	wbPut(t, h, 0, "offline")
	if err := h.Sync(); err != nil {
		t.Fatal(err)
	}
	h.Close()
	if r.hub.content(entry.Ino) != "" || r.hub.count("PUT") != 0 {
		t.Fatal("sent while offline")
	}
	if r.w.Pending("") != 1 {
		t.Fatalf("pending %d", r.w.Pending(""))
	}
	r.online()
	r.drain()
	if got := r.hub.content(entry.Ino); got != "offline" {
		t.Fatalf("hub %q", got)
	}
}

func TestFsyncWaitsForTheHubWithTheFsyncFlag(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("s.txt")
	wbPut(t, h, 0, "durable")
	var fsynced bool
	r.hub.after = func(op wire.Op, meta wire.Meta) error {
		if op == wire.OpPut {
			fsynced, _ = meta.Bool(wire.KeyFsync)
		}
		return nil
	}
	if err := h.Sync(); err != nil {
		t.Fatal(err)
	}
	if r.hub.content(entry.Ino) != "durable" || !fsynced {
		t.Fatalf("fsync returned before the hub had it: fsynced=%v", fsynced)
	}
	h.Close()
}

func TestFsyncOfAnAlreadyCommittedFileAsksTheHubToFsync(t *testing.T) {
	r := newWbRig(t)
	r.online()
	_, h := r.create("s.txt")
	wbPut(t, h, 0, "x")
	h.Flush()
	r.drain()
	if err := h.Sync(); err != nil {
		t.Fatal(err)
	}
	if r.hub.fsyncs != 1 {
		t.Fatalf("fsyncs %d", r.hub.fsyncs)
	}
	h.Close()
}

func TestRenameWaitsForCommitsInFlight(t *testing.T) {
	r := newWbRig(t)
	r.online()
	gate := make(chan struct{})
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpPut {
			<-gate
		}
		return nil
	}
	entry, h := r.create("tmp")
	wbPut(t, h, 0, "saved")
	h.Close()
	if err := r.w.Rename(wbCtx, RenameArgs{Parent: 1, Name: "tmp", NewParent: 1, NewName: "final"}); err != nil {
		close(gate)
		t.Fatal(err)
	}
	time.Sleep(150 * time.Millisecond)
	if r.hub.count("RENAME") != 0 {
		close(gate)
		t.Fatal("rename reached the hub before the commit was acknowledged")
	}
	close(gate)
	r.drain()
	if r.hub.content(entry.Ino) != "saved" {
		t.Fatal("rename overtook the content")
	}
	if ino, ok := r.hub.lookupName(1, "final"); !ok || ino != entry.Ino {
		t.Fatal("not renamed")
	}
}

func TestLinkWaitsForCommitsInFlight(t *testing.T) {
	r := newWbRig(t)
	r.online()
	gate := make(chan struct{})
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpPut {
			<-gate
		}
		return nil
	}
	entry, h := r.create("a")
	wbPut(t, h, 0, "x")
	h.Close()
	done := make(chan struct{})
	go func() {
		defer close(done)
		r.hub.mu.Lock()
		r.hub.nodes[1].names["spare"] = 0
		r.hub.mu.Unlock()
	}()
	<-done
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		_, _ = r.w.awaitCommitsFor(entry.Ino)
	}()
	select {
	case <-finished:
		t.Fatal("barrier did not wait")
	case <-time.After(100 * time.Millisecond):
	}
	close(gate)
	<-finished
}

func (w *writeBack) awaitCommitsFor(ino uint64) (struct{}, error) {
	return struct{}{}, w.awaitCommits(wbCtx, ino)
}

func TestUtimesAfterCloseSurviveTheCommit(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("t")
	wbPut(t, h, 0, "x")
	h.Close()
	stamp := time.Unix(1_000_000, 0)
	attr, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: entry.Ino, Mtime: TimeSpec{Set: true, At: stamp}})
	if err != nil {
		t.Fatal(err)
	}
	if attr.MtimeNs != stamp.UnixNano() {
		t.Fatalf("mtime shown %d", attr.MtimeNs)
	}
	r.drain()
	if m := r.hub.nodes[entry.Ino].mtime; m != stamp.UnixNano() {
		t.Fatalf("a later commit overwrote the mtime: %d", m)
	}
}

func TestReadsSeeUnackedContentThroughTheOverlay(t *testing.T) {
	r := newWbRig(t)
	r.online()
	gate := make(chan struct{})
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpPut {
			<-gate
		}
		return nil
	}
	entry, h := r.create("p")
	wbPut(t, h, 0, "pending data")
	h.Close()
	src := newWriteOverlay(wbEmptySource{}, r.w)
	rd, err := src.Open(wbCtx, entry.Ino)
	if err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 12)
	if n, err := rd.ReadAt(wbCtx, buf, 0); err != nil || n != 12 || string(buf) != "pending data" {
		t.Fatalf("%d %q %v", n, buf, err)
	}
	rd.Release(wbCtx)
	close(gate)
	r.drain()
}

type wbEmptySource struct{ InodeSource }

func (wbEmptySource) Open(context.Context, uint64) (ReadHandle, error) { return nil, os.ErrNotExist }

func TestAttrOverlayShowsLocalSize(t *testing.T) {
	r := newWbRig(t)
	r.online()
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpPut {
			time.Sleep(200 * time.Millisecond)
		}
		return nil
	}
	entry, h := r.create("p")
	wbPut(t, h, 0, "12345")
	attr := entry.Attr
	r.w.overlayAttr(&attr)
	if attr.Size != 5 {
		t.Fatalf("size %d", attr.Size)
	}
	h.Close()
	r.drain()
}

func TestLostSessionRestartsTheCommit(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("l")
	payload := bytes.Repeat([]byte("x"), 2<<20)
	h.WriteAt(payload, 0)
	lost := false
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpEnd && !lost {
			lost = true
			r.hub.mu.Lock()
			r.hub.commits = map[uint64]*wbCommit{}
			r.hub.mu.Unlock()
			return wire.ErrSessionLost
		}
		return nil
	}
	h.Close()
	r.drain()
	wbEventually(t, "recommit", func() bool { return r.hub.content(entry.Ino) == string(payload) })
	if r.hub.count("BEGIN") != 2 {
		t.Fatalf("ops %v", r.hub.ops)
	}
}

func TestCrashAfterFlushReplaysTheSealedWrite(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("c")
	r.w.SetReachable(false)
	wbPut(t, h, 0, "kept")
	h.Flush()
	r.crash()
	r.w = r.open()
	r.online()
	r.drain()
	if got := r.hub.content(entry.Ino); got != "kept" {
		t.Fatalf("hub %q", got)
	}
}

func TestCrashOfAnUnflushedSessionDropsIt(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("c")
	wbPut(t, h, 0, "never flushed")
	_ = entry
	r.reopen()
	r.online()
	r.drain()
	if r.hub.count("PUT") != 0 {
		t.Fatal("an unflushed write was replayed")
	}
	wbEventually(t, "journal clean", func() bool { return len(wbJournalFiles(t, r.dir)) == 0 })
}

func TestCrashAfterFsyncOfflineReplays(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("c")
	r.w.SetReachable(false)
	wbPut(t, h, 0, "synced")
	if err := h.Sync(); err != nil {
		t.Fatal(err)
	}
	r.reopen()
	r.online()
	r.drain()
	if got := r.hub.content(entry.Ino); got != "synced" {
		t.Fatalf("hub %q", got)
	}
}

func TestCrashAfterEndAppliedBeforeTheReplyDoesNotApplyTwice(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("c")
	payload := bytes.Repeat([]byte("e"), 2<<20)
	h.WriteAt(payload, 0)
	applied := make(chan struct{})
	block := make(chan struct{})
	r.hub.after = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpEnd {
			close(applied)
			<-block
			return context.Canceled
		}
		return nil
	}
	h.Close()
	<-applied
	r.w.cancel()
	close(block)
	r.w.workers.Wait()
	revAfterFirst := r.hub.rev(entry.Ino)
	r.hub.after = nil
	r.w = r.open()
	r.online()
	r.drain()
	wbEventually(t, "journal gone", func() bool { return len(wbJournalFiles(t, r.dir)) == 0 })
	if r.hub.rev(entry.Ino) != revAfterFirst {
		t.Fatalf("the commit applied twice: rev %d then %d", revAfterFirst, r.hub.rev(entry.Ino))
	}
	if r.hub.content(entry.Ino) != string(payload) {
		t.Fatal("content wrong")
	}
	if r.hub.count("BEGIN") != 1 {
		t.Fatalf("ops %v", r.hub.ops)
	}
}

func TestCrashBetweenWritesResumesWithOnlyTheMissingRanges(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("c")
	payload := bytes.Repeat([]byte("m"), 3<<20)
	h.WriteAt(payload, 0)
	var writes int
	block := make(chan struct{})
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpWrite {
			r.hub.mu.Lock()
			writes++
			n := writes
			r.hub.mu.Unlock()
			if n > 1 {
				<-block
				return context.Canceled
			}
		}
		return nil
	}
	h.Close()
	wbEventually(t, "first write applied and the rest blocked", func() bool {
		r.hub.mu.Lock()
		defer r.hub.mu.Unlock()
		return writes >= 3
	})
	r.w.cancel()
	close(block)
	r.w.workers.Wait()
	r.hub.before = nil
	r.hub.mu.Lock()
	r.hub.written = 0
	r.hub.mu.Unlock()
	r.w = r.open()
	r.online()
	r.drain()
	if r.hub.content(entry.Ino) != string(payload) {
		t.Fatal("content wrong")
	}
	if r.hub.written >= uint64(len(payload)) {
		t.Fatalf("resent everything: %d", r.hub.written)
	}
}

func TestCommitIdsAreForgottenAfterTheJournalDropsThem(t *testing.T) {
	r := newWbRig(t)
	r.online()
	_, h := r.create("f")
	h.WriteAt(bytes.Repeat([]byte("f"), 2<<20), 0)
	h.Close()
	r.drain()
	wbEventually(t, "forget", func() bool { return r.hub.count("FORGET") == 1 })
	if len(r.hub.forgot) != 1 {
		t.Fatalf("forgot %v", r.hub.forgot)
	}
}

func TestUnlinkedFileWriteIsDiscardedNotKept(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("gone")
	wbPut(t, h, 0, "x")
	if err := r.w.Unlink(wbCtx, 1, "gone"); err != nil {
		t.Fatal(err)
	}
	h.Close()
	r.drain()
	wbEventually(t, "journal clean", func() bool { return len(wbJournalFiles(t, r.dir)) == 0 })
	if r.w.Pending("") != 0 {
		t.Fatal("pending after discard")
	}
	_ = entry
}

func TestUnlinkedFileWriteIsDiscardedWhenTheHubAlreadyForgotTheInode(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "gone.txt", "abcdef")
	r.w.nameOf = func(i uint64) (uint64, string, bool) { return 1, "gone.txt", i == ino }
	var created []string
	r.w.SetCreated(func(parent uint64, name string) { created = append(created, name) })
	h := r.openExisting(ino, false)
	wbPut(t, h, 1, "XY")
	r.hub.change(ino, "other")
	r.w.orphaned(ino)
	h.Close()
	r.drain()
	wbEventually(t, "journal clean", func() bool { return len(wbJournalFiles(t, r.dir)) == 0 })
	if len(created) != 0 {
		t.Fatalf("a conflict copy was made for an unlinked file: %v", created)
	}
	if r.w.Pending("") != 0 {
		t.Fatal("pending after discard")
	}
}

func TestReopenedSessionSharesTheOpenWrite(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, a := r.create("shared")
	b := r.openExisting(entry.Ino, false)
	wbPut(t, a, 0, "ab")
	wbPut(t, b, 2, "cd")
	if got := wbReadAll(t, a); got != "abcd" {
		t.Fatalf("%q", got)
	}
	a.Close()
	b.Close()
	r.drain()
	if r.hub.content(entry.Ino) != "abcd" {
		t.Fatal("content")
	}
}

func TestOpenWriteOfADirectoryFails(t *testing.T) {
	r := newWbRig(t)
	r.online()
	if _, err := r.w.OpenWrite(wbCtx, 1, false); err == nil {
		t.Fatal("opened a directory for write")
	}
}

func TestRandomWritesTruncatesAndPunchesMatchAModel(t *testing.T) {
	rng := rand.New(rand.NewSource(7))
	for round := 0; round < 15; round++ {
		r := newWbRig(t)
		r.online()
		model := make([]byte, 600)
		rng.Read(model)
		ino := r.hub.addFile(1, "m", string(model))
		h := r.openExisting(ino, false)
		var trace []string
		for step := 0; step < 30; step++ {
			kind := rng.Intn(4)
			trace = append(trace, fmt.Sprint(kind))
			switch kind {
			case 0:
				off := rng.Intn(900)
				data := make([]byte, 1+rng.Intn(80))
				rng.Read(data)
				wbPut(t, h, int64(off), string(data))
				for len(model) < off+len(data) {
					model = append(model, 0)
				}
				copy(model[off:], data)
			case 1:
				size := rng.Intn(900)
				if err := h.Truncate(uint64(size)); err != nil {
					t.Fatal(err)
				}
				for len(model) < size {
					model = append(model, 0)
				}
				model = model[:size]
			case 2:
				off := rng.Intn(700)
				length := 1 + rng.Intn(100)
				if err := h.Allocate(wire.AllocatePunchHole, uint64(off), uint64(length)); err != nil {
					t.Fatal(err)
				}
				for p := off; p < off+length && p < len(model); p++ {
					model[p] = 0
				}
			case 3:
				if err := h.Flush(); err != nil {
					t.Fatal(err)
				}
				if rng.Intn(2) == 0 {
					r.drain()
				}
			}
			if got := wbReadAll(t, h); got != string(model) {
				at := 0
				for at < len(got) && got[at] == model[at] {
					at++
				}
				ss := h.(*sessionHandle).s
				ss.mu.Lock()
				msg := fmt.Sprintf("round %d step %d: view differs at %d (len %d) trace %v ranges %v zeros %v since %v clean %d base %d size %d unit %+v sending %v", round, step, at, len(got), trace, ss.ranges.spans, ss.zeros.spans, ss.since.spans, ss.cleanLimit, ss.baseSize, ss.size, ss.unit, ss.sending)
				ss.mu.Unlock()
				t.Fatal(msg)
			}
		}
		h.Close()
		r.drain()
		if r.hub.content(ino) != string(model) {
			t.Fatalf("round %d: hub differs", round)
		}
		r.w.Close()
	}
}

func TestJournalKeepsNoDataFileForUntouchedSessions(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "u", "content")
	h := r.openExisting(ino, false)
	h.Close()
	wbEventually(t, "clean", func() bool { return len(wbJournalFiles(t, r.dir)) == 0 })
	if r.hub.count("PUT")+r.hub.count("BEGIN") != 0 {
		t.Fatal("an untouched open cost a commit")
	}
}

func TestCommittedAttrReachesTheCacheBeforeTheSessionStopsServingTheWrites(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("order")
	wbPut(t, h, 0, "fresh")
	var busy atomic.Bool
	r.w.SetCommitted(func(ino uint64, _ wire.Attr) {
		if s := r.w.sessionOf(ino); s != nil && s.busy() {
			busy.Store(true)
		}
	})
	if err := h.Flush(); err != nil {
		t.Fatal(err)
	}
	h.Close()
	r.drain()
	if r.hub.content(entry.Ino) != "fresh" {
		t.Fatalf("hub %q", r.hub.content(entry.Ino))
	}
	if !busy.Load() {
		t.Fatal("the cache learned the new revision only after the session dropped its ranges")
	}
}
