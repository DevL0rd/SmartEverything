package main

import (
	"errors"
	"strings"
	"syscall"
	"testing"

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
