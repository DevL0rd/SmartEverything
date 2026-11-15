//go:build linux

package main

import (
	"context"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
)

var (
	_ fs.NodeMknoder    = (*node)(nil)
	_ fs.NodeSymlinker  = (*node)(nil)
	_ fs.NodeReadlinker = (*node)(nil)
	_ fs.NodeLinker     = (*node)(nil)
)

func (n *node) Mknod(ctx context.Context, name string, mode uint32, dev uint32, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	args := n.createArgs(ctx, name, mode)
	args.Rdev = dev
	kind, special := specialType(mode)
	if !special {
		return n.mknodRegular(ctx, args, out)
	}
	args.Type = kind
	e, err := n.m.src.Mknod(ctx, args)
	if err != nil {
		return nil, errnoFor(err)
	}
	return n.m.entry(ctx, n.EmbeddedInode(), e, out), 0
}

func (n *node) mknodRegular(ctx context.Context, args CreateArgs, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	args.Exclusive = true
	e, wh, err := n.m.src.Create(ctx, args)
	if err != nil {
		return nil, errnoFor(err)
	}
	if err := wh.Close(); err != nil {
		return nil, errnoFor(err)
	}
	return n.m.entry(ctx, n.EmbeddedInode(), e, out), 0
}

func (n *node) Symlink(ctx context.Context, target, name string, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	args := n.createArgs(ctx, name, 0o777)
	args.Target = target
	e, err := n.m.src.Symlink(ctx, args)
	if err != nil {
		return nil, errnoFor(err)
	}
	return n.m.entry(ctx, n.EmbeddedInode(), e, out), 0
}

func (n *node) Readlink(ctx context.Context) ([]byte, syscall.Errno) {
	target, err := n.m.src.Readlink(ctx, n.ino())
	if err != nil {
		return nil, errnoFor(err)
	}
	return []byte(target), 0
}

func (n *node) Link(ctx context.Context, target fs.InodeEmbedder, name string, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	source, ok := target.(*node)
	if !ok {
		return nil, syscall.EXDEV
	}
	a, err := n.m.src.Link(ctx, source.ino(), n.ino(), name)
	if err != nil {
		return nil, errnoFor(err)
	}
	return n.m.entry(ctx, n.EmbeddedInode(), Entry{Ino: a.Ino, Attr: a}, out), 0
}
