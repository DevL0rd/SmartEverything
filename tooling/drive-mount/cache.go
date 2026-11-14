package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	minBlockSize  = 128 * 1024
	maxBlockSize  = 16 * 1024 * 1024
	maxBlockCount = 2000
	noLimit       = math.MaxInt64
	probeBytes    = 1 << 20
)

var (
	errOffline  = errors.New("offline and not kept in the cache")
	errNotFound = errors.New("not found")
)

func blockTotal(size, block int64) int64 { return (size + block - 1) / block }

func blockSizeFor(size int64) int64 {
	block := int64(minBlockSize)
	for block < maxBlockSize && blockTotal(size, block) >= maxBlockCount {
		block *= 2
	}
	return block
}

type blockID struct {
	key   string
	index int64
}

type cachedFile struct {
	key  string
	st   fileState
	next int64
	run  int
}

func (f *cachedFile) has(i int64) bool { return f.st.Have[i/8]&(1<<(i%8)) != 0 }

func (f *cachedFile) mark(i int64, on bool) {
	if on {
		f.st.Have[i/8] |= 1 << (i % 8)
		return
	}
	f.st.Have[i/8] &^= 1 << (i % 8)
}

func (f *cachedFile) span(i int64) (int64, int64) {
	start := i * f.st.Block
	return start, min(f.st.Size, start+f.st.Block)
}

type flight struct {
	done chan struct{}
	data []byte
	err  error
}

type blockCache struct {
	dir        string
	up         ContentSource
	listings   *listingStore
	startErr   error
	offline    atomic.Bool
	background sync.WaitGroup
	mu         sync.Mutex
	files      map[string]*cachedFile
	lru        *pool
	flights    map[blockID]*flight
	policy     cachePolicy
	held       map[location]int
	released   map[mountRoot]bool
	retime     chan time.Duration
	stop       chan struct{}
	stopped    sync.Once
	now        func() time.Time
	evicted    func(root mountRoot)
}

func newBlockCache(up ContentSource, dir string) *blockCache {
	c := &blockCache{
		dir: dir, up: up, files: map[string]*cachedFile{}, lru: newPool(), flights: map[blockID]*flight{},
		policy: defaultPolicy, held: map[location]int{}, released: map[mountRoot]bool{},
		retime: make(chan time.Duration, 1), stop: make(chan struct{}), now: time.Now,
	}
	c.startErr = c.start()
	if c.startErr == nil {
		c.background.Add(1)
		go c.sweeper()
	}
	return c
}

func (c *blockCache) blocksDir() string { return filepath.Join(c.dir, "blocks") }

func (c *blockCache) start() error {
	if err := os.MkdirAll(c.blocksDir(), 0o700); err != nil {
		return err
	}
	if err := checkHolePunch(c.blocksDir()); err != nil {
		return fmt.Errorf("the cache folder %s cannot release space: %w", c.dir, err)
	}
	listings, err := openListings(filepath.Join(c.dir, "meta"))
	if err != nil {
		return err
	}
	c.listings = listings
	states, err := loadStates(c.blocksDir())
	if err != nil {
		return err
	}
	for _, s := range states {
		f := &cachedFile{key: s.key, st: s.st, next: -1}
		c.files[s.key] = f
		for i := range blockTotal(f.st.Size, f.st.Block) {
			if f.has(i) && !f.st.Pinned {
				start, end := f.span(i)
				c.lru.add(blockID{f.key, i}, end-start, s.at)
			}
		}
	}
	return nil
}

func checkHolePunch(dir string) error {
	f, err := os.CreateTemp(dir, ".holecheck-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	if err := markSparse(f); err != nil {
		return err
	}
	if _, err := f.Write(make([]byte, probeBytes)); err != nil {
		return err
	}
	if err := f.Sync(); err != nil {
		return err
	}
	before, err := allocatedBytes(f)
	if err != nil {
		return err
	}
	if err := punchHole(f, 0, probeBytes); err != nil {
		return err
	}
	if err := f.Sync(); err != nil {
		return err
	}
	after, err := allocatedBytes(f)
	if err != nil {
		return err
	}
	if after >= before {
		return errors.New("punching a hole did not free any space")
	}
	return nil
}

func (c *blockCache) Ready() error { return c.startErr }

func (c *blockCache) Close() {
	c.stopped.Do(func() { close(c.stop) })
	c.background.Wait()
}

func (c *blockCache) SetReachable(reachable bool) { c.offline.Store(!reachable) }

func (c *blockCache) Usage(root mountRoot) int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	var held int64
	for _, f := range c.files {
		if f.st.Root != root {
			continue
		}
		for i := range blockTotal(f.st.Size, f.st.Block) {
			if f.has(i) {
				start, end := f.span(i)
				held += end - start
			}
		}
	}
	return held
}

func (c *blockCache) admit(f *cachedFile, i int64) {
	start, end := f.span(i)
	c.lru.add(blockID{f.key, i}, end-start, c.now())
}

func (c *blockCache) save(f *cachedFile) error { return saveState(c.blocksDir(), f.key, f.st) }

func (c *blockCache) withData(f *cachedFile, fn func(*os.File) error) error {
	d, err := os.OpenFile(filepath.Join(c.blocksDir(), f.key+".data"), os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return err
	}
	defer d.Close()
	if err := markSparse(d); err != nil {
		return err
	}
	return fn(d)
}

func (c *blockCache) release(f *cachedFile, i int64) error {
	start, end := f.span(i)
	err := c.withData(f, func(d *os.File) error { return punchHole(d, start, end-start) })
	if err != nil {
		return err
	}
	f.mark(i, false)
	c.lru.remove(blockID{f.key, i})
	c.released[f.st.Root] = true
	return c.save(f)
}

func (c *blockCache) fileFor(root mountRoot, p string, e entry) *cachedFile {
	key := fileKey(root, p, e.Size, e.Etag)
	c.mu.Lock()
	defer c.mu.Unlock()
	if f, ok := c.files[key]; ok {
		return f
	}
	block := blockSizeFor(e.Size)
	st := fileState{Root: root, Path: p, Size: e.Size, Etag: e.Etag, Block: block, Have: make([]byte, (blockTotal(e.Size, block)+7)/8)}
	f := &cachedFile{key: key, st: st, next: -1}
	c.files[key] = f
	return f
}

func (c *blockCache) List(ctx context.Context, root mountRoot, dir string) ([]entry, error) {
	if c.startErr != nil {
		return nil, c.startErr
	}
	if items, ok := c.listings.get(root, dir, true); ok {
		return items, nil
	}
	if c.offline.Load() {
		if items, ok := c.listings.get(root, dir, false); ok {
			return items, nil
		}
		return nil, errOffline
	}
	items, err := c.up.List(ctx, root, dir)
	if err != nil {
		return nil, err
	}
	previous, err := c.listings.put(root, dir, items)
	if err != nil {
		return nil, err
	}
	c.dropChanged(root, dir, previous, items)
	return items, nil
}

func (c *blockCache) dropChanged(root mountRoot, dir string, previous, items []entry) {
	current := map[string]entry{}
	for _, it := range items {
		current[it.Name] = it
	}
	for _, old := range previous {
		now, present := current[old.Name]
		if present && now == old {
			continue
		}
		c.dropUnder(root, path.Join(dir, old.Name), present)
	}
}

func (c *blockCache) Invalidate(root mountRoot, paths []string) {
	if c.startErr != nil {
		return
	}
	c.listings.invalidate(root, paths)
	for _, p := range paths {
		c.dropUnder(root, path.Clean("/"+p), true)
	}
}

func (c *blockCache) dropUnder(root mountRoot, p string, repin bool) {
	prefix := strings.TrimSuffix(p, "/") + "/"
	var pinned []string
	c.mu.Lock()
	for key, f := range c.files {
		if f.st.Root != root || (f.st.Path != p && !strings.HasPrefix(f.st.Path, prefix)) {
			continue
		}
		if f.st.Pinned {
			pinned = append(pinned, f.st.Path)
		}
		c.forget(key, f)
	}
	c.mu.Unlock()
	if !repin || c.offline.Load() {
		return
	}
	for _, again := range pinned {
		c.background.Add(1)
		go c.repin(root, again)
	}
}

func (c *blockCache) forget(key string, f *cachedFile) {
	for i := range blockTotal(f.st.Size, f.st.Block) {
		c.lru.remove(blockID{key, i})
	}
	delete(c.files, key)
	os.Remove(filepath.Join(c.blocksDir(), key+".data"))
	os.Remove(filepath.Join(c.blocksDir(), key+".json"))
}

func (c *blockCache) stat(ctx context.Context, root mountRoot, p string) (entry, error) {
	if p == "/" || p == "" {
		return entry{Dir: true}, nil
	}
	items, err := c.List(ctx, root, path.Dir(p))
	if err != nil {
		return entry{}, err
	}
	for _, it := range items {
		if it.Name == path.Base(p) {
			return it, nil
		}
	}
	return entry{}, errNotFound
}
