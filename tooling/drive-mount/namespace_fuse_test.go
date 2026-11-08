//go:build linux

package main

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/integration/fakehub"
)

func mountFake(t *testing.T, h *fakehub.Hub) (string, *writeBack) {
	t.Helper()
	requireFuse(t)
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	set := newMountSet(w, newReporter(&lockedBuffer{}))
	t.Cleanup(func() { set.closeAll() })
	return mountAt(t, set, "a", writeRoot), w
}

func saveFile(t *testing.T, name, content string) {
	t.Helper()
	f, err := os.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.WriteString(content); err != nil {
		t.Fatal(err)
	}
	if err := f.Sync(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
}

func readNow(t *testing.T, name string) string {
	t.Helper()
	data, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func settled(t *testing.T, w *writeBack) {
	t.Helper()
	eventually(t, "uploads to finish", func() bool { return w.Pending(writeRoot) == 0 })
}

func TestEditorSavePatternWritesTempFsyncsAndRenamesOver(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/doc.txt", "version one")
	point, w := mountFake(t, h)
	if got := readNow(t, filepath.Join(point, "doc.txt")); got != "version one" {
		t.Fatalf("first read %q", got)
	}
	for _, next := range []string{"version two", "version three"} {
		saveFile(t, filepath.Join(point, ".doc.txt.swp"), next)
		if err := os.Rename(filepath.Join(point, ".doc.txt.swp"), filepath.Join(point, "doc.txt")); err != nil {
			t.Fatal(err)
		}
		if got := readNow(t, filepath.Join(point, "doc.txt")); got != next {
			t.Fatalf("read after save %q want %q", got, next)
		}
	}
	settled(t, w)
	eventually(t, "the hub to hold the last save", func() bool { got, _ := h.Content("/doc.txt"); return got == "version three" })
	if names := h.Names("/"); len(names) != 1 {
		t.Fatalf("hub names %v", names)
	}
	if got := readNow(t, filepath.Join(point, "doc.txt")); got != "version three" {
		t.Fatalf("read after upload %q", got)
	}
}

func TestEditorBackupPatternRenamesTheOriginalAndWritesAFreshFile(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/notes.md", "original")
	point, w := mountFake(t, h)
	if err := os.Rename(filepath.Join(point, "notes.md"), filepath.Join(point, "notes.md~")); err != nil {
		t.Fatal(err)
	}
	saveFile(t, filepath.Join(point, "notes.md"), "edited")
	settled(t, w)
	eventually(t, "both files on the hub", func() bool {
		backup, _ := h.Content("/notes.md~")
		fresh, _ := h.Content("/notes.md")
		return backup == "original" && fresh == "edited"
	})
}

func TestOfficeStyleLockFileSave(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/report.odt", "draft")
	point, w := mountFake(t, h)
	lock := filepath.Join(point, ".~lock.report.odt#")
	saveFile(t, lock, ",user,host,07.11.2026;")
	saveFile(t, filepath.Join(point, "report.odt.tmp"), "final")
	if err := os.Rename(filepath.Join(point, "report.odt.tmp"), filepath.Join(point, "report.odt")); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(lock); err != nil {
		t.Fatal(err)
	}
	settled(t, w)
	eventually(t, "the saved document and no lock", func() bool {
		got, _ := h.Content("/report.odt")
		return got == "final" && !h.Exists("/.~lock.report.odt#") && !h.Exists("/report.odt.tmp")
	})
	if _, err := os.Stat(lock); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("lock still visible: %v", err)
	}
}

func TestTruncateThroughTheMount(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/t.txt", "abcdef")
	point, w := mountFake(t, h)
	name := filepath.Join(point, "t.txt")
	if err := os.Truncate(name, 3); err != nil {
		t.Fatal(err)
	}
	if info, err := os.Stat(name); err != nil || info.Size() != 3 {
		t.Fatalf("stat %v %v", info, err)
	}
	f, err := os.OpenFile(name, os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Truncate(1); err != nil {
		t.Fatal(err)
	}
	if _, err := f.WriteAt([]byte("Z"), 3); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	settled(t, w)
	eventually(t, "truncated content", func() bool { got, _ := h.Content("/t.txt"); return got == "a\x00\x00Z" })
	if err := os.WriteFile(name, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	settled(t, w)
	eventually(t, "emptied", func() bool { got, ok := h.Content("/t.txt"); return ok && got == "" })
}

func TestDirectoriesThroughTheMount(t *testing.T) {
	h := fakehub.New(t)
	point, w := mountFake(t, h)
	if err := os.MkdirAll(filepath.Join(point, "a"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(point, "a", "b"), 0o755); err != nil {
		t.Fatal(err)
	}
	saveFile(t, filepath.Join(point, "a", "b", "f.txt"), "deep")
	settled(t, w)
	if err := os.Remove(filepath.Join(point, "a", "b")); !errors.Is(err, syscall.ENOTEMPTY) {
		t.Fatalf("rmdir full: %v", err)
	}
	if err := os.Rename(filepath.Join(point, "a"), filepath.Join(point, "c")); err != nil {
		t.Fatal(err)
	}
	if got := readNow(t, filepath.Join(point, "c", "b", "f.txt")); got != "deep" {
		t.Fatalf("read after directory rename %q", got)
	}
	eventually(t, "hub paths", func() bool { got, _ := h.Content("/c/b/f.txt"); return got == "deep" && !h.Exists("/a") })
	if err := os.Remove(filepath.Join(point, "c", "b", "f.txt")); err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(filepath.Join(point, "c")); err != nil {
		t.Fatal(err)
	}
	if h.Exists("/c") {
		t.Fatal("directory left on the hub")
	}
}

func TestRenameFlagsAndAttributeChangesAreHandled(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/one.txt", "1")
	h.Put("/two.txt", "2")
	point, w := mountFake(t, h)
	if err := syscall.Rename(filepath.Join(point, "one.txt"), filepath.Join(point, "two.txt")); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(filepath.Join(point, "two.txt"), 0o600); err != nil {
		t.Fatalf("chmod %v", err)
	}
	if err := os.Chtimes(filepath.Join(point, "two.txt"), time.Now(), time.Now()); err != nil {
		t.Fatalf("chtimes %v", err)
	}
	settled(t, w)
	if got := readNow(t, filepath.Join(point, "two.txt")); got != "1" {
		t.Fatalf("read %q", got)
	}
}

func TestMountedEntriesAreOwnedByTheMountingUser(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/a.txt", "a")
	h.Mkdir("/d")
	point, _ := mountFake(t, h)
	for _, name := range []string{"a.txt", "d", "."} {
		info, err := os.Stat(filepath.Join(point, name))
		if err != nil {
			t.Fatal(err)
		}
		if owner := info.Sys().(*syscall.Stat_t); owner.Uid != uint32(os.Getuid()) || owner.Gid != uint32(os.Getgid()) {
			t.Fatalf("%s owned by %d:%d", name, owner.Uid, owner.Gid)
		}
	}
}
