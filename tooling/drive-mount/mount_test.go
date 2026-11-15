//go:build linux

package main

import (
	"bytes"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/integration/fakehub"
	"github.com/smarteverything/drive-mount/wire"
)

type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func nowNs() int64 { return time.Now().UnixNano() }

func eventually(t *testing.T, what string, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !ok() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func requireFuse(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("fusermount3"); err != nil {
		t.Skip("fusermount3 missing")
	}
	if _, err := os.Stat("/dev/fuse"); err != nil {
		t.Skip("/dev/fuse missing")
	}
}

type mounted struct {
	set   *mountSet
	fs    *memFS
	out   *lockedBuffer
	point string
}

func mountModel(t *testing.T, model *fakehub.Model, by string) *mounted {
	t.Helper()
	return mountModelWith(t, model, by, mountOptions{})
}

func mountModelWith(t *testing.T, model *fakehub.Model, by string, options mountOptions) *mounted {
	t.Helper()
	requireFuse(t)
	files := newMemFS(model, by)
	out := &lockedBuffer{}
	set := newMountSet(files, newReporter(out))
	t.Cleanup(func() {
		set.closeAll()
		files.Close()
	})
	point := t.TempDir()
	if err := set.mount("a", mountRoot{}, point, options); err != nil {
		t.Fatalf("mount: %v", err)
	}
	t.Cleanup(func() { set.unmount("a") })
	return &mounted{set: set, fs: files, out: out, point: point}
}

func mountFresh(t *testing.T) (*mounted, *fakehub.Model) {
	t.Helper()
	model := fakehub.NewModel()
	return mountModel(t, model, "mem"), model
}

func (m *mounted) settle(t *testing.T) {
	t.Helper()
	eventually(t, "the pushes of the setup to be delivered", m.fs.settled)
}

func (m *mounted) path(parts ...string) string {
	return filepath.Join(append([]string{m.point}, parts...)...)
}

func readText(t *testing.T, name string) string {
	t.Helper()
	data, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func writeText(t *testing.T, name, content string) {
	t.Helper()
	if err := os.WriteFile(name, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestTheMountShowsTheHubTreeWithItsOwnersTimesAndSizes(t *testing.T) {
	m, model := mountFresh(t)
	model.Put("/docs/note.txt", "hello")
	model.EnsureDir("/empty")
	entries, err := os.ReadDir(m.point)
	if err != nil || len(entries) != 2 {
		t.Fatalf("entries %v %v", entries, err)
	}
	if got := readText(t, m.path("docs", "note.txt")); got != "hello" {
		t.Fatalf("content %q", got)
	}
	info, err := os.Stat(m.path("docs", "note.txt"))
	if err != nil || info.Size() != 5 || info.Mode() != 0o644 {
		t.Fatalf("stat %v %v", info, err)
	}
	st := info.Sys().(*syscall.Stat_t)
	if st.Uid != uint32(os.Getuid()) || st.Gid != uint32(os.Getgid()) {
		t.Fatalf("owner %d:%d", st.Uid, st.Gid)
	}
	if st.Ino != model.InodeOf("/docs/note.txt") {
		t.Fatalf("inode %d, hub inode %d", st.Ino, model.InodeOf("/docs/note.txt"))
	}
	if st.Nlink != 1 {
		t.Fatalf("nlink %d", st.Nlink)
	}
}

func TestTheMountShowsTheDriveSizeAndListsAsANetworkShare(t *testing.T) {
	m, _ := mountFresh(t)
	var stat syscall.Statfs_t
	if err := syscall.Statfs(m.point, &stat); err != nil {
		t.Fatal(err)
	}
	if total := int64(stat.Blocks) * stat.Bsize; total != fakehub.SpaceTotal {
		t.Fatalf("size %d, want %d", total, fakehub.SpaceTotal)
	}
	if free := int64(stat.Bavail) * stat.Bsize; free != fakehub.SpaceFree {
		t.Fatalf("free %d, want %d", free, fakehub.SpaceFree)
	}
	if stat.Namelen != 255 {
		t.Fatalf("name length %d", stat.Namelen)
	}
	info, err := os.ReadFile("/proc/self/mountinfo")
	if err != nil {
		t.Fatal(err)
	}
	for _, line := range strings.Split(string(info), "\n") {
		if !strings.Contains(line, " "+m.point+" ") {
			continue
		}
		if !strings.Contains(line, " - fuse.smarteverything //smarteverything/") {
			t.Fatalf("mount table line %q", line)
		}
		for _, option := range []string{"default_permissions"} {
			if !strings.Contains(line, option) {
				t.Fatalf("mount option %s missing in %q", option, line)
			}
		}
		return
	}
	t.Fatal("the mount is missing from the mount table")
}

func TestTheKernelCachesHoldUntilTheHubPushesAChange(t *testing.T) {
	m, model := mountFresh(t)
	model.Put("/a.txt", "old")
	model.Put("/dir/b.txt", "old-b")
	m.settle(t)
	if readText(t, m.path("a.txt")) != "old" || readText(t, m.path("dir", "b.txt")) != "old-b" {
		t.Fatal("initial read")
	}
	if _, err := os.Stat(m.path("late.txt")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("late.txt exists: %v", err)
	}
	model.SetQuiet(true)
	model.Put("/a.txt", "new!")
	model.Put("/late.txt", "late")
	model.SetQuiet(false)
	if readText(t, m.path("a.txt")) != "old" {
		t.Fatal("the kernel should keep its cache until the hub says it changed")
	}
	if _, err := os.Stat(m.path("late.txt")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("the negative entry should be kept until the hub says it changed")
	}
	model.Notify(fakehub.Change{Inodes: []uint64{model.InodeOf("/a.txt")}, Entries: []wire.NameRef{{Parent: model.Root(), Name: "late.txt"}}})
	eventually(t, "the pushed content", func() bool { return readText(t, m.path("a.txt")) == "new!" })
	eventually(t, "the pushed entry", func() bool { return readText(t, m.path("late.txt")) == "late" })
	if readText(t, m.path("dir", "b.txt")) != "old-b" {
		t.Fatal("an unrelated file was dropped")
	}
}

func TestAChangeFromAnotherComputerIsSeenThroughItsPush(t *testing.T) {
	model := fakehub.NewModel()
	a := mountModel(t, model, "a")
	b := mountModel(t, model, "b")
	writeText(t, a.path("shared.txt"), "from a")
	eventually(t, "b to list the file", func() bool { return readText(t, b.path("shared.txt")) == "from a" })
	writeText(t, a.path("shared.txt"), "second version")
	eventually(t, "b to read the new content", func() bool { return readText(t, b.path("shared.txt")) == "second version" })
	if err := os.Remove(a.path("shared.txt")); err != nil {
		t.Fatal(err)
	}
	eventually(t, "b to lose the file", func() bool {
		_, err := os.Stat(b.path("shared.txt"))
		return errors.Is(err, os.ErrNotExist)
	})
}

func TestAResetPushDropsEveryCache(t *testing.T) {
	m, model := mountFresh(t)
	model.Put("/a.txt", "old")
	model.Put("/dir/b.txt", "old-b")
	m.settle(t)
	if readText(t, m.path("a.txt")) != "old" || readText(t, m.path("dir", "b.txt")) != "old-b" {
		t.Fatal("initial read")
	}
	model.SetQuiet(true)
	model.Put("/a.txt", "new!")
	model.Put("/dir/b.txt", "new-b!")
	model.SetQuiet(false)
	m.set.sourceChanged(Change{Root: "root", Reset: true})
	eventually(t, "a.txt", func() bool { return readText(t, m.path("a.txt")) == "new!" })
	eventually(t, "b.txt", func() bool { return readText(t, m.path("dir", "b.txt")) == "new-b!" })
}

func TestTheInvalidateControlLineDropsAPathOrTheWholeMount(t *testing.T) {
	m, model := mountFresh(t)
	model.Put("/a.txt", "old")
	model.Put("/dir/b.txt", "old-b")
	m.settle(t)
	if readText(t, m.path("a.txt")) != "old" || readText(t, m.path("dir", "b.txt")) != "old-b" {
		t.Fatal("initial read")
	}
	model.SetQuiet(true)
	model.Put("/a.txt", "new!")
	model.Put("/dir/b.txt", "new-b!")
	model.SetQuiet(false)
	if err := m.set.invalidate("a", []string{"/a.txt"}); err != nil {
		t.Fatal(err)
	}
	if got := readText(t, m.path("a.txt")); got != "new!" {
		t.Fatalf("after path invalidate %q", got)
	}
	if readText(t, m.path("dir", "b.txt")) != "old-b" {
		t.Fatal("an unrelated path was dropped")
	}
	if err := m.set.invalidate("a", nil); err != nil {
		t.Fatal(err)
	}
	if got := readText(t, m.path("dir", "b.txt")); got != "new-b!" {
		t.Fatalf("after whole-mount invalidate %q", got)
	}
}

func TestPinAndUnpinResolveThePathToItsInode(t *testing.T) {
	m, model := mountFresh(t)
	model.Put("/dir/deep/file.bin", "x")
	if err := m.set.pin("a", "/dir/deep"); err != nil {
		t.Fatal(err)
	}
	if err := m.set.unpin("a", "/dir/deep/file.bin"); err != nil {
		t.Fatal(err)
	}
	if len(m.fs.pinned) != 1 || m.fs.pinned[0] != model.InodeOf("/dir/deep") {
		t.Fatalf("pinned %v", m.fs.pinned)
	}
	if len(m.fs.unpinned) != 1 || m.fs.unpinned[0] != model.InodeOf("/dir/deep/file.bin") {
		t.Fatalf("unpinned %v", m.fs.unpinned)
	}
	if err := m.set.pin("a", "/missing"); err == nil {
		t.Fatal("a missing path was pinned")
	}
}

func TestMountErrors(t *testing.T) {
	m, _ := mountFresh(t)
	if err := m.set.mount("b", mountRoot{}, "relative", mountOptions{}); err == nil {
		t.Fatal("relative point accepted")
	}
	if !strings.Contains(m.out.String(), `"state":"failed"`) {
		t.Fatalf("no failed status: %s", m.out.String())
	}
	if err := m.set.mount("a", mountRoot{}, t.TempDir(), mountOptions{}); err == nil {
		t.Fatal("a second mount with the same id accepted")
	}
	if err := m.set.unmount("missing"); err == nil {
		t.Fatal("unknown unmount accepted")
	}
	if err := m.set.invalidate("missing", nil); err == nil {
		t.Fatal("unknown invalidate accepted")
	}
	if err := m.set.pin("missing", "/x"); err == nil {
		t.Fatal("unknown pin accepted")
	}
}

func TestSeveralMountsInOneProcessKeepTheirOwnTrees(t *testing.T) {
	requireFuse(t)
	first, second := fakehub.NewModel(), fakehub.NewModel()
	first.Put("/zelda.bin", "zelda")
	second.Put("/cat.jpg", "meow")
	a := mountModel(t, first, "x")
	b := mountModel(t, second, "y")
	if readText(t, a.path("zelda.bin")) != "zelda" || readText(t, b.path("cat.jpg")) != "meow" {
		t.Fatal("content")
	}
	if err := b.set.unmount("a"); err != nil {
		t.Fatal(err)
	}
	if readText(t, a.path("zelda.bin")) != "zelda" {
		t.Fatal("the remaining mount broke")
	}
}

func TestTheOpenFileCountFollowsTheDescriptors(t *testing.T) {
	m, model := mountFresh(t)
	model.Put("/a.txt", "a")
	f, err := os.Open(m.path("a.txt"))
	if err != nil {
		t.Fatal(err)
	}
	eventually(t, "the open count to reach 1", func() bool { return m.set.mounts["a"].open.count.Load() == 1 })
	f.Close()
	eventually(t, "the open count to reach 0", func() bool { return m.set.mounts["a"].open.count.Load() == 0 })
	if !strings.Contains(m.out.String(), `"openFiles":1`) {
		t.Fatalf("usage lines %s", m.out.String())
	}
}
