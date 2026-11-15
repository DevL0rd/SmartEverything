//go:build linux

package main

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"math/rand"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

const childEnv = "SE_DRIVE_MOUNT_TEST_CHILD"

func TestMain(m *testing.M) {
	if mode := os.Getenv(childEnv); mode != "" {
		os.Exit(runChild(mode, os.Args[1:]))
	}
	os.Exit(m.Run())
}

type child struct {
	t     *testing.T
	cmd   *exec.Cmd
	stdin io.WriteCloser
	lines chan string
	done  chan error
	err   bytes.Buffer
}

func startChild(t *testing.T, mode string, args ...string) *child {
	t.Helper()
	cmd := exec.Command(os.Args[0], args...)
	cmd.Env = append(os.Environ(), childEnv+"="+mode)
	c := &child{t: t, cmd: cmd, lines: make(chan string, 64), done: make(chan error, 1)}
	cmd.Stderr = &c.err
	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	c.stdin = stdin
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	go func() {
		scan := bufio.NewScanner(stdout)
		for scan.Scan() {
			c.lines <- scan.Text()
		}
		close(c.lines)
		c.done <- cmd.Wait()
	}()
	t.Cleanup(func() {
		c.stdin.Close()
		cmd.Process.Kill()
	})
	return c
}

func (c *child) next(within time.Duration) (string, bool) {
	select {
	case line, ok := <-c.lines:
		return line, ok
	case <-time.After(within):
		return "", false
	}
}

func (c *child) expect(want string) {
	c.t.Helper()
	line, ok := c.next(10 * time.Second)
	if !ok || line != want {
		c.t.Fatalf("child said %q (alive %v), want %q; stderr %q", line, ok, want, c.err.String())
	}
}

func (c *child) finish() error {
	c.stdin.Close()
	return <-c.done
}

func runChildOnce(t *testing.T, mode string, args ...string) string {
	t.Helper()
	c := startChild(t, mode, args...)
	var out []string
	for line := range c.lines {
		out = append(out, line)
	}
	if err := <-c.done; err != nil {
		t.Fatalf("child %s: %v\nstdout %v\nstderr %s", mode, err, out, c.err.String())
	}
	return strings.Join(out, "\n")
}

func runChild(mode string, args []string) int {
	var err error
	switch mode {
	case "mapwrite":
		err = childMapWrite(args)
	case "mapread":
		err = childMapRead(args)
	case "fsx":
		err = childFsx(args)
	case "lock":
		err = childLock(args)
	default:
		err = fmt.Errorf("unknown child mode %q", mode)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return 0
}

func childMapWrite(args []string) error {
	f, err := os.OpenFile(args[0], os.O_RDWR, 0)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	data, err := unix.Mmap(int(f.Fd()), 0, int(info.Size()), unix.PROT_READ|unix.PROT_WRITE, unix.MAP_SHARED)
	if err != nil {
		return err
	}
	for _, edit := range args[1:] {
		at, text, _ := strings.Cut(edit, "=")
		off, err := strconv.Atoi(at)
		if err != nil {
			return err
		}
		copy(data[off:], text)
	}
	if err := unix.Msync(data, unix.MS_SYNC); err != nil {
		return err
	}
	return unix.Munmap(data)
}

func childMapRead(args []string) error {
	f, err := os.Open(args[0])
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	data, err := unix.Mmap(int(f.Fd()), 0, int(info.Size()), unix.PROT_READ, unix.MAP_SHARED)
	if err != nil {
		return err
	}
	fmt.Println(string(data))
	return unix.Munmap(data)
}

func childFsx(args []string) error {
	seed, _ := strconv.Atoi(args[1])
	steps, _ := strconv.Atoi(args[2])
	const limit = 1 << 18
	f, err := os.OpenFile(args[0], os.O_RDWR|os.O_CREATE, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	reference := []byte{}
	random := rand.New(rand.NewSource(int64(seed)))
	for step := 0; step < steps; step++ {
		off := random.Intn(limit)
		length := 1 + random.Intn(20000)
		op := random.Intn(8)
		fail := func(what string, err error) error {
			return fmt.Errorf("step %d (%s at %d length %d, size %d): %w", step, what, off, length, len(reference), err)
		}
		switch op {
		case 0, 1:
			buf := make([]byte, length)
			random.Read(buf)
			if _, err := f.WriteAt(buf, int64(off)); err != nil {
				return fail("write", err)
			}
			if end := off + length; end > len(reference) {
				reference = append(reference, make([]byte, end-len(reference))...)
			}
			copy(reference[off:], buf)
		case 2:
			size := random.Intn(limit)
			if err := f.Truncate(int64(size)); err != nil {
				return fail("truncate", err)
			}
			if size > len(reference) {
				reference = append(reference, make([]byte, size-len(reference))...)
			}
			reference = reference[:size]
		case 3:
			if off >= len(reference) {
				continue
			}
			end := min(off+length, len(reference))
			got := make([]byte, end-off)
			if _, err := f.ReadAt(got, int64(off)); err != nil {
				return fail("read", err)
			}
			if !bytes.Equal(got, reference[off:end]) {
				return fail("read", fmt.Errorf("the bytes differ"))
			}
		case 4:
			if off+length > len(reference) {
				continue
			}
			if err := unix.Fallocate(int(f.Fd()), unix.FALLOC_FL_PUNCH_HOLE|unix.FALLOC_FL_KEEP_SIZE, int64(off), int64(length)); err != nil {
				return fail("punch hole", err)
			}
			clear(reference[off : off+length])
		case 5:
			if len(reference) == 0 {
				continue
			}
			size := len(reference)
			data, err := unix.Mmap(int(f.Fd()), 0, size, unix.PROT_READ|unix.PROT_WRITE, unix.MAP_SHARED)
			if err != nil {
				return fail("mmap", err)
			}
			at := random.Intn(size)
			n := min(1+random.Intn(4000), size-at)
			random.Read(data[at : at+n])
			copy(reference[at:], data[at:at+n])
			if err := unix.Munmap(data); err != nil {
				return fail("munmap", err)
			}
		case 6:
			if err := f.Sync(); err != nil {
				return fail("fsync", err)
			}
		case 7:
			if len(reference) == 0 {
				continue
			}
			data, err := unix.Mmap(int(f.Fd()), 0, len(reference), unix.PROT_READ, unix.MAP_SHARED)
			if err != nil {
				return fail("mmap read", err)
			}
			end := min(off+length, len(reference))
			if off < len(reference) && !bytes.Equal(data[off:end], reference[off:end]) {
				unix.Munmap(data)
				return fail("mapped read", fmt.Errorf("the bytes differ"))
			}
			if err := unix.Munmap(data); err != nil {
				return fail("munmap", err)
			}
		}
		if info, err := f.Stat(); err != nil || info.Size() != int64(len(reference)) {
			return fail("stat", fmt.Errorf("size %v (%v), want %d", info, err, len(reference)))
		}
	}
	if err := f.Close(); err != nil {
		return err
	}
	back, err := os.ReadFile(args[0])
	if err != nil {
		return err
	}
	if !bytes.Equal(back, reference) {
		return fmt.Errorf("the file read back differs from the reference buffer")
	}
	fmt.Println("ok")
	return nil
}

func childLock(args []string) error {
	typ, _ := strconv.Atoi(args[1])
	start, _ := strconv.Atoi(args[2])
	length, _ := strconv.Atoi(args[3])
	wait := args[4] == "wait"
	hold := args[5] == "hold"
	f, err := os.OpenFile(args[0], os.O_RDWR, 0)
	if err != nil {
		return err
	}
	defer f.Close()
	lock := unix.Flock_t{Type: int16(typ), Whence: 0, Start: int64(start), Len: int64(length)}
	cmd := unix.F_SETLK
	if wait {
		cmd = unix.F_SETLKW
	}
	if err := unix.FcntlFlock(f.Fd(), cmd, &lock); err != nil {
		fmt.Println(err.(syscall.Errno).Error())
		return nil
	}
	fmt.Println("granted")
	if hold {
		io.Copy(io.Discard, os.Stdin)
	}
	return nil
}
