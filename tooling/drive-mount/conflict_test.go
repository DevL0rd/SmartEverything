//go:build linux

package main

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/integration/fakehub"
)

func TestConflictNameKeepsTheExtension(t *testing.T) {
	at := time.Date(2026, 11, 7, 3, 4, 5, 0, time.UTC)
	cases := []struct {
		name    string
		attempt int
		want    string
	}{
		{"report.docx", 0, "report.sync-conflict-20261107-030405-mount.docx"},
		{"notes", 0, "notes.sync-conflict-20261107-030405-mount"},
		{".bashrc", 0, ".bashrc.sync-conflict-20261107-030405-mount"},
		{"a.tar.gz", 1, "a.tar.sync-conflict-20261107-030405-mount-2.gz"},
	}
	for _, c := range cases {
		if got := conflictName(c.name, at, c.attempt); got != c.want {
			t.Errorf("%s: %q want %q", c.name, got, c.want)
		}
	}
}

func TestEditOnAStaleBaseIsKeptBesideTheNewerHubVersion(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/a.txt", "abcdef")
	dir := writeDir(t)
	w := openFake(t, h, dir)
	t.Cleanup(w.Close)
	changes := observe(w)
	handle, err := w.OpenWrite(context.Background(), writeRoot, "/a.txt", false)
	if err != nil {
		t.Fatal(err)
	}
	h.Edit("/a.txt", "hub changed it")
	writeAll(t, handle, 0, "Q")
	handle.Close()
	var copied string
	until(t, changes, "the conflict copy", func() bool {
		for _, name := range h.Names("/") {
			if strings.Contains(name, ".sync-conflict-") {
				copied = "/" + name
			}
		}
		return copied != "" && w.Pending(writeRoot) == 0
	})
	if got, _ := h.Content("/a.txt"); got != "hub changed it" {
		t.Fatalf("hub version overwritten: %q", got)
	}
	if got, _ := h.Content(copied); got != "Qbcdef" || !strings.HasSuffix(copied, "-mount.txt") {
		t.Fatalf("copy %s %q", copied, got)
	}
	if left := journalFiles(t, dir); len(left) != 0 {
		t.Fatalf("journal %v", left)
	}
}

func TestEditOfAFileDeletedOnTheHubIsKeptAsACopy(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/a.txt", "abc")
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	changes := observe(w)
	handle, err := w.OpenWrite(context.Background(), writeRoot, "/a.txt", false)
	if err != nil {
		t.Fatal(err)
	}
	if err := w.hub.remove(context.Background(), writeRoot, entry{ID: h.ID("/a.txt")}); err != nil {
		t.Fatal(err)
	}
	writeAll(t, handle, 0, "Z")
	handle.Close()
	until(t, changes, "the copy", func() bool { return len(h.Names("/")) == 1 && w.Pending(writeRoot) == 0 })
	copied := "/" + h.Names("/")[0]
	if got, _ := h.Content(copied); got != "Zbc" || !strings.Contains(copied, ".sync-conflict-") {
		t.Fatalf("copy %s %q", copied, got)
	}
	if h.Exists("/a.txt") {
		t.Fatal("the deleted file came back")
	}
}
