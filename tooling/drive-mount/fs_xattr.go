//go:build linux

package main

import (
	"context"
	"strings"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/smarteverything/drive-mount/wire"
)

var (
	_ fs.NodeGetxattrer    = (*node)(nil)
	_ fs.NodeSetxattrer    = (*node)(nil)
	_ fs.NodeListxattrer   = (*node)(nil)
	_ fs.NodeRemovexattrer = (*node)(nil)
)

const aclNamePrefix = "system.posix_acl_"

func xattrName(name string) syscall.Errno {
	switch {
	case strings.HasPrefix(name, aclNamePrefix):
		return syscall.EOPNOTSUPP
	case len(name) > wire.XattrNameMaxBytes:
		return syscall.ERANGE
	}
	return 0
}

func (n *node) Getxattr(ctx context.Context, name string, dest []byte) (uint32, syscall.Errno) {
	if errno := xattrName(name); errno != 0 {
		return 0, errno
	}
	value, err := n.m.src.Getxattr(ctx, n.ino(), name)
	if err != nil {
		return 0, errnoFor(err)
	}
	if len(dest) == 0 {
		return uint32(len(value)), 0
	}
	if len(value) > len(dest) {
		return uint32(len(value)), syscall.ERANGE
	}
	return uint32(copy(dest, value)), 0
}

func (n *node) Setxattr(ctx context.Context, name string, data []byte, flags uint32) syscall.Errno {
	if errno := xattrName(name); errno != 0 {
		return errno
	}
	if len(data) > wire.XattrSizeMaxBytes {
		return syscall.E2BIG
	}
	return errnoFor(n.m.src.Setxattr(ctx, n.ino(), name, data, flags))
}

func (n *node) Listxattr(ctx context.Context, dest []byte) (uint32, syscall.Errno) {
	names, err := n.m.src.Listxattr(ctx, n.ino())
	if err != nil {
		return 0, errnoFor(err)
	}
	var packed []byte
	for _, name := range names {
		packed = append(packed, name...)
		packed = append(packed, 0)
	}
	if len(dest) == 0 {
		return uint32(len(packed)), 0
	}
	if len(packed) > len(dest) {
		return uint32(len(packed)), syscall.ERANGE
	}
	return uint32(copy(dest, packed)), 0
}

func (n *node) Removexattr(ctx context.Context, name string) syscall.Errno {
	if errno := xattrName(name); errno != 0 {
		return errno
	}
	return errnoFor(n.m.src.Removexattr(ctx, n.ino(), name))
}
