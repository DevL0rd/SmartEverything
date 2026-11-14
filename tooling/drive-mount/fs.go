//go:build linux

package main

import (
	"context"
	"errors"
	"net/http"
	"path"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
)

type node struct {
	fs.Inode
	src  Filesystem
	root mountRoot
	dir  bool
	open *openCounter
}

type handle struct {
	open    *openCounter
	release func()
}

func (h *handle) Release(context.Context) syscall.Errno {
	h.release()
	h.open.add(-1)
	return 0
}

var (
	_ fs.NodeGetattrer = (*node)(nil)
	_ fs.NodeReaddirer = (*node)(nil)
	_ fs.NodeLookuper  = (*node)(nil)
	_ fs.NodeOpener    = (*node)(nil)
	_ fs.NodeCreater   = (*node)(nil)
	_ fs.NodeReader    = (*node)(nil)
	_ fs.NodeStatfser  = (*node)(nil)
	_ fs.FileReleaser  = (*handle)(nil)
)

func (n *node) hubPath() string { return "/" + n.Path(nil) }

func (n *node) fileSize(ctx context.Context) (int64, bool, error) {
	p := n.hubPath()
	if size, live := n.src.Size(n.root, p); live {
		return size, true, nil
	}
	e, err := n.src.Stat(ctx, n.root, p)
	return e.Size, false, err
}

func (n *node) Getattr(ctx context.Context, f fs.FileHandle, out *fuse.AttrOut) syscall.Errno {
	if n.dir {
		out.Mode = fuse.S_IFDIR | 0o755
		return 0
	}
	out.Mode = fuse.S_IFREG | 0o644
	if open, ok := f.(*writeFile); ok {
		out.Size = uint64(open.wh.Size())
		out.SetTimeout(0)
		return 0
	}
	size, live, err := n.fileSize(ctx)
	if err != nil {
		return errnoFor(err)
	}
	if live {
		out.SetTimeout(0)
	}
	out.Size = uint64(size)
	return 0
}

func (n *node) Readdir(ctx context.Context) (fs.DirStream, syscall.Errno) {
	items, err := n.src.List(ctx, n.root, n.hubPath())
	if err != nil {
		return nil, errnoFor(err)
	}
	out := make([]fuse.DirEntry, 0, len(items))
	for _, it := range items {
		mode := uint32(fuse.S_IFREG)
		if it.Dir {
			mode = fuse.S_IFDIR
		}
		out = append(out, fuse.DirEntry{Name: it.Name, Mode: mode})
	}
	return fs.NewListDirStream(out), 0
}

func (n *node) Lookup(ctx context.Context, name string, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	items, err := n.src.List(ctx, n.root, n.hubPath())
	if err != nil {
		return nil, errnoFor(err)
	}
	for _, it := range items {
		if it.Name != name {
			continue
		}
		child := &node{src: n.src, root: n.root, dir: it.Dir, open: n.open}
		mode := uint32(fuse.S_IFREG)
		if it.Dir {
			mode = fuse.S_IFDIR
		}
		out.Mode = mode | 0o755
		out.Size = uint64(it.Size)
		return n.NewInode(ctx, child, fs.StableAttr{Mode: mode}), 0
	}
	return nil, syscall.ENOENT
}

func (n *node) Open(ctx context.Context, flags uint32) (fs.FileHandle, uint32, syscall.Errno) {
	if flags&(syscall.O_WRONLY|syscall.O_RDWR) != 0 {
		wh, err := n.src.OpenWrite(ctx, n.root, n.hubPath(), flags&syscall.O_TRUNC != 0)
		if err != nil {
			return nil, 0, errnoFor(err)
		}
		n.open.add(1)
		return &writeFile{wh: wh, open: n.open}, fuse.FOPEN_DIRECT_IO, 0
	}
	n.open.add(1)
	return &handle{open: n.open, release: n.src.Hold(n.root, n.hubPath())}, fuse.FOPEN_KEEP_CACHE, 0
}

func (n *node) Create(ctx context.Context, name string, flags uint32, mode uint32, out *fuse.EntryOut) (*fs.Inode, fs.FileHandle, uint32, syscall.Errno) {
	wh, err := n.src.Create(ctx, n.root, path.Join(n.hubPath(), name))
	if err != nil {
		return nil, nil, 0, errnoFor(err)
	}
	child := &node{src: n.src, root: n.root, open: n.open}
	out.Mode = fuse.S_IFREG | 0o644
	n.open.add(1)
	return n.NewInode(ctx, child, fs.StableAttr{Mode: fuse.S_IFREG}), &writeFile{wh: wh, open: n.open}, fuse.FOPEN_DIRECT_IO, 0
}

func (n *node) Read(ctx context.Context, f fs.FileHandle, dest []byte, off int64) (fuse.ReadResult, syscall.Errno) {
	size, _, err := n.fileSize(ctx)
	if err != nil {
		return nil, errnoFor(err)
	}
	if off >= size {
		return fuse.ReadResultData(nil), 0
	}
	got, err := n.src.ReadAt(ctx, n.root, n.hubPath(), off, dest)
	if err != nil {
		return nil, errnoFor(err)
	}
	return fuse.ReadResultData(dest[:got]), 0
}

func errnoFor(err error) syscall.Errno {
	switch {
	case err == nil:
		return 0
	case errors.Is(err, context.Canceled):
		return syscall.EINTR
	case errors.Is(err, errNotFound):
		return syscall.ENOENT
	case errors.Is(err, errExists):
		return syscall.EEXIST
	case errors.Is(err, errIsDir):
		return syscall.EISDIR
	case errors.Is(err, errNoFolder):
		return syscall.EACCES
	case errors.Is(err, errNotEmpty):
		return syscall.ENOTEMPTY
	case errors.Is(err, errNotDir):
		return syscall.ENOTDIR
	case errors.Is(err, errInvalid):
		return syscall.EINVAL
	case errors.Is(err, errOffline):
		return syscall.ENETUNREACH
	default:
		return hubErrno(err)
	}
}

func hubErrno(err error) syscall.Errno {
	var status hubStatusError
	if !errors.As(err, &status) {
		return syscall.EIO
	}
	switch status.status {
	case http.StatusNotFound:
		return syscall.ENOENT
	case http.StatusConflict:
		return syscall.EEXIST
	case http.StatusForbidden, http.StatusUnauthorized:
		return syscall.EACCES
	case http.StatusBadRequest:
		return syscall.EINVAL
	default:
		return syscall.EIO
	}
}

const statfsBlock = 4096

func (n *node) Statfs(ctx context.Context, out *fuse.StatfsOut) syscall.Errno {
	space, err := n.src.Space(ctx, n.root)
	if err != nil {
		return errnoFor(err)
	}
	out.Bsize = statfsBlock
	out.Frsize = statfsBlock
	out.NameLen = 255
	out.Blocks = uint64(space.Total) / statfsBlock
	out.Bfree = uint64(space.Free) / statfsBlock
	out.Bavail = out.Bfree
	return 0
}
