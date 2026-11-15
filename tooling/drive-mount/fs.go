//go:build linux

package main

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
	"github.com/smarteverything/drive-mount/wire"
)

const (
	statBlock        = 4096
	statxBasicAndBtm = 0x7ff | 0x800
	posixEndOfFile   = 0x7fff_ffff_ffff_ffff
)

type fuseMount struct {
	src     InodeFilesystem
	root    string
	point   string
	uid     uint32
	gid     uint32
	open    *openCounter
	options mountOptions
	nodes   sync.Map
}

type node struct {
	fs.Inode
	m *fuseMount
}

var (
	_ fs.NodeGetattrer      = (*node)(nil)
	_ fs.NodeStatxer        = (*node)(nil)
	_ fs.NodeLookuper       = (*node)(nil)
	_ fs.NodeOpendirHandler = (*node)(nil)
	_ fs.NodeStatfser       = (*node)(nil)
	_ fs.NodeOnForgetter    = (*node)(nil)
)

var negativeLifetime time.Duration

func init() {
	live.subscribe(func(f liveFields) { setNegativeLifetime(f.negative.duration()) })
}

func setNegativeLifetime(d time.Duration) { atomic.StoreInt64((*int64)(&negativeLifetime), int64(d)) }

func (n *node) ino() uint64 { return n.StableAttr().Ino }

func typeBits(kind uint8) uint32 {
	switch kind {
	case wire.InodeTypeDirectory:
		return syscall.S_IFDIR
	case wire.InodeTypeSymlink:
		return syscall.S_IFLNK
	case wire.InodeTypeFifo:
		return syscall.S_IFIFO
	case wire.InodeTypeSocket:
		return syscall.S_IFSOCK
	case wire.InodeTypeChar:
		return syscall.S_IFCHR
	case wire.InodeTypeBlock:
		return syscall.S_IFBLK
	default:
		return syscall.S_IFREG
	}
}

func specialType(mode uint32) (uint8, bool) {
	switch mode & syscall.S_IFMT {
	case syscall.S_IFIFO:
		return wire.InodeTypeFifo, true
	case syscall.S_IFSOCK:
		return wire.InodeTypeSocket, true
	case syscall.S_IFCHR:
		return wire.InodeTypeChar, true
	case syscall.S_IFBLK:
		return wire.InodeTypeBlock, true
	default:
		return 0, false
	}
}

func (m *fuseMount) owner(a Attr) (uint32, uint32) {
	uid, gid := m.uid, m.gid
	if a.UID != nil {
		uid = *a.UID
	}
	if a.GID != nil {
		gid = *a.GID
	}
	return uid, gid
}

func (m *fuseMount) wireOwner(id, own uint32) *uint32 {
	if id == own {
		return nil
	}
	return &id
}

func (m *fuseMount) callerOwner(ctx context.Context) (*uint32, *uint32) {
	caller, ok := fuse.FromContext(ctx)
	if !ok {
		return nil, nil
	}
	return m.wireOwner(caller.Uid, m.uid), m.wireOwner(caller.Gid, m.gid)
}

func splitNs(ns int64) (uint64, uint32) {
	t := time.Unix(0, ns)
	return uint64(t.Unix()), uint32(t.Nanosecond())
}

func (m *fuseMount) fillAttr(out *fuse.Attr, a Attr) {
	out.Ino = a.Ino
	out.Size = a.Size
	out.Blocks = a.Blocks
	out.Blksize = statBlock
	out.Nlink = a.Nlink
	out.Mode = typeBits(a.Type) | a.Mode&0o7777
	out.Uid, out.Gid = m.owner(a)
	out.Rdev = a.Rdev
	out.Atime, out.Atimensec = splitNs(a.AtimeNs)
	out.Mtime, out.Mtimensec = splitNs(a.MtimeNs)
	out.Ctime, out.Ctimensec = splitNs(a.CtimeNs)
}

func (m *fuseMount) fillStatx(out *fuse.Statx, a Attr) {
	out.Mask = statxBasicAndBtm
	out.Blksize = statBlock
	out.Nlink = a.Nlink
	out.Uid, out.Gid = m.owner(a)
	out.Mode = uint16(typeBits(a.Type) | a.Mode&0o7777)
	out.Ino = a.Ino
	out.Size = a.Size
	out.Blocks = a.Blocks
	out.Atime.Sec, out.Atime.Nsec = splitNs(a.AtimeNs)
	out.Mtime.Sec, out.Mtime.Nsec = splitNs(a.MtimeNs)
	out.Ctime.Sec, out.Ctime.Nsec = splitNs(a.CtimeNs)
	out.Btime.Sec, out.Btime.Nsec = splitNs(a.BtimeNs)
	out.RdevMajor = a.Rdev >> 8 & 0xfff
	out.RdevMinor = a.Rdev&0xff | a.Rdev>>12&0xfff00
}

func errnoFor(err error) syscall.Errno {
	if err == nil {
		return 0
	}
	var errno syscall.Errno
	if errors.As(err, &errno) {
		return errno
	}
	return wire.ErrnoOf(err)
}

func (m *fuseMount) adopt(ctx context.Context, parent *fs.Inode, e Entry) *fs.Inode {
	inode := parent.NewInode(ctx, &node{m: m}, fs.StableAttr{Ino: e.Ino, Mode: typeBits(e.Attr.Type)})
	m.nodes.Store(e.Ino, inode)
	return inode
}

func (m *fuseMount) entry(ctx context.Context, parent *fs.Inode, e Entry, out *fuse.EntryOut) *fs.Inode {
	m.fillAttr(&out.Attr, e.Attr)
	l := live.load()
	out.SetEntryTimeout(l.entry.duration())
	out.SetAttrTimeout(l.attr.duration())
	return m.adopt(ctx, parent, e)
}

func (n *node) OnForget() {
	n.m.nodes.CompareAndDelete(n.ino(), n.EmbeddedInode())
}

func (n *node) Getattr(ctx context.Context, f fs.FileHandle, out *fuse.AttrOut) syscall.Errno {
	a, err := n.m.src.Getattr(ctx, n.ino())
	if err != nil {
		return errnoFor(err)
	}
	if h, ok := f.(*fileHandle); ok && h.write != nil {
		a.Size = uint64(h.write.Size())
	}
	n.m.fillAttr(&out.Attr, a)
	out.SetTimeout(live.load().attr.duration())
	return 0
}

func (n *node) Statx(ctx context.Context, f fs.FileHandle, flags, mask uint32, out *fuse.StatxOut) syscall.Errno {
	a, err := n.m.src.Getattr(ctx, n.ino())
	if err != nil {
		return errnoFor(err)
	}
	if h, ok := f.(*fileHandle); ok && h.write != nil {
		a.Size = uint64(h.write.Size())
	}
	n.m.fillStatx(&out.Statx, a)
	out.SetTimeout(live.load().attr.duration())
	return 0
}

func (n *node) Lookup(ctx context.Context, name string, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	e, err := n.m.src.Lookup(ctx, n.ino(), name)
	if err != nil {
		return nil, errnoFor(err)
	}
	return n.m.entry(ctx, n.EmbeddedInode(), e, out), 0
}

func (n *node) Statfs(ctx context.Context, out *fuse.StatfsOut) syscall.Errno {
	s, err := n.m.src.Statfs(ctx, n.ino())
	if err != nil {
		return errnoFor(err)
	}
	out.Blocks = s.Blocks
	out.Bfree = s.Free
	out.Bavail = s.Avail
	out.Files = s.Files
	out.Ffree = s.Ffree
	out.Bsize = s.Bsize
	out.Frsize = s.Bsize
	out.NameLen = s.Namelen
	return 0
}
