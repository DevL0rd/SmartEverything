//go:build linux

package main

import (
	"context"
	"path"
	"syscall"
	"time"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
	"golang.org/x/sys/unix"
)

var (
	_ fs.NodeMkdirer   = (*node)(nil)
	_ fs.NodeUnlinker  = (*node)(nil)
	_ fs.NodeRmdirer   = (*node)(nil)
	_ fs.NodeRenamer   = (*node)(nil)
	_ fs.NodeSetattrer = (*node)(nil)
	_ fs.NodeFsyncer   = (*node)(nil)
)

func (n *node) Mkdir(ctx context.Context, name string, mode uint32, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	if err := n.src.Mkdir(ctx, n.root, path.Join(n.hubPath(), name)); err != nil {
		return nil, errnoFor(err)
	}
	child := &node{src: n.src, root: n.root, dir: true, open: n.open}
	out.Mode = fuse.S_IFDIR | 0o755
	return n.NewInode(ctx, child, fs.StableAttr{Mode: fuse.S_IFDIR}), 0
}

func (n *node) Unlink(ctx context.Context, name string) syscall.Errno {
	return errnoFor(n.src.Remove(ctx, n.root, path.Join(n.hubPath(), name), false))
}

func (n *node) Rmdir(ctx context.Context, name string) syscall.Errno {
	return errnoFor(n.src.Remove(ctx, n.root, path.Join(n.hubPath(), name), true))
}

func (n *node) Rename(ctx context.Context, name string, newParent fs.InodeEmbedder, newName string, flags uint32) syscall.Errno {
	target, ok := newParent.(*node)
	if !ok || flags&^unix.RENAME_NOREPLACE != 0 {
		return syscall.EINVAL
	}
	from := path.Join(n.hubPath(), name)
	to := path.Join(target.hubPath(), newName)
	return errnoFor(n.src.Rename(ctx, n.root, from, to, flags&unix.RENAME_NOREPLACE == 0))
}

func (n *node) Setattr(ctx context.Context, f fs.FileHandle, in *fuse.SetAttrIn, out *fuse.AttrOut) syscall.Errno {
	if size, ok := in.GetSize(); ok {
		if errno := n.resize(ctx, f, int64(size)); errno != 0 {
			return errno
		}
	}
	if errno := n.restamp(ctx, in); errno != 0 {
		return errno
	}
	return n.Getattr(ctx, f, out)
}

func (n *node) resize(ctx context.Context, f fs.FileHandle, size int64) syscall.Errno {
	if n.dir {
		return syscall.EISDIR
	}
	if open, ok := f.(*writeFile); ok {
		return errnoFor(open.wh.Truncate(size))
	}
	return errnoFor(n.src.Truncate(ctx, n.root, n.hubPath(), size))
}

func (n *node) restamp(ctx context.Context, in *fuse.SetAttrIn) syscall.Errno {
	at, ok := in.GetMTime()
	if in.Valid&fuse.FATTR_MTIME_NOW != 0 {
		at, ok = time.Now(), true
	}
	if !ok || n.dir {
		return 0
	}
	return errnoFor(n.src.SetTimes(ctx, n.root, n.hubPath(), at))
}

func (n *node) Fsync(ctx context.Context, f fs.FileHandle, flags uint32) syscall.Errno {
	if open, ok := f.(*writeFile); ok {
		return open.Fsync(ctx, flags)
	}
	return 0
}
