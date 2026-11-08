package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

type writeBack struct {
	*blockCache
	hub     *hubClient
	journal *journal
	ctx     context.Context
	cancel  context.CancelFunc
	workers sync.WaitGroup
	wake    chan struct{}
	wmu     sync.Mutex
	live    map[location]*session
	stuck   []*session
	queue   []*session
	changed func(root mountRoot, paths []string)
}

func newWriteBack(cache *blockCache, hub *hubClient, dir string) (*writeBack, error) {
	j, err := openJournal(dir)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	w := &writeBack{
		blockCache: cache, hub: hub, journal: j, ctx: ctx, cancel: cancel,
		wake: make(chan struct{}, 1), live: map[location]*session{},
	}
	if err := w.replay(); err != nil {
		cancel()
		return nil, err
	}
	w.workers.Add(1)
	go w.run()
	return w, nil
}

func (w *writeBack) Close() {
	w.cancel()
	w.workers.Wait()
	w.blockCache.Close()
}

func (w *writeBack) SetReachable(reachable bool) {
	w.blockCache.SetReachable(reachable)
	if reachable {
		w.signal()
	}
}

func (w *writeBack) signal() {
	select {
	case w.wake <- struct{}{}:
	default:
	}
}

func (w *writeBack) enqueue(s *session) {
	w.wmu.Lock()
	w.queue = append(w.queue, s)
	w.wmu.Unlock()
	w.signal()
}

func (w *writeBack) replay() error {
	records, err := w.journal.load()
	if err != nil {
		return err
	}
	known := map[string]bool{}
	for _, rec := range records {
		known[rec.ID] = true
		if err := w.restore(rec); err != nil {
			return err
		}
	}
	return w.sweepOrphans(known)
}

func (w *writeBack) restore(rec journalRecord) error {
	if rec.Phase == phaseOpen {
		fmt.Fprintln(os.Stderr, "journal: dropped a write that was not closed before the helper stopped:", rec.Path)
		return w.journal.remove(rec.ID)
	}
	data, err := w.journal.openData(rec.ID)
	if err != nil {
		return err
	}
	info, err := data.Stat()
	if err != nil {
		return err
	}
	rec.Size = min(rec.Size, info.Size())
	s := &session{rec: rec, data: data, size: rec.Size, dirty: true}
	switch rec.Phase {
	case phaseSealed, phaseFailed:
		s.rec.Phase = phaseSealed
		w.live[location{rec.Root, rec.Path}] = s
		w.queue = append(w.queue, s)
	default:
		w.stuck = append(w.stuck, s)
	}
	return nil
}

func (w *writeBack) sweepOrphans(known map[string]bool) error {
	names, err := filepath.Glob(filepath.Join(w.journal.dir, "*.data"))
	if err != nil {
		return err
	}
	for _, name := range names {
		id := filepath.Base(name[:len(name)-len(".data")])
		if !known[id] {
			if err := os.Remove(name); err != nil {
				return err
			}
		}
	}
	return nil
}

func (w *writeBack) run() {
	defer w.workers.Done()
	for {
		s := w.next()
		if s == nil {
			return
		}
		w.upload(s)
	}
}

func (w *writeBack) next() *session {
	for {
		w.wmu.Lock()
		if len(w.queue) > 0 && !w.blockCache.offline.Load() {
			s := w.queue[0]
			w.queue = w.queue[1:]
			w.wmu.Unlock()
			return s
		}
		w.wmu.Unlock()
		select {
		case <-w.wake:
		case <-w.ctx.Done():
			return nil
		}
	}
}

func (w *writeBack) upload(s *session) {
	s.mu.Lock()
	if s.finished || s.rec.Phase != phaseSealed || s.handles != 0 || s.busy != nil {
		s.mu.Unlock()
		return
	}
	s.busy = make(chan struct{})
	rec := s.rec
	s.mu.Unlock()
	err := w.hub.upload(w.ctx, transfer{
		target: rec.Target, location: rec.Location, size: rec.Size, src: s.data,
		located: func(location string) error { return w.locate(s, location) },
	})
	w.settle(s, err)
}

func (w *writeBack) locate(s *session, location string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rec.Location = location
	return w.journal.save(s.rec)
}

func (w *writeBack) clearBusy(s *session) {
	s.mu.Lock()
	close(s.busy)
	s.busy = nil
	s.mu.Unlock()
}

func (w *writeBack) settle(s *session, err error) {
	switch {
	case err == nil:
		w.complete(s)
	case w.ctx.Err() != nil:
		w.clearBusy(s)
	case errors.Is(err, errStaleBase):
		w.diverge(s)
	case isTransient(err):
		w.blockCache.SetReachable(false)
		w.clearBusy(s)
		w.requeue(s)
	default:
		fmt.Fprintln(os.Stderr, "upload:", s.rec.Path, err)
		w.strand(s, phaseFailed)
		w.clearBusy(s)
	}
}

func (w *writeBack) diverge(s *session) {
	if err := w.keepBoth(w.ctx, s); err != nil {
		fmt.Fprintln(os.Stderr, "conflict:", s.rec.Path, err)
		w.strand(s, phaseFailed)
		w.clearBusy(s)
		return
	}
	w.clearBusy(s)
	w.requeue(s)
}

func (w *writeBack) requeue(s *session) {
	w.wmu.Lock()
	w.queue = append([]*session{s}, w.queue...)
	w.wmu.Unlock()
}

func (w *writeBack) complete(s *session) {
	root, p := s.rec.Root, s.rec.Path
	w.blockCache.Invalidate(root, []string{p})
	s.mu.Lock()
	s.finished = true
	s.mu.Unlock()
	w.wmu.Lock()
	if w.live[location{root, p}] == s {
		delete(w.live, location{root, p})
	}
	w.wmu.Unlock()
	w.clearBusy(s)
	w.discard(s)
	w.notify(root, []string{p})
}
