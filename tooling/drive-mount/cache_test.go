package main

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

const testBlock = 128 * 1024

func sizeLimit(bytes int64) cachePolicy {
	return cachePolicy{maxBytes: bytes, maxAge: time.Hour, every: time.Minute}
}

func oneFile(t *testing.T, content []byte) (*fakeHub, *blockCache, uint64) {
	t.Helper()
	hub := newFakeHub()
	hub.file(hub.rootIno, "big.bin", content)
	c, root := attached(t, hub, cacheDirFor(t))
	return hub, c, lookup(t, c, root.Ino, "big.bin").Ino
}

func TestMissFetchesWholeBlockThenServesFromCache(t *testing.T) {
	content := pattern(1 << 20)
	hub, c, ino := oneFile(t, content)
	h := openFile(t, c, ino)
	if !bytes.Equal(readAll(t, h, 5, 100), content[5:105]) {
		t.Fatal("content mismatch")
	}
	if hub.count(wire.OpRead) != 1 || hub.lastRead != testBlock {
		t.Fatalf("reads %d, last length %d", hub.count(wire.OpRead), hub.lastRead)
	}
	readAll(t, h, 200, 1000)
	if hub.count(wire.OpRead) != 1 {
		t.Fatalf("cached block fetched again: %d reads", hub.count(wire.OpRead))
	}
}

func TestReadAcrossBlocksAndEnd(t *testing.T) {
	content := pattern(testBlock*2 + 777)
	_, c, ino := oneFile(t, content)
	h := openFile(t, c, ino)
	if got := readAll(t, h, testBlock-10, 50); !bytes.Equal(got, content[testBlock-10:testBlock+40]) {
		t.Fatal("read across a block border differs")
	}
	if got := readAll(t, h, int64(len(content))-20, 100); !bytes.Equal(got, content[len(content)-20:]) {
		t.Fatal("read at the end differs")
	}
	if got := readAll(t, h, int64(len(content)), 10); len(got) != 0 {
		t.Fatalf("read past the end returned %d bytes", len(got))
	}
}

func TestBlocksLargerThanOnePayloadAreReadInParallelPieces(t *testing.T) {
	size := uint64(2) * 1024 * 1024 * 1024
	hub := newFakeHub()
	big := hub.generated(hub.rootIno, "huge.bin", size)
	c, _ := attached(t, hub, cacheDirFor(t))
	if blockSizeFor(int64(size)) <= wire.MaxPayloadBytes {
		t.Fatalf("block size %d should exceed one payload", blockSizeFor(int64(size)))
	}
	lookup(t, c, hub.rootIno, "huge.bin")
	h := openFile(t, c, big)
	got := readAll(t, h, 1<<20-8, 16)
	for i, b := range got {
		if b != generatedByte(uint64(1<<20-8+i)) {
			t.Fatalf("byte %d is %d", i, b)
		}
	}
	if pieces := hub.count(wire.OpRead); pieces != int(blockSizeFor(int64(size))/wire.MaxPayloadBytes) {
		t.Fatalf("block fetched in %d reads", pieces)
	}
}

func readOnce(t *testing.T, c *blockCache, ino uint64, off int64, n int) []byte {
	t.Helper()
	h, err := c.Open(context.Background(), ino)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Release(context.Background())
	return readAll(t, h, off, n)
}

func TestEvictionPunchesHolesLeastRecentlyReadFirst(t *testing.T) {
	content := pattern(testBlock * 4)
	_, c, ino := oneFile(t, content)
	readOnce(t, c, ino, 0, 10)
	readOnce(t, c, ino, testBlock, 10)
	readOnce(t, c, ino, testBlock*2, 10)
	if err := c.SetPolicy(sizeLimit(2 * testBlock)); err != nil {
		t.Fatal(err)
	}
	if present(c, ino, 0) || !present(c, ino, 1) || !present(c, ino, 2) {
		t.Fatal("the least recently read block should leave first")
	}
	readOnce(t, c, ino, testBlock*3, 10)
	sweep(t, c)
	if present(c, ino, 1) || !present(c, ino, 2) || !present(c, ino, 3) {
		t.Fatal("eviction should keep the newest blocks")
	}
	if got := readOnce(t, c, ino, 0, 100); !bytes.Equal(got, content[:100]) {
		t.Fatal("an evicted block must be fetched again with the right content")
	}
}

func TestPrefetchAfterTwoSequentialReads(t *testing.T) {
	content := pattern(testBlock * 6)
	_, c, ino := oneFile(t, content)
	h := openFile(t, c, ino)
	readAll(t, h, 0, testBlock)
	if present(c, ino, 1) {
		t.Fatal("the first read must not prefetch")
	}
	readAll(t, h, testBlock, testBlock)
	c.tasks.Wait()
	deadline := time.Now().Add(2 * time.Second)
	for !present(c, ino, 2) && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if !present(c, ino, 2) {
		t.Fatal("the block after two sequential reads should be prefetched")
	}
}

func withLive(t *testing.T, change func(*liveFields)) {
	t.Helper()
	before := live.load()
	next := before
	change(&next)
	live.store(next)
	t.Cleanup(func() { live.store(before) })
}

func waitPresent(t *testing.T, c *blockCache, ino uint64, idx int64) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for !present(c, ino, idx) && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if !present(c, ino, idx) {
		t.Fatalf("block %d never arrived", idx)
	}
}

func TestSequentialReadAheadFollowsTheLiveWindow(t *testing.T) {
	withLive(t, func(f *liveFields) { f.readAheadBytes = 3 * testBlock })
	content := pattern(testBlock * 12)
	_, c, ino := oneFile(t, content)
	h := openFile(t, c, ino)
	readAll(t, h, 0, testBlock)
	readAll(t, h, testBlock, testBlock)
	for idx := int64(2); idx <= 4; idx++ {
		waitPresent(t, c, ino, idx)
	}
	c.tasks.Wait()
	if present(c, ino, 5) {
		t.Fatal("read-ahead went past its window")
	}
	live.store(func() liveFields { f := live.load(); f.readAheadBytes = 6 * testBlock; return f }())
	readAll(t, h, 2*testBlock, testBlock)
	waitPresent(t, c, ino, 8)
}

func TestReadAheadOffFetchesNothingExtra(t *testing.T) {
	withLive(t, func(f *liveFields) { f.readAheadBytes = 0 })
	_, c, ino := oneFile(t, pattern(testBlock*6))
	h := openFile(t, c, ino)
	for i := int64(0); i < 3; i++ {
		readAll(t, h, i*testBlock, testBlock)
	}
	c.tasks.Wait()
	if present(c, ino, 3) {
		t.Fatal("read-ahead is off and block 3 was fetched")
	}
}

func TestSmallFilePrefetchOnlyWhenOnAndOnlyOneFrameOrLess(t *testing.T) {
	hub := newFakeHub()
	dir := hub.dir(hub.rootIno, "d")
	hub.file(dir, "small.txt", pattern(1000))
	hub.file(dir, "frame.bin", pattern(wire.MaxPayloadBytes))
	hub.file(dir, "large.bin", pattern(wire.MaxPayloadBytes+1))
	c, _ := attached(t, hub, cacheDirFor(t))
	list := func() {
		if _, err := c.Readdir(context.Background(), dir, 0); err != nil {
			t.Fatal(err)
		}
		c.tasks.Wait()
	}
	list()
	if hub.count(wire.OpRead) != 0 {
		t.Fatal("prefetch ran while off")
	}
	withLive(t, func(f *liveFields) { f.prefetchSmallFiles = true })
	c.mu.Lock()
	for _, in := range c.inodes {
		in.attrEpoch = 0
	}
	c.mu.Unlock()
	list()
	if got := hub.count(wire.OpRead); got != 2 {
		t.Fatalf("expected the small file and the one-frame file, got %d reads", got)
	}
}

func TestPinsAreWholeAndOutsideTheLimit(t *testing.T) {
	hub := newFakeHub()
	sub := hub.dir(hub.rootIno, "keep")
	a := hub.file(sub, "a.bin", pattern(testBlock*3+5))
	b := hub.file(sub, "b.bin", pattern(testBlock))
	other := hub.file(hub.rootIno, "other.bin", pattern(testBlock*2))
	c, root := attached(t, hub, cacheDirFor(t))
	if err := c.SetPolicy(sizeLimit(testBlock)); err != nil {
		t.Fatal(err)
	}
	if err := c.Pin(context.Background(), lookup(t, c, root.Ino, "keep").Ino); err != nil {
		t.Fatal(err)
	}
	for i := range int64(4) {
		if !present(c, a, i) {
			t.Fatalf("pinned block %d missing", i)
		}
	}
	if !present(c, b, 0) {
		t.Fatal("pinned file b missing")
	}
	otherIno := lookup(t, c, root.Ino, "other.bin").Ino
	readOnce(t, c, otherIno, 0, 10)
	readOnce(t, c, otherIno, testBlock, 10)
	sweep(t, c)
	if !present(c, a, 0) || !present(c, a, 3) || !present(c, b, 0) {
		t.Fatal("pinned blocks must stay outside the limit")
	}
	if present(c, other, 0) {
		t.Fatal("unpinned blocks must still be evicted to the limit")
	}
	if c.PinnedFiles(hub.root) != 2 || c.PinnedBytes(hub.root) != int64(testBlock*4+5) {
		t.Fatalf("pinned files %d, bytes %d", c.PinnedFiles(hub.root), c.PinnedBytes(hub.root))
	}
	if err := c.Unpin(context.Background(), lookup(t, c, root.Ino, "keep").Ino); err != nil {
		t.Fatal(err)
	}
	if c.PinnedFiles(hub.root) != 0 || present(c, a, 0) {
		t.Fatal("unpinned blocks should fall under the limit again")
	}
}

func TestOfflineServesCachedAndRefusesUncachedAtOnce(t *testing.T) {
	content := pattern(testBlock * 3)
	hub, c, ino := oneFile(t, content)
	h := openFile(t, c, ino)
	readAll(t, h, 0, 10)
	c.SetReachable(false)
	hub.setDown(wire.ErrNoRoute)
	if got := readAll(t, h, 20, 50); !bytes.Equal(got, content[20:70]) {
		t.Fatal("cached read while offline differs")
	}
	_, err := h.ReadAt(context.Background(), make([]byte, 10), testBlock*2)
	if !errors.Is(err, errOffline) {
		t.Fatalf("uncached read offline: %v", err)
	}
	reads := hub.count(wire.OpRead)
	if _, err := h.ReadAt(context.Background(), make([]byte, 10), testBlock*2); err == nil || hub.count(wire.OpRead) != reads {
		t.Fatal("offline reads must not touch the hub")
	}
}

func TestChangedFileDropsOldBlocksAndReadsNewContent(t *testing.T) {
	old := pattern(testBlock * 2)
	hub, c, ino := oneFile(t, old)
	h := openFile(t, c, ino)
	readAll(t, h, 0, 10)
	readAll(t, h, testBlock, 10)
	fresh := bytes.Repeat([]byte{9}, testBlock*2+3)
	hub.rewrite(ino, fresh)
	c.Changed(wire.Changed{Root: hub.root, Seq: 8, Inodes: []uint64{ino}})
	c.tasks.Wait()
	if got := readAll(t, h, 0, 20); !bytes.Equal(got, fresh[:20]) {
		t.Fatalf("read after a change returned old content")
	}
	if got := readAll(t, h, testBlock*2, 10); !bytes.Equal(got, fresh[testBlock*2:]) {
		t.Fatal("the grown tail is not readable")
	}
	c.mu.Lock()
	files := len(c.files)
	c.mu.Unlock()
	if files != 1 {
		t.Fatalf("%d cached file versions, want only the current one", files)
	}
}

func TestChangedPinnedFileIsPinnedAgainWithNewContent(t *testing.T) {
	hub, c, ino := oneFile(t, pattern(testBlock*2))
	if err := c.Pin(context.Background(), ino); err != nil {
		t.Fatal(err)
	}
	fresh := bytes.Repeat([]byte{3}, testBlock*2)
	hub.rewrite(ino, fresh)
	c.Changed(wire.Changed{Root: hub.root, Seq: 9, Inodes: []uint64{ino}})
	c.tasks.Wait()
	if !present(c, ino, 0) || !present(c, ino, 1) {
		t.Fatal("the changed pinned file was not fetched again")
	}
	h := openFile(t, c, ino)
	reads := hub.count(wire.OpRead)
	got := readAll(t, h, 0, 8)
	if !bytes.Equal(got, fresh[:8]) || hub.count(wire.OpRead) != reads {
		t.Fatalf("pinned new content should read locally: got %v, reads %d then %d", got, reads, hub.count(wire.OpRead))
	}
}

func TestBrokenCacheFolderIsRefused(t *testing.T) {
	dir := filepath.Join(cacheDirFor(t), "file")
	if err := os.WriteFile(dir, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	c := newBlockCache(newFakeHub(), dir)
	defer c.Close()
	if c.Ready() == nil {
		t.Fatal("a cache folder that is a file must be refused")
	}
	if _, err := c.Getattr(context.Background(), 1); err == nil {
		t.Fatal("a broken cache must refuse every call")
	}
}

func TestHolePunchProbeOnRealDirectory(t *testing.T) {
	dir := cacheDirFor(t)
	if err := checkHolePunch(dir); err != nil {
		t.Fatalf("probe failed on a normal directory: %v", err)
	}
	if left, _ := filepath.Glob(filepath.Join(dir, ".holecheck-*")); len(left) != 0 {
		t.Fatalf("probe left %v behind", left)
	}
}

func TestStatesSurviveARestartAndOldFormatIsDropped(t *testing.T) {
	content := pattern(testBlock * 2)
	hub, c, ino := oneFile(t, content)
	if err := c.Pin(context.Background(), ino); err != nil {
		t.Fatal(err)
	}
	dir := c.dir
	c.Close()
	again := newBlockCache(hub, dir)
	defer again.Close()
	if err := again.Ready(); err != nil {
		t.Fatal(err)
	}
	if !present(again, ino, 0) || !present(again, ino, 1) || again.PinnedFiles(hub.root) != 1 {
		t.Fatal("pinned blocks and the pin must survive a restart")
	}
	again.Close()
	if err := os.WriteFile(filepath.Join(dir, versionFile), []byte("1"), 0o600); err != nil {
		t.Fatal(err)
	}
	old := filepath.Join(dir, "blocks", "legacy.json")
	if err := os.WriteFile(old, []byte(`{"root":{"RootID":"x"},"path":"/a"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	fresh := newBlockCache(hub, dir)
	defer fresh.Close()
	if err := fresh.Ready(); err != nil {
		t.Fatalf("an old format cache must be dropped, not refused: %v", err)
	}
	if present(fresh, ino, 0) || fresh.PinnedFiles(hub.root) != 0 {
		t.Fatal("the old format cache should be gone")
	}
}

func TestOldPinsAreKeptThroughTheWipeAndRestoredOnMount(t *testing.T) {
	dir := cacheDirFor(t)
	hub := newFakeHub()
	hub.file(hub.rootIno, "a.txt", pattern(testBlock*2))
	seed := newBlockCache(hub, dir)
	seed.Close()
	if err := os.WriteFile(filepath.Join(dir, versionFile), []byte("1"), 0o600); err != nil {
		t.Fatal(err)
	}
	blocks := filepath.Join(dir, "blocks")
	states := map[string]string{
		"a.json": `{"root":{"RootID":"r","FolderID":"f"},"path":"/a.txt","pinned":true}`,
		"b.json": `{"root":{"RootID":"r","FolderID":"f"},"path":"/b.txt","pinned":false}`,
		"c.json": `{"root":{"RootID":"other","FolderID":"f"},"path":"/c.txt","pinned":true}`,
	}
	for name, body := range states {
		if err := os.WriteFile(filepath.Join(blocks, name), []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	c := newTestCache(t, hub, dir)
	if len(c.legacy) != 2 {
		t.Fatalf("both pinned files must be remembered across the wipe: %+v", c.legacy)
	}
	pins, err := readLegacyPins(c.legacyPinsPath())
	if err != nil || len(pins) != 2 {
		t.Fatalf("the remembered pins must be on disk: %v %+v", err, pins)
	}
	root, err := c.Attach(context.Background(), hub.placement)
	if err != nil {
		t.Fatal(err)
	}
	c.RestoreLegacyPins(mountRoot{RootID: "nobody", FolderID: "f"}, root.Ino)
	if len(c.legacy) != 2 {
		t.Fatal("pins of another mount must stay")
	}
	c.RestoreLegacyPins(mountRoot{RootID: "r", FolderID: "f"}, root.Ino)
	deadline := time.Now().Add(5 * time.Second)
	for c.PinnedFiles(hub.root) != 1 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if c.PinnedFiles(hub.root) != 1 {
		t.Fatal("the old pin must be kept offline again on mount")
	}
	for time.Now().Before(deadline) {
		left, _ := readLegacyPins(c.legacyPinsPath())
		if len(left) == 1 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	left, _ := readLegacyPins(c.legacyPinsPath())
	if len(left) != 1 || left[0].RootID != "other" {
		t.Fatalf("only the other mount's pin should remain: %+v", left)
	}
}

func TestDataFilesWithoutStateAreRemovedAtStart(t *testing.T) {
	dir := cacheDirFor(t)
	c := newBlockCache(newFakeHub(), dir)
	c.Close()
	orphan := filepath.Join(dir, "blocks", "deadbeef.data")
	if err := os.WriteFile(orphan, []byte("junk"), 0o600); err != nil {
		t.Fatal(err)
	}
	again := newBlockCache(newFakeHub(), dir)
	defer again.Close()
	if _, err := os.Stat(orphan); !os.IsNotExist(err) {
		t.Fatalf("orphan data file kept: %v", err)
	}
}

func TestParallelReadersOfOneBlockFetchItOnce(t *testing.T) {
	content := pattern(testBlock)
	hub, c, ino := oneFile(t, content)
	release := make(chan struct{})
	hub.mu.Lock()
	hub.readHook = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpRead {
			hub.mu.Unlock()
			<-release
			hub.mu.Lock()
		}
		return nil
	}
	hub.mu.Unlock()
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			h, err := c.Open(context.Background(), ino)
			if err != nil {
				t.Error(err)
				return
			}
			defer h.Release(context.Background())
			buf := make([]byte, 64)
			if _, err := h.ReadAt(context.Background(), buf, 3); err != nil || !bytes.Equal(buf, content[3:67]) {
				t.Errorf("read: %v", err)
			}
		}()
	}
	time.Sleep(50 * time.Millisecond)
	close(release)
	wg.Wait()
	if hub.count(wire.OpRead) != 1 {
		t.Fatalf("block fetched %d times", hub.count(wire.OpRead))
	}
}
