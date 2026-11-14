//go:build linux

package main

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/smarteverything/drive-mount/integration/fakehub"
)

func openFake(t *testing.T, h *fakehub.Hub, dir string) *writeBack {
	t.Helper()
	files, err := newFilesystem(routeSpec{URL: h.URL}, fakehub.Token, dir, dir+"/journal")
	if err != nil {
		t.Fatal(err)
	}
	return files
}

func pendingFile(t *testing.T, w *writeBack, p, content string) {
	t.Helper()
	handle, err := w.Create(context.Background(), writeRoot, p)
	if err != nil {
		t.Fatal(err)
	}
	writeAll(t, handle, 0, content)
	if err := handle.Sync(); err != nil {
		t.Fatal(err)
	}
	if err := handle.Close(); err != nil {
		t.Fatal(err)
	}
}

func listed(t *testing.T, w *writeBack, dirs ...string) {
	t.Helper()
	for _, dir := range append([]string{"/"}, dirs...) {
		if _, err := w.List(context.Background(), writeRoot, dir); err != nil {
			t.Fatal(err)
		}
	}
	w.SetReachable(false)
}

func awaitHub(t *testing.T, w *writeBack, what string, ok func() bool) {
	t.Helper()
	until(t, observe(w), what, ok)
}

func hubHas(h *fakehub.Hub, p, want string) func() bool {
	return func() bool { got, _ := h.Content(p); return got == want }
}

func opCount(h *fakehub.Hub, prefix string) int {
	n := 0
	for _, op := range h.Ops() {
		if strings.HasPrefix(op, prefix) {
			n++
		}
	}
	return n
}

func TestRenameOverExistingUploadsAsANewVersionOfTheTarget(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/doc.txt", "old")
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	listed(t, w)
	id := h.ID("/doc.txt")
	pendingFile(t, w, "/doc.txt.tmp", "new")
	if err := w.Rename(context.Background(), writeRoot, "/doc.txt.tmp", "/doc.txt", true); err != nil {
		t.Fatal(err)
	}
	w.SetReachable(true)
	awaitHub(t, w, "the new version", hubHas(h, "/doc.txt", "new"))
	awaitHub(t, w, "pending to clear", func() bool { return w.Pending(writeRoot) == 0 })
	if h.ID("/doc.txt") != id || h.Rev("/doc.txt") != 2 {
		t.Fatalf("item %s rev %d", h.ID("/doc.txt"), h.Rev("/doc.txt"))
	}
	if h.Exists("/doc.txt.tmp") || opCount(h, "upload /doc.txt.tmp") != 0 {
		t.Fatalf("the temporary name reached the hub: %v", h.Ops())
	}
	if left := journalFiles(t, writeDirOf(w)); len(left) != 0 {
		t.Fatalf("journal %v", left)
	}
}

func writeDirOf(w *writeBack) string { return strings.TrimSuffix(w.journal.dir, "/journal") }

func TestRenameOfAPendingFileToANewNameUploadsUnderIt(t *testing.T) {
	h := fakehub.New(t)
	h.Mkdir("/sub")
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	listed(t, w, "/sub")
	pendingFile(t, w, "/draft.txt", "words")
	if err := w.Rename(context.Background(), writeRoot, "/draft.txt", "/sub/final.txt", true); err != nil {
		t.Fatal(err)
	}
	if _, live := w.Size(writeRoot, "/draft.txt"); live {
		t.Fatal("the old name is still pending")
	}
	w.SetReachable(true)
	awaitHub(t, w, "upload", hubHas(h, "/sub/final.txt", "words"))
	if h.Exists("/draft.txt") {
		t.Fatal("old name on the hub")
	}
}

func TestRenameOnTheHubReplacesAFileAndKeepsTheSourceItem(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/a.txt", "from a")
	h.Put("/b.txt", "from b")
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	id := h.ID("/a.txt")
	if err := w.Rename(context.Background(), writeRoot, "/a.txt", "/b.txt", true); err != nil {
		t.Fatal(err)
	}
	if got, _ := h.Content("/b.txt"); got != "from a" || h.ID("/b.txt") != id || h.Exists("/a.txt") {
		t.Fatalf("hub %v", h.Ops())
	}
	if !slices.Equal(h.Ops(), []string{"unlink /b.txt", "rename /a.txt /b.txt"}) {
		t.Fatalf("ops %v", h.Ops())
	}
}

func TestRenameOfADirectoryCarriesItsPendingWrites(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/d/x.txt", "x")
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	listed(t, w, "/d")
	pendingFile(t, w, "/d/new.txt", "fresh")
	if err := w.Rename(context.Background(), writeRoot, "/d", "/e", true); err != nil {
		t.Fatal(err)
	}
	w.SetReachable(true)
	awaitHub(t, w, "upload under the new folder name", hubHas(h, "/e/new.txt", "fresh"))
	if got, _ := h.Content("/e/x.txt"); got != "x" || h.Exists("/d") {
		t.Fatalf("hub %v", h.Ops())
	}
}

func TestRenameOfAnEditedFileKeepsItsBaseAndUploads(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/a.txt", "abc")
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	listed(t, w)
	w.SetReachable(true)
	handle, err := w.OpenWrite(context.Background(), writeRoot, "/a.txt", false)
	if err != nil {
		t.Fatal(err)
	}
	w.SetReachable(false)
	writeAll(t, handle, 0, "Z")
	handle.Close()
	if err := w.Rename(context.Background(), writeRoot, "/a.txt", "/b.txt", true); err != nil {
		t.Fatal(err)
	}
	w.SetReachable(true)
	awaitHub(t, w, "edited content under the new name", hubHas(h, "/b.txt", "Zbc"))
	if opCount(h, "upload") != 1 || h.Exists("/a.txt") {
		t.Fatalf("ops %v", h.Ops())
	}
	if copies := h.Names("/"); len(copies) != 1 {
		t.Fatalf("a conflict copy appeared: %v", copies)
	}
}

func TestRenameRefusals(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/f.txt", "f")
	h.Put("/g.txt", "g")
	h.Put("/d/inner.txt", "i")
	h.Mkdir("/empty")
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	ctx := context.Background()
	cases := []struct {
		name     string
		from, to string
		replace  bool
		want     error
	}{
		{"no replace", "/f.txt", "/g.txt", false, errExists},
		{"file over directory", "/f.txt", "/empty", true, errIsDir},
		{"directory over file", "/d", "/f.txt", true, errNotDir},
		{"directory over a full directory", "/empty", "/d", true, errNotEmpty},
		{"into itself", "/d", "/d/sub", true, errInvalid},
		{"over its own parent", "/d/inner.txt", "/d", true, errNotEmpty},
		{"missing source", "/nope", "/x", true, errNotFound},
		{"missing parent", "/f.txt", "/nope/x", true, errNotFound},
	}
	for _, c := range cases {
		if err := w.Rename(ctx, writeRoot, c.from, c.to, c.replace); !errors.Is(err, c.want) {
			t.Errorf("%s: err %v want %v", c.name, err, c.want)
		}
	}
	if len(h.Ops()) != 0 {
		t.Fatalf("a refused rename reached the hub: %v", h.Ops())
	}
}

func TestRenameOverAnEmptyDirectoryReplacesIt(t *testing.T) {
	h := fakehub.New(t)
	h.Mkdir("/a")
	h.Put("/a/x", "x")
	h.Mkdir("/b")
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	if err := w.Rename(context.Background(), writeRoot, "/a", "/b", true); err != nil {
		t.Fatal(err)
	}
	if got, _ := h.Content("/b/x"); got != "x" || h.Exists("/a") {
		t.Fatalf("ops %v", h.Ops())
	}
}

func TestUnlinkOfAPendingFileNeverUploads(t *testing.T) {
	h := fakehub.New(t)
	dir := writeDir(t)
	w := openFake(t, h, dir)
	t.Cleanup(w.Close)
	listed(t, w)
	pendingFile(t, w, "/lock.tmp", "scratch")
	if err := w.Remove(context.Background(), writeRoot, "/lock.tmp", false); err != nil {
		t.Fatal(err)
	}
	if w.Pending(writeRoot) != 0 || len(journalFiles(t, dir)) != 0 {
		t.Fatalf("pending %d journal %v", w.Pending(writeRoot), journalFiles(t, dir))
	}
	w.SetReachable(true)
	if err := w.Remove(context.Background(), writeRoot, "/lock.tmp", false); !errors.Is(err, errNotFound) {
		t.Fatalf("err %v", err)
	}
	if len(h.Ops()) != 0 {
		t.Fatalf("ops %v", h.Ops())
	}
}

func TestUnlinkWhileAHandleIsOpenKeepsTheHandleWorking(t *testing.T) {
	h := fakehub.New(t)
	dir := writeDir(t)
	w := openFake(t, h, dir)
	t.Cleanup(w.Close)
	handle, err := w.Create(context.Background(), writeRoot, "/gone.tmp")
	if err != nil {
		t.Fatal(err)
	}
	if err := w.Remove(context.Background(), writeRoot, "/gone.tmp", false); err != nil {
		t.Fatal(err)
	}
	writeAll(t, handle, 0, "still writable")
	if err := handle.Close(); err != nil {
		t.Fatal(err)
	}
	if w.Pending(writeRoot) != 0 || h.Exists("/gone.tmp") || len(journalFiles(t, dir)) != 0 {
		t.Fatalf("pending %d journal %v ops %v", w.Pending(writeRoot), journalFiles(t, dir), h.Ops())
	}
}

func TestUnlinkAndRmdirOnTheHub(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/d/x.txt", "x")
	h.Put("/y.txt", "y")
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	ctx := context.Background()
	if err := w.Remove(ctx, writeRoot, "/d", true); !errors.Is(err, errNotEmpty) {
		t.Fatalf("rmdir full %v", err)
	}
	if err := w.Remove(ctx, writeRoot, "/d", false); !errors.Is(err, errIsDir) {
		t.Fatalf("unlink dir %v", err)
	}
	if err := w.Remove(ctx, writeRoot, "/y.txt", true); !errors.Is(err, errNotDir) {
		t.Fatalf("rmdir file %v", err)
	}
	for _, step := range []struct {
		p   string
		dir bool
	}{{"/d/x.txt", false}, {"/d", true}, {"/y.txt", false}} {
		if err := w.Remove(ctx, writeRoot, step.p, step.dir); err != nil {
			t.Fatalf("%s: %v", step.p, err)
		}
	}
	if len(h.Names("/")) != 0 {
		t.Fatalf("left %v", h.Names("/"))
	}
}

func TestMkdirCreatesOnTheHubAndRefusesDuplicates(t *testing.T) {
	h := fakehub.New(t)
	h.Mkdir("/a")
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	ctx := context.Background()
	if err := w.Mkdir(ctx, writeRoot, "/a/b"); err != nil || !h.Exists("/a/b") {
		t.Fatalf("mkdir %v", err)
	}
	if err := w.Mkdir(ctx, writeRoot, "/a/b"); !errors.Is(err, errExists) {
		t.Fatalf("again %v", err)
	}
	if err := w.Mkdir(ctx, writeRoot, "/nope/b"); !errors.Is(err, errNotFound) {
		t.Fatalf("no parent %v", err)
	}
	if err := w.Mkdir(ctx, mountRoot{RootID: "r"}, "/top"); !errors.Is(err, errNoFolder) {
		t.Fatalf("no folder %v", err)
	}
}

func TestSetTimesReachesTheHubAndIsAcceptedForPendingFiles(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/a.txt", "a")
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	listed(t, w)
	pendingFile(t, w, "/b.txt", "b")
	at := testEpoch
	if err := w.SetTimes(context.Background(), writeRoot, "/b.txt", at); err != nil {
		t.Fatal(err)
	}
	if err := w.SetTimes(context.Background(), writeRoot, "/a.txt", at); err != nil {
		t.Fatal(err)
	}
	if err := w.SetTimes(context.Background(), writeRoot, "/missing", at); !errors.Is(err, errNotFound) {
		t.Fatalf("missing %v", err)
	}
	if !slices.Equal(h.Ops(), []string{"utimens /a.txt"}) {
		t.Fatalf("ops %v", h.Ops())
	}
}
