package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/winfsp/cgofuse/fuse"
)

var mountOptions = []string{"-o", "ro,volname=SmartEverything Drive,FileSystemName=smarteverything-drive"}

type activeMount struct {
	id     string
	root   mountRoot
	host   *fuse.FileSystemHost
	cancel context.CancelFunc
	done   chan struct{}
}

type mountSet struct {
	source Filesystem
	report *reporter
	mu     sync.Mutex
	mounts map[string]*activeMount
}

func newMountSet(source Filesystem, report *reporter) *mountSet {
	return &mountSet{source: source, report: report, mounts: map[string]*activeMount{}}
}

func (s *mountSet) route(spec routeSpec) error {
	return s.source.SwitchRoute(spec)
}

func (s *mountSet) fail(id string, err error) error {
	s.report.status(id, stateFailed, err.Error())
	return err
}

func checkMountPoint(point string) error {
	if !filepath.IsAbs(point) {
		return fmt.Errorf("mount point %q is not absolute", point)
	}
	_, err := os.Lstat(point)
	if err == nil {
		return fmt.Errorf("mount point %q already exists", point)
	}
	if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func serveMount(host *fuse.FileSystemHost, point string, finished chan<- error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			finished <- fmt.Errorf("%v", recovered)
		}
	}()
	if host.Mount(point, mountOptions) {
		finished <- nil
		return
	}
	finished <- errors.New("WinFsp refused the mount")
}

func (s *mountSet) mount(id string, root mountRoot, point string) error {
	if err := checkMountPoint(point); err != nil {
		return s.fail(id, err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.mounts[id]; exists {
		return fmt.Errorf("mount %q already exists", id)
	}
	ctx, cancel := context.WithCancel(context.Background())
	system := newWinFS(ctx, s.source, root)
	host := fuse.NewFileSystemHost(system)
	host.SetCapCaseInsensitive(true)
	host.SetCapReaddirPlus(true)
	finished := make(chan error, 1)
	go serveMount(host, point, finished)
	select {
	case <-system.ready:
	case err := <-finished:
		cancel()
		return s.fail(id, err)
	}
	active := &activeMount{id: id, root: root, host: host, cancel: cancel, done: make(chan struct{})}
	s.mounts[id] = active
	go s.watch(active, finished)
	s.report.status(id, stateMounted, "")
	return nil
}

func (s *mountSet) watch(active *activeMount, finished <-chan error) {
	err := <-finished
	active.cancel()
	s.mu.Lock()
	if s.mounts[active.id] == active {
		delete(s.mounts, active.id)
		reason := "unmounted outside the helper"
		if err != nil {
			reason = err.Error()
		}
		s.report.status(active.id, stateStopped, reason)
	}
	s.mu.Unlock()
	close(active.done)
}

func (s *mountSet) take(id string) (*activeMount, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	active, ok := s.mounts[id]
	if !ok {
		return nil, fmt.Errorf("mount %q does not exist", id)
	}
	return active, nil
}

func (s *mountSet) unmount(id string) error {
	s.mu.Lock()
	active, ok := s.mounts[id]
	if ok {
		delete(s.mounts, id)
	}
	s.mu.Unlock()
	if !ok {
		return fmt.Errorf("mount %q does not exist", id)
	}
	active.cancel()
	var err error
	if !active.host.Unmount() {
		err = fmt.Errorf("mount %q: WinFsp refused the unmount", id)
	}
	<-active.done
	s.report.status(id, stateStopped, "")
	s.report.forget(id)
	return err
}

func (s *mountSet) closeAll() error {
	s.mu.Lock()
	ids := make([]string, 0, len(s.mounts))
	for id := range s.mounts {
		ids = append(ids, id)
	}
	s.mu.Unlock()
	var failures []error
	for _, id := range ids {
		failures = append(failures, s.unmount(id))
	}
	return errors.Join(failures...)
}

func (s *mountSet) pin(id, filePath string) error {
	active, err := s.take(id)
	if err != nil {
		return err
	}
	return s.source.Pin(context.Background(), active.root, filePath)
}

func (s *mountSet) unpin(id, filePath string) error {
	active, err := s.take(id)
	if err != nil {
		return err
	}
	return s.source.Unpin(context.Background(), active.root, filePath)
}

func (s *mountSet) cache(policy cachePolicy) error {
	return s.source.SetPolicy(policy)
}
