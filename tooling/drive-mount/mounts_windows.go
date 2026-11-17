package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/smarteverything/drive-mount/wire"
	"github.com/winfsp/cgofuse/fuse"
	"golang.org/x/sys/windows"
)

const attachTimeout = 30 * time.Second

var winfspOptions = []string{"-o", "uid=-1,gid=-1,volname=SmartEverything Drive,FileSystemName=smarteverything-drive"}

type activeMount struct {
	id      string
	root    mountRoot
	hubRoot string
	rootIno uint64
	host    *fuse.FileSystemHost
	fs      *winFS
	open    *openCounter
	cancel  context.CancelFunc
	done    chan struct{}
}

type mountSet struct {
	source InodeFilesystem
	report *reporter
	mu     sync.Mutex
	mounts map[string]*activeMount
	tuning *tuningState
}

func newMountSet(source InodeFilesystem, report *reporter) *mountSet {
	set := &mountSet{source: source, report: report, mounts: map[string]*activeMount{}, tuning: newTuningState(report)}
	source.OnChange(set.sourceChanged)
	source.OnPending(coalesced(set.publishAll))
	return set
}

func (s *mountSet) sourceChanged(change Change) {
	s.mu.Lock()
	var affected []*activeMount
	for _, active := range s.mounts {
		if active.hubRoot == change.Root {
			affected = append(affected, active)
		}
	}
	s.mu.Unlock()
	for _, active := range affected {
		active.fs.apply(active.host, change)
		s.publish(active)
	}
}

func (s *mountSet) route(spec routeSpec) error {
	return s.source.SwitchRoute(wire.Route{URL: spec.URL, Server: spec.Server, Pin: spec.Pin})
}

func (s *mountSet) fail(id string, err error) error {
	s.report.status(id, stateFailed, err.Error(), false)
	return err
}

func driveLetterIndex(point string) (uint32, bool) {
	if len(point) != 2 || point[1] != ':' {
		return 0, false
	}
	letter := point[0] | 0x20
	if letter < 'a' || letter > 'z' {
		return 0, false
	}
	return uint32(letter - 'a'), true
}

func checkMountPoint(point string) error {
	if index, ok := driveLetterIndex(point); ok {
		inUse, err := windows.GetLogicalDrives()
		if err != nil {
			return err
		}
		if inUse&(1<<index) != 0 {
			return fmt.Errorf("drive %s is already in use", point)
		}
		return nil
	}
	if !filepath.IsAbs(point) {
		return fmt.Errorf("mount point %q is neither a drive letter nor an absolute path", point)
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
	if host.Mount(point, winfspOptions) {
		finished <- nil
		return
	}
	finished <- errors.New("WinFsp refused the mount")
}

func (s *mountSet) mount(id string, root mountRoot, point string, options mountOptions) error {
	if err := checkMountPoint(point); err != nil {
		return s.fail(id, err)
	}
	s.mu.Lock()
	_, exists := s.mounts[id]
	s.mu.Unlock()
	if exists {
		return fmt.Errorf("mount %q already exists", id)
	}
	if _, err := s.tuning.forMount(); err != nil {
		return s.fail(id, err)
	}
	attachCtx, attachCancel := context.WithTimeout(context.Background(), attachTimeout)
	attached, err := s.source.Attach(attachCtx, id)
	attachCancel()
	if err != nil {
		return s.fail(id, err)
	}
	if r, ok := s.source.(legacyPinRestorer); ok {
		r.RestoreLegacyPins(root, attached.Ino)
	}
	ctx, cancel := context.WithCancel(context.Background())
	open := &openCounter{}
	system := newWinFS(ctx, options.source(s.source), attached.Ino, open, options)
	host := fuse.NewFileSystemHost(system)
	host.SetCapReaddirPlus(true)
	finished := make(chan error, 1)
	go serveMount(host, point, finished)
	select {
	case <-system.ready:
	case err := <-finished:
		cancel()
		return s.fail(id, err)
	}
	active := &activeMount{id: id, root: root, hubRoot: attached.Root, rootIno: attached.Ino, host: host, fs: system, open: open, cancel: cancel, done: make(chan struct{})}
	open.changed = func() { s.publish(active) }
	s.mu.Lock()
	s.mounts[id] = active
	s.mu.Unlock()
	go s.watch(active, finished)
	s.report.status(id, stateMounted, "", options.readOnly)
	s.report.applied(id, nil, live.load())
	s.publish(active)
	return nil
}

func (s *mountSet) tune(t tuning) error {
	if err := s.tuning.apply(t); err != nil {
		return err
	}
	s.mu.Lock()
	mounted := make([]*activeMount, 0, len(s.mounts))
	for _, active := range s.mounts {
		mounted = append(mounted, active)
	}
	s.mu.Unlock()
	for _, active := range mounted {
		s.report.applied(active.id, nil, live.load())
	}
	return nil
}

func (s *mountSet) publishAll() {
	s.mu.Lock()
	mounted := make([]*activeMount, 0, len(s.mounts))
	for _, active := range s.mounts {
		mounted = append(mounted, active)
	}
	s.mu.Unlock()
	for _, active := range mounted {
		s.publish(active)
	}
}

func (s *mountSet) publish(active *activeMount) {
	s.report.usage(active.id, s.source.Usage(active.hubRoot), s.source.PinnedBytes(active.hubRoot), active.open.count.Load(), s.source.Pending(active.hubRoot))
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
		s.report.status(active.id, stateStopped, reason, false)
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
	s.report.status(id, stateStopped, "", false)
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
	defer s.publish(active)
	e, err := active.fs.resolve(filePath)
	if err != nil {
		return err
	}
	return s.source.Pin(context.Background(), e.Ino)
}

func (s *mountSet) unpin(id, filePath string) error {
	active, err := s.take(id)
	if err != nil {
		return err
	}
	defer s.publish(active)
	e, err := active.fs.resolve(filePath)
	if err != nil {
		return err
	}
	return s.source.Unpin(context.Background(), e.Ino)
}

func (s *mountSet) cache(policy cachePolicy) error {
	return s.source.SetPolicy(policy)
}
