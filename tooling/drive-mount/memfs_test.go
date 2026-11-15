//go:build linux

package main

import (
	"context"
	"io"
	"sync"
	"sync/atomic"

	"github.com/smarteverything/drive-mount/integration/fakehub"
	"github.com/smarteverything/drive-mount/wire"
)

type memFS struct {
	model    *fakehub.Model
	by       string
	mu       sync.Mutex
	onChange func(Change)
	flushes  atomic.Int64
	syncs    atomic.Int64
	pinned   []uint64
	unpinned []uint64
	opens    atomic.Int64
	closes   atomic.Int64
	dirSync  atomic.Int64
	accesses []bool
	unsub    func()
	queue    chan Change
	inflight atomic.Int64
	stopped  chan struct{}
}

func newMemFS(model *fakehub.Model, by string) *memFS {
	m := &memFS{model: model, by: by, queue: make(chan Change, 4096), stopped: make(chan struct{})}
	m.unsub = model.Subscribe(func(author string, c fakehub.Change) {
		if author == by {
			return
		}
		m.inflight.Add(1)
		m.queue <- Change{Root: "root", Inodes: c.Inodes, Entries: c.Entries, Removed: c.Removed}
	})
	go func() {
		for {
			select {
			case c := <-m.queue:
				m.mu.Lock()
				fn := m.onChange
				m.mu.Unlock()
				if fn != nil {
					fn(c)
				}
				m.inflight.Add(-1)
			case <-m.stopped:
				return
			}
		}
	}()
	return m
}

func (m *memFS) settled() bool { return m.inflight.Load() == 0 }

func (m *memFS) Close() {
	m.unsub()
	close(m.stopped)
}

func (m *memFS) Attach(context.Context, string) (wire.Root, error) { return m.model.Attach(), nil }

func (m *memFS) Lookup(_ context.Context, parent uint64, name string) (Entry, error) {
	return m.model.Lookup(parent, name)
}

func (m *memFS) Getattr(_ context.Context, ino uint64) (Attr, error) { return m.model.Getattr(ino) }

func (m *memFS) Readdir(_ context.Context, ino, cursor uint64) (DirPage, error) {
	return m.model.Readdir(ino, cursor)
}

func (m *memFS) Readlink(_ context.Context, ino uint64) (string, error) { return m.model.Readlink(ino) }

func (m *memFS) Statfs(context.Context, uint64) (Statfs, error) { return m.model.Statfs(), nil }

func (m *memFS) Getxattr(_ context.Context, ino uint64, name string) ([]byte, error) {
	return m.model.Getxattr(ino, name)
}

func (m *memFS) Listxattr(_ context.Context, ino uint64) ([]string, error) {
	return m.model.Listxattr(ino)
}

type memRead struct {
	m   *memFS
	ino uint64
}

func (r *memRead) ReadAt(_ context.Context, dst []byte, off int64) (int, error) {
	data, err := r.m.model.ReadAt(r.ino, uint64(off), len(dst))
	if err != nil {
		return 0, err
	}
	n := copy(dst, data)
	if n < len(dst) {
		return n, io.EOF
	}
	return n, nil
}

func (r *memRead) Seek(_ context.Context, off int64, whence uint32) (int64, error) {
	at, err := r.m.model.Seek(r.ino, uint64(off), whence)
	return int64(at), err
}

func (r *memRead) Release(context.Context) error {
	r.m.closes.Add(1)
	return nil
}

func (m *memFS) Open(_ context.Context, ino uint64) (ReadHandle, error) {
	if _, err := m.model.Getattr(ino); err != nil {
		return nil, err
	}
	m.opens.Add(1)
	return &memRead{m: m, ino: ino}, nil
}

func (m *memFS) Pin(_ context.Context, ino uint64) error {
	m.pinned = append(m.pinned, ino)
	return nil
}

func (m *memFS) Unpin(_ context.Context, ino uint64) error {
	m.unpinned = append(m.unpinned, ino)
	return nil
}

func (m *memFS) Usage(string) int64 { return 0 }

func (m *memFS) PinnedBytes(string) int64 { return 0 }

func (m *memFS) SetPolicy(cachePolicy) error { return nil }

func (m *memFS) OnChange(fn func(Change)) {
	m.mu.Lock()
	m.onChange = fn
	m.mu.Unlock()
}

type memWrite struct {
	m   *memFS
	ino uint64
}

func (w *memWrite) WriteAt(p []byte, off int64) (int, error) {
	if _, err := w.m.model.WriteAt(w.m.by, w.ino, uint64(off), p); err != nil {
		return 0, err
	}
	return len(p), nil
}

func (w *memWrite) ReadAt(p []byte, off int64) (int, error) {
	data, err := w.m.model.ReadAt(w.ino, uint64(off), len(p))
	if err != nil {
		return 0, err
	}
	n := copy(p, data)
	if n < len(p) {
		return n, io.EOF
	}
	return n, nil
}

func (w *memWrite) Size() int64 {
	a, err := w.m.model.Getattr(w.ino)
	if err != nil {
		return 0
	}
	return int64(a.Size)
}

func (w *memWrite) Truncate(size uint64) error {
	_, err := w.m.model.SetSize(w.m.by, w.ino, size)
	return err
}

func (w *memWrite) Allocate(mode uint32, off, length uint64) error {
	return w.m.model.Allocate(w.m.by, w.ino, mode, off, length)
}

func (w *memWrite) Flush() error {
	w.m.flushes.Add(1)
	return nil
}

func (w *memWrite) Sync() error {
	w.m.syncs.Add(1)
	return nil
}

func (w *memWrite) Close() error {
	w.m.closes.Add(1)
	return nil
}

func (m *memFS) Create(_ context.Context, a CreateArgs) (Entry, InodeWriteHandle, error) {
	e, err := m.model.Create(m.by, a.Parent, a.Name, a.Mode, a.UID, a.GID, a.Exclusive)
	if err != nil {
		return Entry{}, nil, err
	}
	m.opens.Add(1)
	return e, &memWrite{m: m, ino: e.Ino}, nil
}

func (m *memFS) OpenWrite(_ context.Context, ino uint64, truncate bool) (InodeWriteHandle, error) {
	if _, err := m.model.Getattr(ino); err != nil {
		return nil, err
	}
	if truncate {
		if _, err := m.model.SetSize(m.by, ino, 0); err != nil {
			return nil, err
		}
	}
	m.opens.Add(1)
	return &memWrite{m: m, ino: ino}, nil
}

func (m *memFS) Tmpfile(_ context.Context, a CreateArgs) (Entry, InodeWriteHandle, error) {
	e, err := m.model.Tmpfile(a.Parent, a.Mode, a.UID, a.GID)
	if err != nil {
		return Entry{}, nil, err
	}
	m.opens.Add(1)
	return e, &memWrite{m: m, ino: e.Ino}, nil
}

func (m *memFS) Mkdir(_ context.Context, a CreateArgs) (Entry, error) {
	return m.model.Mkdir(m.by, a.Parent, a.Name, a.Mode, a.UID, a.GID)
}

func (m *memFS) Mknod(_ context.Context, a CreateArgs) (Entry, error) {
	return m.model.Mknod(m.by, a.Parent, a.Name, a.Type, a.Mode, a.Rdev, a.UID, a.GID)
}

func (m *memFS) Symlink(_ context.Context, a CreateArgs) (Entry, error) {
	return m.model.Symlink(m.by, a.Parent, a.Name, a.Target, a.UID, a.GID)
}

func (m *memFS) Link(_ context.Context, ino, parent uint64, name string) (Attr, error) {
	return m.model.Link(m.by, ino, parent, name)
}

func (m *memFS) Unlink(_ context.Context, parent uint64, name string) error {
	return m.model.Unlink(m.by, parent, name)
}

func (m *memFS) Rmdir(_ context.Context, parent uint64, name string) error {
	return m.model.Rmdir(m.by, parent, name)
}

func (m *memFS) Rename(_ context.Context, a RenameArgs) error {
	return m.model.Rename(m.by, a.Parent, a.Name, a.NewParent, a.NewName, a.Flags)
}

func (t TimeSpec) ns(now func() int64) *int64 {
	if !t.Set {
		return nil
	}
	var v int64
	if t.Now {
		v = now()
	} else {
		v = t.At.UnixNano()
	}
	return &v
}

func (m *memFS) Setattr(_ context.Context, a SetattrArgs) (Attr, error) {
	now := func() int64 { return nowNs() }
	return m.model.Setattr(m.by, a.Ino, a.Valid, a.Mode, a.UID, a.GID, a.Size, a.Atime.ns(now), a.Mtime.ns(now))
}

func (m *memFS) Setxattr(_ context.Context, ino uint64, name string, value []byte, flags uint32) error {
	return m.model.Setxattr(m.by, ino, name, value, flags)
}

func (m *memFS) Removexattr(_ context.Context, ino uint64, name string) error {
	return m.model.Removexattr(m.by, ino, name)
}

func (m *memFS) Fsync(_ context.Context, ino uint64, directory bool) error {
	if directory {
		m.dirSync.Add(1)
	} else {
		m.syncs.Add(1)
	}
	return nil
}

func (m *memFS) Access(_ context.Context, ino uint64, strict bool) (Attr, error) {
	m.mu.Lock()
	m.accesses = append(m.accesses, strict)
	m.mu.Unlock()
	return m.model.Getattr(ino)
}

func (m *memFS) accessed() []bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]bool(nil), m.accesses...)
}

func (m *memFS) Getlk(_ context.Context, a LockArgs) (*Lock, error) {
	return m.model.Getlk(m.by, a.Ino, a.Owner, a.Lock, a.Flock)
}

func (m *memFS) Setlk(ctx context.Context, a LockArgs) error {
	return m.model.Setlk(ctx, m.by, a.Ino, a.Owner, a.Lock, a.Wait, a.Flock)
}

func (m *memFS) Unlock(_ context.Context, a UnlockArgs) error {
	m.model.Unlock(m.by, a.Ino, a.Owner, a.Flock, a.Start, a.End)
	return nil
}

func (m *memFS) Pending(string) int64 { return 0 }

func (m *memFS) SetReachable(bool) {}

func (m *memFS) SwitchRoute(wire.Route) error { return nil }
