package main

import (
	"context"
	"errors"
	"syscall"
	"testing"

	"github.com/smarteverything/drive-mount/wire"
)

type hubCopy struct {
	hub *wbHub
	src uint64
}

func (c hubCopy) ino() uint64 { return c.src }

func (c hubCopy) copyInto(_ context.Context, meta func(handle uint64) wire.Meta) (wire.Reply, error) {
	m := meta(7)
	if handle, _ := m.Uint(wire.KeySrcHandle); handle != 7 {
		c.hub.t.Errorf("source handle %d", handle)
	}
	commit, _ := m.Uint(wire.KeyCommit)
	srcOff, _ := m.Uint(wire.KeyOffset)
	dstOff, _ := m.Uint(wire.KeyDstOffset)
	length, _ := m.Uint(wire.KeyLength)
	c.hub.mu.Lock()
	defer c.hub.mu.Unlock()
	c.hub.ops = append(c.hub.ops, "COPY")
	data := c.hub.nodes[c.src].data
	if srcOff >= uint64(len(data)) {
		return wire.Reply{Meta: wire.Meta{wire.KeyCopied: uint64(0)}}, nil
	}
	chunk := append([]byte(nil), data[srcOff:min(srcOff+length, uint64(len(data)))]...)
	k := c.hub.commits[commit]
	k.chunks[dstOff] = chunk
	k.got.add(dstOff, dstOff+uint64(len(chunk)))
	return wire.Reply{Meta: wire.Meta{wire.KeyCopied: uint64(len(chunk))}}, nil
}

func TestServerCopyReplacesRangeWithoutUploadingBytes(t *testing.T) {
	r := newWbRig(t)
	r.online()
	src := r.hub.addFile(1, "src", "0123456789")
	dst := r.hub.addFile(1, "dst", "abcdefghij")
	h := r.openExisting(dst, false)
	s := r.w.sessionOf(dst)
	copied, err := s.copyFrom(wbCtx, hubCopy{r.hub, src}, 2, 4, 3)
	if err != nil || copied != 3 {
		t.Fatalf("copy: %d %v", copied, err)
	}
	if got := r.hub.content(dst); got != "abcd234hij" {
		t.Fatalf("hub content %q", got)
	}
	if got := wbReadAll(t, h); got != "abcd234hij" {
		t.Fatalf("local read %q", got)
	}
	if r.hub.written != 0 || r.hub.count("WRITE") != 0 {
		t.Fatalf("bytes travelled: %d", r.hub.written)
	}
	wbPut(t, h, 0, "ZZ")
	if err := h.Close(); err != nil {
		t.Fatal(err)
	}
	r.drain()
	if got := r.hub.content(dst); got != "ZZcd234hij" {
		t.Fatalf("after later write %q", got)
	}
}

func TestServerCopyExtendsTheFile(t *testing.T) {
	r := newWbRig(t)
	r.online()
	src := r.hub.addFile(1, "src", "XYZ")
	dst := r.hub.addFile(1, "dst", "ab")
	h := r.openExisting(dst, false)
	s := r.w.sessionOf(dst)
	if copied, err := s.copyFrom(wbCtx, hubCopy{r.hub, src}, 0, 5, 3); err != nil || copied != 3 {
		t.Fatalf("copy: %d %v", copied, err)
	}
	if got := r.hub.content(dst); got != "ab\x00\x00\x00XYZ" {
		t.Fatalf("hub content %q", got)
	}
	if h.Size() != 8 {
		t.Fatalf("size %d", h.Size())
	}
	_ = h.Close()
}

func TestServerCopyIsDeclinedWhenLocalWritesArePending(t *testing.T) {
	r := newWbRig(t)
	r.online()
	src := r.hub.addFile(1, "src", "SRC")
	dst := r.hub.addFile(1, "dst", "dst")
	h := r.openExisting(dst, false)
	wbPut(t, h, 0, "X")
	s := r.w.sessionOf(dst)
	if _, err := s.copyFrom(wbCtx, hubCopy{r.hub, src}, 0, 0, 3); !errors.Is(err, syscall.EOPNOTSUPP) {
		t.Fatalf("pending writes: %v", err)
	}
	if r.hub.count("BEGIN") != 0 {
		t.Fatal("a commit was begun")
	}
	_ = h.Close()
}

func TestServerCopyIsDeclinedOfflineAndWithinOneFile(t *testing.T) {
	r := newWbRig(t)
	r.online()
	src := r.hub.addFile(1, "src", "SRC")
	dst := r.hub.addFile(1, "dst", "dst")
	h := r.openExisting(dst, false)
	s := r.w.sessionOf(dst)
	r.w.SetReachable(false)
	if _, err := s.copyFrom(wbCtx, hubCopy{r.hub, src}, 0, 0, 3); !errors.Is(err, syscall.EOPNOTSUPP) {
		t.Fatalf("offline: %v", err)
	}
	r.online()
	if _, err := s.copyFrom(wbCtx, hubCopy{r.hub, dst}, 0, 0, 3); !errors.Is(err, syscall.EOPNOTSUPP) {
		t.Fatalf("same file: %v", err)
	}
	_ = h.Close()
}

func TestServerCopyAbortsTheCommitWhenTheHubFails(t *testing.T) {
	r := newWbRig(t)
	r.online()
	src := r.hub.addFile(1, "src", "SRC")
	dst := r.hub.addFile(1, "dst", "dst")
	h := r.openExisting(dst, false)
	s := r.w.sessionOf(dst)
	aborted := errors.New("aborted")
	var aborts int
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		switch op {
		case wire.OpEnd:
			return wbRemote(wire.ErrENOSPC)
		case wire.OpAbort:
			aborts++
			return aborted
		}
		return nil
	}
	_, err := s.copyFrom(wbCtx, hubCopy{r.hub, src}, 0, 0, 3)
	if err == nil || errors.Is(err, syscall.EOPNOTSUPP) || !errors.Is(err, aborted) {
		t.Fatalf("expected the hub failure and the abort, got %v", err)
	}
	if aborts != 1 {
		t.Fatalf("aborts %d", aborts)
	}
	r.hub.before = nil
	_ = h.Close()
}
