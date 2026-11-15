package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/smarteverything/drive-mount/wire"
	"github.com/winfsp/cgofuse/fuse"
)

const (
	winStatBlock = 4096
	noHandle     = ^uint64(0)
)

type winHandle struct {
	ino    uint64
	ctx    context.Context
	cancel context.CancelFunc
	read   ReadHandle
	write  InodeWriteHandle
}

type winFS struct {
	fuse.FileSystemBase
	ctx     context.Context
	src     InodeFilesystem
	rootIno uint64
	open    *openCounter
	paths   *pathBook
	ready   chan struct{}
	once    sync.Once
	mu      sync.Mutex
	next    uint64
	handles map[uint64]*winHandle
	options mountOptions
}

func newWinFS(ctx context.Context, src InodeFilesystem, rootIno uint64, open *openCounter, options mountOptions) *winFS {
	w := &winFS{ctx: ctx, src: src, rootIno: rootIno, open: open, paths: newPathBook(), ready: make(chan struct{}), handles: map[uint64]*winHandle{}, options: options}
	w.paths.note("/", rootIno)
	return w
}

func (w *winFS) Init() {
	w.once.Do(func() { close(w.ready) })
}

var codeErrno = map[wire.ErrorCode]int{
	wire.ErrENOENT: fuse.ENOENT, wire.ErrEEXIST: fuse.EEXIST, wire.ErrENOTEMPTY: fuse.ENOTEMPTY,
	wire.ErrENOTDIR: fuse.ENOTDIR, wire.ErrEISDIR: fuse.EISDIR, wire.ErrEACCES: fuse.EACCES,
	wire.ErrEPERM: fuse.EPERM, wire.ErrEINVAL: fuse.EINVAL, wire.ErrENOSPC: fuse.ENOSPC,
	wire.ErrEDQUOT: fuse.ENOSPC, wire.ErrEXDEV: fuse.EXDEV, wire.ErrENAMETOOLONG: fuse.ENAMETOOLONG,
	wire.ErrEILSEQ: fuse.EILSEQ, wire.ErrESTALE: fuse.EIO, wire.ErrEAGAIN: fuse.EAGAIN,
	wire.ErrEDEADLK: fuse.EDEADLK, wire.ErrEINTR: fuse.EINTR, wire.ErrEOPNOTSUPP: fuse.EOPNOTSUPP,
	wire.ErrENODATA: fuse.ENODATA, wire.ErrERANGE: fuse.ERANGE, wire.ErrE2BIG: fuse.E2BIG,
	wire.ErrELOOP: fuse.ELOOP, wire.ErrENOLCK: fuse.ENOLCK, wire.ErrEIO: fuse.EIO,
	wire.ErrENETUNREACH: fuse.ENETUNREACH, wire.ErrEFBIG: fuse.EFBIG,
}

var localErrno = map[syscall.Errno]int{
	syscall.ENOENT: fuse.ENOENT, syscall.EEXIST: fuse.EEXIST, syscall.ENOTEMPTY: fuse.ENOTEMPTY,
	syscall.ENOTDIR: fuse.ENOTDIR, syscall.EISDIR: fuse.EISDIR, syscall.EACCES: fuse.EACCES,
	syscall.EPERM: fuse.EPERM, syscall.EINVAL: fuse.EINVAL, syscall.ENOSPC: fuse.ENOSPC,
	syscall.EXDEV: fuse.EXDEV, syscall.ENXIO: fuse.ENXIO, syscall.EBADF: fuse.EBADF,
	syscall.EINTR: fuse.EINTR, syscall.ENAMETOOLONG: fuse.ENAMETOOLONG, syscall.EROFS: fuse.EROFS,
}

func errnoOf(err error) int {
	if err == nil {
		return 0
	}
	if code, ok := wire.CodeOf(err); ok {
		if errc, known := codeErrno[code]; known {
			return -errc
		}
		return -fuse.EIO
	}
	switch {
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return -fuse.EINTR
	case errors.Is(err, wire.ErrNoRoute), errors.Is(err, wire.ErrConnLost), errors.Is(err, wire.ErrClosed):
		return -fuse.ENETUNREACH
	}
	var local syscall.Errno
	if errors.As(err, &local) {
		if errc, known := localErrno[local]; known {
			return -errc
		}
	}
	return -fuse.EIO
}

func winTypeBits(kind uint8) uint32 {
	switch kind {
	case wire.InodeTypeDirectory:
		return fuse.S_IFDIR
	case wire.InodeTypeSymlink:
		return fuse.S_IFLNK
	case wire.InodeTypeFifo:
		return fuse.S_IFIFO
	case wire.InodeTypeSocket:
		return fuse.S_IFSOCK
	case wire.InodeTypeChar:
		return fuse.S_IFCHR
	case wire.InodeTypeBlock:
		return fuse.S_IFBLK
	default:
		return fuse.S_IFREG
	}
}

func winSpecialType(mode uint32) (uint8, bool) {
	switch mode & fuse.S_IFMT {
	case fuse.S_IFIFO:
		return wire.InodeTypeFifo, true
	case fuse.S_IFSOCK:
		return wire.InodeTypeSocket, true
	case fuse.S_IFCHR:
		return wire.InodeTypeChar, true
	case fuse.S_IFBLK:
		return wire.InodeTypeBlock, true
	default:
		return 0, false
	}
}

func stamp(ns int64) fuse.Timespec {
	return fuse.NewTimespec(time.Unix(0, ns))
}

func fillStat(stat *fuse.Stat_t, a Attr) {
	stat.Ino = a.Ino
	stat.Mode = winTypeBits(a.Type) | a.Mode&0o7777
	stat.Nlink = a.Nlink
	if a.UID != nil {
		stat.Uid = *a.UID
	}
	if a.GID != nil {
		stat.Gid = *a.GID
	}
	stat.Rdev = uint64(a.Rdev)
	stat.Size = int64(a.Size)
	stat.Atim = stamp(a.AtimeNs)
	stat.Mtim = stamp(a.MtimeNs)
	stat.Ctim = stamp(a.CtimeNs)
	stat.Birthtim = stamp(a.BtimeNs)
	stat.Blksize = winStatBlock
	stat.Blocks = int64(a.Blocks)
}

func (w *winFS) handle(fh uint64) *winHandle {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.handles[fh]
}

func (w *winFS) register(h *winHandle) uint64 {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.next++
	w.handles[w.next] = h
	w.open.add(1)
	return w.next
}

func (w *winFS) newHandle(ino uint64, read ReadHandle, write InodeWriteHandle) uint64 {
	ctx, cancel := context.WithCancel(w.ctx)
	return w.register(&winHandle{ino: ino, ctx: ctx, cancel: cancel, read: read, write: write})
}

func segments(p string) []string {
	var out []string
	for _, segment := range strings.Split(strings.Trim(p, "/"), "/") {
		if segment != "" {
			out = append(out, segment)
		}
	}
	return out
}

func (w *winFS) resolve(p string) (Entry, error) {
	walked := ""
	var last Entry
	ino := w.rootIno
	names := segments(p)
	for _, segment := range names {
		e, err := w.src.Lookup(w.ctx, ino, segment)
		if err != nil {
			return Entry{}, err
		}
		walked += "/" + segment
		w.paths.note(walked, e.Ino)
		ino, last = e.Ino, e
	}
	if len(names) > 0 {
		return last, nil
	}
	a, err := w.src.Getattr(w.ctx, ino)
	if err != nil {
		return Entry{}, err
	}
	return Entry{Ino: ino, Attr: a}, nil
}

func (w *winFS) parent(p string) (uint64, string, error) {
	dir, name := path.Split(path.Clean("/" + strings.Trim(p, "/")))
	if name == "" {
		return 0, "", syscall.EINVAL
	}
	e, err := w.resolve(dir)
	if err != nil {
		return 0, "", err
	}
	return e.Ino, name, nil
}

func (w *winFS) inoOf(p string, fh uint64) (uint64, error) {
	if h := w.handle(fh); h != nil {
		return h.ino, nil
	}
	e, err := w.resolve(p)
	return e.Ino, err
}

func (w *winFS) Getattr(p string, stat *fuse.Stat_t, fh uint64) int {
	if h := w.handle(fh); h != nil {
		a, err := w.src.Getattr(w.ctx, h.ino)
		if err != nil {
			return errnoOf(err)
		}
		fillStat(stat, a)
		if h.write != nil {
			stat.Size = h.write.Size()
		}
		return 0
	}
	e, err := w.resolve(p)
	if err != nil {
		return errnoOf(err)
	}
	fillStat(stat, e.Attr)
	return 0
}

func (w *winFS) Opendir(p string) (int, uint64) {
	e, err := w.resolve(p)
	if err != nil {
		return errnoOf(err), noHandle
	}
	if e.Attr.Type != wire.InodeTypeDirectory {
		return -fuse.ENOTDIR, noHandle
	}
	return 0, e.Ino
}

func (w *winFS) Readdir(p string, fill func(name string, stat *fuse.Stat_t, ofst int64) bool, ofst int64, fh uint64) int {
	ino := fh
	if fh == noHandle || fh == 0 {
		e, err := w.resolve(p)
		if err != nil {
			return errnoOf(err)
		}
		ino = e.Ino
	}
	fill(".", nil, 0)
	fill("..", nil, 0)
	var cursor uint64
	for {
		page, err := w.src.Readdir(w.ctx, ino, cursor)
		if err != nil {
			return errnoOf(err)
		}
		for _, item := range page.Entries {
			var stat fuse.Stat_t
			fillStat(&stat, item.Attr)
			w.paths.note(path.Join(p, item.Name), item.Ino)
			if !fill(item.Name, &stat, 0) {
				return 0
			}
		}
		if page.Next == nil {
			return 0
		}
		cursor = *page.Next
	}
}

func (w *winFS) Releasedir(p string, fh uint64) int { return 0 }

func (w *winFS) Fsyncdir(p string, datasync bool, fh uint64) int {
	ino, err := w.inoOf(p, noHandle)
	if err != nil {
		return errnoOf(err)
	}
	return errnoOf(w.src.Fsync(w.ctx, ino, true))
}

func (w *winFS) Open(p string, flags int) (int, uint64) {
	e, err := w.resolve(p)
	if err != nil {
		return errnoOf(err), noHandle
	}
	if e.Attr.Type == wire.InodeTypeDirectory {
		return -fuse.EISDIR, noHandle
	}
	if flags&fuse.O_ACCMODE != fuse.O_WRONLY {
		w.noteAccess(e.Ino)
	}
	if flags&fuse.O_ACCMODE == fuse.O_RDONLY {
		rh, err := w.src.Open(w.ctx, e.Ino)
		if err != nil {
			return errnoOf(err), noHandle
		}
		return 0, w.newHandle(e.Ino, rh, nil)
	}
	wh, err := w.src.OpenWrite(w.ctx, e.Ino, flags&fuse.O_TRUNC != 0)
	if err != nil {
		return errnoOf(err), noHandle
	}
	return 0, w.newHandle(e.Ino, nil, wh)
}

func (w *winFS) noteAccess(ino uint64) {
	if !accessDue(w.ctx, w.src, w.options, ino) {
		return
	}
	_, strict := w.options.notesAccess()
	if _, err := w.src.Access(w.ctx, ino, strict); err != nil {
		fmt.Fprintln(os.Stderr, "access time:", ino, err)
	}
}

func (w *winFS) Create(p string, flags int, mode uint32) (int, uint64) {
	parent, name, err := w.parent(p)
	if err != nil {
		return errnoOf(err), noHandle
	}
	e, wh, err := w.src.Create(w.ctx, CreateArgs{Parent: parent, Name: name, Mode: mode & 0o7777, Exclusive: flags&fuse.O_EXCL != 0})
	if err != nil {
		return errnoOf(err), noHandle
	}
	w.paths.note(path.Clean("/"+strings.Trim(p, "/")), e.Ino)
	return 0, w.newHandle(e.Ino, nil, wh)
}

func (w *winFS) Mknod(p string, mode uint32, dev uint64) int {
	parent, name, err := w.parent(p)
	if err != nil {
		return errnoOf(err)
	}
	args := CreateArgs{Parent: parent, Name: name, Mode: mode & 0o7777, Rdev: uint32(dev)}
	kind, special := winSpecialType(mode)
	if !special {
		args.Exclusive = true
		_, wh, err := w.src.Create(w.ctx, args)
		if err != nil {
			return errnoOf(err)
		}
		return errnoOf(wh.Close())
	}
	args.Type = kind
	_, err = w.src.Mknod(w.ctx, args)
	return errnoOf(err)
}

func (w *winFS) Read(p string, buff []byte, ofst int64, fh uint64) int {
	h := w.handle(fh)
	if h == nil {
		return -fuse.EBADF
	}
	var got int
	var err error
	if h.write != nil {
		got, err = h.write.ReadAt(buff, ofst)
	} else {
		got, err = h.read.ReadAt(h.ctx, buff, ofst)
	}
	if err != nil && !errors.Is(err, io.EOF) {
		return errnoOf(err)
	}
	return got
}

func (w *winFS) Write(p string, buff []byte, ofst int64, fh uint64) int {
	h := w.handle(fh)
	if h == nil || h.write == nil {
		return -fuse.EBADF
	}
	written, err := h.write.WriteAt(buff, ofst)
	if err != nil {
		return errnoOf(err)
	}
	return written
}

func (w *winFS) Truncate(p string, size int64, fh uint64) int {
	if size < 0 {
		return -fuse.EINVAL
	}
	if h := w.handle(fh); h != nil && h.write != nil {
		return errnoOf(h.write.Truncate(uint64(size)))
	}
	ino, err := w.inoOf(p, fh)
	if err != nil {
		return errnoOf(err)
	}
	_, err = w.src.Setattr(w.ctx, SetattrArgs{Ino: ino, Valid: wire.SetattrValidSize, Size: uint64(size)})
	return errnoOf(err)
}

func (w *winFS) Flush(p string, fh uint64) int {
	h := w.handle(fh)
	if h == nil || h.write == nil {
		return 0
	}
	return errnoOf(h.write.Flush())
}

func (w *winFS) Fsync(p string, datasync bool, fh uint64) int {
	if h := w.handle(fh); h != nil && h.write != nil {
		return errnoOf(h.write.Sync())
	}
	ino, err := w.inoOf(p, fh)
	if err != nil {
		return errnoOf(err)
	}
	return errnoOf(w.src.Fsync(w.ctx, ino, false))
}

func (w *winFS) Release(p string, fh uint64) int {
	w.mu.Lock()
	h, ok := w.handles[fh]
	delete(w.handles, fh)
	w.mu.Unlock()
	if !ok {
		return 0
	}
	h.cancel()
	var err error
	if h.write != nil {
		err = errors.Join(err, h.write.Close())
	}
	if h.read != nil {
		err = errors.Join(err, h.read.Release(w.ctx))
	}
	w.open.add(-1)
	return errnoOf(err)
}

func (w *winFS) Mkdir(p string, mode uint32) int {
	parent, name, err := w.parent(p)
	if err != nil {
		return errnoOf(err)
	}
	e, err := w.src.Mkdir(w.ctx, CreateArgs{Parent: parent, Name: name, Mode: mode & 0o7777})
	if err != nil {
		return errnoOf(err)
	}
	w.paths.note(path.Clean("/"+strings.Trim(p, "/")), e.Ino)
	return 0
}

func (w *winFS) Unlink(p string) int {
	parent, name, err := w.parent(p)
	if err != nil {
		return errnoOf(err)
	}
	if err := w.src.Unlink(w.ctx, parent, name); err != nil {
		return errnoOf(err)
	}
	w.paths.forget(p)
	return 0
}

func (w *winFS) Rmdir(p string) int {
	parent, name, err := w.parent(p)
	if err != nil {
		return errnoOf(err)
	}
	if err := w.src.Rmdir(w.ctx, parent, name); err != nil {
		return errnoOf(err)
	}
	w.paths.forget(p)
	return 0
}

func (w *winFS) Rename(oldpath, newpath string) int {
	oldParent, oldName, err := w.parent(oldpath)
	if err != nil {
		return errnoOf(err)
	}
	newParent, newName, err := w.parent(newpath)
	if err != nil {
		return errnoOf(err)
	}
	if err := w.src.Rename(w.ctx, RenameArgs{Parent: oldParent, Name: oldName, NewParent: newParent, NewName: newName}); err != nil {
		return errnoOf(err)
	}
	w.paths.rename(oldpath, newpath)
	return 0
}

func (w *winFS) Symlink(target, newpath string) int {
	parent, name, err := w.parent(newpath)
	if err != nil {
		return errnoOf(err)
	}
	e, err := w.src.Symlink(w.ctx, CreateArgs{Parent: parent, Name: name, Mode: 0o777, Target: target})
	if err != nil {
		return errnoOf(err)
	}
	w.paths.note(path.Clean("/"+strings.Trim(newpath, "/")), e.Ino)
	return 0
}

func (w *winFS) Readlink(p string) (int, string) {
	e, err := w.resolve(p)
	if err != nil {
		return errnoOf(err), ""
	}
	target, err := w.src.Readlink(w.ctx, e.Ino)
	if err != nil {
		return errnoOf(err), ""
	}
	return 0, target
}

func (w *winFS) Link(oldpath, newpath string) int {
	source, err := w.resolve(oldpath)
	if err != nil {
		return errnoOf(err)
	}
	parent, name, err := w.parent(newpath)
	if err != nil {
		return errnoOf(err)
	}
	if _, err := w.src.Link(w.ctx, source.Ino, parent, name); err != nil {
		return errnoOf(err)
	}
	w.paths.note(path.Clean("/"+strings.Trim(newpath, "/")), source.Ino)
	return 0
}

func (w *winFS) setattr(p string, args SetattrArgs) int {
	e, err := w.resolve(p)
	if err != nil {
		return errnoOf(err)
	}
	args.Ino = e.Ino
	_, err = w.src.Setattr(w.ctx, args)
	return errnoOf(err)
}

func (w *winFS) Chmod(p string, mode uint32) int {
	return w.setattr(p, SetattrArgs{Valid: wire.SetattrValidMode, Mode: mode & 0o7777})
}

func (w *winFS) Chown(p string, uid, gid uint32) int {
	if uid == ^uint32(0) && gid == ^uint32(0) {
		return 0
	}
	return -fuse.EPERM
}

func timeSpec(t fuse.Timespec) (TimeSpec, bool) {
	switch t.Nsec {
	case fuse.UTIME_OMIT:
		return TimeSpec{}, false
	case fuse.UTIME_NOW:
		return TimeSpec{Set: true, Now: true}, true
	}
	return TimeSpec{Set: true, At: time.Unix(t.Sec, t.Nsec)}, true
}

func (w *winFS) Utimens(p string, tmsp []fuse.Timespec) int {
	var args SetattrArgs
	if len(tmsp) == 2 {
		if at, ok := timeSpec(tmsp[0]); ok {
			args.Valid |= wire.SetattrValidAtime
			args.Atime = at
		}
		if mt, ok := timeSpec(tmsp[1]); ok {
			args.Valid |= wire.SetattrValidMtime
			args.Mtime = mt
		}
	} else {
		args.Valid = wire.SetattrValidAtime | wire.SetattrValidMtime
		args.Atime = TimeSpec{Set: true, Now: true}
		args.Mtime = TimeSpec{Set: true, Now: true}
	}
	if args.Valid == 0 {
		return 0
	}
	return w.setattr(p, args)
}

func (w *winFS) Statfs(p string, stat *fuse.Statfs_t) int {
	s, err := w.src.Statfs(w.ctx, w.rootIno)
	if err != nil {
		return errnoOf(err)
	}
	stat.Bsize = uint64(s.Bsize)
	stat.Frsize = uint64(s.Bsize)
	stat.Blocks = s.Blocks
	stat.Bfree = s.Free
	stat.Bavail = s.Avail
	stat.Files = s.Files
	stat.Ffree = s.Ffree
	stat.Favail = s.Ffree
	stat.Namemax = uint64(s.Namelen)
	return 0
}

const aclNamePrefix = "system.posix_acl_"

func winXattrName(name string) int {
	switch {
	case strings.HasPrefix(name, aclNamePrefix):
		return fuse.EOPNOTSUPP
	case len(name) > wire.XattrNameMaxBytes:
		return fuse.ERANGE
	}
	return 0
}

func (w *winFS) Getxattr(p string, name string) (int, []byte) {
	if errc := winXattrName(name); errc != 0 {
		return -errc, nil
	}
	e, err := w.resolve(p)
	if err != nil {
		return errnoOf(err), nil
	}
	value, err := w.src.Getxattr(w.ctx, e.Ino, name)
	if err != nil {
		return errnoOf(err), nil
	}
	return 0, value
}

func (w *winFS) Setxattr(p string, name string, value []byte, flags int) int {
	if errc := winXattrName(name); errc != 0 {
		return -errc
	}
	if len(value) > wire.XattrSizeMaxBytes {
		return -fuse.E2BIG
	}
	e, err := w.resolve(p)
	if err != nil {
		return errnoOf(err)
	}
	return errnoOf(w.src.Setxattr(w.ctx, e.Ino, name, value, uint32(flags)))
}

func (w *winFS) Listxattr(p string, fill func(name string) bool) int {
	e, err := w.resolve(p)
	if err != nil {
		return errnoOf(err)
	}
	names, err := w.src.Listxattr(w.ctx, e.Ino)
	if err != nil {
		return errnoOf(err)
	}
	for _, name := range names {
		if !fill(name) {
			break
		}
	}
	return 0
}

func (w *winFS) Removexattr(p string, name string) int {
	if errc := winXattrName(name); errc != 0 {
		return -errc
	}
	e, err := w.resolve(p)
	if err != nil {
		return errnoOf(err)
	}
	return errnoOf(w.src.Removexattr(w.ctx, e.Ino, name))
}
