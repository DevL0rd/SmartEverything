package main

import (
	"context"
	"testing"
	"time"
)

type testClock struct{ at time.Time }

func (c *testClock) now() time.Time { return c.at }

func agedFile(t *testing.T, size int) (*blockCache, *testClock, uint64, ReadHandle) {
	t.Helper()
	_, c, ino := oneFile(t, pattern(size))
	clock := &testClock{at: time.Unix(1_000_000, 0)}
	c.mu.Lock()
	c.now = clock.now
	c.mu.Unlock()
	return c, clock, ino, openFile(t, c, ino)
}

func sweep(t *testing.T, c *blockCache) {
	t.Helper()
	c.mu.Lock()
	err := c.evict()
	c.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
}

func TestCleanupRemovesBlocksUnusedForLongerThanTheMaxAge(t *testing.T) {
	c, clock, ino, h := agedFile(t, 4*testBlock)
	readAll(t, h, 0, 10)
	clock.at = clock.at.Add(30 * time.Minute)
	readAll(t, h, testBlock, 10)
	h.Release(context.Background())
	clock.at = clock.at.Add(31 * time.Minute)
	sweep(t, c)
	if present(c, ino, 0) || !present(c, ino, 1) {
		t.Fatal("only the block unused for more than an hour should be removed")
	}
}

func TestOpenFilesAreNeverRemoved(t *testing.T) {
	hub := newFakeHub()
	open := hub.file(hub.rootIno, "open.bin", pattern(2*testBlock))
	closed := hub.file(hub.rootIno, "closed.bin", pattern(2*testBlock))
	c, _ := attached(t, hub, cacheDirFor(t))
	clock := &testClock{at: time.Unix(1_000_000, 0)}
	c.mu.Lock()
	c.now = clock.now
	c.mu.Unlock()
	lookup(t, c, hub.rootIno, "open.bin")
	lookup(t, c, hub.rootIno, "closed.bin")
	held := openFile(t, c, open)
	other := openFile(t, c, closed)
	readAll(t, held, 0, 10)
	readAll(t, other, 0, 10)
	other.Release(context.Background())
	clock.at = clock.at.Add(2 * time.Hour)
	sweep(t, c)
	if !present(c, open, 0) || present(c, closed, 0) {
		t.Fatal("the open file must stay while the closed one leaves")
	}
	held.Release(context.Background())
	sweep(t, c)
	if present(c, open, 0) {
		t.Fatal("the file should leave once it is closed")
	}
}

func TestUploadingFilesAreNeverRemoved(t *testing.T) {
	c, clock, ino, h := agedFile(t, 2*testBlock)
	readAll(t, h, 0, 10)
	h.Release(context.Background())
	done := c.Hold(ino)
	clock.at = clock.at.Add(2 * time.Hour)
	sweep(t, c)
	if !present(c, ino, 0) {
		t.Fatal("a file held for an upload must stay")
	}
	done()
	done()
	sweep(t, c)
	if present(c, ino, 0) {
		t.Fatal("the file should leave once the upload no longer holds it")
	}
}

func TestPolicyChangeAppliesToTheRunningCache(t *testing.T) {
	c, clock, ino, h := agedFile(t, 4*testBlock)
	readAll(t, h, 0, 10)
	h.Release(context.Background())
	clock.at = clock.at.Add(10 * time.Minute)
	if err := c.SetPolicy(cachePolicy{maxBytes: noLimit, maxAge: 5 * time.Minute, every: time.Minute}); err != nil {
		t.Fatal(err)
	}
	if present(c, ino, 0) {
		t.Fatal("a shorter max age should apply at once")
	}
	if err := c.SetPolicy(cachePolicy{maxBytes: noLimit, maxAge: 0, every: time.Minute}); err == nil {
		t.Fatal("a zero max age should be refused")
	}
}

func TestEvictionAnnouncesTheRootThatLostBlocks(t *testing.T) {
	c, clock, _, h := agedFile(t, 2*testBlock)
	readAll(t, h, 0, 10)
	h.Release(context.Background())
	got := make(chan string, 4)
	c.OnEvict(func(root string) { got <- root })
	clock.at = clock.at.Add(2 * time.Hour)
	if err := c.SetPolicy(defaultPolicy); err != nil {
		t.Fatal(err)
	}
	select {
	case root := <-got:
		if root == "" {
			t.Fatal("the announced root is empty")
		}
	case <-time.After(time.Second):
		t.Fatal("no eviction announced")
	}
}
