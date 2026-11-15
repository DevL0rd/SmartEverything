//go:build linux

package main

import (
	"bytes"
	"context"
	"os"
	"sync/atomic"
	"syscall"
	"testing"

	"golang.org/x/sys/unix"

	"github.com/smarteverything/drive-mount/integration/fakehub"
)

type copyingFS struct {
	*memFS
	accept bool
	calls  atomic.Int64
	offIn  atomic.Uint64
	offOut atomic.Uint64
}

func (c *copyingFS) ServerCopy(ctx context.Context, src ReadHandle, srcOff uint64, dst InodeWriteHandle, dstOff, length uint64) (uint64, error) {
	if !c.accept {
		return 0, errCopyDeclined
	}
	c.calls.Add(1)
	c.offIn.Store(srcOff)
	c.offOut.Store(dstOff)
	buf := make([]byte, length)
	n, err := src.ReadAt(ctx, buf, int64(srcOff))
	if err != nil && n == 0 {
		return 0, err
	}
	if _, err := dst.WriteAt(buf[:n], int64(dstOff)); err != nil {
		return 0, err
	}
	return uint64(n), nil
}

func mountCopying(t *testing.T, accept bool) (string, *fakehub.Model, *copyingFS) {
	t.Helper()
	requireFuse(t)
	model := fakehub.NewModel()
	files := &copyingFS{memFS: newMemFS(model, "mem"), accept: accept}
	set := newMountSet(files, newReporter(&lockedBuffer{}))
	t.Cleanup(func() {
		set.closeAll()
		files.Close()
	})
	point := t.TempDir()
	if err := set.mount("a", mountRoot{}, point, mountOptions{}); err != nil {
		t.Fatalf("mount: %v", err)
	}
	t.Cleanup(func() { set.unmount("a") })
	return point, model, files
}

func copyRange(t *testing.T, from, to string, offIn, offOut int64, length int) (int, error) {
	t.Helper()
	in, err := os.Open(from)
	if err != nil {
		t.Fatal(err)
	}
	defer in.Close()
	out, err := os.OpenFile(to, os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer out.Close()
	return unix.CopyFileRange(int(in.Fd()), &offIn, int(out.Fd()), &offOut, length, 0)
}

func TestCopyFileRangeReachesTheFilesystemWithBothOffsets(t *testing.T) {
	point, model, files := mountCopying(t, true)
	model.Put("/src.txt", "0123456789")
	model.Put("/dst.txt", "abcdefghij")
	n, err := copyRange(t, point+"/src.txt", point+"/dst.txt", 2, 4, 3)
	if err != nil || n != 3 {
		t.Fatalf("copy_file_range: %d %v", n, err)
	}
	if files.calls.Load() != 1 || files.offIn.Load() != 2 || files.offOut.Load() != 4 {
		t.Fatalf("filesystem saw %d calls at %d to %d", files.calls.Load(), files.offIn.Load(), files.offOut.Load())
	}
	if got, _ := model.Content("/dst.txt"); got != "abcd234hij" {
		t.Fatalf("content %q", got)
	}
}

func TestADeclinedCopyFileRangeStillCopiesThroughTheKernel(t *testing.T) {
	point, model, _ := mountCopying(t, false)
	data := bytes.Repeat([]byte("xyz"), 5000)
	model.Put("/src.bin", string(data))
	model.Put("/dst.bin", "")
	n, err := copyRange(t, point+"/src.bin", point+"/dst.bin", 0, 0, len(data))
	if err != nil && err != syscall.EOPNOTSUPP {
		t.Fatalf("copy_file_range: %v", err)
	}
	if err == nil && n != len(data) {
		t.Fatalf("copied %d", n)
	}
	if err == syscall.EOPNOTSUPP {
		src, rerr := os.ReadFile(point + "/src.bin")
		if rerr != nil {
			t.Fatal(rerr)
		}
		if werr := os.WriteFile(point+"/dst.bin", src, 0o644); werr != nil {
			t.Fatal(werr)
		}
	}
	if got, _ := model.Content("/dst.bin"); got != string(data) {
		t.Fatalf("content length %d", len(got))
	}
}

func TestCopyFileRangeNeedsAFilesystemThatCanCopy(t *testing.T) {
	m, model := mountFresh(t)
	point := m.point
	model.Put("/a", "aaa")
	model.Put("/b", "bbb")
	_, err := copyRange(t, point+"/a", point+"/b", 0, 0, 3)
	if err != nil && err != syscall.EOPNOTSUPP {
		t.Fatalf("expected success through the kernel or EOPNOTSUPP, got %v", err)
	}
}
