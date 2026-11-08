package main

import (
	"context"
	"testing"

	"github.com/winfsp/cgofuse/fuse"
)

type listedSource struct {
	entered chan struct{}
	items   []entry
}

func (s listedSource) List(context.Context, mountRoot, string) ([]entry, error) { return s.items, nil }

func (s listedSource) ReadAt(ctx context.Context, _ mountRoot, _ string, _ int64, _ []byte) (int, error) {
	close(s.entered)
	<-ctx.Done()
	return 0, ctx.Err()
}

func (s listedSource) Pin(context.Context, mountRoot, string) error   { return nil }
func (s listedSource) Unpin(context.Context, mountRoot, string) error { return nil }

func (s listedSource) Usage(mountRoot) int64 { return 0 }

func (s listedSource) SetLimit(mountRoot, int64) error { return nil }

func newTestFS(items []entry) (*winFS, listedSource) {
	source := listedSource{entered: make(chan struct{}), items: items}
	return newWinFS(context.Background(), source, mountRoot{RootID: "r"}), source
}

func TestGetattrAndWriteRefusal(t *testing.T) {
	system, _ := newTestFS([]entry{{Name: "a.rom", Size: 7}, {Name: "d", Dir: true}})
	var stat fuse.Stat_t
	if errc := system.Getattr("/a.rom", &stat, 0); errc != 0 || stat.Size != 7 || stat.Mode&fuse.S_IFMT != fuse.S_IFREG {
		t.Fatalf("file attr %d %+v", errc, stat)
	}
	if errc := system.Getattr("/d", &stat, 0); errc != 0 || stat.Mode&fuse.S_IFMT != fuse.S_IFDIR {
		t.Fatalf("dir attr %d %+v", errc, stat)
	}
	if errc := system.Getattr("/missing", &stat, 0); errc != -fuse.ENOENT {
		t.Fatalf("missing %d", errc)
	}
	if errc, _ := system.Open("/a.rom", fuse.O_WRONLY); errc != -fuse.EROFS {
		t.Fatalf("write open %d", errc)
	}
}

func TestReleaseAbortsSourceRead(t *testing.T) {
	system, source := newTestFS([]entry{{Name: "a.rom", Size: 7}})
	errc, fh := system.Open("/a.rom", fuse.O_RDONLY)
	if errc != 0 {
		t.Fatalf("open %d", errc)
	}
	result := make(chan int, 1)
	go func() { result <- system.Read("/a.rom", make([]byte, 4), 0, fh) }()
	<-source.entered
	system.Release("/a.rom", fh)
	if got := <-result; got != -fuse.EINTR {
		t.Fatalf("read %d", got)
	}
}

func TestCheckMountPoint(t *testing.T) {
	if err := checkMountPoint("relative"); err == nil {
		t.Fatal("relative accepted")
	}
	if err := checkMountPoint(t.TempDir()); err == nil {
		t.Fatal("existing directory accepted")
	}
}
