//go:build linux

package main

import (
	"context"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
	"github.com/smarteverything/drive-mount/wire"
)

const (
	fallocKeepSize  = 0x01
	fallocPunchHole = 0x02
	fallocZeroRange = 0x10
)

var (
	_ fs.NodeCreater  = (*node)(nil)
	_ fs.NodeTmpfiler = (*node)(nil)

	_ fs.FileWriter    = (*fileHandle)(nil)
	_ fs.FileFlusher   = (*fileHandle)(nil)
	_ fs.FileFsyncer   = (*fileHandle)(nil)
	_ fs.FileAllocater = (*fileHandle)(nil)
)

func (n *node) newWritable(ctx context.Context, e Entry, wh InodeWriteHandle, out *fuse.EntryOut) (*fs.Inode, fs.FileHandle) {
	inode := n.m.entry(ctx, n.EmbeddedInode(), e, out)
	n.m.open.add(1)
	return inode, &fileHandle{n: inode.Operations().(*node), write: wh}
}

func (n *node) Create(ctx context.Context, name string, flags uint32, mode uint32, out *fuse.EntryOut) (*fs.Inode, fs.FileHandle, uint32, syscall.Errno) {
	args := n.createArgs(ctx, name, mode)
	args.Exclusive = flags&syscall.O_EXCL != 0
	e, wh, err := n.m.src.Create(ctx, args)
	if err != nil {
		return nil, nil, 0, errnoFor(err)
	}
	inode, h := n.newWritable(ctx, e, wh, out)
	return inode, h, 0, 0
}

func (n *node) Tmpfile(ctx context.Context, flags uint32, mode uint32, out *fuse.EntryOut) (*fs.Inode, fs.FileHandle, uint32, syscall.Errno) {
	e, wh, err := n.m.src.Tmpfile(ctx, n.createArgs(ctx, "", mode))
	if err != nil {
		return nil, nil, 0, errnoFor(err)
	}
	inode, h := n.newWritable(ctx, e, wh, out)
	return inode, h, 0, 0
}

func (h *fileHandle) Write(ctx context.Context, data []byte, off int64) (uint32, syscall.Errno) {
	if h.write == nil {
		return 0, syscall.EBADF
	}
	written, err := h.write.WriteAt(data, off)
	if err != nil {
		return uint32(written), errnoFor(err)
	}
	return uint32(written), 0
}

func (h *fileHandle) Flush(ctx context.Context) syscall.Errno {
	ctx = uninterruptible(ctx)
	var err error
	if h.write != nil {
		err = h.write.Flush()
	}
	if err == nil {
		err = h.releaseLocks(ctx, false)
	}
	return errnoFor(err)
}

func (h *fileHandle) Fsync(ctx context.Context, flags uint32) syscall.Errno {
	if h.write != nil {
		return errnoFor(h.write.Sync())
	}
	return errnoFor(h.n.m.src.Fsync(uninterruptible(ctx), h.n.ino(), false))
}

func allocateMode(mode uint32) (uint32, bool) {
	switch mode {
	case 0:
		return wire.AllocateAllocate, true
	case fallocKeepSize:
		return wire.AllocateKeepSize, true
	case fallocPunchHole | fallocKeepSize:
		return wire.AllocatePunchHole, true
	case fallocZeroRange:
		return wire.AllocateZeroRange, true
	case fallocZeroRange | fallocKeepSize:
		return wire.AllocateZeroRangeKeepSize, true
	}
	return 0, false
}

func (h *fileHandle) Allocate(ctx context.Context, off uint64, size uint64, mode uint32) syscall.Errno {
	if h.write == nil {
		return syscall.EBADF
	}
	wireMode, ok := allocateMode(mode)
	if !ok {
		return syscall.EOPNOTSUPP
	}
	return errnoFor(h.write.Allocate(wireMode, off, size))
}
