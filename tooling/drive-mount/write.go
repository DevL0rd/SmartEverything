package main

import (
	"context"
	"errors"
	"io"
	"os"
	"path"
	"sync"
	"time"
)

const copyChunk = 1 << 20

var (
	errIsDir    = errors.New("is a directory")
	errExists   = errors.New("already exists")
	errNoFolder = errors.New("this level of the library folder has no hub folder to create files in")
)

type WriteHandle interface {
	WriteAt(p []byte, off int64) (int, error)
	ReadAt(p []byte, off int64) (int, error)
	Size() int64
	Truncate(size int64) error
	Sync() error
	Close() error
}

type Writer interface {
	Create(ctx context.Context, root mountRoot, p string) (WriteHandle, error)
	OpenWrite(ctx context.Context, root mountRoot, p string, truncate bool) (WriteHandle, error)
	Size(root mountRoot, p string) (int64, bool)
	Pending(root mountRoot) int64
	OnChange(func(root mountRoot, paths []string))
	Mkdir(ctx context.Context, root mountRoot, p string) error
	Remove(ctx context.Context, root mountRoot, p string, dir bool) error
	Rename(ctx context.Context, root mountRoot, from, to string, replace bool) error
	SetTimes(ctx context.Context, root mountRoot, p string, at time.Time) error
	Truncate(ctx context.Context, root mountRoot, p string, size int64) error
}

type Filesystem interface {
	ContentSource
	Writer
	SetReachable(reachable bool)
	Invalidate(root mountRoot, paths []string)
	Stat(ctx context.Context, root mountRoot, p string) (entry, error)
}

type session struct {
	mu       sync.Mutex
	rec      journalRecord
	data     *os.File
	size     int64
	dirty    bool
	handles  int
	busy     chan struct{}
	finished bool
}

type sessionHandle struct {
	wb     *writeBack
	s      *session
	closed sync.Once
	err    error
}

func (h *sessionHandle) WriteAt(p []byte, off int64) (int, error) {
	n, err := h.s.data.WriteAt(p, off)
	h.s.mu.Lock()
	h.s.dirty = true
	h.s.size = max(h.s.size, off+int64(n))
	h.s.mu.Unlock()
	return n, err
}

func (h *sessionHandle) ReadAt(p []byte, off int64) (int, error) {
	return h.s.readAt(p, off)
}

func (h *sessionHandle) Size() int64 { return h.s.currentSize() }

func (h *sessionHandle) Close() error {
	h.closed.Do(func() { h.err = h.wb.release(h.s) })
	return h.err
}

func (s *session) currentSize() int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.size
}

func (s *session) readAt(p []byte, off int64) (int, error) {
	size := s.currentSize()
	if off >= size || len(p) == 0 {
		return 0, nil
	}
	n, err := s.data.ReadAt(p[:min(int64(len(p)), size-off)], off)
	if errors.Is(err, io.EOF) {
		err = nil
	}
	return n, err
}

func (w *writeBack) stat(ctx context.Context, root mountRoot, p string) (entry, error) {
	items, err := w.List(ctx, root, path.Dir(p))
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

func (w *writeBack) Stat(ctx context.Context, root mountRoot, p string) (entry, error) {
	return w.stat(ctx, root, p)
}

func (w *writeBack) parentFolder(ctx context.Context, root mountRoot, p string) (string, error) {
	dir := path.Dir(p)
	if dir == "/" || dir == "." {
		if root.FolderID == "" {
			return "", errNoFolder
		}
		return root.FolderID, nil
	}
	folder, err := w.stat(ctx, root, dir)
	if err != nil {
		return "", err
	}
	if !folder.Dir {
		return "", errNotFound
	}
	return folder.ID, nil
}

func (w *writeBack) Create(ctx context.Context, root mountRoot, p string) (WriteHandle, error) {
	folder, err := w.parentFolder(ctx, root, p)
	if err != nil {
		return nil, err
	}
	if _, err := w.stat(ctx, root, p); err == nil {
		return nil, errExists
	} else if !errors.Is(err, errNotFound) {
		return nil, err
	}
	rec := journalRecord{Root: root, Path: p, Phase: phaseOpen, Target: uploadTarget{FolderID: folder, Name: path.Base(p)}}
	return w.begin(rec, true, func(*os.File) error { return nil })
}

func (w *writeBack) OpenWrite(ctx context.Context, root mountRoot, p string, truncate bool) (WriteHandle, error) {
	loc := location{root, p}
	for {
		s, wait := w.attach(loc)
		if s != nil {
			return w.reopened(s, truncate)
		}
		if wait == nil {
			break
		}
		select {
		case <-wait:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	e, err := w.stat(ctx, root, p)
	if err != nil {
		return nil, err
	}
	if e.Dir {
		return nil, errIsDir
	}
	rec := journalRecord{Root: root, Path: p, Phase: phaseOpen, Target: uploadTarget{ItemID: e.ID, BaseRev: e.Rev}}
	return w.begin(rec, truncate && e.Size > 0, func(staged *os.File) error {
		if truncate {
			return nil
		}
		return w.stageContent(ctx, staged, loc, e)
	})
}

func (w *writeBack) stageContent(ctx context.Context, staged *os.File, loc location, e entry) error {
	buf := make([]byte, copyChunk)
	for off := int64(0); off < e.Size; {
		n, err := w.blockCache.ReadAt(ctx, loc.root, loc.path, off, buf)
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrUnexpectedEOF
		}
		if _, err := staged.WriteAt(buf[:n], off); err != nil {
			return err
		}
		off += int64(n)
	}
	return nil
}

func (w *writeBack) reopened(s *session, truncate bool) (WriteHandle, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if truncate {
		if err := s.data.Truncate(0); err != nil {
			s.handles--
			return nil, err
		}
		s.size = 0
		s.dirty = true
	}
	return &sessionHandle{wb: w, s: s}, nil
}

func (w *writeBack) attach(loc location) (*session, <-chan struct{}) {
	w.wmu.Lock()
	defer w.wmu.Unlock()
	s := w.live[loc]
	if s == nil {
		return nil, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.busy != nil {
		return nil, s.busy
	}
	s.handles++
	return s, nil
}
