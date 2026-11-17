package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

const (
	minBlockSize  = 128 * 1024
	maxBlockSize  = 16 * 1024 * 1024
	maxBlockCount = 2000
	noLimit       = math.MaxInt64
	probeBytes    = 1 << 20
	flushDelay    = 2 * time.Second
	cacheVersion  = "2"
	versionFile   = "version"
)

var _ InodeSource = (*blockCache)(nil)

var errOffline = fmt.Errorf("%w: offline and not kept in the cache", wire.ErrNoRoute)

func notFound() error { return &wire.RemoteError{Code: wire.ErrENOENT} }

func remoteCode(err error, code wire.ErrorCode) bool {
	got, ok := wire.CodeOf(err)
	return ok && got == code
}

func unreachable(err error) bool {
	return errors.Is(err, wire.ErrNoRoute) || errors.Is(err, wire.ErrConnLost) || errors.Is(err, wire.ErrClosed)
}

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
	io   sync.RWMutex
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

type flightKind uint8

const (
	flightAttr flightKind = iota + 1
	flightList
	flightLink
)

type flightKey struct {
	kind flightKind
	ino  uint64
}

type nameSlot struct {
	ino   uint64
	epoch uint64
}

type xattrSlot struct {
	value  []byte
	absent bool
}

type localNote struct {
	name string
	ino  uint64
}

type dirMeta struct {
	names    map[string]nameSlot
	order    []string
	complete bool
	epoch    uint64
	gen      uint64
	snap     []wire.DirEntry
}

func (d *dirMeta) invalidate() {
	d.epoch = 0
	d.gen++
	d.snap = nil
}

type inodeMeta struct {
	ino        uint64
	root       string
	attr       wire.Attr
	hasAttr    bool
	attrEpoch  uint64
	gen        uint64
	link       string
	hasLink    bool
	linkEpoch  uint64
	dir        *dirMeta
	listed     map[uint64]struct{}
	xattrs     map[string]xattrSlot
	xattrNames []string
	hasNames   bool
	xattrEpoch uint64
}

type rootState struct {
	id        string
	placement string
	ino       uint64
	seq       uint64
	attached  bool
	epoch     uint64
	space     wire.Statfs
	hasSpace  bool
}

type blockCache struct {
	legacy     []legacyPin
	dir        string
	call       wire.Caller
	startErr   error
	offline    atomic.Bool
	ctx        context.Context
	cancel     context.CancelFunc
	background sync.WaitGroup
	tasks      sync.WaitGroup
	mu         sync.Mutex
	inodes     map[uint64]*inodeMeta
	fetching   map[uint64][]localNote
	roots      map[string]*rootState
	flights    map[flightKey]*flight
	files      map[string]*cachedFile
	byIno      map[uint64]*cachedFile
	lru        *pool
	blocks     map[blockID]*flight
	policy     cachePolicy
	held       map[uint64]int
	wires      map[*wireHandle]struct{}
	released   map[string]bool
	dirtyRoots map[string]bool
	dirty      chan struct{}
	retime     chan time.Duration
	stop       chan struct{}
	stopped    sync.Once
	spawning   sync.Mutex
	closing    bool
	now        func() time.Time
	evicted    func(root string)
	changed    []func(Change)
}

func newBlockCache(call wire.Caller, dir string) *blockCache {
	ctx, cancel := context.WithCancel(context.Background())
	c := &blockCache{
		dir: dir, call: call, ctx: ctx, cancel: cancel,
		inodes: map[uint64]*inodeMeta{}, fetching: map[uint64][]localNote{}, roots: map[string]*rootState{}, flights: map[flightKey]*flight{},
		files: map[string]*cachedFile{}, byIno: map[uint64]*cachedFile{}, lru: newPool(), blocks: map[blockID]*flight{},
		policy: defaultPolicy, held: map[uint64]int{}, wires: map[*wireHandle]struct{}{},
		released: map[string]bool{}, dirtyRoots: map[string]bool{}, dirty: make(chan struct{}, 1),
		retime: make(chan time.Duration, 1), stop: make(chan struct{}), now: time.Now,
	}
	c.startErr = c.start()
	if c.startErr == nil {
		c.background.Add(2)
		go c.sweeper()
		go c.flusher()
	}
	return c
}

func (c *blockCache) blocksDir() string { return filepath.Join(c.dir, "blocks") }

func (c *blockCache) metaDir() string { return filepath.Join(c.dir, "meta") }

func (c *blockCache) start() error {
	if err := os.MkdirAll(c.dir, 0o700); err != nil {
		return err
	}
	if err := c.migrate(); err != nil {
		return err
	}
	legacy, err := readLegacyPins(c.legacyPinsPath())
	if err != nil {
		return err
	}
	c.legacy = legacy
	if err := os.MkdirAll(c.blocksDir(), 0o700); err != nil {
		return err
	}
	if err := checkHolePunch(c.blocksDir()); err != nil {
		return fmt.Errorf("the cache folder %s cannot release space: %w", c.dir, err)
	}
	if err := c.loadMeta(); err != nil {
		return err
	}
	states, err := loadStates(c.blocksDir())
	if err != nil {
		return err
	}
	for _, s := range states {
		c.adopt(s)
	}
	return c.removeOrphans()
}

func (c *blockCache) removeOrphans() error {
	names, err := filepath.Glob(filepath.Join(c.blocksDir(), "*.data"))
	if err != nil {
		return err
	}
	for _, name := range names {
		if _, known := c.files[strings.TrimSuffix(filepath.Base(name), ".data")]; !known {
			os.Remove(name)
		}
	}
	return nil
}

func (c *blockCache) migrate() error {
	marker := filepath.Join(c.dir, versionFile)
	if raw, err := os.ReadFile(marker); err == nil && string(raw) == cacheVersion {
		return nil
	}
	if err := c.keepLegacyPins(); err != nil {
		return err
	}
	for _, old := range []string{c.blocksDir(), c.metaDir()} {
		if err := os.RemoveAll(old); err != nil {
			return err
		}
	}
	return os.WriteFile(marker, []byte(cacheVersion), 0o600)
}

func (c *blockCache) adopt(s loadedState) {
	if previous, ok := c.byIno[s.st.Ino]; ok {
		c.discard(previous)
	}
	f := &cachedFile{key: s.key, st: s.st, next: -1}
	c.files[s.key] = f
	c.byIno[s.st.Ino] = f
	for i := range blockTotal(f.st.Size, f.st.Block) {
		if f.has(i) && !f.st.Pinned {
			start, end := f.span(i)
			c.lru.add(blockID{f.key, i}, end-start, s.at)
		}
	}
}

func (c *blockCache) loadMeta() error {
	stored, err := loadRoots(c.metaDir())
	if err != nil {
		return err
	}
	for _, sr := range stored {
		c.roots[sr.Root] = &rootState{id: sr.Root, placement: sr.Placement, ino: sr.Ino, epoch: 1}
		for ino, si := range sr.Inodes {
			in := &inodeMeta{ino: ino, root: sr.Root, attr: si.Attr, hasAttr: true}
			if si.Link != nil {
				in.link, in.hasLink = *si.Link, true
			}
			if si.Dir != nil {
				in.dir = &dirMeta{names: map[string]nameSlot{}, order: si.Dir.Order, complete: si.Dir.Complete}
				for name, child := range si.Dir.Names {
					in.dir.names[name] = nameSlot{ino: child}
				}
			}
			c.inodes[ino] = in
		}
	}
	for _, in := range c.inodes {
		if in.dir == nil {
			continue
		}
		for _, slot := range in.dir.names {
			if child := c.inodes[slot.ino]; child != nil {
				child.markListed(in.ino)
			}
		}
	}
	return nil
}

func (in *inodeMeta) markListed(dir uint64) {
	if in.listed == nil {
		in.listed = map[uint64]struct{}{}
	}
	in.listed[dir] = struct{}{}
}

func (c *blockCache) touchRoot(root string) {
	c.dirtyRoots[root] = true
	select {
	case c.dirty <- struct{}{}:
	default:
	}
}

func (c *blockCache) flusher() {
	defer c.background.Done()
	for {
		select {
		case <-c.stop:
			c.flushMeta()
			return
		case <-c.dirty:
		}
		select {
		case <-c.stop:
			c.flushMeta()
			return
		case <-time.After(flushDelay):
		}
		c.flushMeta()
	}
}

func (c *blockCache) flushMeta() {
	if c.startErr != nil {
		return
	}
	c.mu.Lock()
	snapshots := make([]storedRoot, 0, len(c.dirtyRoots))
	for root := range c.dirtyRoots {
		rs := c.roots[root]
		if rs == nil {
			continue
		}
		snapshots = append(snapshots, c.snapshotLocked(rs))
	}
	clear(c.dirtyRoots)
	c.mu.Unlock()
	for _, snap := range snapshots {
		if err := saveRoot(c.metaDir(), snap); err != nil {
			fmt.Fprintln(os.Stderr, "cache metadata:", err)
		}
	}
}

func (c *blockCache) snapshotLocked(rs *rootState) storedRoot {
	out := storedRoot{Root: rs.id, Placement: rs.placement, Ino: rs.ino, Inodes: map[uint64]storedInode{}}
	for ino, in := range c.inodes {
		if in.root != rs.id || !in.hasAttr {
			continue
		}
		si := storedInode{Attr: in.attr}
		if in.hasLink {
			link := in.link
			si.Link = &link
		}
		if in.dir != nil {
			sd := &storedDir{Names: map[string]uint64{}, Complete: in.dir.complete}
			if in.dir.complete {
				sd.Order = append([]string(nil), in.dir.order...)
			}
			for name, slot := range in.dir.names {
				if slot.ino != 0 {
					sd.Names[name] = slot.ino
				}
			}
			si.Dir = sd
		}
		out.Inodes[ino] = si
	}
	return out
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
	c.stopped.Do(func() {
		c.spawning.Lock()
		c.closing = true
		c.spawning.Unlock()
		c.cancel()
		close(c.stop)
	})
	c.background.Wait()
	c.tasks.Wait()
}

func (c *blockCache) SetReachable(reachable bool) {
	c.offline.Store(!reachable)
	if !reachable {
		c.flushMeta()
		return
	}
	c.repinIncomplete()
}

func (c *blockCache) Usage(root string) int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	var held int64
	for _, f := range c.files {
		if f.st.Root == root {
			held += c.heldBytes(f)
		}
	}
	return held
}

func (c *blockCache) PinnedBytes(root string) int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	var held int64
	for _, f := range c.files {
		if f.st.Root == root && f.st.Pinned {
			held += c.heldBytes(f)
		}
	}
	return held
}

func (c *blockCache) heldBytes(f *cachedFile) int64 {
	var held int64
	for i := range blockTotal(f.st.Size, f.st.Block) {
		if f.has(i) {
			start, end := f.span(i)
			held += end - start
		}
	}
	return held
}

func (c *blockCache) admit(f *cachedFile, i int64) {
	start, end := f.span(i)
	c.lru.add(blockID{f.key, i}, end-start, c.now())
}

func (c *blockCache) dataPath(f *cachedFile) string {
	return filepath.Join(c.blocksDir(), f.key+".data")
}

func (c *blockCache) save(f *cachedFile) error { return saveState(c.blocksDir(), f.key, f.st) }

func (c *blockCache) withData(f *cachedFile, fn func(*os.File) error) error {
	d, err := os.OpenFile(c.dataPath(f), os.O_RDWR|os.O_CREATE, 0o600)
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
	f.io.Lock()
	err := c.withData(f, func(d *os.File) error { return punchHole(d, start, end-start) })
	f.io.Unlock()
	if err != nil {
		return err
	}
	f.mark(i, false)
	c.lru.remove(blockID{f.key, i})
	c.released[f.st.Root] = true
	return c.save(f)
}

func (c *blockCache) discard(f *cachedFile) {
	for i := range blockTotal(f.st.Size, f.st.Block) {
		c.lru.remove(blockID{f.key, i})
	}
	delete(c.files, f.key)
	if c.byIno[f.st.Ino] == f {
		delete(c.byIno, f.st.Ino)
	}
	os.Remove(c.dataPath(f))
	os.Remove(filepath.Join(c.blocksDir(), f.key+".json"))
}

func (c *blockCache) fileFor(attr wire.Attr) *cachedFile {
	size := int64(attr.Size)
	key := fileKey(attr.Ino, attr.Etag, size)
	c.mu.Lock()
	defer c.mu.Unlock()
	if f, ok := c.byIno[attr.Ino]; ok && f.key == key {
		return f
	}
	pinned := false
	if old, ok := c.byIno[attr.Ino]; ok {
		pinned = old.st.Pinned
		c.discard(old)
	}
	root := ""
	if in := c.inodes[attr.Ino]; in != nil {
		root = in.root
	}
	block := blockSizeFor(size)
	st := fileState{Root: root, Ino: attr.Ino, Size: size, Etag: attr.Etag, Block: block, Pinned: pinned, Have: make([]byte, (blockTotal(size, block)+7)/8)}
	f := &cachedFile{key: key, st: st, next: -1}
	c.files[key] = f
	c.byIno[attr.Ino] = f
	if pinned && !c.offline.Load() {
		c.spawn(func() { c.repin(attr.Ino) })
	}
	return f
}

func (c *blockCache) Hold(ino uint64) func() {
	c.mu.Lock()
	c.held[ino]++
	c.mu.Unlock()
	var once sync.Once
	return func() {
		once.Do(func() {
			c.mu.Lock()
			c.held[ino]--
			if c.held[ino] <= 0 {
				delete(c.held, ino)
			}
			c.mu.Unlock()
		})
	}
}
