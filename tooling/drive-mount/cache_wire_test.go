package main

import (
	"bytes"
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

func TestSeqsAndHandlesDescribeTheSessionForAResume(t *testing.T) {
	hub, c, ino := oneFile(t, pattern(100))
	if seqs := c.Seqs(); len(seqs) != 1 || seqs[0].Root != hub.root || seqs[0].Seq != 7 {
		t.Fatalf("seqs %+v", seqs)
	}
	c.Changed(wire.Changed{Root: hub.root, Seq: 11})
	if seqs := c.Seqs(); seqs[0].Seq != 11 {
		t.Fatalf("seqs after a push %+v", seqs)
	}
	h := openFile(t, c, ino)
	held := c.Handles()
	if len(held) != 1 || held[0].Ino != ino || held[0].Handle == 0 {
		t.Fatalf("handles %+v", held)
	}
	h.Release(context.Background())
	c.tasks.Wait()
	if len(c.Handles()) != 0 || hub.openHandles() != 0 || hub.count(wire.OpRelease) != 1 {
		t.Fatalf("handles after release: %+v, hub %d, releases %d", c.Handles(), hub.openHandles(), hub.count(wire.OpRelease))
	}
}

func TestChangedPushReachesTheFilesystemAfterTheCacheIsUpdated(t *testing.T) {
	hub, c, ino := oneFile(t, pattern(100))
	var seen []Change
	c.OnChange(func(ch Change) {
		attr, err := c.Getattr(context.Background(), ino)
		if err != nil || attr.Size != 6 {
			t.Errorf("the cache must already see the change: %v %+v", err, attr)
		}
		seen = append(seen, ch)
	})
	hub.rewrite(ino, []byte("sixsix"))
	c.Changed(wire.Changed{Root: hub.root, Seq: 8, Inodes: []uint64{ino}, Entries: []wire.NameRef{{Parent: hub.rootIno, Name: "big.bin"}}})
	if len(seen) != 1 || seen[0].Inodes[0] != ino || seen[0].Entries[0].Name != "big.bin" || seen[0].Reset {
		t.Fatalf("changes %+v", seen)
	}
}

func TestReadAfterTheSessionWasLostOpensTheFileAgain(t *testing.T) {
	content := pattern(testBlock * 2)
	hub, c, ino := oneFile(t, content)
	h := openFile(t, c, ino)
	first := c.Handles()[0].Handle
	hub.expireSession()
	if got := readAll(t, h, 5, 40); !bytes.Equal(got, content[5:45]) {
		t.Fatal("read after the session expired differs")
	}
	if now := c.Handles(); len(now) != 1 || now[0].Handle == first {
		t.Fatalf("handle was not replaced: %+v", now)
	}
}

func TestSessionLostErrorFromTheSocketReopensAndRetries(t *testing.T) {
	content := pattern(testBlock)
	hub, c, ino := oneFile(t, content)
	h := openFile(t, c, ino)
	var failed atomic.Bool
	hub.mu.Lock()
	hub.readHook = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpRead && failed.CompareAndSwap(false, true) {
			return wire.ErrSessionLost
		}
		return nil
	}
	hub.mu.Unlock()
	if got := readAll(t, h, 0, 30); !bytes.Equal(got, content[:30]) {
		t.Fatal("read after a lost session differs")
	}
	if hub.count(wire.OpOpen) != 2 {
		t.Fatalf("%d opens, want the original and one reopen", hub.count(wire.OpOpen))
	}
}

func TestReadOfAFileDeletedMeanwhileAnswersStale(t *testing.T) {
	hub, c, ino := oneFile(t, pattern(testBlock))
	h := openFile(t, c, ino)
	hub.expireSession()
	hub.mu.Lock()
	delete(hub.nodes, ino)
	hub.mu.Unlock()
	c.mu.Lock()
	c.inodes[ino].attrEpoch = 0
	c.mu.Unlock()
	hub.setDown(nil)
	_, err := h.ReadAt(context.Background(), make([]byte, 10), 0)
	if err == nil {
		t.Fatal("a vanished file must not read")
	}
	if code, ok := wire.CodeOf(err); !ok || (code != wire.ErrENOENT && code != wire.ErrESTALE) {
		t.Fatalf("error %v", err)
	}
}

func TestReestablishAfterAnExpiredSessionAttachesAndOpensAgain(t *testing.T) {
	hub, c, ino := oneFile(t, pattern(testBlock))
	h := openFile(t, c, ino)
	readAll(t, h, 0, 10)
	first := c.Handles()[0].Handle
	var changes []Change
	c.OnChange(func(ch Change) { changes = append(changes, ch) })
	hub.expireSession()
	if err := c.Reestablish(context.Background(), hub, true); err != nil || hub.count(wire.OpAttach) != 1 {
		t.Fatalf("a resumed session needs nothing: %v, attaches %d", err, hub.count(wire.OpAttach))
	}
	if err := c.Reestablish(context.Background(), hub, false); err != nil {
		t.Fatal(err)
	}
	if hub.count(wire.OpAttach) != 2 {
		t.Fatalf("attaches %d", hub.count(wire.OpAttach))
	}
	if now := c.Handles(); len(now) != 1 || now[0].Handle == first || hub.openHandles() != 1 {
		t.Fatalf("handles %+v, hub %d", now, hub.openHandles())
	}
	if len(changes) != 1 || !changes[0].Reset {
		t.Fatalf("changes %+v", changes)
	}
	before := hub.count(wire.OpGetattr)
	if _, err := c.Getattr(context.Background(), ino); err != nil || hub.count(wire.OpGetattr) == before {
		t.Fatalf("answers must be stale after a new session: %v", err)
	}
}

func TestReestablishMarksHandlesOfVanishedFilesStale(t *testing.T) {
	hub, c, ino := oneFile(t, pattern(testBlock*2))
	h := openFile(t, c, ino)
	hub.expireSession()
	hub.mu.Lock()
	delete(hub.nodes, ino)
	hub.mu.Unlock()
	if err := c.Reestablish(context.Background(), hub, false); err != nil {
		t.Fatal(err)
	}
	if len(c.Handles()) != 0 {
		t.Fatalf("a dead handle must not be reported as held: %+v", c.Handles())
	}
	c.mu.Lock()
	c.inodes[ino].attrEpoch = 0
	c.mu.Unlock()
	if _, err := h.ReadAt(context.Background(), make([]byte, 4), testBlock); err == nil {
		t.Fatal("reading a vanished file must fail")
	}
}

func TestOpenWhileOfflineReadsCachedDataAndOpensLazily(t *testing.T) {
	content := pattern(testBlock)
	hub, c, ino := oneFile(t, content)
	readOnce(t, c, ino, 0, 10)
	c.SetReachable(false)
	hub.setDown(wire.ErrNoRoute)
	opens := hub.count(wire.OpOpen)
	h := openFile(t, c, ino)
	if got := readAll(t, h, 10, 20); !bytes.Equal(got, content[10:30]) {
		t.Fatal("offline read of a cached file differs")
	}
	if hub.count(wire.OpOpen) != opens {
		t.Fatal("an offline open must not reach the hub")
	}
	hub.setDown(nil)
	c.SetReachable(true)
	if got := readAll(t, h, testBlock-5, 5); !bytes.Equal(got, content[testBlock-5:]) {
		t.Fatal("read after coming back differs")
	}
}

func TestNotesFromOwnChangesAnswerWithoutTheHub(t *testing.T) {
	hub := newFakeHub()
	c, root := attached(t, hub, cacheDirFor(t))
	made := wire.Entry{Ino: 900, Attr: wire.Attr{Ino: 900, Type: wire.InodeTypeFile, Mode: 0o600, Size: 3, Etag: "x"}}
	c.NoteEntry(root.Ino, "mine", made)
	got, err := c.Lookup(context.Background(), root.Ino, "mine")
	if err != nil || got.Ino != 900 || hub.count(wire.OpLookup) != 0 {
		t.Fatalf("noted entry: %v %+v, lookups %d", err, got, hub.count(wire.OpLookup))
	}
	made.Attr.Size = 8
	c.NoteAttr(made.Attr)
	if attr, err := c.Getattr(context.Background(), 900); err != nil || attr.Size != 8 {
		t.Fatalf("noted attr: %v %+v", err, attr)
	}
	c.NoteGone(root.Ino, "mine", 900)
	if _, err := c.Lookup(context.Background(), root.Ino, "mine"); !remoteCode(err, wire.ErrENOENT) || hub.count(wire.OpLookup) != 0 {
		t.Fatalf("noted removal: %v", err)
	}
	before := hub.count(wire.OpGetattr)
	if _, err := c.Getattr(context.Background(), root.Ino); err != nil || hub.count(wire.OpGetattr) == before {
		t.Fatalf("a changed folder must have its attributes asked again: %v", err)
	}
}

func TestCloseWritesTheMetadataOutAtOnce(t *testing.T) {
	hub := newFakeHub()
	hub.file(hub.rootIno, "x", []byte("1"))
	dir := cacheDirFor(t)
	c, root := attached(t, hub, dir)
	lookup(t, c, root.Ino, "x")
	start := time.Now()
	c.Close()
	if time.Since(start) > flushDelay {
		t.Fatal("close must not wait for the flush delay")
	}
	again := newBlockCache(hub, dir)
	defer again.Close()
	again.SetReachable(false)
	if got, err := again.Lookup(context.Background(), root.Ino, "x"); err != nil || got.Attr.Size != 1 {
		t.Fatalf("persisted lookup: %v %+v", err, got)
	}
}

func TestSeekAsksTheHubThroughTheOpenHandle(t *testing.T) {
	_, c, ino := oneFile(t, pattern(1000))
	h := openFile(t, c, ino)
	pos, err := h.Seek(context.Background(), 40, wire.WhenceData)
	if err != nil || pos != 40 {
		t.Fatalf("seek %v %d", err, pos)
	}
}
