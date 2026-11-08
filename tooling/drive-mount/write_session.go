package main

import (
	"context"
	"fmt"
	"os"
	"path"
	"slices"
)

func (w *writeBack) begin(rec journalRecord, dirty bool, fill func(*os.File) error) (WriteHandle, error) {
	id, err := newSessionID()
	if err != nil {
		return nil, err
	}
	rec.ID = id
	data, err := w.journal.openData(id)
	if err != nil {
		return nil, err
	}
	s := &session{rec: rec, data: data, dirty: dirty, handles: 1}
	if err := w.stage(s, fill); err != nil {
		w.discard(s)
		return nil, err
	}
	loc := location{rec.Root, rec.Path}
	w.wmu.Lock()
	if _, taken := w.live[loc]; taken {
		w.wmu.Unlock()
		w.discard(s)
		return nil, errExists
	}
	w.live[loc] = s
	w.wmu.Unlock()
	w.notify(rec.Root, nil)
	return &sessionHandle{wb: w, s: s}, nil
}

func (w *writeBack) stage(s *session, fill func(*os.File) error) error {
	if err := w.journal.save(s.rec); err != nil {
		return err
	}
	if err := fill(s.data); err != nil {
		return err
	}
	info, err := s.data.Stat()
	if err != nil {
		return err
	}
	s.size = info.Size()
	return nil
}

func (w *writeBack) discard(s *session) {
	s.data.Close()
	if err := w.journal.remove(s.rec.ID); err != nil {
		fmt.Fprintln(os.Stderr, "journal:", s.rec.Path, err)
	}
}

func (w *writeBack) release(s *session) error {
	s.mu.Lock()
	s.handles--
	if s.handles > 0 {
		s.mu.Unlock()
		return nil
	}
	if s.finished {
		s.data.Close()
		s.mu.Unlock()
		return nil
	}
	if !s.dirty {
		s.mu.Unlock()
		w.forget(s)
		return nil
	}
	err := w.seal(s)
	s.mu.Unlock()
	if err != nil {
		w.strand(s, phaseFailed)
		return err
	}
	w.enqueue(s)
	return nil
}

func (w *writeBack) seal(s *session) error {
	if err := s.data.Sync(); err != nil {
		return err
	}
	s.rec.Size = s.size
	s.rec.Phase = phaseSealed
	return w.journal.save(s.rec)
}

func (w *writeBack) forget(s *session) {
	w.wmu.Lock()
	if w.live[location{s.rec.Root, s.rec.Path}] == s {
		delete(w.live, location{s.rec.Root, s.rec.Path})
	}
	w.wmu.Unlock()
	w.discard(s)
	w.notify(s.rec.Root, nil)
}

func (w *writeBack) strand(s *session, phase string) {
	s.mu.Lock()
	s.rec.Phase = phase
	if err := w.journal.save(s.rec); err != nil {
		fmt.Fprintln(os.Stderr, "journal:", s.rec.Path, err)
	}
	s.mu.Unlock()
	w.wmu.Lock()
	if w.live[location{s.rec.Root, s.rec.Path}] == s {
		delete(w.live, location{s.rec.Root, s.rec.Path})
	}
	w.stuck = append(w.stuck, s)
	w.wmu.Unlock()
	w.notify(s.rec.Root, nil)
}

func (w *writeBack) notify(root mountRoot, paths []string) {
	w.wmu.Lock()
	changed := w.changed
	w.wmu.Unlock()
	if changed != nil {
		changed(root, paths)
	}
}

func (w *writeBack) OnChange(fn func(root mountRoot, paths []string)) {
	w.wmu.Lock()
	w.changed = fn
	w.wmu.Unlock()
}

func (w *writeBack) Size(root mountRoot, p string) (int64, bool) {
	w.wmu.Lock()
	s := w.live[location{root, p}]
	w.wmu.Unlock()
	if s == nil {
		return 0, false
	}
	return s.currentSize(), true
}

func (w *writeBack) Pending(root mountRoot) int64 {
	w.wmu.Lock()
	defer w.wmu.Unlock()
	var held int64
	for loc := range w.live {
		if loc.root == root {
			held++
		}
	}
	for _, s := range w.stuck {
		if s.rec.Root == root {
			held++
		}
	}
	return held
}

func (w *writeBack) liveIn(root mountRoot, dir string) []*session {
	w.wmu.Lock()
	defer w.wmu.Unlock()
	var found []*session
	for loc, s := range w.live {
		if loc.root == root && path.Dir(loc.path) == dir {
			found = append(found, s)
		}
	}
	return found
}

func (w *writeBack) List(ctx context.Context, root mountRoot, dir string) ([]entry, error) {
	items, err := w.blockCache.List(ctx, root, dir)
	if err != nil {
		return nil, err
	}
	items = slices.Clone(items)
	for _, s := range w.liveIn(root, dir) {
		name := path.Base(s.rec.Path)
		size := s.currentSize()
		at := slices.IndexFunc(items, func(it entry) bool { return it.Name == name })
		if at >= 0 {
			items[at].Size = size
			continue
		}
		items = append(items, entry{Name: name, Size: size})
	}
	return items, nil
}

func (w *writeBack) ReadAt(ctx context.Context, root mountRoot, p string, off int64, dst []byte) (int, error) {
	w.wmu.Lock()
	s := w.live[location{root, p}]
	w.wmu.Unlock()
	if s == nil {
		return w.blockCache.ReadAt(ctx, root, p, off, dst)
	}
	return s.readAt(dst, off)
}
