//go:build linux

package main

import (
	"context"
	"math"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
)

var _ fs.NodeCopyFileRanger = (*node)(nil)

func (n *node) CopyFileRange(ctx context.Context, fhIn fs.FileHandle, offIn uint64, _ *fs.Inode, fhOut fs.FileHandle, offOut, length, _ uint64) (uint32, syscall.Errno) {
	copier, ok := n.m.src.(serverCopier)
	in, inOK := fhIn.(*fileHandle)
	out, outOK := fhOut.(*fileHandle)
	if !ok || !inOK || !outOK || in.read == nil || out.write == nil {
		return 0, syscall.EOPNOTSUPP
	}
	copied, err := copier.ServerCopy(ctx, in.read, offIn, out.write, offOut, min(length, math.MaxUint32))
	if err != nil {
		return 0, errnoFor(err)
	}
	return uint32(copied), 0
}
