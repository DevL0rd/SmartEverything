package main

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

const testBlock = 128 * 1024

var testRoot = mountRoot{RootID: "roms", FolderID: "f1"}

type fakeSource struct {
	mu      sync.Mutex
	files   map[string][]byte
	reads   int
	lists   int
	lastLen int
}

func newFake(files map[string][]byte) *fakeSource { return &fakeSource{files: files} }

func (s *fakeSource) set(p string, content []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.files[p] = content
}

func (s *fakeSource) List(_ context.Context, _ mountRoot, dir string) ([]entry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lists++
	seen := map[string]entry{}
	for p, content := range s.files {
		prefix := strings.TrimSuffix(dir, "/") + "/"
		if !strings.HasPrefix(p, prefix) {
			continue
		}
		name, _, nested := strings.Cut(strings.TrimPrefix(p, prefix), "/")
		if nested {
			seen[name] = entry{Name: name, Dir: true}
		} else {
			seen[name] = entry{Name: name, Size: int64(len(content)), Etag: digest(string(content))}
		}
	}
	out := make([]entry, 0, len(seen))
	for _, e := range seen {
		out = append(out, e)
	}
	return out, nil
}

func (s *fakeSource) ReadAt(_ context.Context, _ mountRoot, p string, off int64, dst []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reads++
	s.lastLen = len(dst)
	return copy(dst, s.files[p][off:]), nil
}

func (s *fakeSource) Pin(context.Context, mountRoot, string) error   { return errPinUnsupported }
func (s *fakeSource) Unpin(context.Context, mountRoot, string) error { return errPinUnsupported }
func (s *fakeSource) Usage(mountRoot) int64                          { return 0 }

func (s *fakeSource) SetPolicy(cachePolicy) error { return nil }

func (s *fakeSource) Hold(mountRoot, string) func() { return func() {} }

func sizeLimit(bytes int64) cachePolicy {
	return cachePolicy{maxBytes: bytes, maxAge: time.Hour, every: time.Minute}
}

func (s *fakeSource) readCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.reads
}

func pattern(size int) []byte {
	out := make([]byte, size)
	for i := range out {
		out[i] = byte(i % 253)
	}
	return out
}

func cacheDirFor(t *testing.T) string {
	t.Helper()
	parent := filepath.Join("..", "..", "tmp", "drive-mounted-folders", "cache-test")
	dir := filepath.Join(parent, strings.ReplaceAll(t.Name(), "/", "_"))
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		os.RemoveAll(dir)
		os.Remove(parent)
	})
	return dir
}

func newTestCache(t *testing.T, up ContentSource, dir string) *blockCache {
	t.Helper()
	c := newBlockCache(up, dir)
	if err := c.Ready(); err != nil {
		t.Fatalf("cache not ready: %v", err)
	}
	t.Cleanup(c.Close)
	return c
}

func readAll(t *testing.T, c *blockCache, p string, off int64, n int) []byte {
	t.Helper()
	buf := make([]byte, n)
	got, err := c.ReadAt(context.Background(), testRoot, p, off, buf)
	if err != nil {
		t.Fatalf("read %s@%d: %v", p, off, err)
	}
	return buf[:got]
}

func present(c *blockCache, p string, size int64, idx int64) bool {
	e, err := c.stat(context.Background(), testRoot, p)
	if err != nil || e.Size != size {
		return false
	}
	f := c.fileFor(testRoot, p, e)
	c.mu.Lock()
	defer c.mu.Unlock()
	return f.has(idx)
}

func TestMissFetchesWholeBlockThenServesFromCache(t *testing.T) {
	content := pattern(1 << 20)
	up := newFake(map[string][]byte{"/big.bin": content})
	c := newTestCache(t, up, cacheDirFor(t))
	got := readAll(t, c, "/big.bin", 5, 100)
	if !bytes.Equal(got, content[5:105]) {
		t.Fatal("content mismatch")
	}
	if up.readCount() != 1 || up.lastLen != testBlock {
		t.Fatalf("reads %d, last length %d", up.readCount(), up.lastLen)
	}
	readAll(t, c, "/big.bin", 200, 1000)
	if up.readCount() != 1 {
		t.Fatalf("cached block fetched again: %d reads", up.readCount())
	}
}

func TestReadAcrossBlocksAndEnd(t *testing.T) {
	content := pattern(testBlock*2 + 777)
	up := newFake(map[string][]byte{"/a.bin": content})
	c := newTestCache(t, up, cacheDirFor(t))
	got := readAll(t, c, "/a.bin", testBlock-10, 50)
	if !bytes.Equal(got, content[testBlock-10:testBlock+40]) {
		t.Fatal("cross block mismatch")
	}
	tail := readAll(t, c, "/a.bin", int64(len(content))-100, 500)
	if !bytes.Equal(tail, content[len(content)-100:]) {
		t.Fatal("tail mismatch")
	}
	if len(readAll(t, c, "/a.bin", int64(len(content)), 10)) != 0 {
		t.Fatal("read past the end returned data")
	}
}

func TestEvictionPunchesHolesLeastRecentlyReadFirst(t *testing.T) {
	size := int64(1 << 20)
	up := newFake(map[string][]byte{"/big.bin": pattern(int(size))})
	c := newTestCache(t, up, cacheDirFor(t))
	if err := c.SetPolicy(sizeLimit(2 * testBlock)); err != nil {
		t.Fatal(err)
	}
	for _, block := range []int64{0, 1, 2} {
		readAll(t, c, "/big.bin", block*testBlock, 10)
	}
	if present(c, "/big.bin", size, 0) || !present(c, "/big.bin", size, 1) || !present(c, "/big.bin", size, 2) {
		t.Fatal("the first block read should be the one evicted")
	}
	readAll(t, c, "/big.bin", testBlock, 10)
	readAll(t, c, "/big.bin", 3*testBlock, 10)
	if !present(c, "/big.bin", size, 1) || present(c, "/big.bin", size, 2) {
		t.Fatal("re-reading block 1 should have kept it over block 2")
	}
	e, _ := c.stat(context.Background(), testRoot, "/big.bin")
	f := c.fileFor(testRoot, "/big.bin", e)
	err := c.withData(f, func(d *os.File) error {
		used, statErr := allocatedBytes(d)
		if statErr == nil && used > 2*testBlock {
			t.Errorf("data file holds %d bytes after eviction, limit %d", used, 2*testBlock)
		}
		return statErr
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestPrefetchAfterTwoSequentialReads(t *testing.T) {
	size := int64(1 << 20)
	up := newFake(map[string][]byte{"/big.bin": pattern(int(size))})
	c := newTestCache(t, up, cacheDirFor(t))
	readAll(t, c, "/big.bin", 0, 1000)
	c.Close()
	if present(c, "/big.bin", size, 1) {
		t.Fatal("prefetched after a single read")
	}
	readAll(t, c, "/big.bin", 1000, 1000)
	c.Close()
	if !present(c, "/big.bin", size, 1) || up.readCount() != 2 {
		t.Fatalf("next block not prefetched, reads %d", up.readCount())
	}
}

func TestPinsAreWholeAndOutsideTheLimit(t *testing.T) {
	size := int64(1 << 20)
	up := newFake(map[string][]byte{"/kept/big.bin": pattern(int(size)), "/other.bin": pattern(4 * testBlock)})
	c := newTestCache(t, up, cacheDirFor(t))
	if err := c.SetPolicy(sizeLimit(testBlock)); err != nil {
		t.Fatal(err)
	}
	if err := c.Pin(context.Background(), testRoot, "/kept"); err != nil {
		t.Fatal(err)
	}
	for i := range int64(8) {
		if !present(c, "/kept/big.bin", size, i) {
			t.Fatalf("pinned block %d missing", i)
		}
	}
	if c.PinnedFiles(testRoot) != 1 {
		t.Fatalf("pinned files %d", c.PinnedFiles(testRoot))
	}
	for i := range int64(4) {
		readAll(t, c, "/other.bin", i*testBlock, 10)
	}
	if !present(c, "/kept/big.bin", size, 0) || !present(c, "/kept/big.bin", size, 7) {
		t.Fatal("pinned blocks were evicted")
	}
	if err := c.Unpin(context.Background(), testRoot, "/kept"); err != nil {
		t.Fatal(err)
	}
	c.mu.Lock()
	used := c.lru.used
	c.mu.Unlock()
	if used > testBlock || c.PinnedFiles(testRoot) != 0 {
		t.Fatalf("after unpin used %d pinned %d", used, c.PinnedFiles(testRoot))
	}
}

func TestOfflineServesCachedAndRefusesUncachedAtOnce(t *testing.T) {
	content := pattern(1 << 20)
	up := newFake(map[string][]byte{"/big.bin": content})
	dir := cacheDirFor(t)
	c := newTestCache(t, up, dir)
	readAll(t, c, "/big.bin", 0, 10)
	c.Invalidate(testRoot, nil)
	c.SetReachable(false)
	before := up.readCount()
	if !bytes.Equal(readAll(t, c, "/big.bin", 0, 10), content[:10]) {
		t.Fatal("cached read wrong offline")
	}
	buf := make([]byte, 10)
	if _, err := c.ReadAt(context.Background(), testRoot, "/big.bin", 5*testBlock, buf); !errors.Is(err, errOffline) {
		t.Fatalf("uncached read offline: %v", err)
	}
	if up.readCount() != before {
		t.Fatal("offline read reached the hub")
	}
	again := newTestCache(t, up, dir)
	again.SetReachable(false)
	items, err := again.List(context.Background(), testRoot, "/")
	if err != nil || len(items) != 1 || items[0].Name != "big.bin" {
		t.Fatalf("offline listing after restart: %v %v", items, err)
	}
	if !bytes.Equal(readAll(t, again, "/big.bin", 0, 10), content[:10]) {
		t.Fatal("cached block lost across restart")
	}
	if _, err := again.List(context.Background(), testRoot, "/never"); !errors.Is(err, errOffline) {
		t.Fatalf("unlisted folder offline: %v", err)
	}
	again.SetReachable(true)
	if _, err := again.ReadAt(context.Background(), testRoot, "/big.bin", 5*testBlock, buf); err != nil {
		t.Fatalf("read after coming back online: %v", err)
	}
}

func TestListingsRefreshOnInvalidateAndDropChangedFiles(t *testing.T) {
	up := newFake(map[string][]byte{"/a.txt": []byte("old")})
	c := newTestCache(t, up, cacheDirFor(t))
	for range 2 {
		if _, err := c.List(context.Background(), testRoot, "/"); err != nil {
			t.Fatal(err)
		}
	}
	if up.lists != 1 {
		t.Fatalf("listing not cached: %d lists", up.lists)
	}
	if string(readAll(t, c, "/a.txt", 0, 10)) != "old" {
		t.Fatal("first read")
	}
	up.set("/a.txt", []byte("newer"))
	c.Invalidate(testRoot, []string{"/a.txt"})
	if got := string(readAll(t, c, "/a.txt", 0, 10)); got != "newer" {
		t.Fatalf("after invalidate %q", got)
	}
	if up.lists != 2 {
		t.Fatalf("listing not refreshed: %d lists", up.lists)
	}
}

func TestBrokenCacheFolderIsRefused(t *testing.T) {
	blocker := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(blocker, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	c := newBlockCache(newFake(nil), path.Join(blocker, "cache"))
	if c.Ready() == nil {
		t.Fatal("cache started on an unusable folder")
	}
	if _, err := c.List(context.Background(), testRoot, "/"); err == nil {
		t.Fatal("listing served by a refused cache")
	}
}

func TestHolePunchProbeOnRealDirectory(t *testing.T) {
	dir := cacheDirFor(t)
	if err := checkHolePunch(dir); err != nil {
		t.Fatalf("hole punching: %v", err)
	}
	leftovers, _ := filepath.Glob(filepath.Join(dir, ".holecheck-*"))
	if len(leftovers) != 0 {
		t.Fatalf("probe left files: %v", leftovers)
	}
}
