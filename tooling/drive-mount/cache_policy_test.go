package main

import (
	"testing"
	"time"
)

type testClock struct{ at time.Time }

func (c *testClock) now() time.Time { return c.at }

func agedCache(t *testing.T, files map[string][]byte) (*blockCache, *testClock) {
	t.Helper()
	c := newTestCache(t, newFake(files), cacheDirFor(t))
	clock := &testClock{at: time.Unix(1_000_000, 0)}
	c.mu.Lock()
	c.now = clock.now
	c.mu.Unlock()
	return c, clock
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
	size := int64(4 * testBlock)
	c, clock := agedCache(t, map[string][]byte{"/a.bin": pattern(int(size))})
	readAll(t, c, "/a.bin", 0, 10)
	clock.at = clock.at.Add(30 * time.Minute)
	readAll(t, c, "/a.bin", testBlock, 10)
	clock.at = clock.at.Add(31 * time.Minute)
	sweep(t, c)
	if present(c, "/a.bin", size, 0) || !present(c, "/a.bin", size, 1) {
		t.Fatal("only the block unused for more than an hour should be removed")
	}
}

func TestOpenFilesAreNeverRemoved(t *testing.T) {
	size := int64(2 * testBlock)
	c, clock := agedCache(t, map[string][]byte{"/open.bin": pattern(int(size)), "/closed.bin": pattern(int(size))})
	readAll(t, c, "/open.bin", 0, 10)
	readAll(t, c, "/closed.bin", 0, 10)
	release := c.Hold(testRoot, "/open.bin")
	clock.at = clock.at.Add(2 * time.Hour)
	sweep(t, c)
	if !present(c, "/open.bin", size, 0) || present(c, "/closed.bin", size, 0) {
		t.Fatal("the open file must stay while the closed one leaves")
	}
	release()
	sweep(t, c)
	if present(c, "/open.bin", size, 0) {
		t.Fatal("the file should leave once it is closed")
	}
}

func TestPolicyChangeAppliesToTheRunningCache(t *testing.T) {
	size := int64(4 * testBlock)
	c, clock := agedCache(t, map[string][]byte{"/a.bin": pattern(int(size))})
	readAll(t, c, "/a.bin", 0, 10)
	clock.at = clock.at.Add(10 * time.Minute)
	if err := c.SetPolicy(cachePolicy{maxBytes: noLimit, maxAge: 5 * time.Minute, every: time.Minute}); err != nil {
		t.Fatal(err)
	}
	if present(c, "/a.bin", size, 0) {
		t.Fatal("a shorter max age should apply at once")
	}
	if err := c.SetPolicy(cachePolicy{maxBytes: noLimit, maxAge: 0, every: time.Minute}); err == nil {
		t.Fatal("a zero max age should be refused")
	}
}
