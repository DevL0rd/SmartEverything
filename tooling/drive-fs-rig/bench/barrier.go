package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"syscall"
	"time"
)

const (
	execLimit = 10 * time.Minute
	drainPoll = 100 * time.Millisecond
)

type counters struct {
	Type    string `json:"type"`
	Mount   string `json:"mount"`
	Open    int64  `json:"openFiles"`
	Pending int64  `json:"pendingUploads"`
}

func unsupported(err error) bool {
	return errors.Is(err, syscall.ENOSYS) || errors.Is(err, syscall.EINVAL) || errors.Is(err, syscall.EOPNOTSUPP) || errors.Is(err, syscall.ENOTSUP)
}

func syncTree(dir string) error {
	handle, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer handle.Close()
	if err := handle.Sync(); err != nil && !unsupported(err) {
		return err
	}
	return nil
}

type statusTail struct {
	file    *os.File
	events  *os.File
	partial []byte
	mount   string
	last    counters
	found   bool
}

func openTail(path, mount string) (*statusTail, error) {
	fd, err := syscall.InotifyInit1(syscall.IN_NONBLOCK | syscall.IN_CLOEXEC)
	if err != nil {
		return nil, fmt.Errorf("watching the status log %s: %w", path, err)
	}
	events := os.NewFile(uintptr(fd), "inotify")
	if _, err := syscall.InotifyAddWatch(fd, path, syscall.IN_MODIFY); err != nil {
		events.Close()
		return nil, fmt.Errorf("watching the status log %s: %w", path, err)
	}
	file, err := os.Open(path)
	if err != nil {
		events.Close()
		return nil, err
	}
	return &statusTail{file: file, events: events, mount: mount}, nil
}

func (t *statusTail) Close() {
	t.file.Close()
	t.events.Close()
}

func (t *statusTail) read() error {
	chunk := make([]byte, 1<<16)
	for {
		n, err := t.file.Read(chunk)
		t.partial = append(t.partial, chunk[:n]...)
		for {
			end := bytes.IndexByte(t.partial, '\n')
			if end < 0 {
				break
			}
			var line counters
			if json.Unmarshal(t.partial[:end], &line) == nil && line.Type == "counters" && line.Mount == t.mount {
				t.last = line
				t.found = true
			}
			t.partial = t.partial[end+1:]
		}
		if errors.Is(err, io.EOF) || n == 0 {
			return nil
		}
		if err != nil {
			return err
		}
	}
}

func (t *statusTail) wait(until time.Time) (bool, error) {
	if err := t.events.SetReadDeadline(until); err != nil {
		return false, err
	}
	buffer := make([]byte, 4096)
	_, err := t.events.Read(buffer)
	if errors.Is(err, os.ErrDeadlineExceeded) {
		return false, nil
	}
	return err == nil, err
}

var mutating = map[string]bool{
	"seq-write": true, "rand-write-1": true, "rand-write-16": true,
	"create-1": true, "create-16": true, "create-32": true,
	"untar": true, "clone": true, "office-save": true, "rm-tree": true,
}

type stalledError struct {
	pending int64
	since   time.Time
}

func (e *stalledError) Error() string {
	return fmt.Sprintf("the helper stopped making upload progress with %d uploads pending", e.pending)
}

func drainExec(d Drain, name string) error {
	if d.Exec == "" || (name != "" && !mutating[name]) {
		return nil
	}
	deadline := time.Now().Add(execLimit)
	for {
		err := exec.Command("sh", "-c", d.Exec).Run()
		if err == nil {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("the drain command %q kept failing for %s: %w", d.Exec, execLimit, err)
		}
		time.Sleep(drainPoll)
	}
}

func drain(d Drain, name string) error {
	if err := drainExec(d, name); err != nil {
		return err
	}
	if d.StatusLog == "" {
		return nil
	}
	tail, err := openTail(d.StatusLog, d.Mount)
	if err != nil {
		return err
	}
	defer tail.Close()
	progressAt := time.Now()
	var previous counters
	for {
		if err := tail.read(); err != nil {
			return err
		}
		now := tail.last
		if !tail.found || (now.Pending == 0 && now.Open == 0) {
			return nil
		}
		if now != previous {
			previous = now
			progressAt = time.Now()
		}
		changed, err := tail.wait(progressAt.Add(d.IdleLimit))
		if err != nil {
			return err
		}
		if !changed {
			if d.Tolerate {
				return &stalledError{pending: now.Pending, since: progressAt}
			}
			return fmt.Errorf("the helper made no upload progress for %s with %d uploads pending", d.IdleLimit, now.Pending)
		}
	}
}
