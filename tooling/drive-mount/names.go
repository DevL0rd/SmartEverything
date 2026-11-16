package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

type nameKey struct {
	parent uint64
	name   string
}

type pendingName struct {
	nameEntry
	posted  bool
	failed  error
	attempt int
	hub     *wire.Attr
	victim  wire.Attr
}

type namespaceLog struct {
	w         *writeBack
	refilling sync.Mutex
	urgent    atomic.Int64
	journal   *nameJournal
	leases    *leasePool
	mu        sync.Mutex
	nextSeq   uint64
	order     []*pendingName
	created   map[nameKey]*pendingName
	byIno     map[uint64]*pendingName
	removed   map[nameKey]*pendingName
	inRoot    map[string]map[uint64]int
	wake      chan struct{}
}

func openNamespaceLog(w *writeBack, journalDir string) (*namespaceLog, error) {
	dir := filepath.Join(journalDir, namesDir)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	leases, err := loadLeases(dir)
	if err != nil {
		return nil, err
	}
	journal, entries, err := openNameJournal(dir)
	if err != nil {
		return nil, err
	}
	n := &namespaceLog{
		w: w, journal: journal, leases: leases, wake: make(chan struct{}, 1),
		created: map[nameKey]*pendingName{}, byIno: map[uint64]*pendingName{}, removed: map[nameKey]*pendingName{},
		inRoot: map[string]map[uint64]int{},
	}
	for _, e := range entries {
		n.track(&pendingName{nameEntry: e})
		n.nextSeq = max(n.nextSeq, e.Seq)
		if e.Kind == nameCreate || e.Kind == nameMkdir {
			leases.consumed(e.Ino)
		}
	}
	return n, nil
}

func (n *namespaceLog) count(p *pendingName, delta int) {
	inos := n.inRoot[p.Root]
	if inos == nil {
		inos = map[uint64]int{}
		n.inRoot[p.Root] = inos
	}
	inos[p.Ino] += delta
	if inos[p.Ino] <= 0 {
		delete(inos, p.Ino)
	}
	if len(inos) == 0 {
		delete(n.inRoot, p.Root)
	}
}

func (n *namespaceLog) track(p *pendingName) {
	n.order = append(n.order, p)
	n.count(p, 1)
	key := nameKey{p.Parent, p.Name}
	switch p.Kind {
	case nameCreate, nameMkdir:
		n.created[key] = p
		n.byIno[p.Ino] = p
		delete(n.removed, key)
	default:
		if made := n.created[key]; made != nil && made.Ino == p.Ino {
			delete(n.created, key)
		}
		n.removed[key] = p
	}
}

func (n *namespaceLog) signal() {
	select {
	case n.wake <- struct{}{}:
	default:
	}
}

func (n *namespaceLog) inode() (uint64, error) {
	if ino, ok := n.leases.take(); ok {
		if n.leases.left() < leaseRefill {
			go n.ensureLeases(n.w.ctx)
		}
		return ino, nil
	}
	if err := n.refill(n.w.ctx); err != nil {
		return 0, err
	}
	if ino, ok := n.leases.take(); ok {
		return ino, nil
	}
	return 0, errNoLease
}

func (n *namespaceLog) refill(ctx context.Context) error {
	n.refilling.Lock()
	defer n.refilling.Unlock()
	if n.leases.left() >= leaseRefill {
		return nil
	}
	if !n.w.online.Load() {
		return errNoLease
	}
	reply, err := n.w.caller.Call(ctx, wire.OpLease, wire.Meta{wire.KeyCount: uint64(leaseBatch)}, nil)
	if err != nil {
		return err
	}
	start, err := reply.Meta.Uint(wire.KeyStart)
	if err != nil {
		return err
	}
	count, err := reply.Meta.Uint(wire.KeyCount)
	if err != nil {
		return err
	}
	return n.leases.add(start, count)
}

func (n *namespaceLog) ensureLeases(ctx context.Context) {
	if n.leases.left() >= leaseRefill {
		return
	}
	if err := n.refill(ctx); err != nil {
		fmt.Fprintln(os.Stderr, "leases:", err)
	}
}

func (n *namespaceLog) add(e nameEntry) (*pendingName, error) {
	return n.addWith(e, wire.Attr{})
}

func (n *namespaceLog) addRemoval(e nameEntry, victim wire.Attr) error {
	_, err := n.addWith(e, victim)
	return err
}

func (n *namespaceLog) removedAttr(ino uint64) (wire.Attr, bool) {
	n.mu.Lock()
	defer n.mu.Unlock()
	for i := len(n.order) - 1; i >= 0; i-- {
		p := n.order[i]
		if p.Ino == ino && (p.Kind == nameUnlink || p.Kind == nameRmdir) {
			return p.victim, true
		}
	}
	return wire.Attr{}, false
}

func (n *namespaceLog) addWith(e nameEntry, victim wire.Attr) (*pendingName, error) {
	n.mu.Lock()
	n.nextSeq++
	e.Seq = n.nextSeq
	e.OpKey = newKeyHex()
	if err := n.journal.set(e); err != nil {
		n.mu.Unlock()
		return nil, err
	}
	p := &pendingName{nameEntry: e, victim: victim}
	n.track(p)
	n.mu.Unlock()
	n.signal()
	n.w.broadcast()
	return p, nil
}

func (n *namespaceLog) draft(kind string, args CreateArgs, root string) (nameEntry, error) {
	ino, err := n.inode()
	if err != nil {
		return nameEntry{}, err
	}
	return nameEntry{
		Kind: kind, Ino: ino, Parent: args.Parent, Name: args.Name, Root: root,
		Mode: args.Mode, UID: args.UID, GID: args.GID, MtimeNs: time.Now().UnixNano(),
	}, nil
}

func (n *namespaceLog) make(kind string, args CreateArgs, root string) (*pendingName, error) {
	e, err := n.draft(kind, args, root)
	if err != nil {
		return nil, err
	}
	return n.add(e)
}

func (n *namespaceLog) cancel(p *pendingName) bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	if p.posted {
		return false
	}
	n.dropLocked(p)
	if err := n.journal.done(p.Seq); err != nil {
		logJournal(p.Ino, err)
	}
	return true
}

func (n *namespaceLog) dropLocked(p *pendingName) {
	for i, q := range n.order {
		if q == p {
			n.order = append(n.order[:i:i], n.order[i+1:]...)
			n.count(p, -1)
			break
		}
	}
	key := nameKey{p.Parent, p.Name}
	switch p.Kind {
	case nameCreate, nameMkdir:
		if n.created[key] == p {
			delete(n.created, key)
		}
		if n.byIno[p.Ino] == p {
			delete(n.byIno, p.Ino)
		}
	default:
		if n.removed[key] == p {
			delete(n.removed, key)
		}
	}
}

func (n *namespaceLog) madeAt(parent uint64, name string) *pendingName {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.created[nameKey{parent, name}]
}

func (n *namespaceLog) goneAt(parent uint64, name string) bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	_, gone := n.removed[nameKey{parent, name}]
	return gone
}

func (n *namespaceLog) made(ino uint64) *pendingName {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.byIno[ino]
}

func (n *namespaceLog) blocks(ino uint64) bool { return n.made(ino) != nil }

func (n *namespaceLog) children(parent uint64) []*pendingName {
	n.mu.Lock()
	defer n.mu.Unlock()
	var out []*pendingName
	for _, p := range n.order {
		if (p.Kind == nameCreate || p.Kind == nameMkdir) && p.Parent == parent && n.created[nameKey{p.Parent, p.Name}] == p {
			out = append(out, p)
		}
	}
	return out
}

func (n *namespaceLog) pendingIn(root string) int64 {
	n.mu.Lock()
	defer n.mu.Unlock()
	return int64(len(n.inRoot[root]))
}

func (n *namespaceLog) counted(root string, ino uint64) (counted bool, madeElsewhere bool) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if _, held := n.inRoot[root][ino]; held {
		return true, false
	}
	p := n.byIno[ino]
	return false, p != nil && p.Root != root
}

func (n *namespaceLog) idle() bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	return len(n.order) == 0
}

func (n *namespaceLog) hurry() func() {
	n.urgent.Add(1)
	n.signal()
	return func() { n.urgent.Add(-1) }
}

func (n *namespaceLog) drain(ctx context.Context) error {
	defer n.hurry()()
	return n.w.waitUntil(ctx, func() error {
		if n.idle() {
			return nil
		}
		if !n.w.online.Load() {
			return wire.ErrNoRoute
		}
		return errPending
	})
}

func (n *namespaceLog) settle(ctx context.Context, inos ...uint64) error {
	defer n.hurry()()
	return n.w.waitUntil(ctx, func() error {
		for _, ino := range inos {
			if n.blocks(ino) {
				if !n.w.online.Load() {
					return wire.ErrNoRoute
				}
				return errPending
			}
		}
		return nil
	})
}

func (n *namespaceLog) attrOf(p *pendingName) wire.Attr {
	n.mu.Lock()
	hub := p.hub
	n.mu.Unlock()
	if hub != nil {
		return *hub
	}
	attr := wire.Attr{
		Ino: p.Ino, Type: wire.InodeTypeFile, Mode: p.Mode, Nlink: 1, UID: p.UID, GID: p.GID,
		AtimeNs: p.MtimeNs, MtimeNs: p.MtimeNs, CtimeNs: p.MtimeNs, BtimeNs: p.MtimeNs,
		Etag: fmt.Sprintf("local-%d", p.Ino),
	}
	if p.Kind == nameMkdir {
		attr.Type, attr.Nlink = wire.InodeTypeDirectory, 2
	}
	return attr
}

func (n *namespaceLog) foldMode(args SetattrArgs) bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	p := n.byIno[args.Ino]
	if p == nil || p.posted {
		return false
	}
	if args.Valid&wire.SetattrValidMode != 0 {
		p.Mode = args.Mode
	}
	if args.Valid&wire.SetattrValidUid != 0 {
		p.UID = args.UID
	}
	if args.Valid&wire.SetattrValidGid != 0 {
		p.GID = args.GID
	}
	if err := n.journal.set(p.nameEntry); err != nil {
		logJournal(p.Ino, err)
	}
	return true
}

func (n *namespaceLog) sync() error { return n.journal.sync() }

func (n *namespaceLog) close() {
	if err := n.journal.close(); err != nil {
		logJournal(0, err)
	}
}

func (n *namespaceLog) foldTimes(ino uint64, mtime TimeSpec) bool {
	if !mtime.Set {
		return false
	}
	n.mu.Lock()
	defer n.mu.Unlock()
	p := n.byIno[ino]
	if p == nil || p.posted {
		return false
	}
	p.MtimeNs = timeOf(mtime, time.Now().UnixNano())
	if err := n.journal.set(p.nameEntry); err != nil {
		logJournal(p.Ino, err)
	}
	return true
}
