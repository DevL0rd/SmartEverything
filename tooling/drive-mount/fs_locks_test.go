//go:build linux

package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/integration/fakehub"
	"golang.org/x/sys/unix"
)

func openRW(t *testing.T, name string) *os.File {
	t.Helper()
	f, err := os.OpenFile(name, os.O_RDWR|os.O_CREATE, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { f.Close() })
	return f
}

var busy = syscall.EAGAIN.Error()

func parentLock(t *testing.T, f *os.File, typ int16, start, length int64) {
	t.Helper()
	lock := unix.Flock_t{Type: typ, Start: start, Len: length}
	if err := unix.FcntlFlock(f.Fd(), unix.F_SETLK, &lock); err != nil {
		t.Fatal(err)
	}
}

func TestFlockLocksConflictBetweenDescriptorsAndWaitForTheHolder(t *testing.T) {
	m, _ := mountFresh(t)
	a := openRW(t, m.path("lock"))
	b := openRW(t, m.path("lock"))
	if err := syscall.Flock(int(a.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatal(err)
	}
	wantErrno(t, "a second exclusive flock", syscall.Flock(int(b.Fd()), syscall.LOCK_EX|syscall.LOCK_NB), syscall.EWOULDBLOCK)
	granted := make(chan error, 1)
	go func() { granted <- syscall.Flock(int(b.Fd()), syscall.LOCK_EX) }()
	select {
	case err := <-granted:
		t.Fatalf("the blocking flock returned while the lock was held: %v", err)
	case <-time.After(300 * time.Millisecond):
	}
	if err := syscall.Flock(int(a.Fd()), syscall.LOCK_UN); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-granted:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the blocking flock was never granted")
	}
	c := openRW(t, m.path("lock"))
	wantErrno(t, "a lock held by the second descriptor", syscall.Flock(int(c.Fd()), syscall.LOCK_SH|syscall.LOCK_NB), syscall.EWOULDBLOCK)
	b.Close()
	eventually(t, "closing the holder to release its flock", func() bool {
		return syscall.Flock(int(c.Fd()), syscall.LOCK_SH|syscall.LOCK_NB) == nil
	})
	d := openRW(t, m.path("lock"))
	if err := syscall.Flock(int(d.Fd()), syscall.LOCK_SH|syscall.LOCK_NB); err != nil {
		t.Fatalf("two shared flocks: %v", err)
	}
}

func TestPosixLocksOfAnotherProcessConflictAndPartialUnlocksKeepTheRest(t *testing.T) {
	m, _ := mountFresh(t)
	name := m.path("posix")
	f := openRW(t, name)
	parentLock(t, f, unix.F_WRLCK, 0, 100)
	if out := runChildOnce(t, "lock", name, fmt.Sprint(unix.F_WRLCK), "0", "50", "try", "release"); out != busy {
		t.Fatalf("the child got %q while the parent held the range", out)
	}
	if out := runChildOnce(t, "lock", name, fmt.Sprint(unix.F_RDLCK), "99", "1", "try", "release"); out != busy {
		t.Fatalf("a read lock over a write lock: %q", out)
	}
	if out := runChildOnce(t, "lock", name, fmt.Sprint(unix.F_WRLCK), "100", "10", "try", "release"); out != "granted" {
		t.Fatalf("a range outside the lock: %q", out)
	}
	parentLock(t, f, unix.F_UNLCK, 10, 10)
	if out := runChildOnce(t, "lock", name, fmt.Sprint(unix.F_WRLCK), "10", "10", "try", "release"); out != "granted" {
		t.Fatalf("the unlocked middle: %q", out)
	}
	if out := runChildOnce(t, "lock", name, fmt.Sprint(unix.F_WRLCK), "0", "10", "try", "release"); out != busy {
		t.Fatalf("the front part must stay locked: %q", out)
	}
	if out := runChildOnce(t, "lock", name, fmt.Sprint(unix.F_WRLCK), "20", "80", "try", "release"); out != busy {
		t.Fatalf("the back part must stay locked: %q", out)
	}
	f.Close()
	if out := runChildOnce(t, "lock", name, fmt.Sprint(unix.F_WRLCK), "0", "0", "try", "release"); out != "granted" {
		t.Fatalf("closing the file must release the process locks: %q", out)
	}
}

func TestPosixLockWaitsUntilTheHolderUnlocksAndGetlkNamesTheHolder(t *testing.T) {
	m, _ := mountFresh(t)
	name := m.path("wait")
	f := openRW(t, name)
	parentLock(t, f, unix.F_WRLCK, 0, 0)
	waiting := startChild(t, "lock", name, fmt.Sprint(unix.F_WRLCK), "0", "0", "wait", "hold")
	if line, ok := waiting.next(400 * time.Millisecond); ok {
		t.Fatalf("the waiting child answered %q before the unlock", line)
	}
	parentLock(t, f, unix.F_UNLCK, 0, 0)
	waiting.expect("granted")
	probe := unix.Flock_t{Type: unix.F_WRLCK, Start: 0, Len: 0}
	if err := unix.FcntlFlock(f.Fd(), unix.F_GETLK, &probe); err != nil {
		t.Fatal(err)
	}
	if probe.Type != unix.F_WRLCK || int(probe.Pid) != waiting.cmd.Process.Pid {
		t.Fatalf("F_GETLK answered type %d pid %d, want the child %d", probe.Type, probe.Pid, waiting.cmd.Process.Pid)
	}
	waiting.finish()
	free := unix.Flock_t{Type: unix.F_WRLCK, Start: 0, Len: 0}
	eventually(t, "the child's exit to release its lock", func() bool {
		free = unix.Flock_t{Type: unix.F_WRLCK, Start: 0, Len: 0}
		return unix.FcntlFlock(f.Fd(), unix.F_GETLK, &free) == nil && free.Type == unix.F_UNLCK
	})
}

func TestAnInterruptedLockWaitCancelsItsRequest(t *testing.T) {
	m, model := mountFresh(t)
	name := m.path("cancel")
	f := openRW(t, name)
	parentLock(t, f, unix.F_WRLCK, 0, 0)
	waiting := startChild(t, "lock", name, fmt.Sprint(unix.F_WRLCK), "0", "0", "wait", "release")
	if _, ok := waiting.next(300 * time.Millisecond); ok {
		t.Fatal("the child was granted a lock that is held")
	}
	if err := waiting.cmd.Process.Signal(syscall.SIGKILL); err != nil {
		t.Fatal(err)
	}
	waiting.finish()
	parentLock(t, f, unix.F_UNLCK, 0, 0)
	if out := runChildOnce(t, "lock", name, fmt.Sprint(unix.F_WRLCK), "0", "0", "try", "release"); out != "granted" {
		t.Fatalf("a cancelled waiter must not hold or block the lock: %q", out)
	}
	eventually(t, "the hub to drop every lock", func() bool { return model.Held(model.InodeOf("/cancel")) == 0 })
}

func TestTakingALockDropsTheCachedPagesAndReleasingItFlushesTheWrites(t *testing.T) {
	m, model := mountFresh(t)
	model.Put("/cached.txt", "0123456789")
	f := openRW(t, m.path("cached.txt"))
	buf := make([]byte, 10)
	if _, err := f.ReadAt(buf, 0); err != nil || string(buf) != "0123456789" {
		t.Fatalf("first read %q %v", buf, err)
	}
	model.SetQuiet(true)
	model.Put("/cached.txt", "abcdefghij")
	model.SetQuiet(false)
	if _, err := f.ReadAt(buf, 0); err != nil || string(buf) != "0123456789" {
		t.Fatalf("the kernel should still serve the cached pages, got %q %v", buf, err)
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		t.Fatal(err)
	}
	if _, err := f.ReadAt(buf, 0); err != nil || string(buf) != "abcdefghij" {
		t.Fatalf("after taking the lock the pages must come from the hub, got %q %v", buf, err)
	}
	before := m.fs.syncs.Load()
	if _, err := f.WriteAt([]byte("Z"), 0); err != nil {
		t.Fatal(err)
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_UN); err != nil {
		t.Fatal(err)
	}
	if m.fs.syncs.Load() <= before {
		t.Fatal("releasing a lock must sync the writes of a writable descriptor")
	}
	if got, _ := model.Content("/cached.txt"); got[0] != 'Z' {
		t.Fatalf("the write did not reach the hub before the lock was released: %q", got)
	}
}

func TestLocksAreSharedBetweenTwoComputers(t *testing.T) {
	model := fakehub.NewModel()
	a := mountModel(t, model, "a")
	b := mountModel(t, model, "b")
	fa := openRW(t, a.path("shared.lock"))
	eventually(t, "b to see the file", func() bool { _, err := os.Stat(b.path("shared.lock")); return err == nil })
	fb := openRW(t, b.path("shared.lock"))
	if err := syscall.Flock(int(fa.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatal(err)
	}
	wantErrno(t, "a flock held on the other computer", syscall.Flock(int(fb.Fd()), syscall.LOCK_EX|syscall.LOCK_NB), syscall.EWOULDBLOCK)
	granted := make(chan error, 1)
	go func() { granted <- syscall.Flock(int(fb.Fd()), syscall.LOCK_EX) }()
	time.Sleep(200 * time.Millisecond)
	if err := syscall.Flock(int(fa.Fd()), syscall.LOCK_UN); err != nil {
		t.Fatal(err)
	}
	if err := <-granted; err != nil {
		t.Fatal(err)
	}
}

func TestADatabaseUsedFromTwoComputersStaysConsistent(t *testing.T) {
	if _, err := exec.LookPath("sqlite3"); err != nil {
		t.Skip("sqlite3 missing")
	}
	model := fakehub.NewModel()
	a := mountModel(t, model, "a")
	b := mountModel(t, model, "b")
	sql := func(mount *mounted, statement string) (string, error) {
		cmd := exec.Command("sqlite3", "-cmd", ".timeout 20000", mount.path("shared.db"), statement)
		out, err := cmd.CombinedOutput()
		return strings.TrimSpace(string(out)), err
	}
	if out, err := sql(a, "create table rows (side text, n integer);"); err != nil {
		t.Fatalf("create: %v %s", err, out)
	}
	eventually(t, "b to see the database", func() bool { _, err := os.Stat(b.path("shared.db")); return err == nil })
	const each = 25
	var wg sync.WaitGroup
	for _, side := range []struct {
		mount *mounted
		name  string
	}{{a, "a"}, {b, "b"}} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for n := 0; n < each; n++ {
				if out, err := sql(side.mount, fmt.Sprintf("insert into rows values ('%s', %d);", side.name, n)); err != nil {
					t.Errorf("insert from %s: %v %s", side.name, err, out)
					return
				}
			}
		}()
	}
	wg.Wait()
	for _, mount := range []*mounted{a, b} {
		if out, err := sql(mount, "select count(*) from rows;"); err != nil || out != fmt.Sprint(2*each) {
			t.Fatalf("row count %q (%v), want %d", out, err, 2*each)
		}
		if out, err := sql(mount, "pragma integrity_check;"); err != nil || out != "ok" {
			t.Fatalf("integrity check %q (%v)", out, err)
		}
	}
}
