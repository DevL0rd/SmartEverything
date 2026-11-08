package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path"
	"slices"
	"strings"
	"time"
)

var (
	errNotEmpty = errors.New("directory not empty")
	errNotDir   = errors.New("not a directory")
	errInvalid  = errors.New("invalid argument")
)

type parentRef struct {
	id string
}

func (r parentRef) folder(root mountRoot) string {
	if r.id == "" {
		return root.FolderID
	}
	return r.id
}

func (r parentRef) wire() *string {
	if r.id == "" {
		return nil
	}
	return &r.id
}

func (w *writeBack) hubStat(ctx context.Context, root mountRoot, p string) (entry, bool, error) {
	e, err := w.blockCache.stat(ctx, root, p)
	if errors.Is(err, errNotFound) {
		return entry{}, false, nil
	}
	return e, err == nil, err
}

func (w *writeBack) placement(ctx context.Context, root mountRoot, p string) (parentRef, error) {
	dir := path.Dir(p)
	if dir == "/" {
		if root.FolderID == "" {
			return parentRef{}, errNoFolder
		}
		return parentRef{}, nil
	}
	folder, err := w.stat(ctx, root, dir)
	if err != nil {
		return parentRef{}, err
	}
	if !folder.Dir {
		return parentRef{}, errNotDir
	}
	return parentRef{id: folder.ID}, nil
}

func (w *writeBack) Mkdir(ctx context.Context, root mountRoot, p string) error {
	parent, err := w.placement(ctx, root, p)
	if err != nil {
		return err
	}
	if _, err := w.stat(ctx, root, p); err == nil {
		return errExists
	} else if !errors.Is(err, errNotFound) {
		return err
	}
	if _, err := w.hub.mkdir(ctx, root, parent, path.Base(p)); err != nil {
		return err
	}
	w.refresh(root, path.Dir(p))
	return nil
}

func (w *writeBack) Remove(ctx context.Context, root mountRoot, p string, dir bool) error {
	held, err := w.claimUnder(ctx, root, p)
	if err != nil {
		return err
	}
	defer w.unclaim(held)
	exact := sessionAt(held, p)
	if err := removable(held, exact, dir); err != nil {
		return err
	}
	found, ok, err := w.hubStat(ctx, root, p)
	if err != nil {
		return err
	}
	if !ok && exact == nil {
		return errNotFound
	}
	if ok {
		if err := w.removeHub(ctx, root, p, found, dir); err != nil {
			return err
		}
	}
	if exact != nil {
		w.drop(exact)
	}
	w.refresh(root, p)
	return nil
}

func removable(held []*session, exact *session, dir bool) error {
	switch {
	case !dir:
		return nil
	case exact != nil:
		return errNotDir
	case len(held) > 0:
		return errNotEmpty
	}
	return nil
}

func (w *writeBack) removeHub(ctx context.Context, root mountRoot, p string, found entry, dir bool) error {
	if found.Dir != dir {
		if dir {
			return errNotDir
		}
		return errIsDir
	}
	if dir {
		if err := w.requireEmpty(ctx, root, p); err != nil {
			return err
		}
	}
	return w.hub.remove(ctx, root, found)
}

func (w *writeBack) requireEmpty(ctx context.Context, root mountRoot, dir string) error {
	items, err := w.List(ctx, root, dir)
	if err != nil {
		return err
	}
	if len(items) > 0 {
		return errNotEmpty
	}
	return nil
}

func (w *writeBack) SetTimes(ctx context.Context, root mountRoot, p string, at time.Time) error {
	held, err := w.claimUnder(ctx, root, p)
	if err != nil {
		return err
	}
	defer w.unclaim(held)
	if sessionAt(held, p) != nil {
		return nil
	}
	found, ok, err := w.hubStat(ctx, root, p)
	if err != nil {
		return err
	}
	if !ok {
		return errNotFound
	}
	if err := w.hub.stamp(ctx, root, found, at); err != nil {
		return err
	}
	w.refresh(root, p)
	return nil
}

func (w *writeBack) refresh(root mountRoot, paths ...string) {
	w.blockCache.Invalidate(root, paths)
	w.hub.forget(root, paths...)
	w.notify(root, nil)
}

func sessionAt(held []*session, p string) *session {
	at := slices.IndexFunc(held, func(s *session) bool { return s.rec.Path == p })
	if at < 0 {
		return nil
	}
	return held[at]
}

func (w *writeBack) sessionsUnder(root mountRoot, p string) []*session {
	w.wmu.Lock()
	defer w.wmu.Unlock()
	prefix := strings.TrimSuffix(p, "/") + "/"
	var found []*session
	for loc, s := range w.live {
		if loc.root == root && (loc.path == p || strings.HasPrefix(loc.path, prefix)) {
			found = append(found, s)
		}
	}
	return found
}

func (w *writeBack) claimUnder(ctx context.Context, root mountRoot, p string) ([]*session, error) {
	var claimed []*session
	for _, s := range w.sessionsUnder(root, p) {
		held, err := w.freeze(ctx, s)
		if err != nil {
			w.unclaim(claimed)
			return nil, err
		}
		if held {
			claimed = append(claimed, s)
		}
	}
	return claimed, nil
}

func (w *writeBack) freeze(ctx context.Context, s *session) (bool, error) {
	for {
		s.mu.Lock()
		if s.finished {
			s.mu.Unlock()
			return false, nil
		}
		if s.busy == nil {
			s.busy = make(chan struct{})
			s.mu.Unlock()
			return true, nil
		}
		wait := s.busy
		s.mu.Unlock()
		select {
		case <-wait:
		case <-ctx.Done():
			return false, ctx.Err()
		}
	}
}

func (w *writeBack) unclaim(held []*session) {
	for _, s := range held {
		s.mu.Lock()
		if s.busy != nil {
			close(s.busy)
			s.busy = nil
		}
		again := !s.finished && s.rec.Phase == phaseSealed && s.handles == 0
		s.mu.Unlock()
		if again {
			w.enqueue(s)
		}
	}
}

func (w *writeBack) drop(s *session) {
	w.wmu.Lock()
	loc := location{s.rec.Root, s.rec.Path}
	if w.live[loc] == s {
		delete(w.live, loc)
	}
	w.wmu.Unlock()
	s.mu.Lock()
	s.finished = true
	if s.handles == 0 {
		s.data.Close()
	}
	s.mu.Unlock()
	if err := w.journal.remove(s.rec.ID); err != nil {
		fmt.Fprintln(os.Stderr, "journal:", s.rec.Path, err)
	}
}

func (w *writeBack) rekey(s *session, to string, target uploadTarget) error {
	s.mu.Lock()
	updated := s.rec
	updated.Path = to
	if target != updated.Target {
		updated.Location = ""
	}
	updated.Target = target
	if err := w.journal.save(updated); err != nil {
		s.mu.Unlock()
		return err
	}
	old := location{s.rec.Root, s.rec.Path}
	s.rec = updated
	s.mu.Unlock()
	w.wmu.Lock()
	if w.live[old] == s {
		delete(w.live, old)
	}
	w.live[location{updated.Root, to}] = s
	w.wmu.Unlock()
	return nil
}
