//go:build linux

package main

import (
	"context"
	"testing"

	"github.com/smarteverything/drive-mount/integration/fakehub"
)

func TestFsyncedWriteSurvivesAHelperCrashWithoutAClose(t *testing.T) {
	h := fakehub.New(t)
	dir := writeDir(t)
	first := openFake(t, h, dir)
	listed(t, first)
	handle, err := first.Create(context.Background(), writeRoot, "/kept.txt")
	if err != nil {
		t.Fatal(err)
	}
	writeAll(t, handle, 0, "kept")
	if err := handle.Sync(); err != nil {
		t.Fatal(err)
	}
	writeAll(t, handle, 4, " but not this")
	first.Close()
	second := openFake(t, h, dir)
	t.Cleanup(second.Close)
	if second.Pending(writeRoot) != 1 {
		t.Fatalf("replayed pending %d", second.Pending(writeRoot))
	}
	awaitHub(t, second, "the fsynced bytes", hubHas(h, "/kept.txt", "kept"))
}

func TestWriteWithoutFsyncOrCloseIsStillDroppedAtStart(t *testing.T) {
	h := fakehub.New(t)
	dir := writeDir(t)
	first := openFake(t, h, dir)
	handle, err := first.Create(context.Background(), writeRoot, "/half.txt")
	if err != nil {
		t.Fatal(err)
	}
	writeAll(t, handle, 0, "partial")
	first.Close()
	second := openFake(t, h, dir)
	t.Cleanup(second.Close)
	if second.Pending(writeRoot) != 0 || h.Exists("/half.txt") {
		t.Fatalf("pending %d", second.Pending(writeRoot))
	}
}

func TestClosedWriteReopenedBeforeUploadSurvivesACrash(t *testing.T) {
	h := fakehub.New(t)
	dir := writeDir(t)
	first := openFake(t, h, dir)
	listed(t, first)
	pendingFile(t, first, "/queued.txt", "closed once")
	handle, err := first.OpenWrite(context.Background(), writeRoot, "/queued.txt", false)
	if err != nil {
		t.Fatal(err)
	}
	writeAll(t, handle, 0, "C")
	first.Close()
	second := openFake(t, h, dir)
	t.Cleanup(second.Close)
	awaitHub(t, second, "the sealed bytes", func() bool {
		got, ok := h.Content("/queued.txt")
		return ok && len(got) == len("closed once")
	})
}

func TestFsyncOfACleanSessionWritesNoJournalRecord(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/a.txt", "abc")
	dir := writeDir(t)
	w := openFake(t, h, dir)
	t.Cleanup(w.Close)
	handle, err := w.OpenWrite(context.Background(), writeRoot, "/a.txt", false)
	if err != nil {
		t.Fatal(err)
	}
	if err := handle.Sync(); err != nil {
		t.Fatal(err)
	}
	handle.Close()
	if w.Pending(writeRoot) != 0 || opCount(h, "upload") != 0 {
		t.Fatalf("pending %d ops %v", w.Pending(writeRoot), h.Ops())
	}
}
