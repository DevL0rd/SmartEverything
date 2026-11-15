//go:build linux

package main

import (
	"bytes"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"sync"
	"syscall"
	"testing"

	"golang.org/x/sys/unix"
)

func TestFilesAreCreatedWrittenAndReadBack(t *testing.T) {
	m, model := mountFresh(t)
	writeText(t, m.path("a.txt"), "hello world")
	if got, _ := model.Content("/a.txt"); got != "hello world" {
		t.Fatalf("hub content %q", got)
	}
	info, err := os.Stat(m.path("a.txt"))
	if err != nil || info.Size() != 11 || info.Mode() != 0o644 {
		t.Fatalf("stat %v %v", info, err)
	}
	f, err := os.OpenFile(m.path("a.txt"), os.O_WRONLY|os.O_APPEND, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.WriteString("!"); err != nil {
		t.Fatal(err)
	}
	f.Close()
	if got := readText(t, m.path("a.txt")); got != "hello world!" {
		t.Fatalf("after the append %q", got)
	}
	wantErrno(t, "exclusive create over an existing file", func() error {
		f, err := os.OpenFile(m.path("a.txt"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
		if f != nil {
			f.Close()
		}
		return err
	}(), syscall.EEXIST)
	if err := os.Chmod(m.path("a.txt"), 0o444); err != nil {
		t.Fatal(err)
	}
	if os.Getuid() != 0 {
		_, err = os.OpenFile(m.path("a.txt"), os.O_WRONLY, 0)
		wantErrno(t, "opening a read-only file for writing", err, syscall.EACCES)
	}
}

func TestCloseSealsAndFsyncSyncsTheWriteHandle(t *testing.T) {
	m, _ := mountFresh(t)
	f, err := os.Create(m.path("s.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.WriteString("data"); err != nil {
		t.Fatal(err)
	}
	if err := f.Sync(); err != nil {
		t.Fatal(err)
	}
	if m.fs.syncs.Load() != 1 {
		t.Fatalf("fsync reached the filesystem %d times", m.fs.syncs.Load())
	}
	if m.fs.flushes.Load() != 0 {
		t.Fatalf("a flush before the close: %d", m.fs.flushes.Load())
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	if m.fs.flushes.Load() != 1 {
		t.Fatalf("the close flushed %d times", m.fs.flushes.Load())
	}
	if m.fs.syncs.Load() != 1 {
		t.Fatal("a plain close must not fsync")
	}
	dir, err := os.Open(m.point)
	if err != nil {
		t.Fatal(err)
	}
	defer dir.Close()
	if err := dir.Sync(); err != nil {
		t.Fatal(err)
	}
	if m.fs.dirSync.Load() != 1 {
		t.Fatalf("fsync of a directory reached the filesystem %d times", m.fs.dirSync.Load())
	}
}

func TestTruncateAndOpenTruncateAndWritePastTheEnd(t *testing.T) {
	m, model := mountFresh(t)
	writeText(t, m.path("t.txt"), "abcdef")
	if err := os.Truncate(m.path("t.txt"), 3); err != nil {
		t.Fatal(err)
	}
	if got, _ := model.Content("/t.txt"); got != "abc" {
		t.Fatalf("after truncate %q", got)
	}
	f, err := os.OpenFile(m.path("t.txt"), os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Truncate(1); err != nil {
		t.Fatal(err)
	}
	if _, err := f.WriteAt([]byte("Z"), 3); err != nil {
		t.Fatal(err)
	}
	if info, err := f.Stat(); err != nil || info.Size() != 4 {
		t.Fatalf("size before the close %v %v", info, err)
	}
	f.Close()
	if got, _ := model.Content("/t.txt"); got != "a\x00\x00Z" {
		t.Fatalf("after the hole %q", got)
	}
	if err := os.WriteFile(m.path("t.txt"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if got, ok := model.Content("/t.txt"); !ok || got != "" {
		t.Fatalf("after open with truncate %q", got)
	}
	if err := os.Truncate(m.path("t.txt"), 1<<20); err != nil {
		t.Fatal(err)
	}
	if info, _ := os.Stat(m.path("t.txt")); info.Size() != 1<<20 {
		t.Fatalf("grown size %d", info.Size())
	}
}

func TestSharedWritableMappingsReachTheHub(t *testing.T) {
	m, model := mountFresh(t)
	writeText(t, m.path("map.bin"), string(make([]byte, 8192)))
	runChildOnce(t, "mapwrite", m.path("map.bin"), "100=through the mapping", "8000=end")
	got, _ := model.Content("/map.bin")
	if len(got) != 8192 || got[100:119] != "through the mapping" || got[8000:8003] != "end" {
		t.Fatalf("hub content after msync: %q", got[96:130])
	}
	model.Put("/ro.bin", "mapped read only")
	if out := runChildOnce(t, "mapread", m.path("ro.bin")); out != "mapped read only" {
		t.Fatalf("mapped read %q", out)
	}
}

func TestRandomReadsWritesTruncatesAndMappingsMatchAReferenceBuffer(t *testing.T) {
	m, model := mountFresh(t)
	for _, seed := range []string{"7", "8", "9"} {
		name := "fsx-" + seed
		if out := runChildOnce(t, "fsx", m.path(name), seed, "1200"); out != "ok" {
			t.Fatalf("seed %s: %q", seed, out)
		}
		if got, _ := model.Content("/" + name); got == "" {
			t.Fatalf("seed %s left an empty file on the hub", seed)
		}
	}
}

func TestOpenTmpfileAndLinkItIntoPlace(t *testing.T) {
	m, model := mountFresh(t)
	model.EnsureDir("/dir")
	fd, err := unix.Open(m.path("dir"), unix.O_TMPFILE|unix.O_RDWR, 0o600)
	if err != nil {
		t.Fatalf("O_TMPFILE: %v", err)
	}
	file := os.NewFile(uintptr(fd), "tmpfile")
	defer file.Close()
	if _, err := file.WriteString("unnamed content"); err != nil {
		t.Fatal(err)
	}
	if names := model.Names("/dir"); len(names) != 0 {
		t.Fatalf("a temporary file has a name: %v", names)
	}
	if err := unix.Linkat(unix.AT_FDCWD, fmt.Sprintf("/proc/self/fd/%d", fd), unix.AT_FDCWD, m.path("dir", "named.txt"), unix.AT_SYMLINK_FOLLOW); err != nil {
		t.Fatalf("linkat: %v", err)
	}
	if got := readText(t, m.path("dir", "named.txt")); got != "unnamed content" {
		t.Fatalf("content through the new name %q", got)
	}
	if got, _ := model.Content("/dir/named.txt"); got != "unnamed content" {
		t.Fatalf("hub content %q", got)
	}
}

func TestFallocateModes(t *testing.T) {
	m, model := mountFresh(t)
	writeText(t, m.path("f"), "0123456789")
	f, err := os.OpenFile(m.path("f"), os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := unix.Fallocate(int(f.Fd()), 0, 0, 100); err != nil {
		t.Fatal(err)
	}
	if info, _ := f.Stat(); info.Size() != 100 {
		t.Fatalf("allocate grew to %d", info.Size())
	}
	if err := unix.Fallocate(int(f.Fd()), unix.FALLOC_FL_KEEP_SIZE, 0, 500); err != nil {
		t.Fatal(err)
	}
	if info, _ := f.Stat(); info.Size() != 100 {
		t.Fatalf("keep size grew to %d", info.Size())
	}
	if err := unix.Fallocate(int(f.Fd()), unix.FALLOC_FL_PUNCH_HOLE|unix.FALLOC_FL_KEEP_SIZE, 2, 3); err != nil {
		t.Fatal(err)
	}
	if got, _ := model.Content("/f"); got[:10] != "01\x00\x00\x0056789" {
		t.Fatalf("after the punch %q", got[:10])
	}
	if err := unix.Fallocate(int(f.Fd()), unix.FALLOC_FL_ZERO_RANGE, 5, 2); err != nil {
		t.Fatal(err)
	}
	if got, _ := model.Content("/f"); got[:10] != "01\x00\x00\x00\x00\x00789" {
		t.Fatalf("after the zero range %q", got[:10])
	}
	wantErrno(t, "collapse range", unix.Fallocate(int(f.Fd()), unix.FALLOC_FL_COLLAPSE_RANGE, 0, 4096), syscall.EOPNOTSUPP)
}

func TestSeekDataAndHoleAnswerFromTheHub(t *testing.T) {
	m, model := mountFresh(t)
	model.Put("/s", "0123456789")
	f, err := os.Open(m.path("s"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if at, err := unix.Seek(int(f.Fd()), 4, unix.SEEK_DATA); err != nil || at != 4 {
		t.Fatalf("SEEK_DATA %d %v", at, err)
	}
	if at, err := unix.Seek(int(f.Fd()), 4, unix.SEEK_HOLE); err != nil || at != 10 {
		t.Fatalf("SEEK_HOLE %d %v", at, err)
	}
	w, err := os.OpenFile(m.path("s"), os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer w.Close()
	if at, err := unix.Seek(int(w.Fd()), 2, unix.SEEK_HOLE); err != nil || at != 10 {
		t.Fatalf("SEEK_HOLE through a writable descriptor %d %v", at, err)
	}
}

func TestTwoDescriptorsOfOneFileSeeEachOthersWrites(t *testing.T) {
	m, _ := mountFresh(t)
	a, err := os.OpenFile(m.path("shared"), os.O_RDWR|os.O_CREATE, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	b, err := os.OpenFile(m.path("shared"), os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	if _, err := a.WriteAt([]byte("from a"), 0); err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 6)
	if _, err := b.ReadAt(buf, 0); err != nil || string(buf) != "from a" {
		t.Fatalf("b reads %q %v", buf, err)
	}
	if _, err := b.WriteAt([]byte("B"), 5); err != nil {
		t.Fatal(err)
	}
	if _, err := a.ReadAt(buf, 0); err != nil || string(buf) != "from B" {
		t.Fatalf("a reads %q %v", buf, err)
	}
}

func TestLargeSequentialWritesAndParallelWritersKeepEveryByte(t *testing.T) {
	m, model := mountFresh(t)
	payload := make([]byte, 3<<20+12345)
	rand.New(rand.NewSource(3)).Read(payload)
	if err := os.WriteFile(m.path("big.bin"), payload, 0o644); err != nil {
		t.Fatal(err)
	}
	if got, _ := model.Content("/big.bin"); got != string(payload) {
		t.Fatal("the large file differs on the hub")
	}
	f, err := os.OpenFile(m.path("parts.bin"), os.O_RDWR|os.O_CREATE, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	var wg sync.WaitGroup
	for part := 0; part < 8; part++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			chunk := bytes.Repeat([]byte{byte('a' + part)}, 70000)
			if _, err := f.WriteAt(chunk, int64(part)*70000); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	got := readText(t, m.path("parts.bin"))
	for part := 0; part < 8; part++ {
		if got[part*70000:(part+1)*70000] != string(bytes.Repeat([]byte{byte('a' + part)}, 70000)) {
			t.Fatalf("part %d is wrong", part)
		}
	}
}

func TestAnErrorFromTheHubReachesTheWriterAsItsErrno(t *testing.T) {
	m, model := mountFresh(t)
	writeText(t, m.path("f"), "x")
	f, err := os.OpenFile(m.path("f"), os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := model.Unlink("test", model.Root(), "f"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(m.path("sub", "x")); !errors.Is(err, syscall.ENOENT) {
		t.Fatalf("a missing directory: %v", err)
	}
}
