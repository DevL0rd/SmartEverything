//go:build linux

package main

import (
	"context"
	"fmt"
	"testing"

	"github.com/smarteverything/drive-mount/integration/fakehub"
)

func TestTruncateByPathShrinksEmptiesAndExtendsOnTheHub(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/t.txt", "abcdef")
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	ctx := context.Background()
	steps := []struct {
		size int64
		want string
	}{{3, "abc"}, {6, "abc\x00\x00\x00"}, {0, ""}}
	for _, step := range steps {
		if err := w.Truncate(ctx, writeRoot, "/t.txt", step.size); err != nil {
			t.Fatal(err)
		}
		awaitHub(t, w, fmt.Sprintf("truncated content %d", step.size), hubHas(h, "/t.txt", step.want))
		awaitHub(t, w, "pending to clear", func() bool { return w.Pending(writeRoot) == 0 })
	}
}

func TestTruncateToTheCurrentSizeUploadsNothing(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/t.txt", "abc")
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	if err := w.Truncate(context.Background(), writeRoot, "/t.txt", 3); err != nil {
		t.Fatal(err)
	}
	if w.Pending(writeRoot) != 0 || opCount(h, "upload") != 0 {
		t.Fatalf("pending %d ops %v", w.Pending(writeRoot), h.Ops())
	}
}

func TestTruncateThroughAnOpenHandleKeepsLaterWrites(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/t.txt", "abcdef")
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	handle, err := w.OpenWrite(context.Background(), writeRoot, "/t.txt", false)
	if err != nil {
		t.Fatal(err)
	}
	if err := handle.Truncate(2); err != nil {
		t.Fatal(err)
	}
	if size, live := w.Size(writeRoot, "/t.txt"); !live || size != 2 {
		t.Fatalf("size %d live %v", size, live)
	}
	writeAll(t, handle, 2, "XY")
	buf := make([]byte, 8)
	if n, err := handle.ReadAt(buf, 0); err != nil || string(buf[:n]) != "abXY" {
		t.Fatalf("read %q %v", buf[:n], err)
	}
	handle.Close()
	awaitHub(t, w, "content", hubHas(h, "/t.txt", "abXY"))
}

func TestTruncateOfAMissingFileIsRefused(t *testing.T) {
	h := fakehub.New(t)
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	if err := w.Truncate(context.Background(), writeRoot, "/none", 0); err == nil {
		t.Fatal("expected an error")
	}
}

func TestTruncatingOpenWithoutWritesEmptiesTheHubFile(t *testing.T) {
	h := fakehub.New(t)
	h.Put("/t.txt", "abcdef")
	w := openFake(t, h, writeDir(t))
	t.Cleanup(w.Close)
	handle, err := w.OpenWrite(context.Background(), writeRoot, "/t.txt", true)
	if err != nil {
		t.Fatal(err)
	}
	if err := handle.Close(); err != nil {
		t.Fatal(err)
	}
	awaitHub(t, w, "the emptied file", func() bool { got, ok := h.Content("/t.txt"); return ok && got == "" && h.Rev("/t.txt") == 2 })
}
