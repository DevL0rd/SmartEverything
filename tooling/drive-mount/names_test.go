package main

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

func TestCreatesAndRemovalsReturnBeforeTheHubAnswers(t *testing.T) {
	r := newWbRig(t)
	r.online()
	r.leases(t)
	gate := make(chan struct{})
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpCreate || op == wire.OpMkdir || op == wire.OpUnlink || op == wire.OpRmdir {
			<-gate
		}
		return nil
	}
	dir, err := r.w.Mkdir(wbCtx, CreateArgs{Parent: 1, Name: "d", Mode: 0o755})
	if err != nil {
		t.Fatal(err)
	}
	file, h, err := r.w.Create(wbCtx, CreateArgs{Parent: dir.Ino, Name: "f", Mode: 0o644})
	if err != nil {
		t.Fatal(err)
	}
	wbPut(t, h, 0, "inside")
	h.Close()
	existing := r.hub.addFile(1, "old.txt", "old")
	if err := r.w.Unlink(wbCtx, 1, "old.txt"); err != nil {
		t.Fatal(err)
	}
	if r.w.Pending("") != 3 {
		t.Fatalf("pending %d, want the folder, the file and the removal", r.w.Pending(""))
	}
	close(gate)
	r.drain()
	if got := r.hub.content(file.Ino); got != "inside" {
		t.Fatalf("hub %q", got)
	}
	if _, ok := r.hub.lookupName(1, "old.txt"); ok {
		t.Fatal("the removal never reached the Hub")
	}
	if r.hub.count("PUT") != 0 || r.hub.count("CREATE") != 1 {
		t.Fatalf("a small new file costs one CREATE, got %v", r.hub.ops)
	}
	_ = existing
}

func TestSymlinksAndSpecialFilesReturnBeforeTheirFolderReachesTheHub(t *testing.T) {
	r := newWbRig(t)
	r.online()
	r.leases(t)
	gate := make(chan struct{})
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpMkdir || op == wire.OpSymlink || op == wire.OpMknod {
			<-gate
		}
		return nil
	}
	dir, err := r.w.Mkdir(wbCtx, CreateArgs{Parent: 1, Name: "d", Mode: 0o755})
	if err != nil {
		t.Fatal(err)
	}
	link, err := r.w.Symlink(wbCtx, CreateArgs{Parent: dir.Ino, Name: "l", Mode: 0o777, Target: "../there"})
	if err != nil {
		t.Fatal(err)
	}
	if link.Attr.Type != wire.InodeTypeSymlink || link.Attr.Size != uint64(len("../there")) {
		t.Fatalf("local symlink attr %+v", link.Attr)
	}
	fifo, err := r.w.Mknod(wbCtx, CreateArgs{Parent: dir.Ino, Name: "p", Mode: 0o644, Type: wire.InodeTypeFifo})
	if err != nil {
		t.Fatal(err)
	}
	if fifo.Attr.Type != wire.InodeTypeFifo {
		t.Fatalf("local fifo attr %+v", fifo.Attr)
	}
	overlay := &writeOverlay{w: r.w}
	if target, err := overlay.Readlink(wbCtx, link.Ino); err != nil || target != "../there" {
		t.Fatalf("pending readlink %q %v", target, err)
	}
	if r.w.Pending("") != 3 {
		t.Fatalf("pending %d, want the folder, the link and the fifo", r.w.Pending(""))
	}
	close(gate)
	r.drain()
	got, ok := r.hub.lookupName(dir.Ino, "l")
	if !ok || got != link.Ino {
		t.Fatalf("the link did not reach the Hub: %v %v", got, ok)
	}
	r.hub.mu.Lock()
	made := *r.hub.nodes[got]
	r.hub.mu.Unlock()
	if made.typ != wire.InodeTypeSymlink || string(made.data) != "../there" {
		t.Fatalf("the link reached the Hub as %+v", made)
	}
	got, ok = r.hub.lookupName(dir.Ino, "p")
	if !ok || got != fifo.Ino {
		t.Fatal("the fifo did not reach the Hub")
	}
	r.hub.mu.Lock()
	made = *r.hub.nodes[got]
	r.hub.mu.Unlock()
	if made.typ != wire.InodeTypeFifo {
		t.Fatalf("the fifo reached the Hub as %+v", made)
	}
}

func (r *wbRig) leases(t *testing.T) {
	t.Helper()
	if err := r.w.ns.refill(wbCtx); err != nil {
		t.Fatal(err)
	}
}

func TestFilesCreatedOfflineAndFsyncedSurviveACrash(t *testing.T) {
	r := newWbRig(t)
	r.online()
	r.leases(t)
	r.w.SetReachable(false)
	dir, err := r.w.Mkdir(wbCtx, CreateArgs{Parent: 1, Name: "offline", Mode: 0o755})
	if err != nil {
		t.Fatal(err)
	}
	file, h, err := r.w.Create(wbCtx, CreateArgs{Parent: dir.Ino, Name: "kept.txt", Mode: 0o644})
	if err != nil {
		t.Fatal(err)
	}
	wbPut(t, h, 0, "written offline")
	if err := h.Sync(); err != nil {
		t.Fatalf("an offline fsync is local: %v", err)
	}
	h.Close()
	if r.hub.count("CREATE")+r.hub.count("MKDIR") != 0 {
		t.Fatal("nothing reaches the Hub while offline")
	}
	r.crash()
	r.w = r.open()
	r.online()
	r.drain()
	if got := r.hub.content(file.Ino); got != "written offline" {
		t.Fatalf("hub %q", got)
	}
	if ino, ok := r.hub.lookupName(1, "offline"); !ok || ino != dir.Ino {
		t.Fatal("the offline folder is missing on the Hub")
	}
	if len(wbJournalFiles(t, r.dir)) != 0 {
		t.Fatalf("journal left %v", wbJournalFiles(t, r.dir))
	}
}

func TestRemovingANameNotYetSentCancelsItsCreate(t *testing.T) {
	r := newWbRig(t)
	r.online()
	r.leases(t)
	r.w.SetReachable(false)
	dir, err := r.w.Mkdir(wbCtx, CreateArgs{Parent: 1, Name: "tmp", Mode: 0o755})
	if err != nil {
		t.Fatal(err)
	}
	_, h, err := r.w.Create(wbCtx, CreateArgs{Parent: dir.Ino, Name: "scratch", Mode: 0o644})
	if err != nil {
		t.Fatal(err)
	}
	h.Close()
	if err := r.w.Rmdir(wbCtx, 1, "tmp"); !errors.Is(err, syscall.ENOTEMPTY) {
		t.Fatalf("rmdir of a folder with a new file = %v", err)
	}
	if err := r.w.Unlink(wbCtx, dir.Ino, "scratch"); err != nil {
		t.Fatal(err)
	}
	if err := r.w.Rmdir(wbCtx, 1, "tmp"); err != nil {
		t.Fatal(err)
	}
	r.online()
	r.drain()
	if n := r.hub.count("CREATE") + r.hub.count("MKDIR") + r.hub.count("UNLINK") + r.hub.count("RMDIR"); n != 0 {
		t.Fatalf("cancelled names still reached the Hub: %v", r.hub.ops)
	}
}

func TestANameTakenOnTheHubKeepsTheNewFileBesideIt(t *testing.T) {
	r := newWbRig(t)
	r.online()
	r.leases(t)
	r.w.SetReachable(false)
	file, h, err := r.w.Create(wbCtx, CreateArgs{Parent: 1, Name: "report.txt", Mode: 0o644})
	if err != nil {
		t.Fatal(err)
	}
	wbPut(t, h, 0, "mine")
	h.Close()
	theirs := r.hub.addFile(1, "report.txt", "theirs")
	r.online()
	r.drain()
	if r.hub.content(theirs) != "theirs" {
		t.Fatal("the other computer's file was replaced")
	}
	if r.hub.content(file.Ino) != "mine" {
		t.Fatal("the new file was lost")
	}
	r.hub.mu.Lock()
	defer r.hub.mu.Unlock()
	for name, ino := range r.hub.nodes[1].names {
		if ino == file.Ino && !strings.Contains(name, "sync-conflict") {
			t.Fatalf("the new file kept the taken name %s", name)
		}
	}
}

func TestARemovalOfANameNowHoldingAnotherFileLeavesThatFile(t *testing.T) {
	r := newWbRig(t)
	r.online()
	r.leases(t)
	old := r.hub.addFile(1, "a.txt", "old")
	if _, err := r.w.lookupBase(wbCtx, 1, "a.txt"); err != nil {
		t.Fatal(err)
	}
	r.w.SetReachable(false)
	if err := r.w.Unlink(wbCtx, 1, "a.txt"); err != nil {
		t.Fatal(err)
	}
	r.hub.mu.Lock()
	delete(r.hub.nodes, old)
	r.hub.mu.Unlock()
	replacement := r.hub.addFile(1, "a.txt", "replacement")
	r.online()
	r.drain()
	if got, ok := r.hub.lookupName(1, "a.txt"); !ok || got != replacement {
		t.Fatal("the removal deleted the file another computer put at that name")
	}
}

func TestRenamingANewFileThatIsStillOpenDoesNotWaitForItsClose(t *testing.T) {
	r := newWbRig(t)
	r.online()
	r.leases(t)
	entry, h := r.make("draft.tmp")
	wbPut(t, h, 0, "draft")
	if err := r.w.Rename(wbCtx, RenameArgs{Parent: 1, Name: "draft.tmp", NewParent: 1, NewName: "draft.txt"}); err != nil {
		t.Fatal(err)
	}
	h.Close()
	r.drain()
	if ino, ok := r.hub.lookupName(1, "draft.txt"); !ok || ino != entry.Ino {
		t.Fatal("the renamed file is missing")
	}
	if got := r.hub.content(entry.Ino); got != "draft" {
		t.Fatalf("hub %q", got)
	}
}

func removalTree(t *testing.T, r *wbRig) (uint64, uint64) {
	t.Helper()
	top := r.hub.addDir(1, "tree")
	sub := r.hub.addDir(top, "sub")
	r.hub.addFile(sub, "a", "a")
	r.hub.addFile(sub, "b", "b")
	r.hub.addFile(top, "c", "c")
	return top, sub
}

func removeTree(t *testing.T, r *wbRig, top, sub uint64) {
	t.Helper()
	for _, step := range []struct {
		parent uint64
		name   string
		dir    bool
	}{{sub, "a", false}, {sub, "b", false}, {top, "sub", true}, {top, "c", false}, {1, "tree", true}} {
		var err error
		if step.dir {
			err = r.w.Rmdir(wbCtx, step.parent, step.name)
		} else {
			err = r.w.Unlink(wbCtx, step.parent, step.name)
		}
		if err != nil {
			t.Fatal(step.name, err)
		}
	}
}

func TestRemovingAFolderTreeReachesTheHubAsOneRemoval(t *testing.T) {
	r := newWbRig(t)
	top, sub := removalTree(t, r)
	r.online()
	gate := make(chan struct{})
	var first sync.Once
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpUnlink {
			first.Do(func() { <-gate })
		}
		return nil
	}
	removeTree(t, r, top, sub)
	close(gate)
	r.drain()
	if _, ok := r.hub.lookupName(1, "tree"); ok {
		t.Fatal("the tree is still on the Hub")
	}
	removals := r.hub.count("UNLINK") + r.hub.count("RMTREE") + r.hub.count("RMDIR")
	if r.hub.count("RMTREE") == 0 || removals > 3 {
		t.Fatalf("want the folders folded into tree removals, got %v", r.hub.ops)
	}
	if r.w.ns.inflight != 0 {
		t.Fatalf("in flight %d after the drain", r.w.ns.inflight)
	}
}

func TestATreeTheHubNoLongerMatchesIsRemovedItemByItem(t *testing.T) {
	r := newWbRig(t)
	top, sub := removalTree(t, r)
	r.online()
	gate := make(chan struct{})
	var first sync.Once
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		switch op {
		case wire.OpUnlink:
			first.Do(func() { <-gate })
		case wire.OpRmtree:
			return wbRemote(wire.ErrESTALE)
		}
		return nil
	}
	removeTree(t, r, top, sub)
	close(gate)
	r.drain()
	if _, ok := r.hub.lookupName(1, "tree"); ok {
		t.Fatal("the tree is still on the Hub")
	}
	if r.hub.count("UNLINK") != 3 || r.hub.count("RMDIR") != 2 {
		t.Fatalf("want every removal on its own after the refusal, got %v", r.hub.ops)
	}
}

func TestALoneRemovalIsNotHeld(t *testing.T) {
	r := newWbRig(t)
	r.hub.addFile(1, "alone", "x")
	r.online()
	if err := r.w.Unlink(wbCtx, 1, "alone"); err != nil {
		t.Fatal(err)
	}
	wbEventually(t, "the removal on the Hub", func() bool {
		_, ok := r.hub.lookupName(1, "alone")
		return !ok
	})
}

func TestHeldRemovalsFoldAgainAfterACrash(t *testing.T) {
	r := newWbRig(t)
	top, sub := removalTree(t, r)
	r.w.SetReachable(false)
	removeTree(t, r, top, sub)
	r.reopen()
	r.online()
	r.drain()
	if _, ok := r.hub.lookupName(1, "tree"); ok {
		t.Fatal("the tree is still on the Hub")
	}
	if r.hub.count("RMTREE") != 1 || r.hub.count("UNLINK") != 0 || r.hub.count("RMDIR") != 0 {
		t.Fatalf("want one tree removal after the restart, got %v", r.hub.ops)
	}
}

func TestARenameWaitsOnlyForTheNamesItTouches(t *testing.T) {
	r := newWbRig(t)
	r.hub.addFile(1, "old", "x")
	r.online()
	r.leases(t)
	gate := make(chan struct{})
	r.hub.before = func(op wire.Op, meta wire.Meta) error {
		if name, _ := meta.String(wire.KeyName); op == wire.OpCreate && name == "slow" {
			<-gate
		}
		return nil
	}
	_, h, err := r.w.Create(wbCtx, CreateArgs{Parent: 1, Name: "slow", Mode: 0o644})
	if err != nil {
		t.Fatal(err)
	}
	h.Close()
	if err := r.w.Rename(wbCtx, RenameArgs{Parent: 1, Name: "old", NewParent: 1, NewName: "new"}); err != nil {
		t.Fatal(err)
	}
	if _, ok := r.hub.lookupName(1, "new"); !ok {
		t.Fatal("the rename did not reach the Hub")
	}
	close(gate)
	r.drain()
}

func TestInodesTheHubAlreadyHoldsAreNotLeasedAgainAfterACrash(t *testing.T) {
	r := newWbRig(t)
	r.online()
	r.leases(t)
	var holding atomic.Bool
	holding.Store(true)
	r.hub.before = func(op wire.Op, meta wire.Meta) error {
		if name, _ := meta.String(wire.KeyName); holding.Load() && op == wire.OpMkdir && name == "held" {
			return wbRemote(wire.ErrEAGAIN)
		}
		return nil
	}
	if _, err := r.w.Mkdir(wbCtx, CreateArgs{Parent: 1, Name: "held", Mode: 0o755}); err != nil {
		t.Fatal(err)
	}
	landed, err := r.w.Mkdir(wbCtx, CreateArgs{Parent: 1, Name: "landed", Mode: 0o755})
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		if _, ok := r.hub.lookupName(1, "landed"); ok {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the folder never reached the Hub")
		}
		time.Sleep(5 * time.Millisecond)
	}
	holding.Store(false)
	r.reopen()
	r.online()
	next, err := r.w.Mkdir(wbCtx, CreateArgs{Parent: 1, Name: "after", Mode: 0o755})
	if err != nil {
		t.Fatal(err)
	}
	if next.Ino == landed.Ino {
		t.Fatalf("the inode %d of a folder already on the Hub was leased again", landed.Ino)
	}
	r.drain()
	if ino, ok := r.hub.lookupName(1, "after"); !ok || ino != next.Ino {
		t.Fatal("the folder made after the restart is missing on the Hub")
	}
}

func TestAnInodeTheHubRefusesIsKeptLocallyWithoutRenaming(t *testing.T) {
	r := newWbRig(t)
	r.online()
	r.leases(t)
	var mu sync.Mutex
	var names []string
	r.hub.before = func(op wire.Op, meta wire.Meta) error {
		if op != wire.OpMkdir {
			return nil
		}
		name, _ := meta.String(wire.KeyName)
		mu.Lock()
		names = append(names, name)
		mu.Unlock()
		return wbRemote(wire.ErrEINVAL)
	}
	if _, err := r.w.Mkdir(wbCtx, CreateArgs{Parent: 1, Name: "case", Mode: 0o755}); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		r.w.ns.mu.Lock()
		failed := len(r.w.ns.order) == 1 && r.w.ns.order[0].failed != nil
		r.w.ns.mu.Unlock()
		if failed {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the refused folder was never kept locally")
		}
		time.Sleep(5 * time.Millisecond)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(names) != 1 || names[0] != "case" {
		t.Fatalf("want one post under the original name, got %v", names)
	}
}

func TestRepeatedNameConflictsKeepTheConflictNameShort(t *testing.T) {
	r := newWbRig(t)
	r.online()
	r.leases(t)
	var mu sync.Mutex
	var names []string
	r.hub.before = func(op wire.Op, meta wire.Meta) error {
		if op != wire.OpMkdir {
			return nil
		}
		name, _ := meta.String(wire.KeyName)
		mu.Lock()
		defer mu.Unlock()
		names = append(names, name)
		if len(names) <= 5 {
			return wbRemote(wire.ErrEEXIST)
		}
		return nil
	}
	dir, err := r.w.Mkdir(wbCtx, CreateArgs{Parent: 1, Name: "case", Mode: 0o755})
	if err != nil {
		t.Fatal(err)
	}
	r.drain()
	mu.Lock()
	defer mu.Unlock()
	if len(names) != 6 {
		t.Fatalf("want five refusals and one landing, got %v", names)
	}
	last := names[len(names)-1]
	if strings.Count(last, "sync-conflict") != 1 || !strings.HasPrefix(last, "case.sync-conflict-") {
		t.Fatalf("the conflict name grew: %s", last)
	}
	if ino, ok := r.hub.lookupName(1, last); !ok || ino != dir.Ino {
		t.Fatal("the rerouted folder is missing on the Hub")
	}
}

type landingBase struct {
	InodeSource
	base wbBase
	land func()
}

func (b landingBase) Readdir(ctx context.Context, ino, cursor uint64) (DirPage, error) {
	page, err := b.base.Readdir(ctx, ino, cursor)
	b.land()
	return page, err
}

func TestAListingTakenWhileANewNameLandsStillShowsIt(t *testing.T) {
	r := newWbRig(t)
	r.online()
	r.leases(t)
	r.w.SetReachable(false)
	if _, err := r.w.Mkdir(wbCtx, CreateArgs{Parent: 1, Name: "landing", Mode: 0o755}); err != nil {
		t.Fatal(err)
	}
	overlay := &writeOverlay{w: r.w, InodeSource: landingBase{base: wbBase{r.hub}, land: func() {
		r.online()
		r.drain()
	}}}
	page, err := overlay.Readdir(wbCtx, 1, 0)
	if err != nil {
		t.Fatal(err)
	}
	seen := 0
	for _, e := range page.Entries {
		if e.Name == "landing" {
			seen++
		}
	}
	if seen != 1 {
		t.Fatalf("the folder that landed during the listing shows %d times: %v", seen, page.Entries)
	}
}

type heldReply struct {
	reply wire.Reply
	err   error
	hold  chan struct{}
}

func (h heldReply) Wait(ctx context.Context) (wire.Reply, error) {
	select {
	case <-h.hold:
		return h.reply, h.err
	case <-ctx.Done():
		return wire.Reply{}, ctx.Err()
	}
}

func (h heldReply) Forget() {}

type holdingFolders struct {
	*wbHub
	hold chan struct{}
}

func (h holdingFolders) Post(ctx context.Context, op wire.Op, meta wire.Meta, payload []byte) (wire.Posted, error) {
	reply, err := h.Call(ctx, op, meta, payload)
	if op == wire.OpMkdir {
		return heldReply{reply: reply, err: err, hold: h.hold}, nil
	}
	return wire.Settled{Reply: reply, Err: err}, nil
}

func TestAFileAnsweredBeforeItsNewFolderWaitsForTheFolder(t *testing.T) {
	r := &wbRig{t: t, hub: newWbHub(t), dir: t.TempDir()}
	held := holdingFolders{wbHub: r.hub, hold: make(chan struct{})}
	w, err := newWriteBack(writeConfig{Caller: held, Base: wbBase{r.hub}, Names: wbNames{}, Dir: r.dir})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(w.Close)
	r.w = w
	r.online()
	r.leases(t)
	dir, err := r.w.Mkdir(wbCtx, CreateArgs{Parent: 1, Name: "folder", Mode: 0o755})
	if err != nil {
		t.Fatal(err)
	}
	file, h, err := r.w.Create(wbCtx, CreateArgs{Parent: dir.Ino, Name: "inside.txt", Mode: 0o644})
	if err != nil {
		t.Fatal(err)
	}
	h.Close()
	deadline := time.Now().Add(5 * time.Second)
	for {
		if _, ok := r.hub.lookupName(dir.Ino, "inside.txt"); ok {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the file never reached the Hub")
		}
		time.Sleep(5 * time.Millisecond)
	}
	time.Sleep(50 * time.Millisecond)
	r.w.ns.mu.Lock()
	_, waiting := r.w.ns.byIno[file.Ino]
	r.w.ns.mu.Unlock()
	if !waiting {
		t.Fatal("the file finished before its folder was answered")
	}
	close(held.hold)
	r.drain()
	r.w.ns.mu.Lock()
	defer r.w.ns.mu.Unlock()
	if len(r.w.ns.order) != 0 {
		t.Fatalf("names still pending after the folder was answered: %d", len(r.w.ns.order))
	}
}
