package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
)

const untilInvalidated = time.Duration(math.MaxInt64)

type activeMount struct {
	id     string
	root   mountRoot
	server *fuse.Server
	top    *node
	open   *openCounter
	done   chan struct{}
}

type mountSet struct {
	source Filesystem
	report *reporter
	mu     sync.Mutex
	mounts map[string]*activeMount
}

func newMountSet(source Filesystem, report *reporter) *mountSet {
	set := &mountSet{source: source, report: report, mounts: map[string]*activeMount{}}
	source.OnChange(set.sourceChanged)
	return set
}

func (s *mountSet) sourceChanged(root mountRoot, paths []string) {
	s.mu.Lock()
	var affected []*activeMount
	for _, active := range s.mounts {
		if active.root == root {
			affected = append(affected, active)
		}
	}
	s.mu.Unlock()
	for _, active := range affected {
		if len(paths) > 0 {
			if err := s.invalidate(active.id, paths); err != nil {
				s.report.failure(active.id, err)
			}
		}
		s.publish(active)
	}
}

func (s *mountSet) reachable(reachable bool) error {
	s.source.SetReachable(reachable)
	return nil
}

func (s *mountSet) mount(id string, root mountRoot, point string) error {
	if !filepath.IsAbs(point) {
		return s.fail(id, fmt.Errorf("mount point %q is not absolute", point))
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.mounts[id]; exists {
		return fmt.Errorf("mount %q already exists", id)
	}
	open := &openCounter{}
	top := &node{src: s.source, root: root, dir: true, open: open}
	server, err := fs.Mount(point, top, serverOptions())
	if err != nil {
		return s.fail(id, err)
	}
	active := &activeMount{id: id, root: root, server: server, top: top, open: open, done: make(chan struct{})}
	open.changed = func() { s.publish(active) }
	s.mounts[id] = active
	go s.watch(active)
	s.report.status(id, stateMounted, "")
	s.publish(active)
	return nil
}

func (s *mountSet) publish(active *activeMount) {
	s.report.usage(active.id, s.source.Usage(active.root), active.open.count.Load(), s.source.Pending(active.root))
}

func (s *mountSet) limit(id string, bytes int64) error {
	active, err := s.take(id)
	if err != nil {
		return err
	}
	if err := s.source.SetLimit(active.root, bytes); err != nil {
		return err
	}
	s.publish(active)
	return nil
}

func (s *mountSet) fail(id string, err error) error {
	s.report.status(id, stateFailed, err.Error())
	return err
}

func serverOptions() *fs.Options {
	forever := untilInvalidated
	return &fs.Options{
		EntryTimeout: &forever,
		AttrTimeout:  &forever,
		UID:          uint32(os.Getuid()),
		GID:          uint32(os.Getgid()),
		MountOptions: fuse.MountOptions{FsName: "smarteverything-drive", Name: "smarteverything", MaxReadAhead: 1 << 20, MaxWrite: 512 << 10, DirectMount: false},
	}
}

func (s *mountSet) watch(active *activeMount) {
	active.server.Wait()
	s.mu.Lock()
	if s.mounts[active.id] == active {
		delete(s.mounts, active.id)
		s.report.status(active.id, stateStopped, "unmounted outside the helper")
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
	err := active.server.Unmount()
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

func (s *mountSet) pin(id, path string) error {
	active, err := s.take(id)
	if err != nil {
		return err
	}
	defer s.publish(active)
	return s.source.Pin(context.Background(), active.root, path)
}

func (s *mountSet) unpin(id, path string) error {
	active, err := s.take(id)
	if err != nil {
		return err
	}
	defer s.publish(active)
	return s.source.Unpin(context.Background(), active.root, path)
}
