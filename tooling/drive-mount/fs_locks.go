//go:build linux

package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
	"github.com/smarteverything/drive-mount/wire"
)

var (
	_ fs.FileGetlker  = (*fileHandle)(nil)
	_ fs.FileSetlker  = (*fileHandle)(nil)
	_ fs.FileSetlkwer = (*fileHandle)(nil)
)

func wireLockEnd(end uint64) uint64 {
	if end == posixEndOfFile {
		return wire.EndOfFile
	}
	return end
}

func fuseLockEnd(end uint64) uint64 {
	if end == wire.EndOfFile {
		return posixEndOfFile
	}
	return end
}

func wireLockType(typ uint32) uint8 {
	if typ == syscall.F_RDLCK {
		return wire.LockTypeRead
	}
	return wire.LockTypeWrite
}

func fuseLockType(typ uint8) uint32 {
	if typ == wire.LockTypeRead {
		return syscall.F_RDLCK
	}
	return syscall.F_WRLCK
}

func (h *fileHandle) lockArgs(owner uint64, lk *fuse.FileLock, flags uint32, wait bool) LockArgs {
	return LockArgs{
		Ino:   h.n.ino(),
		Owner: owner,
		Lock:  wire.Lock{Type: wireLockType(lk.Typ), Start: lk.Start, End: wireLockEnd(lk.End), Pid: lk.Pid},
		Wait:  wait,
		Flock: flags&fuse.LK_FLOCK != 0,
	}
}

func (h *fileHandle) Getlk(ctx context.Context, owner uint64, lk *fuse.FileLock, flags uint32, out *fuse.FileLock) syscall.Errno {
	conflict, err := h.n.m.src.Getlk(ctx, h.lockArgs(owner, lk, flags, false))
	if err != nil {
		return errnoFor(err)
	}
	if conflict == nil {
		out.Typ = syscall.F_UNLCK
		return 0
	}
	out.Typ = fuseLockType(conflict.Type)
	out.Start = conflict.Start
	out.End = fuseLockEnd(conflict.End)
	out.Pid = conflict.Pid
	return 0
}

func (h *fileHandle) Setlk(ctx context.Context, owner uint64, lk *fuse.FileLock, flags uint32) syscall.Errno {
	return h.setLock(ctx, owner, lk, flags, false)
}

func (h *fileHandle) Setlkw(ctx context.Context, owner uint64, lk *fuse.FileLock, flags uint32) syscall.Errno {
	return h.setLock(ctx, owner, lk, flags, true)
}

func (h *fileHandle) setLock(ctx context.Context, owner uint64, lk *fuse.FileLock, flags uint32, wait bool) syscall.Errno {
	args := h.lockArgs(owner, lk, flags, wait)
	if lk.Typ == syscall.F_UNLCK {
		return errnoFor(h.unlockRange(ctx, owner, args.Start, args.End, args.Flock, true))
	}
	if err := h.n.m.src.Setlk(ctx, args); err != nil {
		return errnoFor(err)
	}
	h.mu.Lock()
	if h.owners == nil {
		h.owners = map[lockOwner]lockHolder{}
	}
	h.owners[lockOwner{owner, args.Flock}] = lockHolder{pid: lk.Pid}
	h.mu.Unlock()
	h.n.NotifyContent(0, 0)
	return 0
}

func (h *fileHandle) unlockRange(ctx context.Context, owner, start, end uint64, flock, kernelPages bool) error {
	if err := h.flushBeforeUnlock(ctx, kernelPages); err != nil {
		return err
	}
	return h.n.m.src.Unlock(ctx, UnlockArgs{Ino: h.n.ino(), Owner: owner, Start: start, End: end, Flock: flock})
}

func (h *fileHandle) flushBeforeUnlock(ctx context.Context, kernelPages bool) error {
	if kernelPages {
		if err := h.n.m.flushPages(h.n); err == nil {
			return nil
		}
	}
	if h.write != nil {
		return h.write.Sync()
	}
	return nil
}

func (m *fuseMount) flushPages(n *node) error {
	if n.StableAttr().Mode&syscall.S_IFMT != syscall.S_IFREG {
		return errors.New("not a regular file")
	}
	rel := n.Path(nil)
	if strings.HasPrefix(rel, ".go-fuse") || rel == "" {
		return errors.New("no path")
	}
	name := filepath.Join(m.point, rel)
	f, err := os.OpenFile(name, os.O_RDONLY|syscall.O_NOFOLLOW, 0)
	if err != nil {
		if f, err = os.OpenFile(name, os.O_WRONLY|syscall.O_NOFOLLOW, 0); err != nil {
			return err
		}
	}
	defer f.Close()
	return f.Sync()
}

func (h *fileHandle) releaseLocks(ctx context.Context, all bool) error {
	var pid uint32
	if caller, ok := fuse.FromContext(ctx); ok {
		pid = caller.Pid
	}
	h.mu.Lock()
	var owners []lockOwner
	for o, holder := range h.owners {
		if all || (!o.flock && holder.pid == pid) {
			owners = append(owners, o)
			delete(h.owners, o)
		}
	}
	h.mu.Unlock()
	var failure error
	for _, o := range owners {
		if err := h.unlockRange(ctx, o.owner, 0, wire.EndOfFile, o.flock, false); err != nil {
			failure = err
		}
	}
	return failure
}
