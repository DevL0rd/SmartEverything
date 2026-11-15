package main

import (
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

func TestSetattrSizeTruncatesLocallyAndCommitsLater(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "t", "0123456789")
	attr, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: ino, Valid: wire.SetattrValidSize, Size: 4})
	if err != nil {
		t.Fatal(err)
	}
	if attr.Size != 4 {
		t.Fatalf("attr size %d", attr.Size)
	}
	r.drain()
	if got := r.hub.content(ino); got != "0123" {
		t.Fatalf("hub %q", got)
	}
}

func TestSetattrSizeToZeroIsOnePut(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "t", "0123456789")
	if _, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: ino, Valid: wire.SetattrValidSize, Size: 0}); err != nil {
		t.Fatal(err)
	}
	r.drain()
	if r.hub.content(ino) != "" || r.hub.count("PUT") != 1 || r.hub.count("BEGIN") != 0 {
		t.Fatalf("ops %v content %q", r.hub.ops, r.hub.content(ino))
	}
}

func TestSetattrSizeToTheSameSizeStillCommitsToUpdateTimes(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "t", "abc")
	before := r.hub.rev(ino)
	if _, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: ino, Valid: wire.SetattrValidSize, Size: 3}); err != nil {
		t.Fatal(err)
	}
	r.drain()
	wbEventually(t, "commit", func() bool { return r.hub.rev(ino) > before })
	if r.hub.content(ino) != "abc" {
		t.Fatal("content changed")
	}
}

func TestSetattrModeGoesStraightToTheHub(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "t", "abc")
	attr, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: ino, Valid: wire.SetattrValidMode, Mode: 0o755})
	if err != nil || attr.Mode != 0o755 {
		t.Fatalf("%v %o", err, attr.Mode)
	}
	if r.hub.count("PUT")+r.hub.count("BEGIN") != 0 {
		t.Fatal("a mode change cost a commit")
	}
}

func TestSetattrSizeAndMtimeApplyInOrder(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "t", "abcdef")
	stamp := time.Unix(2_000_000, 0)
	attr, err := r.w.Setattr(wbCtx, SetattrArgs{Ino: ino, Valid: wire.SetattrValidSize, Size: 2, Mtime: TimeSpec{Set: true, At: stamp}})
	if err != nil {
		t.Fatal(err)
	}
	if attr.Size != 2 || attr.MtimeNs != stamp.UnixNano() {
		t.Fatalf("attr %+v", attr)
	}
	r.drain()
	if r.hub.content(ino) != "ab" {
		t.Fatal("size")
	}
	r.hub.mu.Lock()
	m := r.hub.nodes[ino].mtime
	r.hub.mu.Unlock()
	if m != stamp.UnixNano() {
		t.Fatalf("mtime %d", m)
	}
}

func TestOpenWithTruncateEmptiesTheView(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "t", "old content")
	h := r.openExisting(ino, true)
	if h.Size() != 0 {
		t.Fatalf("size %d", h.Size())
	}
	wbPut(t, h, 0, "new")
	h.Close()
	r.drain()
	if r.hub.content(ino) != "new" {
		t.Fatalf("hub %q", r.hub.content(ino))
	}
}
