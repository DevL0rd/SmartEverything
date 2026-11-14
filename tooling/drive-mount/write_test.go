//go:build linux

package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var writeRoot = mountRoot{RootID: "r", FolderID: "f1"}

func writeHub(t *testing.T) *stubHub {
	t.Helper()
	h := newStubHub(t)
	h.upKey = key("r", "f1")
	return h
}

func openWriteBack(t *testing.T, h *stubHub, dir string) *writeBack {
	t.Helper()
	files, err := newFilesystem(routeSpec{URL: h.server.URL}, stubToken, dir, filepath.Join(dir, "journal"))
	if err != nil {
		t.Fatal(err)
	}
	return files
}

func goOffline(t *testing.T, w *writeBack) {
	t.Helper()
	if _, err := w.List(context.Background(), writeRoot, "/"); err != nil {
		t.Fatal(err)
	}
	w.SetReachable(false)
}

func writeDir(t *testing.T) string {
	t.Helper()
	return cacheDirFor(t)
}

func observe(w *writeBack) chan struct{} {
	changes := make(chan struct{}, 64)
	w.OnChange(func(mountRoot, []string) {
		select {
		case changes <- struct{}{}:
		default:
		}
	})
	return changes
}

func until(t *testing.T, changes chan struct{}, what string, ok func() bool) {
	t.Helper()
	deadline := time.After(5 * time.Second)
	for !ok() {
		select {
		case <-changes:
		case <-deadline:
			t.Fatalf("timed out waiting for %s", what)
		}
	}
}

func journalFiles(t *testing.T, dir string) []string {
	t.Helper()
	names, err := os.ReadDir(filepath.Join(dir, "journal"))
	if err != nil {
		t.Fatal(err)
	}
	var out []string
	for _, n := range names {
		out = append(out, n.Name())
	}
	return out
}

func recordFile(t *testing.T, dir string) string {
	t.Helper()
	for _, name := range journalFiles(t, dir) {
		if strings.HasSuffix(name, ".json") {
			return name
		}
	}
	t.Fatal("no journal record")
	return ""
}

func writeAll(t *testing.T, h WriteHandle, off int64, data string) {
	t.Helper()
	if n, err := h.WriteAt([]byte(data), off); err != nil || n != len(data) {
		t.Fatalf("write %d %v", n, err)
	}
}

func TestCreatedFileUploadsToItsFolderAndLeavesNoJournal(t *testing.T) {
	h := writeHub(t)
	dir := writeDir(t)
	w := openWriteBack(t, h, dir)
	t.Cleanup(w.Close)
	changes := observe(w)
	handle, err := w.Create(context.Background(), writeRoot, "/new.txt")
	if err != nil {
		t.Fatal(err)
	}
	writeAll(t, handle, 0, "hello")
	if err := handle.Close(); err != nil {
		t.Fatal(err)
	}
	until(t, changes, "upload", func() bool { got, _ := h.content("/new.txt"); return got == "hello" })
	until(t, changes, "pending to clear", func() bool { return w.Pending(writeRoot) == 0 })
	if left := journalFiles(t, dir); len(left) != 0 {
		t.Fatalf("journal not cleaned: %v", left)
	}
	items, err := w.List(context.Background(), writeRoot, "/")
	if err != nil || len(items) != 1 || items[0].Size != 5 {
		t.Fatalf("items %v err %v", items, err)
	}
}

func TestCreateInRootWithoutFolderIsRefused(t *testing.T) {
	h := writeHub(t)
	w := openWriteBack(t, h, writeDir(t))
	t.Cleanup(w.Close)
	if _, err := w.Create(context.Background(), mountRoot{RootID: "r"}, "/x"); err != errNoFolder {
		t.Fatalf("err %v", err)
	}
}

func TestCreateOverExistingIsRefused(t *testing.T) {
	h := writeHub(t)
	h.set("r", "f1", "/a.txt", "x")
	w := openWriteBack(t, h, writeDir(t))
	t.Cleanup(w.Close)
	if _, err := w.Create(context.Background(), writeRoot, "/a.txt"); err != errExists {
		t.Fatalf("err %v", err)
	}
}

func TestEditStagesCurrentContentAndUploadsAgainstBaseRev(t *testing.T) {
	h := writeHub(t)
	h.set("r", "f1", "/a.txt", "abcdef")
	w := openWriteBack(t, h, writeDir(t))
	t.Cleanup(w.Close)
	changes := observe(w)
	handle, err := w.OpenWrite(context.Background(), writeRoot, "/a.txt", false)
	if err != nil {
		t.Fatal(err)
	}
	writeAll(t, handle, 1, "XY")
	handle.Close()
	until(t, changes, "upload", func() bool { got, _ := h.content("/a.txt"); return got == "aXYdef" })
	if h.revOf("/a.txt") != 2 {
		t.Fatalf("rev %d", h.revOf("/a.txt"))
	}
}

func TestTruncatingOpenStartsEmpty(t *testing.T) {
	h := writeHub(t)
	h.set("r", "f1", "/a.txt", "abcdef")
	w := openWriteBack(t, h, writeDir(t))
	t.Cleanup(w.Close)
	changes := observe(w)
	handle, err := w.OpenWrite(context.Background(), writeRoot, "/a.txt", true)
	if err != nil {
		t.Fatal(err)
	}
	writeAll(t, handle, 0, "z")
	handle.Close()
	until(t, changes, "upload", func() bool { got, _ := h.content("/a.txt"); return got == "z" })
}

func TestSealedWriteSurvivesRestartAndUploadsAtStart(t *testing.T) {
	h := writeHub(t)
	dir := writeDir(t)
	first := openWriteBack(t, h, dir)
	goOffline(t, first)
	handle, err := first.Create(context.Background(), writeRoot, "/kept.txt")
	if err != nil {
		t.Fatal(err)
	}
	writeAll(t, handle, 0, "durable")
	handle.Close()
	if first.Pending(writeRoot) != 1 {
		t.Fatalf("pending %d", first.Pending(writeRoot))
	}
	first.Close()
	if got, ok := h.content("/kept.txt"); ok {
		t.Fatalf("uploaded while offline: %q", got)
	}
	second := openWriteBack(t, h, dir)
	t.Cleanup(second.Close)
	changes := observe(second)
	if second.Pending(writeRoot) != 1 {
		t.Fatalf("replayed pending %d", second.Pending(writeRoot))
	}
	until(t, changes, "replayed upload", func() bool { got, _ := h.content("/kept.txt"); return got == "durable" })
	until(t, changes, "pending to clear", func() bool { return second.Pending(writeRoot) == 0 })
}

func TestWriteNotClosedBeforeStopIsDroppedAtStart(t *testing.T) {
	h := writeHub(t)
	dir := writeDir(t)
	first := openWriteBack(t, h, dir)
	handle, err := first.Create(context.Background(), writeRoot, "/half.txt")
	if err != nil {
		t.Fatal(err)
	}
	writeAll(t, handle, 0, "partial")
	first.Close()
	second := openWriteBack(t, h, dir)
	t.Cleanup(second.Close)
	if second.Pending(writeRoot) != 0 || len(journalFiles(t, dir)) != 0 {
		t.Fatalf("pending %d journal %v", second.Pending(writeRoot), journalFiles(t, dir))
	}
	if _, ok := h.content("/half.txt"); ok {
		t.Fatal("half a file reached the hub")
	}
}

func TestInterruptedUploadResumesFromTheHubOffset(t *testing.T) {
	h := writeHub(t)
	dir := writeDir(t)
	first := openWriteBack(t, h, dir)
	goOffline(t, first)
	handle, err := first.Create(context.Background(), writeRoot, "/big.bin")
	if err != nil {
		t.Fatal(err)
	}
	writeAll(t, handle, 0, "0123456789")
	handle.Close()
	first.Close()
	j, err := openJournal(filepath.Join(dir, "journal"))
	if err != nil {
		t.Fatal(err)
	}
	records, err := j.load()
	if err != nil || len(records) != 1 {
		t.Fatalf("records %v %v", records, err)
	}
	records[0].Location = "/drive/uploads/1"
	if err := j.save(records[0]); err != nil {
		t.Fatal(err)
	}
	h.uploads["1"] = &stubUpload{target: "/big.bin", length: 10, data: []byte("01234")}
	second := openWriteBack(t, h, dir)
	t.Cleanup(second.Close)
	changes := observe(second)
	until(t, changes, "resumed upload", func() bool { got, _ := h.content("/big.bin"); return got == "0123456789" })
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.patches) != 1 || h.patches[0] != 5 {
		t.Fatalf("patch offsets %v", h.patches)
	}
}

func TestPendingFileIsListedAndReadableBeforeItUploads(t *testing.T) {
	h := writeHub(t)
	w := openWriteBack(t, h, writeDir(t))
	t.Cleanup(w.Close)
	goOffline(t, w)
	handle, err := w.Create(context.Background(), writeRoot, "/n.txt")
	if err != nil {
		t.Fatal(err)
	}
	writeAll(t, handle, 0, "abc")
	handle.Close()
	items, err := w.List(context.Background(), writeRoot, "/")
	if err != nil || len(items) != 1 || items[0].Name != "n.txt" || items[0].Size != 3 {
		t.Fatalf("items %v err %v", items, err)
	}
	buf := make([]byte, 8)
	n, err := w.ReadAt(context.Background(), writeRoot, "/n.txt", 0, buf)
	if err != nil || string(buf[:n]) != "abc" {
		t.Fatalf("read %q %v", buf[:n], err)
	}
	if size, ok := w.Size(writeRoot, "/n.txt"); !ok || size != 3 {
		t.Fatalf("size %d %v", size, ok)
	}
}

func TestReopeningAPendingFileContinuesTheSameWrite(t *testing.T) {
	h := writeHub(t)
	w := openWriteBack(t, h, writeDir(t))
	t.Cleanup(w.Close)
	changes := observe(w)
	goOffline(t, w)
	first, err := w.Create(context.Background(), writeRoot, "/n.txt")
	if err != nil {
		t.Fatal(err)
	}
	writeAll(t, first, 0, "ab")
	first.Close()
	second, err := w.OpenWrite(context.Background(), writeRoot, "/n.txt", false)
	if err != nil {
		t.Fatal(err)
	}
	writeAll(t, second, 2, "c")
	second.Close()
	w.SetReachable(true)
	until(t, changes, "upload", func() bool { got, _ := h.content("/n.txt"); return got == "abc" })
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.uploads) != 1 {
		t.Fatalf("uploads %d", len(h.uploads))
	}
}

func TestOpeningForWriteWithoutWritingUploadsNothing(t *testing.T) {
	h := writeHub(t)
	h.set("r", "f1", "/a.txt", "abc")
	w := openWriteBack(t, h, writeDir(t))
	t.Cleanup(w.Close)
	handle, err := w.OpenWrite(context.Background(), writeRoot, "/a.txt", false)
	if err != nil {
		t.Fatal(err)
	}
	if w.Pending(writeRoot) != 1 {
		t.Fatalf("pending while open %d", w.Pending(writeRoot))
	}
	handle.Close()
	if w.Pending(writeRoot) != 0 {
		t.Fatalf("pending after close %d", w.Pending(writeRoot))
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.uploads) != 0 {
		t.Fatalf("uploads %d", len(h.uploads))
	}
}

func TestDirectoryCannotBeOpenedForWrite(t *testing.T) {
	h := writeHub(t)
	h.set("r", "f1", "/d/a.txt", "abc")
	w := openWriteBack(t, h, writeDir(t))
	t.Cleanup(w.Close)
	if _, err := w.OpenWrite(context.Background(), writeRoot, "/d", false); err != errIsDir {
		t.Fatalf("err %v", err)
	}
}
