package main

import (
	"context"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

type Attr = wire.Attr

type Entry = wire.Entry

type DirPage = wire.DirPage

type Statfs = wire.Statfs

type Lock = wire.Lock

type TimeSpec struct {
	Set bool
	Now bool
	At  time.Time
}

type SetattrArgs struct {
	Ino   uint64
	Valid uint32
	Mode  uint32
	UID   *uint32
	GID   *uint32
	Size  uint64
	Atime TimeSpec
	Mtime TimeSpec
}

type CreateArgs struct {
	Parent    uint64
	Name      string
	Mode      uint32
	UID       *uint32
	GID       *uint32
	Rdev      uint32
	Type      uint8
	Exclusive bool
	Target    string
}

type RenameArgs struct {
	Parent    uint64
	Name      string
	NewParent uint64
	NewName   string
	Flags     uint32
}

type LockArgs struct {
	Ino   uint64
	Owner uint64
	Lock
	Wait  bool
	Flock bool
}

type UnlockArgs struct {
	Ino   uint64
	Owner uint64
	Start uint64
	End   uint64
	Flock bool
}

type Change struct {
	Root    string
	Inodes  []uint64
	Entries []wire.NameRef
	Removed []uint64
	Reset   bool
}

type ReadHandle interface {
	ReadAt(ctx context.Context, dst []byte, off int64) (int, error)
	Seek(ctx context.Context, off int64, whence uint32) (int64, error)
	Release(ctx context.Context) error
}

type InodeWriteHandle interface {
	WriteAt(p []byte, off int64) (int, error)
	ReadAt(p []byte, off int64) (int, error)
	Size() int64
	Truncate(size uint64) error
	Allocate(mode uint32, off, length uint64) error
	Flush() error
	Sync() error
	Close() error
}

type InodeSource interface {
	Attach(ctx context.Context, placementID string) (wire.Root, error)
	Lookup(ctx context.Context, parent uint64, name string) (Entry, error)
	Getattr(ctx context.Context, ino uint64) (Attr, error)
	Readdir(ctx context.Context, ino, cursor uint64) (DirPage, error)
	Readlink(ctx context.Context, ino uint64) (string, error)
	Statfs(ctx context.Context, ino uint64) (Statfs, error)
	Getxattr(ctx context.Context, ino uint64, name string) ([]byte, error)
	Listxattr(ctx context.Context, ino uint64) ([]string, error)
	Open(ctx context.Context, ino uint64) (ReadHandle, error)
	Pin(ctx context.Context, ino uint64) error
	Unpin(ctx context.Context, ino uint64) error
	Usage(root string) int64
	PinnedBytes(root string) int64
	SetPolicy(policy cachePolicy) error
	OnChange(fn func(Change))
}

type InodeWriter interface {
	Create(ctx context.Context, args CreateArgs) (Entry, InodeWriteHandle, error)
	OpenWrite(ctx context.Context, ino uint64, truncate bool) (InodeWriteHandle, error)
	Tmpfile(ctx context.Context, args CreateArgs) (Entry, InodeWriteHandle, error)
	Mkdir(ctx context.Context, args CreateArgs) (Entry, error)
	Mknod(ctx context.Context, args CreateArgs) (Entry, error)
	Symlink(ctx context.Context, args CreateArgs) (Entry, error)
	Link(ctx context.Context, ino, parent uint64, name string) (Attr, error)
	Unlink(ctx context.Context, parent uint64, name string) error
	Rmdir(ctx context.Context, parent uint64, name string) error
	Rename(ctx context.Context, args RenameArgs) error
	Setattr(ctx context.Context, args SetattrArgs) (Attr, error)
	Setxattr(ctx context.Context, ino uint64, name string, value []byte, flags uint32) error
	Removexattr(ctx context.Context, ino uint64, name string) error
	Fsync(ctx context.Context, ino uint64, directory bool) error
	Access(ctx context.Context, ino uint64, strict bool) (Attr, error)
	Getlk(ctx context.Context, args LockArgs) (*Lock, error)
	Setlk(ctx context.Context, args LockArgs) error
	Unlock(ctx context.Context, args UnlockArgs) error
	Pending(root string) int64
}

type InodeFilesystem interface {
	InodeSource
	InodeWriter
	SetReachable(reachable bool)
	SwitchRoute(route wire.Route) error
}
