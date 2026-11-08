//go:build linux

package main

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"syscall"
	"testing"
)

func TestStatusOnChangeOnly(t *testing.T) {
	out := &bytes.Buffer{}
	r := newReporter(out)
	r.status("a", stateMounted, "")
	r.status("a", stateMounted, "")
	r.status("b", stateMounted, "")
	r.status("a", stateFailed, "gone")
	r.status("a", stateFailed, "gone")
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 3 {
		t.Fatalf("lines %v", lines)
	}
	r.forget("a")
	r.status("a", stateFailed, "gone")
	if got := strings.Count(out.String(), "\n"); got != 4 {
		t.Fatalf("after forget %d lines", got)
	}
}

type blockingSource struct {
	Filesystem
	entered chan struct{}
}

func (b blockingSource) Size(mountRoot, string) (int64, bool) { return 0, false }

func (b blockingSource) Stat(context.Context, mountRoot, string) (entry, error) {
	return entry{Size: 10}, nil
}

func (b blockingSource) List(ctx context.Context, _ mountRoot, _ string) ([]entry, error) {
	return nil, errors.New("unused")
}

func (b blockingSource) ReadAt(ctx context.Context, _ mountRoot, _ string, _ int64, _ []byte) (int, error) {
	close(b.entered)
	<-ctx.Done()
	return 0, ctx.Err()
}

func TestInterruptAbortsSourceRead(t *testing.T) {
	source := blockingSource{entered: make(chan struct{})}
	n := &node{src: source}
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan syscall.Errno, 1)
	go func() {
		_, errno := n.Read(ctx, nil, make([]byte, 4), 0)
		result <- errno
	}()
	<-source.entered
	cancel()
	if errno := <-result; errno != syscall.EINTR {
		t.Fatalf("errno %v", errno)
	}
}
