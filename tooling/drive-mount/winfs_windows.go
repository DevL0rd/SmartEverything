package main

import (
	"context"
	"errors"
	"path"
	"sync"

	"github.com/winfsp/cgofuse/fuse"
)

type openFile struct {
	ctx    context.Context
	cancel context.CancelFunc
	size   int64
}

type winFS struct {
	fuse.FileSystemBase
	ctx    context.Context
	src    ContentSource
	root   mountRoot
	ready  chan struct{}
	once   sync.Once
	mu     sync.Mutex
	next   uint64
	opened map[uint64]openFile
}

func newWinFS(ctx context.Context, src ContentSource, root mountRoot) *winFS {
	return &winFS{ctx: ctx, src: src, root: root, ready: make(chan struct{}), opened: map[uint64]openFile{}}
}

func (w *winFS) Init() {
	w.once.Do(func() { close(w.ready) })
}

func errnoOf(err error) int {
	if errors.Is(err, context.Canceled) {
		return -fuse.EINTR
	}
	return -fuse.EIO
}

func fillStat(stat *fuse.Stat_t, e entry) {
	stat.Nlink = 1
	if e.Dir {
		stat.Mode = fuse.S_IFDIR | 0o555
		return
	}
	stat.Mode = fuse.S_IFREG | 0o444
	stat.Size = e.Size
}

func (w *winFS) lookup(p string) (entry, int) {
	if p == "/" {
		return entry{Name: "/", Dir: true}, 0
	}
	items, err := w.src.List(w.ctx, w.root, path.Dir(p))
	if err != nil {
		return entry{}, errnoOf(err)
	}
	name := path.Base(p)
	for _, item := range items {
		if item.Name == name {
			return item, 0
		}
	}
	return entry{}, -fuse.ENOENT
}

func (w *winFS) Getattr(p string, stat *fuse.Stat_t, fh uint64) int {
	e, errc := w.lookup(p)
	if errc != 0 {
		return errc
	}
	fillStat(stat, e)
	return 0
}

func (w *winFS) Opendir(p string) (int, uint64) {
	e, errc := w.lookup(p)
	if errc != 0 {
		return errc, ^uint64(0)
	}
	if !e.Dir {
		return -fuse.ENOTDIR, ^uint64(0)
	}
	return 0, 0
}

func (w *winFS) Readdir(p string, fill func(name string, stat *fuse.Stat_t, ofst int64) bool, ofst int64, fh uint64) int {
	items, err := w.src.List(w.ctx, w.root, p)
	if err != nil {
		return errnoOf(err)
	}
	fill(".", nil, 0)
	fill("..", nil, 0)
	for _, item := range items {
		var stat fuse.Stat_t
		fillStat(&stat, item)
		if !fill(item.Name, &stat, 0) {
			break
		}
	}
	return 0
}

func (w *winFS) Open(p string, flags int) (int, uint64) {
	if flags&fuse.O_ACCMODE != fuse.O_RDONLY {
		return -fuse.EROFS, ^uint64(0)
	}
	e, errc := w.lookup(p)
	if errc != 0 {
		return errc, ^uint64(0)
	}
	if e.Dir {
		return -fuse.EISDIR, ^uint64(0)
	}
	ctx, cancel := context.WithCancel(w.ctx)
	w.mu.Lock()
	defer w.mu.Unlock()
	w.next++
	w.opened[w.next] = openFile{ctx: ctx, cancel: cancel, size: e.Size}
	return 0, w.next
}

func (w *winFS) Read(p string, buff []byte, ofst int64, fh uint64) int {
	w.mu.Lock()
	file, ok := w.opened[fh]
	w.mu.Unlock()
	if !ok {
		return -fuse.EIO
	}
	if ofst >= file.size {
		return 0
	}
	got, err := w.src.ReadAt(file.ctx, w.root, p, ofst, buff)
	if err != nil {
		return errnoOf(err)
	}
	return got
}

func (w *winFS) Release(p string, fh uint64) int {
	w.mu.Lock()
	file, ok := w.opened[fh]
	delete(w.opened, fh)
	w.mu.Unlock()
	if ok {
		file.cancel()
	}
	return 0
}

func (w *winFS) Releasedir(p string, fh uint64) int { return 0 }

func (w *winFS) Statfs(p string, stat *fuse.Statfs_t) int {
	stat.Bsize = 4096
	stat.Frsize = 4096
	return 0
}
