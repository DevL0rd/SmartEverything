package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

type baseSource interface {
	Open(ctx context.Context, ino uint64) (ReadHandle, error)
	Getattr(ctx context.Context, ino uint64) (wire.Attr, error)
	Lookup(ctx context.Context, parent uint64, name string) (Entry, error)
	Readdir(ctx context.Context, ino, cursor uint64) (DirPage, error)
}

type nameCache interface {
	NoteLocal(parent uint64, name string, entry wire.Entry)
	NoteLocalDir(ino uint64)
	NoteLocalGone(parent uint64, name string, ino uint64)
	NoteName(parent uint64, name string)
	NoteChanged(ino uint64)
	RootIno(root string) (uint64, bool)
}

type writeConfig struct {
	Caller wire.Caller
	Base   baseSource
	Names  nameCache
	Dir    string
	NameOf func(ino uint64) (parent uint64, name string, ok bool)
	RootOf func(ino uint64) string
}

type writeBack struct {
	caller    wire.Caller
	base      baseSource
	names     nameCache
	ns        *namespaceLog
	journal   *journal
	nameOf    func(ino uint64) (uint64, string, bool)
	rootOf    func(ino uint64) string
	ctx       context.Context
	cancel    context.CancelFunc
	workers   sync.WaitGroup
	wake      chan struct{}
	online    atomic.Bool
	mu        sync.Mutex
	sessions  map[uint64]*session
	queue     []*session
	forgets   []uint64
	committed func(ino uint64, attr wire.Attr)
	created   func(parent uint64, name string)
	pending   func()
	changed   chan struct{}
	locks     lockBook
	window    *frameWindow
	target    int64
	running   int64
	resized   chan struct{}
}

func newWriteBack(cfg writeConfig) (*writeBack, error) {
	j, err := openJournal(cfg.Dir)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	if cfg.Names == nil {
		cancel()
		return nil, errors.New("the write-back needs the name cache")
	}
	w := &writeBack{
		caller: cfg.Caller, base: cfg.Base, names: cfg.Names, journal: j, nameOf: cfg.NameOf, rootOf: cfg.RootOf,
		ctx: ctx, cancel: cancel, wake: make(chan struct{}, 1),
		sessions: map[uint64]*session{}, changed: make(chan struct{}), resized: make(chan struct{}),
		window: newFrameWindow(live.load().uploadFramesInFlight),
	}
	ns, err := openNamespaceLog(w, cfg.Dir)
	if err != nil {
		cancel()
		return nil, err
	}
	w.ns = ns
	if err := w.replay(); err != nil {
		cancel()
		ns.close()
		return nil, err
	}
	w.workers.Add(1)
	go ns.run()
	ns.signal()
	w.applyLive(live.load())
	live.subscribe(w.applyLive)
	return w, nil
}

func (w *writeBack) applyLive(f liveFields) {
	w.window.resize(f.uploadFramesInFlight)
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.ctx.Err() != nil {
		return
	}
	w.target = f.uploadFiles
	for w.running < w.target {
		w.running++
		w.workers.Add(1)
		go w.run()
	}
	close(w.resized)
	w.resized = make(chan struct{})
}

func (w *writeBack) Close() {
	w.SealAll()
	w.mu.Lock()
	w.cancel()
	w.mu.Unlock()
	w.workers.Wait()
	w.ns.close()
	w.mu.Lock()
	sessions := make([]*session, 0, len(w.sessions))
	for _, s := range w.sessions {
		sessions = append(sessions, s)
	}
	w.mu.Unlock()
	for _, s := range sessions {
		s.closeFiles()
	}
}

func (w *writeBack) Drain(ctx context.Context) error {
	w.expedite()
	return w.waitUntil(ctx, func() error {
		if !w.online.Load() {
			return nil
		}
		if !w.ns.idle() {
			return errPending
		}
		w.mu.Lock()
		defer w.mu.Unlock()
		for _, s := range w.sessions {
			if flying, err := s.inFlight(); flying || err != nil {
				return errPending
			}
		}
		return nil
	})
}

var errPending = errors.New("commits pending")

func (w *writeBack) SetReachable(reachable bool) {
	w.online.Store(reachable)
	w.broadcast()
	if reachable {
		w.signal()
		w.ns.reachable()
	}
}

func (w *writeBack) cache() nameCache { return w.names }

func (w *writeBack) SetCommitted(fn func(ino uint64, attr wire.Attr)) {
	w.mu.Lock()
	w.committed = fn
	w.mu.Unlock()
}

func (w *writeBack) SetCreated(fn func(parent uint64, name string)) {
	w.mu.Lock()
	w.created = fn
	w.mu.Unlock()
}

func (w *writeBack) signal() {
	select {
	case w.wake <- struct{}{}:
	default:
	}
}

func (w *writeBack) broadcast() {
	w.mu.Lock()
	close(w.changed)
	w.changed = make(chan struct{})
	hook := w.pending
	w.mu.Unlock()
	if hook != nil {
		hook()
	}
}

func (w *writeBack) OnPending(fn func()) {
	w.mu.Lock()
	w.pending = fn
	w.mu.Unlock()
}

func (w *writeBack) waitUntil(ctx context.Context, done func() error) error {
	for {
		w.mu.Lock()
		changed := w.changed
		w.mu.Unlock()
		err := done()
		if err == nil {
			return nil
		}
		if !errors.Is(err, errPending) {
			return err
		}
		select {
		case <-changed:
		case <-ctx.Done():
			return ctx.Err()
		case <-w.ctx.Done():
			return context.Canceled
		}
	}
}

func (w *writeBack) enqueue(s *session) {
	if w.ns.blocks(s.ino()) {
		w.ns.signal()
		return
	}
	w.mu.Lock()
	if !s.queued {
		s.queued = true
		w.queue = append(w.queue, s)
	}
	w.mu.Unlock()
	w.signal()
}

func (w *writeBack) enqueueSealed(s *session) {
	delay := live.load().uploadDelay
	if delay <= 0 {
		w.enqueue(s)
		return
	}
	time.AfterFunc(delay, func() {
		if w.ctx.Err() == nil {
			w.enqueue(s)
		}
	})
}

func (w *writeBack) expedite() {
	w.mu.Lock()
	sessions := make([]*session, 0, len(w.sessions))
	for _, s := range w.sessions {
		sessions = append(sessions, s)
	}
	w.mu.Unlock()
	for _, s := range sessions {
		s.mu.Lock()
		ready := !s.sending && ((s.sealed && s.needsCommit()) || s.resume != nil || s.hasTimes())
		s.mu.Unlock()
		if ready {
			w.enqueue(s)
		}
	}
}

func (w *writeBack) replay() error {
	records, err := w.journal.load()
	if err != nil {
		return err
	}
	known := map[string]bool{}
	for _, rec := range records {
		if rec.Phase != phaseSealed {
			fmt.Fprintln(os.Stderr, "journal: dropped a write that was not flushed before the helper stopped:", rec.Ino)
			if err := w.journal.remove(rec.ID); err != nil {
				return err
			}
			continue
		}
		known[rec.ID] = true
		if err := w.restore(rec); err != nil {
			return err
		}
	}
	return w.journal.sweepOrphans(known)
}

func (w *writeBack) restore(rec journalRecord) error {
	data, err := w.journal.openData(rec.ID)
	if err != nil {
		return err
	}
	if prior := w.sessions[rec.Ino]; prior != nil {
		data.Close()
		return fmt.Errorf("journal: two sealed sessions for inode %d", rec.Ino)
	}
	s := newSession(w, rec, data)
	s.ranges = spansToSet(rec.Ranges)
	s.zeros = spansToSet(rec.Zeros)
	s.forced = rec.Forced
	s.size = rec.Size
	s.sealed = true
	if rec.Unit != nil {
		s.resume = rec.Unit
		s.since = spansToSet(rec.Since)
	}
	w.sessions[rec.Ino] = s
	w.queue = append(w.queue, s)
	s.queued = true
	return nil
}

func spansToSet(spans [][2]uint64) rangeSet {
	var out rangeSet
	for _, span := range spans {
		out.add(span[0], span[1])
	}
	return out
}

func (w *writeBack) SealAll() {
	w.mu.Lock()
	sessions := make([]*session, 0, len(w.sessions))
	for _, s := range w.sessions {
		sessions = append(sessions, s)
	}
	w.mu.Unlock()
	for _, s := range sessions {
		if err := s.seal(); err != nil {
			fmt.Fprintln(os.Stderr, "journal:", s.ino(), err)
		}
	}
}

func (w *writeBack) CommitIDs() []uint64 {
	w.mu.Lock()
	defer w.mu.Unlock()
	var ids []uint64
	for _, s := range w.sessions {
		if id := s.commitID(); id != 0 {
			ids = append(ids, id)
		}
	}
	return ids
}

func (w *writeBack) Pending(root string) int64 {
	held := w.ns.pendingIn(root)
	w.mu.Lock()
	sessions := make(map[uint64]*session, len(w.sessions))
	for ino, s := range w.sessions {
		sessions[ino] = s
	}
	w.mu.Unlock()
	for ino, s := range sessions {
		if !s.busy() {
			continue
		}
		if counted, elsewhere := w.ns.counted(root, ino); !counted && !elsewhere && w.inRoot(ino, root) {
			held++
		}
	}
	return held
}

func (w *writeBack) inRoot(ino uint64, root string) bool {
	return w.rootOf == nil || w.rootOf(ino) == root
}

func (w *writeBack) sessionOf(ino uint64) *session {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.sessions[ino]
}

func (w *writeBack) mutate(ctx context.Context, op wire.Op, meta wire.Meta, payload []byte) (wire.Reply, error) {
	if !w.online.Load() {
		return wire.Reply{}, wire.ErrNoRoute
	}
	meta[wire.KeyOpKey] = wire.NewOpKey()
	return w.caller.Call(ctx, op, meta, payload)
}

func (w *writeBack) ask(ctx context.Context, op wire.Op, meta wire.Meta) (wire.Reply, error) {
	if !w.online.Load() {
		return wire.Reply{}, wire.ErrNoRoute
	}
	return w.caller.Call(ctx, op, meta, nil)
}

func (w *writeBack) fetchAttr(ctx context.Context, ino uint64) (wire.Attr, error) {
	reply, err := w.ask(ctx, wire.OpGetattr, wire.Meta{wire.KeyIno: ino})
	if err != nil {
		return wire.Attr{}, err
	}
	return reply.Meta.Attr(wire.KeyAttr)
}

func (w *writeBack) OpenWrite(ctx context.Context, ino uint64, truncate bool) (InodeWriteHandle, error) {
	for {
		if s := w.sessionOf(ino); s != nil {
			if h, ok := s.attachHandle(truncate); ok {
				return h, nil
			}
			yieldOnce()
			continue
		}
		attr, err := w.startAttr(ctx, ino)
		if err != nil {
			return nil, err
		}
		if attr.Type == wire.InodeTypeDirectory {
			return nil, syscall.EISDIR
		}
		s, err := w.startSession(ino, attr, false)
		if errors.Is(err, errSessionExists) {
			continue
		}
		if err != nil {
			return nil, err
		}
		h, _ := s.attachHandle(truncate)
		return h, nil
	}
}

var errSessionExists = errors.New("session exists")

func (w *writeBack) startAttr(ctx context.Context, ino uint64) (wire.Attr, error) {
	if p := w.ns.made(ino); p != nil {
		return w.ns.attrOf(p), nil
	}
	return w.base.Getattr(ctx, ino)
}

func (w *writeBack) lookupBase(ctx context.Context, parent uint64, name string) (Entry, error) {
	return w.base.Lookup(ctx, parent, name)
}

func (w *writeBack) listBase(ctx context.Context, ino uint64) (DirPage, error) {
	return w.base.Readdir(ctx, ino, 0)
}

func (w *writeBack) startSession(ino uint64, attr wire.Attr, orphan bool) (*session, error) {
	id, err := newSessionID()
	if err != nil {
		return nil, err
	}
	data, err := w.journal.openData(id)
	if err != nil {
		return nil, err
	}
	rec := journalRecord{
		ID: id, Ino: ino, Phase: phaseOpen, BaseRev: attr.Rev, BaseSize: attr.Size,
		CleanLimit: attr.Size, Size: attr.Size, Mode: attr.Mode, UID: attr.UID, GID: attr.GID, Orphan: orphan,
	}
	if w.nameOf != nil {
		if parent, name, ok := w.nameOf(ino); ok {
			rec.Parent, rec.Name = parent, name
		}
	}
	s := newSession(w, rec, data)
	s.size = attr.Size
	s.attr = attr
	if err := w.journal.save(s.rec); err != nil {
		s.closeFiles()
		_ = w.journal.remove(id)
		return nil, err
	}
	w.mu.Lock()
	if _, taken := w.sessions[ino]; taken {
		w.mu.Unlock()
		s.closeFiles()
		_ = w.journal.remove(id)
		return nil, errSessionExists
	}
	w.sessions[ino] = s
	w.mu.Unlock()
	return s, nil
}

func (w *writeBack) Create(ctx context.Context, args CreateArgs) (Entry, InodeWriteHandle, error) {
	e, err := w.ns.draft(nameCreate, args, w.rootOfDir(args.Parent))
	if err != nil {
		return Entry{}, nil, err
	}
	entry := Entry{Ino: e.Ino, Attr: w.ns.attrOf(&pendingName{nameEntry: e})}
	h, err := w.handleFor(entry, args, false)
	if err != nil {
		return Entry{}, nil, err
	}
	if _, err := w.ns.add(e); err != nil {
		h.Close()
		return Entry{}, nil, err
	}
	return entry, h, nil
}

func (w *writeBack) rootOfDir(parent uint64) string {
	if p := w.ns.made(parent); p != nil {
		return p.Root
	}
	if w.rootOf == nil {
		return ""
	}
	return w.rootOf(parent)
}

func (w *writeBack) Tmpfile(ctx context.Context, args CreateArgs) (Entry, InodeWriteHandle, error) {
	if err := w.ns.settle(ctx, args.Parent); err != nil {
		return Entry{}, nil, err
	}
	reply, err := w.mutate(ctx, wire.OpTmpfile, wire.Meta{
		wire.KeyParent: args.Parent, wire.KeyMode: uint64(args.Mode),
		wire.KeyUid: optID(args.UID), wire.KeyGid: optID(args.GID),
	}, nil)
	if err != nil {
		return Entry{}, nil, err
	}
	entry, err := wire.ParseEntry(reply.Meta)
	if err != nil {
		return Entry{}, nil, err
	}
	h, err := w.handleFor(entry, args, true)
	if err != nil {
		return Entry{}, nil, err
	}
	return entry, h, nil
}

func (w *writeBack) handleFor(entry Entry, args CreateArgs, orphan bool) (InodeWriteHandle, error) {
	for {
		if s := w.sessionOf(entry.Ino); s != nil {
			if h, ok := s.attachHandle(false); ok {
				return h, nil
			}
			yieldOnce()
			continue
		}
		s, err := w.startSession(entry.Ino, entry.Attr, orphan)
		if errors.Is(err, errSessionExists) {
			continue
		}
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		if !orphan {
			s.rec.Parent, s.rec.Name = args.Parent, args.Name
		}
		s.mu.Unlock()
		h, _ := s.attachHandle(false)
		return h, nil
	}
}

func optID(id *uint32) any {
	if id == nil {
		return nil
	}
	return uint64(*id)
}

func logJournal(ino uint64, err error) {
	fmt.Fprintln(os.Stderr, "journal:", ino, err)
}
