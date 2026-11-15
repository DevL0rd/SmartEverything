//go:build linux

package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"sync"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
)

type lockOwner struct {
	owner uint64
	flock bool
}

type lockHolder struct {
	pid uint32
}

type fileHandle struct {
	n      *node
	read   ReadHandle
	write  InodeWriteHandle
	mu     sync.Mutex
	seeker ReadHandle
	owners map[lockOwner]lockHolder
}

var (
	_ fs.NodeOpener = (*node)(nil)

	_ fs.FileReader   = (*fileHandle)(nil)
	_ fs.FileLseeker  = (*fileHandle)(nil)
	_ fs.FileReleaser = (*fileHandle)(nil)
)

func (n *node) Open(ctx context.Context, flags uint32) (fs.FileHandle, uint32, syscall.Errno) {
	h := &fileHandle{n: n}
	if flags&(syscall.O_WRONLY|syscall.O_RDWR) != 0 {
		wh, err := n.m.src.OpenWrite(ctx, n.ino(), flags&syscall.O_TRUNC != 0)
		if err != nil {
			return nil, 0, errnoFor(err)
		}
		h.write = wh
	} else {
		rh, err := n.m.src.Open(ctx, n.ino())
		if err != nil {
			return nil, 0, errnoFor(err)
		}
		h.read = rh
	}
	if flags&syscall.O_ACCMODE != syscall.O_WRONLY {
		n.noteAccess(ctx)
	}
	n.m.open.add(1)
	return h, fuse.FOPEN_KEEP_CACHE, 0
}

func (h *fileHandle) Read(ctx context.Context, dest []byte, off int64) (fuse.ReadResult, syscall.Errno) {
	var got int
	var err error
	if h.write != nil {
		got, err = h.write.ReadAt(dest, off)
	} else {
		got, err = h.read.ReadAt(ctx, dest, off)
	}
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, errnoFor(err)
	}
	return fuse.ReadResultData(dest[:got]), 0
}

func (n *node) noteAccess(ctx context.Context) {
	if !accessDue(ctx, n.m.src, n.m.options, n.ino()) {
		return
	}
	_, strict := n.m.options.notesAccess()
	if _, err := n.m.src.Access(ctx, n.ino(), strict); err != nil {
		fmt.Fprintln(os.Stderr, "access time:", n.ino(), err)
		return
	}
	if errno := n.NotifyContent(-1, 0); errno != 0 && errno != syscall.ENOENT {
		fmt.Fprintln(os.Stderr, "access time: invalidate", n.ino(), errno)
	}
}

func (h *fileHandle) seekSource(ctx context.Context) (ReadHandle, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.read != nil {
		return h.read, nil
	}
	if h.seeker == nil {
		rh, err := h.n.m.src.Open(ctx, h.n.ino())
		if err != nil {
			return nil, err
		}
		h.seeker = rh
	}
	return h.seeker, nil
}

func (h *fileHandle) Lseek(ctx context.Context, off uint64, whence uint32) (uint64, syscall.Errno) {
	source, err := h.seekSource(ctx)
	if err != nil {
		return 0, errnoFor(err)
	}
	at, err := source.Seek(ctx, int64(off), whence)
	if err != nil {
		return 0, errnoFor(err)
	}
	return uint64(at), 0
}

func (h *fileHandle) Release(ctx context.Context) syscall.Errno {
	defer h.n.m.open.add(-1)
	err := h.releaseLocks(ctx, true)
	if h.write != nil {
		err = errors.Join(err, h.write.Close())
	}
	if h.read != nil {
		err = errors.Join(err, h.read.Release(ctx))
	}
	h.mu.Lock()
	seeker := h.seeker
	h.mu.Unlock()
	if seeker != nil {
		err = errors.Join(err, seeker.Release(ctx))
	}
	return errnoFor(err)
}
