package main

import (
	"context"
	"io"
	"sync"
	"testing"

	"github.com/smarteverything/drive-mount/wire"
	"github.com/winfsp/cgofuse/fuse"
)

const winTestRoot = 1

type winBlockedRead struct{ entered chan struct{} }

func (r winBlockedRead) ReadAt(ctx context.Context, _ []byte, _ int64) (int, error) {
	close(r.entered)
	<-ctx.Done()
	return 0, ctx.Err()
}

func (r winBlockedRead) Seek(context.Context, int64, uint32) (int64, error) { return 0, nil }

func (r winBlockedRead) Release(context.Context) error { return nil }

type winMemoryWrite struct {
	mu      sync.Mutex
	data    []byte
	flushed int
	closed  bool
}

func (m *winMemoryWrite) WriteAt(p []byte, off int64) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if end := int(off) + len(p); end > len(m.data) {
		m.data = append(m.data, make([]byte, end-len(m.data))...)
	}
	copy(m.data[off:], p)
	return len(p), nil
}

func (m *winMemoryWrite) ReadAt(p []byte, off int64) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if int(off) >= len(m.data) {
		return 0, io.EOF
	}
	return copy(p, m.data[off:]), nil
}

func (m *winMemoryWrite) Size() int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return int64(len(m.data))
}

func (m *winMemoryWrite) Truncate(size uint64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.data = m.data[:size]
	return nil
}

func (m *winMemoryWrite) Allocate(uint32, uint64, uint64) error { return nil }

func (m *winMemoryWrite) Flush() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.flushed++
	return nil
}

func (m *winMemoryWrite) Sync() error { return nil }

func (m *winMemoryWrite) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closed = true
	return nil
}

type winFakeInodes struct {
	InodeFilesystem
	entries map[string]Entry
	reading winBlockedRead
	created *winMemoryWrite
	renamed []RenameArgs
}

func winRemote(code wire.ErrorCode) error { return &wire.RemoteError{Code: code} }

func (f *winFakeInodes) Lookup(_ context.Context, parent uint64, name string) (Entry, error) {
	if parent != winTestRoot {
		return Entry{}, winRemote(wire.ErrENOTDIR)
	}
	if e, ok := f.entries[name]; ok {
		return e, nil
	}
	return Entry{}, winRemote(wire.ErrENOENT)
}

func (f *winFakeInodes) Getattr(_ context.Context, ino uint64) (Attr, error) {
	if ino == winTestRoot {
		return Attr{Ino: winTestRoot, Type: wire.InodeTypeDirectory, Mode: 0o755, Nlink: 2}, nil
	}
	if ino == 9 && f.created != nil {
		return Attr{Ino: 9, Type: wire.InodeTypeFile, Mode: 0o644, Nlink: 1}, nil
	}
	for _, e := range f.entries {
		if e.Ino == ino {
			return e.Attr, nil
		}
	}
	return Attr{}, winRemote(wire.ErrENOENT)
}

func (f *winFakeInodes) Readdir(_ context.Context, ino, cursor uint64) (DirPage, error) {
	if cursor == 0 {
		next := uint64(1)
		return DirPage{Entries: []wire.DirEntry{{Name: "a.rom", Entry: f.entries["a.rom"]}}, Next: &next}, nil
	}
	return DirPage{Entries: []wire.DirEntry{{Name: "d", Entry: f.entries["d"]}}}, nil
}

func (f *winFakeInodes) Open(context.Context, uint64) (ReadHandle, error) { return f.reading, nil }

func (f *winFakeInodes) Create(_ context.Context, args CreateArgs) (Entry, InodeWriteHandle, error) {
	f.created = &winMemoryWrite{}
	return Entry{Ino: 9, Attr: Attr{Ino: 9, Type: wire.InodeTypeFile, Mode: args.Mode}}, f.created, nil
}

func (f *winFakeInodes) Rename(_ context.Context, args RenameArgs) error {
	f.renamed = append(f.renamed, args)
	return nil
}

func (f *winFakeInodes) Statfs(context.Context, uint64) (Statfs, error) {
	return Statfs{Blocks: 100, Free: 40, Avail: 30, Files: 10, Ffree: 5, Bsize: 4096, Namelen: 255}, nil
}

func newWinTestFS() (*winFS, *winFakeInodes, *openCounter) {
	source := &winFakeInodes{
		entries: map[string]Entry{
			"a.rom": {Ino: 2, Attr: Attr{Ino: 2, Type: wire.InodeTypeFile, Mode: 0o644, Nlink: 1, Size: 7}},
			"d":     {Ino: 3, Attr: Attr{Ino: 3, Type: wire.InodeTypeDirectory, Mode: 0o755, Nlink: 2}},
		},
		reading: winBlockedRead{entered: make(chan struct{})},
	}
	open := &openCounter{}
	return newWinFS(context.Background(), source, winTestRoot, open, mountOptions{}), source, open
}

func TestGetattrMapsTypesAndErrors(t *testing.T) {
	system, _, _ := newWinTestFS()
	var stat fuse.Stat_t
	if errc := system.Getattr("/a.rom", &stat, noHandle); errc != 0 || stat.Size != 7 || stat.Mode&fuse.S_IFMT != fuse.S_IFREG || stat.Mode&0o777 != 0o644 {
		t.Fatalf("file attr %d %+v", errc, stat)
	}
	if errc := system.Getattr("/d", &stat, noHandle); errc != 0 || stat.Mode&fuse.S_IFMT != fuse.S_IFDIR {
		t.Fatalf("dir attr %d %+v", errc, stat)
	}
	if errc := system.Getattr("/missing", &stat, noHandle); errc != -fuse.ENOENT {
		t.Fatalf("missing %d", errc)
	}
	if errc := system.Getattr("/a.rom/inner", &stat, noHandle); errc != -fuse.ENOTDIR {
		t.Fatalf("not a directory %d", errc)
	}
}

func TestReaddirFollowsPages(t *testing.T) {
	system, _, _ := newWinTestFS()
	errc, fh := system.Opendir("/")
	if errc != 0 {
		t.Fatalf("opendir %d", errc)
	}
	var names []string
	fill := func(name string, _ *fuse.Stat_t, _ int64) bool {
		names = append(names, name)
		return true
	}
	if errc := system.Readdir("/", fill, 0, fh); errc != 0 {
		t.Fatalf("readdir %d", errc)
	}
	if len(names) != 4 || names[2] != "a.rom" || names[3] != "d" {
		t.Fatalf("names %v", names)
	}
}

func TestReleaseAbortsSourceRead(t *testing.T) {
	system, source, open := newWinTestFS()
	errc, fh := system.Open("/a.rom", fuse.O_RDONLY)
	if errc != 0 {
		t.Fatalf("open %d", errc)
	}
	result := make(chan int, 1)
	go func() { result <- system.Read("/a.rom", make([]byte, 4), 0, fh) }()
	<-source.reading.entered
	system.Release("/a.rom", fh)
	if got := <-result; got != -fuse.EINTR {
		t.Fatalf("read %d", got)
	}
	if open.count.Load() != 0 {
		t.Fatalf("open count %d", open.count.Load())
	}
}

func TestCreateWriteFlushRelease(t *testing.T) {
	system, source, open := newWinTestFS()
	errc, fh := system.Create("/new.txt", fuse.O_CREAT|fuse.O_WRONLY, 0o644)
	if errc != 0 {
		t.Fatalf("create %d", errc)
	}
	if got := system.Write("/new.txt", []byte("hello"), 0, fh); got != 5 {
		t.Fatalf("write %d", got)
	}
	buf := make([]byte, 5)
	if got := system.Read("/new.txt", buf, 0, fh); got != 5 || string(buf) != "hello" {
		t.Fatalf("read %d %q", got, buf)
	}
	var stat fuse.Stat_t
	if errc := system.Getattr("/new.txt", &stat, fh); errc != 0 || stat.Size != 5 {
		t.Fatalf("size %d %d", errc, stat.Size)
	}
	if errc := system.Flush("/new.txt", fh); errc != 0 || source.created.flushed != 1 {
		t.Fatalf("flush %d %d", errc, source.created.flushed)
	}
	if errc := system.Truncate("/new.txt", 2, fh); errc != 0 || source.created.Size() != 2 {
		t.Fatalf("truncate %d", errc)
	}
	if open.count.Load() != 1 {
		t.Fatalf("open count %d", open.count.Load())
	}
	if errc := system.Release("/new.txt", fh); errc != 0 || !source.created.closed || open.count.Load() != 0 {
		t.Fatalf("release %d", errc)
	}
}

func TestRenameMovesKnownPaths(t *testing.T) {
	system, source, _ := newWinTestFS()
	var stat fuse.Stat_t
	system.Getattr("/a.rom", &stat, noHandle)
	if errc := system.Rename("/a.rom", "/d/b.rom"); errc != 0 {
		t.Fatalf("rename %d", errc)
	}
	if len(source.renamed) != 1 || source.renamed[0].Name != "a.rom" || source.renamed[0].NewName != "b.rom" {
		t.Fatalf("rename args %+v", source.renamed)
	}
	if got := system.paths.of(2); len(got) != 1 || got[0] != "/d/b.rom" {
		t.Fatalf("paths %v", got)
	}
}

func TestPathBookForgetsSubtree(t *testing.T) {
	book := newPathBook()
	book.note("/d", 3)
	book.note("/d/x", 4)
	book.note("/dd", 5)
	book.forget("/d")
	if len(book.of(3)) != 0 || len(book.of(4)) != 0 || len(book.of(5)) != 1 {
		t.Fatalf("remaining %v", book.all())
	}
}

func TestStatfs(t *testing.T) {
	system, _, _ := newWinTestFS()
	var stat fuse.Statfs_t
	if errc := system.Statfs("/", &stat); errc != 0 || stat.Bsize != 4096 || stat.Bavail != 30 || stat.Namemax != 255 {
		t.Fatalf("statfs %d %+v", errc, stat)
	}
}

func TestErrnoMapping(t *testing.T) {
	cases := map[error]int{
		winRemote(wire.ErrEEXIST):      -fuse.EEXIST,
		winRemote(wire.ErrEDQUOT):      -fuse.ENOSPC,
		winRemote(wire.ErrENOTEMPTY):   -fuse.ENOTEMPTY,
		context.Canceled:               -fuse.EINTR,
		wire.ErrNoRoute:                -fuse.ENETUNREACH,
		io.ErrUnexpectedEOF:            -fuse.EIO,
		nil:                            0,
		winRemote(wire.ErrorCode(250)): -fuse.EIO,
	}
	for err, want := range cases {
		if got := errnoOf(err); got != want {
			t.Fatalf("%v: got %d want %d", err, got, want)
		}
	}
}

func TestXattrNameRules(t *testing.T) {
	if winXattrName("system.posix_acl_access") != fuse.EOPNOTSUPP {
		t.Fatal("acl accepted")
	}
	if winXattrName("user.note") != 0 {
		t.Fatal("plain name refused")
	}
}

func TestCheckMountPoint(t *testing.T) {
	if err := checkMountPoint("relative"); err == nil {
		t.Fatal("relative accepted")
	}
	if err := checkMountPoint(t.TempDir()); err == nil {
		t.Fatal("existing directory accepted")
	}
	if err := checkMountPoint("1:"); err == nil {
		t.Fatal("digit drive accepted")
	}
}

func TestDriveLetterIndex(t *testing.T) {
	for point, want := range map[string]uint32{"X:": 23, "z:": 25, "A:": 0} {
		if got, ok := driveLetterIndex(point); !ok || got != want {
			t.Fatalf("%s: %d %v", point, got, ok)
		}
	}
	for _, point := range []string{"X:\\", "XY:", "1:", ":", "", `C:\mount`} {
		if _, ok := driveLetterIndex(point); ok {
			t.Fatalf("%q accepted", point)
		}
	}
}
