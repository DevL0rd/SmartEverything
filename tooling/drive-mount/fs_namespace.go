//go:build linux

package main

import (
	"context"
	"sync"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
	"github.com/smarteverything/drive-mount/wire"
)

var (
	_ fs.NodeMkdirer   = (*node)(nil)
	_ fs.NodeUnlinker  = (*node)(nil)
	_ fs.NodeRmdirer   = (*node)(nil)
	_ fs.NodeRenamer   = (*node)(nil)
	_ fs.NodeSetattrer = (*node)(nil)

	_ fs.FileReaddirenter = (*dirHandle)(nil)
	_ fs.FileSeekdirer    = (*dirHandle)(nil)
	_ fs.FileLookuper     = (*dirHandle)(nil)
	_ fs.FileFsyncdirer   = (*dirHandle)(nil)
	_ fs.FileReleasedirer = (*dirHandle)(nil)
)

type dirHandle struct {
	n      *node
	mu     sync.Mutex
	page   []wire.DirEntry
	pos    int
	cursor uint64
	next   *uint64
	loaded bool
	issued uint64
	last   *wire.DirEntry
}

func (n *node) OpendirHandle(ctx context.Context, flags uint32) (fs.FileHandle, uint32, syscall.Errno) {
	return &dirHandle{n: n}, 0, 0
}

func (h *dirHandle) parentIno() uint64 {
	if _, parent := h.n.Parent(); parent != nil {
		return parent.StableAttr().Ino
	}
	return h.n.ino()
}

func (h *dirHandle) dotEntry(name string, ino uint64) *fuse.DirEntry {
	h.issued++
	return &fuse.DirEntry{Name: name, Mode: syscall.S_IFDIR, Ino: ino, Off: h.issued}
}

func (h *dirHandle) fill(ctx context.Context) syscall.Errno {
	page, err := h.n.m.src.Readdir(ctx, h.n.ino(), h.cursor)
	if err != nil {
		return errnoFor(err)
	}
	h.page, h.pos, h.next, h.loaded = page.Entries, 0, page.Next, true
	return 0
}

func (h *dirHandle) advance(ctx context.Context) (*fuse.DirEntry, syscall.Errno) {
	switch h.issued {
	case 0:
		return h.dotEntry(".", h.n.ino()), 0
	case 1:
		return h.dotEntry("..", h.parentIno()), 0
	}
	for !h.loaded || h.pos >= len(h.page) {
		if h.loaded && h.next == nil {
			return nil, 0
		}
		if h.loaded {
			h.cursor = *h.next
		}
		if errno := h.fill(ctx); errno != 0 {
			return nil, errno
		}
	}
	e := h.page[h.pos]
	h.pos++
	h.issued++
	h.last = &e
	return &fuse.DirEntry{Name: e.Name, Mode: typeBits(e.Attr.Type), Ino: e.Ino, Off: h.issued}, 0
}

func (h *dirHandle) Readdirent(ctx context.Context) (*fuse.DirEntry, syscall.Errno) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.advance(ctx)
}

func (h *dirHandle) Seekdir(ctx context.Context, off uint64) syscall.Errno {
	h.mu.Lock()
	defer h.mu.Unlock()
	if off == h.issued {
		return 0
	}
	h.page, h.pos, h.cursor, h.next, h.loaded, h.issued, h.last = nil, 0, 0, nil, false, 0, nil
	for h.issued < off {
		e, errno := h.advance(ctx)
		if errno != 0 {
			return errno
		}
		if e == nil {
			break
		}
	}
	return 0
}

func (h *dirHandle) Lookup(ctx context.Context, name string, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	h.mu.Lock()
	last := h.last
	h.mu.Unlock()
	if last != nil && last.Name == name {
		return h.n.m.entry(ctx, h.n.EmbeddedInode(), last.Entry, out), 0
	}
	return h.n.Lookup(ctx, name, out)
}

func (h *dirHandle) Fsyncdir(ctx context.Context, flags uint32) syscall.Errno {
	return errnoFor(h.n.m.src.Fsync(ctx, h.n.ino(), true))
}

func (h *dirHandle) Releasedir(ctx context.Context, releaseFlags uint32) {}

func (n *node) createArgs(ctx context.Context, name string, mode uint32) CreateArgs {
	uid, gid := n.m.callerOwner(ctx)
	return CreateArgs{Parent: n.ino(), Name: name, Mode: mode & 0o7777, UID: uid, GID: gid}
}

func (n *node) Mkdir(ctx context.Context, name string, mode uint32, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	e, err := n.m.src.Mkdir(ctx, n.createArgs(ctx, name, mode))
	if err != nil {
		return nil, errnoFor(err)
	}
	return n.m.entry(ctx, n.EmbeddedInode(), e, out), 0
}

func (n *node) Unlink(ctx context.Context, name string) syscall.Errno {
	return errnoFor(n.m.src.Unlink(ctx, n.ino(), name))
}

func (n *node) Rmdir(ctx context.Context, name string) syscall.Errno {
	return errnoFor(n.m.src.Rmdir(ctx, n.ino(), name))
}

func (n *node) Rename(ctx context.Context, name string, newParent fs.InodeEmbedder, newName string, flags uint32) syscall.Errno {
	target, ok := newParent.(*node)
	if !ok {
		return syscall.EINVAL
	}
	return errnoFor(n.m.src.Rename(ctx, RenameArgs{Parent: n.ino(), Name: name, NewParent: target.ino(), NewName: newName, Flags: flags}))
}

func (n *node) setattrArgs(ctx context.Context, in *fuse.SetAttrIn) SetattrArgs {
	args := SetattrArgs{Ino: n.ino()}
	if mode, ok := in.GetMode(); ok {
		args.Valid |= wire.SetattrValidMode
		args.Mode = mode
	}
	if uid, ok := in.GetUID(); ok {
		args.Valid |= wire.SetattrValidUid
		args.UID = n.m.wireOwner(uid, n.m.uid)
	}
	if gid, ok := in.GetGID(); ok {
		args.Valid |= wire.SetattrValidGid
		args.GID = n.m.wireOwner(gid, n.m.gid)
	}
	if size, ok := in.GetSize(); ok {
		args.Valid |= wire.SetattrValidSize
		args.Size = size
	}
	if at, ok := in.GetATime(); ok {
		args.Valid |= wire.SetattrValidAtime
		args.Atime = TimeSpec{Set: true, Now: in.Valid&fuse.FATTR_ATIME_NOW != 0, At: at}
	}
	if at, ok := in.GetMTime(); ok {
		args.Valid |= wire.SetattrValidMtime
		args.Mtime = TimeSpec{Set: true, Now: in.Valid&fuse.FATTR_MTIME_NOW != 0, At: at}
	}
	return args
}

func (n *node) Setattr(ctx context.Context, f fs.FileHandle, in *fuse.SetAttrIn, out *fuse.AttrOut) syscall.Errno {
	args := n.setattrArgs(ctx, in)
	if h, ok := f.(*fileHandle); ok && h.write != nil && args.Valid&wire.SetattrValidSize != 0 {
		if err := h.write.Truncate(args.Size); err != nil {
			return errnoFor(err)
		}
		args.Valid &^= wire.SetattrValidSize
	}
	var a Attr
	var err error
	if args.Valid == 0 {
		a, err = n.m.src.Getattr(ctx, n.ino())
	} else {
		a, err = n.m.src.Setattr(ctx, args)
	}
	if err != nil {
		return errnoFor(err)
	}
	if h, ok := f.(*fileHandle); ok && h.write != nil {
		a.Size = uint64(h.write.Size())
	}
	n.m.fillAttr(&out.Attr, a)
	return 0
}
