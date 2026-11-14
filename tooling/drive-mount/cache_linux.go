//go:build linux

package main

import (
	"errors"
	"os"
	"syscall"
)

const (
	fallocKeepSize  = 0x1
	fallocPunchHole = 0x2
)

func markSparse(*os.File) error { return nil }

func punchHole(f *os.File, off, length int64) error {
	return syscall.Fallocate(int(f.Fd()), fallocPunchHole|fallocKeepSize, off, length)
}

func allocatedBytes(f *os.File) (int64, error) {
	info, err := f.Stat()
	if err != nil {
		return 0, err
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return 0, errors.New("no allocation size on this platform")
	}
	return stat.Blocks * 512, nil
}

func diskFree(dir string) (int64, error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(dir, &stat); err != nil {
		return 0, err
	}
	return int64(stat.Bavail) * stat.Bsize, nil
}
