//go:build linux

package main

import (
	"errors"
	"io/fs"
	"os"
	"strings"
	"syscall"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

func inodeOf(t *testing.T, name string) *syscall.Stat_t {
	t.Helper()
	var st syscall.Stat_t
	if err := syscall.Lstat(name, &st); err != nil {
		t.Fatal(err)
	}
	return &st
}

func wantErrno(t *testing.T, what string, err error, want syscall.Errno) {
	t.Helper()
	if !errors.Is(err, want) {
		t.Fatalf("%s: got %v, want %v", what, err, want)
	}
}

func TestDirectoriesCanBeMadeRenamedAndRemoved(t *testing.T) {
	m, model := mountFresh(t)
	if err := os.MkdirAll(m.path("a", "b"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeText(t, m.path("a", "b", "f.txt"), "deep")
	wantErrno(t, "rmdir of a full directory", syscall.Rmdir(m.path("a", "b")), syscall.ENOTEMPTY)
	wantErrno(t, "mkdir over an existing name", os.Mkdir(m.path("a"), 0o755), syscall.EEXIST)
	if err := os.Rename(m.path("a"), m.path("c")); err != nil {
		t.Fatal(err)
	}
	if got := readText(t, m.path("c", "b", "f.txt")); got != "deep" {
		t.Fatalf("read after the directory rename %q", got)
	}
	if !model.Exists("/c/b/f.txt") || model.Exists("/a") {
		t.Fatal("the hub tree is wrong after the rename")
	}
	wantErrno(t, "moving a directory into itself", os.Rename(m.path("c"), m.path("c", "b", "c")), syscall.EINVAL)
	if err := os.Remove(m.path("c", "b", "f.txt")); err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(m.path("c")); err != nil {
		t.Fatal(err)
	}
	if model.Exists("/c") {
		t.Fatal("the directory is still on the hub")
	}
	info := inodeOf(t, m.point)
	if info.Nlink != 2 {
		t.Fatalf("an empty root has %d links", info.Nlink)
	}
}

func TestADirectoryListsAcrossSeveralPagesAndRewinds(t *testing.T) {
	m, model := mountFresh(t)
	model.PageSize = 3
	want := map[string]bool{}
	for i := 0; i < 10; i++ {
		name := string(rune('a'+i)) + ".txt"
		model.Put("/"+name, name)
		want[name] = true
	}
	f, err := os.Open(m.point)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	seen := map[string]bool{}
	for {
		batch, err := f.ReadDir(2)
		for _, entry := range batch {
			if seen[entry.Name()] {
				t.Fatalf("%s listed twice", entry.Name())
			}
			seen[entry.Name()] = true
		}
		if err != nil {
			break
		}
	}
	if len(seen) != len(want) {
		t.Fatalf("listed %v", seen)
	}
	if _, err := f.Seek(0, 0); err != nil {
		t.Fatal(err)
	}
	again, err := f.ReadDir(-1)
	if err != nil || len(again) != len(want) {
		t.Fatalf("after rewind %d entries, %v", len(again), err)
	}
	for _, entry := range again {
		if !want[entry.Name()] || entry.IsDir() {
			t.Fatalf("entry %v", entry)
		}
	}
}

func TestDotAndDotDotAreListed(t *testing.T) {
	m, model := mountFresh(t)
	model.EnsureDir("/d")
	f, err := os.Open(m.path("d"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	names, err := f.Readdirnames(-1)
	if err != nil || len(names) != 0 {
		t.Fatalf("an empty directory lists %v %v", names, err)
	}
	var buf [4096]byte
	n, err := syscall.ReadDirent(int(f.Fd()), buf[:])
	_ = n
	_ = err
	if _, err := f.Seek(0, 0); err != nil {
		t.Fatal(err)
	}
	n, err = syscall.ReadDirent(int(f.Fd()), buf[:])
	if err != nil {
		t.Fatal(err)
	}
	raw := string(buf[:n])
	if !strings.Contains(raw, ".\x00") || !strings.Contains(raw, "..\x00") {
		t.Fatalf("raw directory entries %q", raw)
	}
}

func TestHardLinksShareOneInodeAndCountNames(t *testing.T) {
	m, model := mountFresh(t)
	writeText(t, m.path("one"), "shared content")
	if err := os.Link(m.path("one"), m.path("two")); err != nil {
		t.Fatal(err)
	}
	one, two := inodeOf(t, m.path("one")), inodeOf(t, m.path("two"))
	if one.Ino != two.Ino || one.Nlink != 2 || two.Nlink != 2 {
		t.Fatalf("one %d/%d, two %d/%d", one.Ino, one.Nlink, two.Ino, two.Nlink)
	}
	if model.InodeOf("/one") != model.InodeOf("/two") {
		t.Fatal("the hub made two inodes")
	}
	if err := os.Remove(m.path("one")); err != nil {
		t.Fatal(err)
	}
	if got := readText(t, m.path("two")); got != "shared content" {
		t.Fatalf("content after unlinking the first name %q", got)
	}
	if st := inodeOf(t, m.path("two")); st.Nlink != 1 {
		t.Fatalf("nlink %d", st.Nlink)
	}
	model.EnsureDir("/dir")
	wantErrno(t, "link of a directory", os.Link(m.path("dir"), m.path("dirlink")), syscall.EPERM)
	wantErrno(t, "link over an existing name", os.Link(m.path("two"), m.path("dir")), syscall.EEXIST)
}

func TestSymlinksAreRealAndNeverFollowedByTheMount(t *testing.T) {
	m, model := mountFresh(t)
	writeText(t, m.path("target.txt"), "pointed at")
	if err := os.Symlink("target.txt", m.path("link")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("../../outside", m.path("dangling")); err != nil {
		t.Fatal(err)
	}
	info, err := os.Lstat(m.path("link"))
	if err != nil || info.Mode()&fs.ModeSymlink == 0 {
		t.Fatalf("lstat %v %v", info, err)
	}
	if got, err := os.Readlink(m.path("link")); err != nil || got != "target.txt" {
		t.Fatalf("readlink %q %v", got, err)
	}
	if got := readText(t, m.path("link")); got != "pointed at" {
		t.Fatalf("read through the link %q", got)
	}
	if got, err := os.Readlink(m.path("dangling")); err != nil || got != "../../outside" {
		t.Fatalf("readlink of a dangling link %q %v", got, err)
	}
	if _, err := os.Stat(m.path("dangling")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("stat of a dangling link: %v", err)
	}
	if info.Size() != int64(len("target.txt")) {
		t.Fatalf("link size %d", info.Size())
	}
	attr, _ := model.Getattr(model.InodeOf("/link"))
	if attr.Type != 3 {
		t.Fatalf("hub type %d", attr.Type)
	}
	long := strings.Repeat("d/", 1000)
	if err := os.Symlink(long, m.path("long")); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.Readlink(m.path("long")); got != long {
		t.Fatal("a long target was cut")
	}
}

func TestFifosAndSocketsAreMetadataOnlyItems(t *testing.T) {
	m, model := mountFresh(t)
	if err := syscall.Mkfifo(m.path("pipe"), 0o640); err != nil {
		t.Fatal(err)
	}
	if err := syscall.Mknod(m.path("sock"), syscall.S_IFSOCK|0o600, 0); err != nil {
		t.Fatal(err)
	}
	pipe, sock := inodeOf(t, m.path("pipe")), inodeOf(t, m.path("sock"))
	if pipe.Mode&syscall.S_IFMT != syscall.S_IFIFO || pipe.Mode&0o777 != 0o640 {
		t.Fatalf("fifo mode %o", pipe.Mode)
	}
	if sock.Mode&syscall.S_IFMT != syscall.S_IFSOCK {
		t.Fatalf("socket mode %o", sock.Mode)
	}
	if attr, _ := model.Getattr(model.InodeOf("/pipe")); attr.Type != 4 {
		t.Fatalf("hub type %d", attr.Type)
	}
	entries, err := os.ReadDir(m.point)
	if err != nil {
		t.Fatal(err)
	}
	types := map[string]fs.FileMode{}
	for _, e := range entries {
		types[e.Name()] = e.Type()
	}
	if types["pipe"]&fs.ModeNamedPipe == 0 || types["sock"]&fs.ModeSocket == 0 {
		t.Fatalf("listed types %v", types)
	}
}

func TestMknodOfARegularFileCreatesAnEmptyFileAndRefusesAnExistingName(t *testing.T) {
	m, model := mountFresh(t)
	if err := syscall.Mknod(m.path("plain"), syscall.S_IFREG|0o644, 0); err != nil {
		t.Fatal(err)
	}
	if got, ok := model.Content("/plain"); !ok || got != "" {
		t.Fatalf("hub content %q %v", got, ok)
	}
	wantErrno(t, "mknod over an existing name", syscall.Mknod(m.path("plain"), syscall.S_IFREG|0o644, 0), syscall.EEXIST)
}

func TestModesIncludingTheExecutableAndSpecialBitsReachTheHub(t *testing.T) {
	m, model := mountFresh(t)
	writeText(t, m.path("run.sh"), "#!/bin/sh\n")
	for _, mode := range []os.FileMode{0o755, 0o600, 0o4755 | os.ModeSetuid, 0o000} {
		if err := os.Chmod(m.path("run.sh"), mode); err != nil {
			t.Fatalf("chmod %v: %v", mode, err)
		}
		attr, err := model.Getattr(model.InodeOf("/run.sh"))
		if err != nil {
			t.Fatal(err)
		}
		st := inodeOf(t, m.path("run.sh"))
		if st.Mode&0o7777 != attr.Mode {
			t.Fatalf("kernel mode %o, hub mode %o", st.Mode&0o7777, attr.Mode)
		}
		if info, _ := os.Lstat(m.path("run.sh")); info.Mode() != mode&^0 && mode != 0o4755|os.ModeSetuid {
			t.Fatalf("mode %v, want %v", info.Mode(), mode)
		}
	}
	model.EnsureDir("/d")
	if err := os.Chmod(m.path("d"), 0o1777|os.ModeSticky); err != nil {
		t.Fatal(err)
	}
	if attr, _ := model.Getattr(model.InodeOf("/d")); attr.Mode != 0o1777 {
		t.Fatalf("sticky mode %o", attr.Mode)
	}
}

func TestOwnerAndGroupAreThePersonUnlessAnotherNumberIsStored(t *testing.T) {
	m, model := mountFresh(t)
	writeText(t, m.path("mine.txt"), "x")
	attr, _ := model.Getattr(model.InodeOf("/mine.txt"))
	if attr.UID != nil || attr.GID != nil {
		t.Fatalf("a file made by the mounting user stored owner %v:%v", attr.UID, attr.GID)
	}
	other := uint32(4242)
	if _, err := model.Mkdir("t", model.Root(), "theirs", 0o755, &other, &other); err != nil {
		t.Fatal(err)
	}
	st := inodeOf(t, m.path("theirs"))
	if st.Uid != 4242 || st.Gid != 4242 {
		t.Fatalf("a stored number shows as %d:%d", st.Uid, st.Gid)
	}
	if err := os.Lchown(m.path("mine.txt"), os.Getuid(), os.Getgid()); err != nil {
		t.Fatal(err)
	}
	if attr, _ := model.Getattr(model.InodeOf("/mine.txt")); attr.UID != nil || attr.GID != nil {
		t.Fatalf("chown to the person stored %v:%v", attr.UID, attr.GID)
	}
	if os.Getuid() != 0 {
		wantErrno(t, "chown to another user without privileges", os.Lchown(m.path("mine.txt"), 4243, -1), syscall.EPERM)
	}
}

func TestTimesKeepNanosecondsAndNowIsTakenFromTheHub(t *testing.T) {
	m, model := mountFresh(t)
	writeText(t, m.path("t.txt"), "x")
	at := time.Unix(1_700_000_000, 123_456_789)
	mt := time.Unix(1_600_000_000, 987_654_321)
	if err := os.Chtimes(m.path("t.txt"), at, mt); err != nil {
		t.Fatal(err)
	}
	attr, _ := model.Getattr(model.InodeOf("/t.txt"))
	if attr.AtimeNs != at.UnixNano() || attr.MtimeNs != mt.UnixNano() {
		t.Fatalf("hub times %d %d", attr.AtimeNs, attr.MtimeNs)
	}
	st := inodeOf(t, m.path("t.txt"))
	if st.Mtim.Sec != mt.Unix() || st.Mtim.Nsec != int64(mt.Nanosecond()) || st.Atim.Nsec != int64(at.Nanosecond()) {
		t.Fatalf("kernel times %v %v", st.Atim, st.Mtim)
	}
	before := time.Now().UnixNano()
	omit := unix.Timespec{Nsec: unix.UTIME_OMIT}
	now := unix.Timespec{Nsec: unix.UTIME_NOW}
	if err := unix.UtimesNanoAt(unix.AT_FDCWD, m.path("t.txt"), []unix.Timespec{omit, now}, 0); err != nil {
		t.Fatal(err)
	}
	attr, _ = model.Getattr(model.InodeOf("/t.txt"))
	if attr.MtimeNs < before-int64(50*time.Millisecond) || attr.AtimeNs != at.UnixNano() {
		t.Fatalf("after now and omit: mtime %d atime %d before %d", attr.MtimeNs, attr.AtimeNs, before)
	}
}

func TestStatxShowsTheBirthTime(t *testing.T) {
	m, model := mountFresh(t)
	writeText(t, m.path("b.txt"), "x")
	var sx unix.Statx_t
	if err := unix.Statx(unix.AT_FDCWD, m.path("b.txt"), unix.AT_SYMLINK_NOFOLLOW, unix.STATX_BASIC_STATS|unix.STATX_BTIME, &sx); err != nil {
		t.Fatal(err)
	}
	if sx.Mask&unix.STATX_BTIME == 0 {
		t.Skip("this kernel does not pass birth times through FUSE")
	}
	attr, _ := model.Getattr(model.InodeOf("/b.txt"))
	if int64(sx.Btime.Sec)*1e9+int64(sx.Btime.Nsec) != attr.BtimeNs {
		t.Fatalf("birth %d.%d, hub %d", sx.Btime.Sec, sx.Btime.Nsec, attr.BtimeNs)
	}
}

func TestExtendedAttributesRoundTripAndFollowTheLinuxRules(t *testing.T) {
	m, model := mountFresh(t)
	writeText(t, m.path("x.txt"), "x")
	name := m.path("x.txt")
	if err := syscall.Setxattr(name, "user.color", []byte("blue"), 0); err != nil {
		t.Fatal(err)
	}
	if err := syscall.Setxattr(name, "user.empty", nil, 0); err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 64)
	n, err := syscall.Getxattr(name, "user.color", buf)
	if err != nil || string(buf[:n]) != "blue" {
		t.Fatalf("get %q %v", buf[:n], err)
	}
	if size, err := syscall.Getxattr(name, "user.color", nil); err != nil || size != 4 {
		t.Fatalf("size query %d %v", size, err)
	}
	if _, err := syscall.Getxattr(name, "user.color", make([]byte, 2)); !errors.Is(err, syscall.ERANGE) {
		t.Fatalf("a small buffer: %v", err)
	}
	if n, err := syscall.Getxattr(name, "user.empty", buf); err != nil || n != 0 {
		t.Fatalf("empty value %d %v", n, err)
	}
	wantErrno(t, "a missing attribute", func() error { _, err := syscall.Getxattr(name, "user.none", buf); return err }(), syscall.ENODATA)
	wantErrno(t, "create over an existing attribute", syscall.Setxattr(name, "user.color", []byte("red"), 1), syscall.EEXIST)
	wantErrno(t, "replace a missing attribute", syscall.Setxattr(name, "user.none", []byte("red"), 2), syscall.ENODATA)
	if err := syscall.Setxattr(name, "user.color", []byte("red"), 2); err != nil {
		t.Fatal(err)
	}
	list := make([]byte, 128)
	n, err = syscall.Listxattr(name, list)
	if err != nil || string(list[:n]) != "user.color\x00user.empty\x00" {
		t.Fatalf("list %q %v", list[:n], err)
	}
	if size, err := syscall.Listxattr(name, nil); err != nil || size != n {
		t.Fatalf("list size %d %v", size, err)
	}
	if got, _ := model.Getxattr(model.InodeOf("/x.txt"), "user.color"); string(got) != "red" {
		t.Fatalf("hub value %q", got)
	}
	big := make([]byte, 65536)
	if err := syscall.Setxattr(name, "user.big", big, 0); err != nil {
		t.Fatalf("a value of the Linux maximum: %v", err)
	}
	wantErrno(t, "a value over the Linux maximum", syscall.Setxattr(name, "user.big", make([]byte, 65537), 0), syscall.E2BIG)
	wantErrno(t, "an access control list", syscall.Setxattr(name, "system.posix_acl_access", []byte{2, 0, 0, 0}, 0), syscall.EOPNOTSUPP)
	if err := syscall.Removexattr(name, "user.color"); err != nil {
		t.Fatal(err)
	}
	wantErrno(t, "removing twice", syscall.Removexattr(name, "user.color"), syscall.ENODATA)
	if err := syscall.Setxattr(m.point, "user.dir", []byte("on a directory"), 0); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("x.txt", m.path("l")); err != nil {
		t.Fatal(err)
	}
}

func TestRenameOverAnExistingFileIsOneAtomicStep(t *testing.T) {
	m, model := mountFresh(t)
	writeText(t, m.path("doc.txt"), "version one")
	oldInode := inodeOf(t, m.path("doc.txt")).Ino
	for _, next := range []string{"version two", "version three"} {
		writeText(t, m.path(".doc.swp"), next)
		if err := os.Rename(m.path(".doc.swp"), m.path("doc.txt")); err != nil {
			t.Fatal(err)
		}
		if got := readText(t, m.path("doc.txt")); got != next {
			t.Fatalf("read after the save %q want %q", got, next)
		}
	}
	if inodeOf(t, m.path("doc.txt")).Ino == oldInode {
		t.Fatal("a rename over a file keeps the old inode")
	}
	if names := model.Names("/"); len(names) != 1 || names[0] != "doc.txt" {
		t.Fatalf("hub names %v", names)
	}
	model.EnsureDir("/d1")
	model.EnsureDir("/d2")
	writeText(t, m.path("d2", "inside"), "x")
	wantErrno(t, "a directory over a full directory", syscall.Rename(m.path("d1"), m.path("d2")), syscall.ENOTEMPTY)
	wantErrno(t, "a file over a directory", syscall.Rename(m.path("doc.txt"), m.path("d1")), syscall.EISDIR)
	wantErrno(t, "a directory over a file", syscall.Rename(m.path("d1"), m.path("doc.txt")), syscall.ENOTDIR)
}

func TestRenameFlagsNoReplaceAndExchange(t *testing.T) {
	m, _ := mountFresh(t)
	writeText(t, m.path("one"), "1")
	writeText(t, m.path("two"), "2")
	wantErrno(t, "RENAME_NOREPLACE over an existing name", unix.Renameat2(unix.AT_FDCWD, m.path("one"), unix.AT_FDCWD, m.path("two"), unix.RENAME_NOREPLACE), syscall.EEXIST)
	if err := unix.Renameat2(unix.AT_FDCWD, m.path("one"), unix.AT_FDCWD, m.path("fresh"), unix.RENAME_NOREPLACE); err != nil {
		t.Fatal(err)
	}
	if err := unix.Renameat2(unix.AT_FDCWD, m.path("fresh"), unix.AT_FDCWD, m.path("two"), unix.RENAME_EXCHANGE); err != nil {
		t.Fatal(err)
	}
	if readText(t, m.path("fresh")) != "2" || readText(t, m.path("two")) != "1" {
		t.Fatal("the exchange did not swap the files")
	}
	wantErrno(t, "RENAME_EXCHANGE with a missing name", unix.Renameat2(unix.AT_FDCWD, m.path("fresh"), unix.AT_FDCWD, m.path("nothing"), unix.RENAME_EXCHANGE), syscall.ENOENT)
	wantErrno(t, "RENAME_WHITEOUT", unix.Renameat2(unix.AT_FDCWD, m.path("fresh"), unix.AT_FDCWD, m.path("w"), unix.RENAME_WHITEOUT), syscall.EINVAL)
}

func TestAnUnlinkedFileStaysReadableThroughItsOpenDescriptor(t *testing.T) {
	m, _ := mountFresh(t)
	writeText(t, m.path("gone.txt"), "still here")
	f, err := os.Open(m.path("gone.txt"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := os.Remove(m.path("gone.txt")); err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 32)
	n, err := f.Read(buf)
	if err != nil || string(buf[:n]) != "still here" {
		t.Fatalf("read %q %v", buf[:n], err)
	}
	if _, err := os.Stat(m.path("gone.txt")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("stat after unlink: %v", err)
	}
}

func TestNamesFollowTheByteLimitAndTheHubRules(t *testing.T) {
	m, _ := mountFresh(t)
	long := strings.Repeat("n", 255)
	writeText(t, m.path(long), "x")
	if _, err := os.Stat(m.path(long)); err != nil {
		t.Fatal(err)
	}
	_, err := os.Create(m.path(long + "n"))
	wantErrno(t, "a 256 byte name", err, syscall.ENAMETOOLONG)
	writeText(t, m.path("ünïcode ☃ file"), "x")
	if _, err := os.Stat(m.path("ünïcode ☃ file")); err != nil {
		t.Fatal(err)
	}
}

func TestStaleInodesAnswerESTALEAfterTheHubForgetsThem(t *testing.T) {
	m, model := mountFresh(t)
	model.Put("/a.txt", "a")
	if _, err := os.Stat(m.path("a.txt")); err != nil {
		t.Fatal(err)
	}
	if err := model.Unlink("test", model.Root(), "a.txt"); err != nil {
		t.Fatal(err)
	}
	eventually(t, "the removal to be seen", func() bool {
		_, err := os.Stat(m.path("a.txt"))
		return errors.Is(err, os.ErrNotExist)
	})
}
