//go:build linux

package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func mountWritable(t *testing.T, h *stubHub) (string, *writeBack, *lockedBuffer) {
	t.Helper()
	requireFuse(t)
	files := newFS(t, h)
	out := &lockedBuffer{}
	set := newMountSet(files, newReporter(out))
	t.Cleanup(func() { set.closeAll() })
	return mountAt(t, set, "a", writeRoot), files, out
}

func eventually(t *testing.T, what string, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !ok() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestMountedWritesReachTheHubAndStatusIsWritable(t *testing.T) {
	h := writeHub(t)
	h.set("r", "f1", "/old.txt", "old content")
	point, _, out := mountWritable(t, h)
	if err := os.WriteFile(filepath.Join(point, "fresh.txt"), []byte("fresh bytes"), 0o644); err != nil {
		t.Fatal(err)
	}
	edit, err := os.OpenFile(filepath.Join(point, "old.txt"), os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := edit.WriteAt([]byte("new"), 0); err != nil {
		t.Fatal(err)
	}
	if err := edit.Close(); err != nil {
		t.Fatal(err)
	}
	eventually(t, "uploads", func() bool {
		fresh, _ := h.content("/fresh.txt")
		old, _ := h.content("/old.txt")
		return fresh == "fresh bytes" && old == "new content"
	})
	eventually(t, "kernel view to refresh", func() bool {
		data, err := os.ReadFile(filepath.Join(point, "old.txt"))
		return err == nil && string(data) == "new content"
	})
	info, err := os.Stat(filepath.Join(point, "fresh.txt"))
	if err != nil || info.Size() != 11 || info.Mode().Perm()&0o200 == 0 {
		t.Fatalf("stat %v %v", info, err)
	}
	eventually(t, "the waiting count to clear", func() bool {
		log := out.String()
		for _, want := range []string{`"readOnly":false`, `"pendingUploads":1`, `"pendingUploads":0`} {
			if !strings.Contains(log, want) {
				return false
			}
		}
		return true
	})
}

func TestMountedFileIsListedAndReadWhileWaitingToUpload(t *testing.T) {
	h := writeHub(t)
	point, files, _ := mountWritable(t, h)
	if _, err := os.ReadDir(point); err != nil {
		t.Fatal(err)
	}
	files.SetReachable(false)
	if err := os.WriteFile(filepath.Join(point, "queued.txt"), []byte("queued"), 0o644); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(point, "queued.txt"))
	if err != nil || string(data) != "queued" {
		t.Fatalf("read %q %v", data, err)
	}
	entries, err := os.ReadDir(point)
	if err != nil || len(entries) != 1 || entries[0].Name() != "queued.txt" {
		t.Fatalf("entries %v %v", entries, err)
	}
	if _, ok := h.content("/queued.txt"); ok {
		t.Fatal("uploaded while offline")
	}
	files.SetReachable(true)
	eventually(t, "upload after reconnect", func() bool { got, _ := h.content("/queued.txt"); return got == "queued" })
}
