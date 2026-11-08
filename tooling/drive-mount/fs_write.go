//go:build linux

package main

import (
	"context"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
)

type writeFile struct {
	wh   WriteHandle
	open *openCounter
}

var (
	_ fs.FileReader    = (*writeFile)(nil)
	_ fs.FileWriter    = (*writeFile)(nil)
	_ fs.FileFsyncer   = (*writeFile)(nil)
	_ fs.FileGetattrer = (*writeFile)(nil)
	_ fs.FileReleaser  = (*writeFile)(nil)
)

func (f *writeFile) Read(ctx context.Context, dest []byte, off int64) (fuse.ReadResult, syscall.Errno) {
	n, err := f.wh.ReadAt(dest, off)
	if err != nil {
		return nil, errnoFor(err)
	}
	return fuse.ReadResultData(dest[:n]), 0
}

func (f *writeFile) Write(ctx context.Context, data []byte, off int64) (uint32, syscall.Errno) {
	n, err := f.wh.WriteAt(data, off)
	if err != nil {
		return uint32(n), errnoFor(err)
	}
	return uint32(n), 0
}

func (f *writeFile) Fsync(ctx context.Context, flags uint32) syscall.Errno {
	if err := f.wh.Sync(); err != nil {
		return errnoFor(err)
	}
	return 0
}

func (f *writeFile) Getattr(ctx context.Context, out *fuse.AttrOut) syscall.Errno {
	out.Mode = fuse.S_IFREG | 0o644
	out.Size = uint64(f.wh.Size())
	return 0
}

func (f *writeFile) Release(ctx context.Context) syscall.Errno {
	defer f.open.add(-1)
	if err := f.wh.Close(); err != nil {
		return errnoFor(err)
	}
	return 0
}
