package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
	"github.com/smarteverything/drive-mount/wire"
)

const (
	untilInvalidated = time.Duration(math.MaxInt64)
	attachTimeout    = 30 * time.Second
	maxTransfer      = 1 << 20
	backgroundCalls  = 12
)

type activeMount struct {
	id      string
	root    mountRoot
	hubRoot string
	rootIno uint64
	server  *fuse.Server
	top     *node
	mount   *fuseMount
	open    *openCounter
	done    chan struct{}
}

type mountSet struct {
	source InodeFilesystem
	report *reporter
	mu     sync.Mutex
	mounts map[string]*activeMount
}

func newMountSet(source InodeFilesystem, report *reporter) *mountSet {
	set := &mountSet{source: source, report: report, mounts: map[string]*activeMount{}}
	source.OnChange(set.sourceChanged)
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
		if err := active.mount.apply(change); err != nil {
			s.report.failure(active.id, err)
		}
		s.publish(active)
	}
}

func (s *mountSet) route(spec routeSpec) error {
	return s.source.SwitchRoute(wire.Route{URL: spec.URL, Server: spec.Server, Pin: spec.Pin})
}

func (s *mountSet) mount(id string, root mountRoot, point string, options mountOptions) error {
	if !filepath.IsAbs(point) {
		return s.fail(id, fmt.Errorf("mount point %q is not absolute", point))
	}
	s.mu.Lock()
	_, exists := s.mounts[id]
	s.mu.Unlock()
	if exists {
		return fmt.Errorf("mount %q already exists", id)
	}
	ctx, cancel := context.WithTimeout(context.Background(), attachTimeout)
	attached, err := s.source.Attach(ctx, id)
	cancel()
	if err != nil {
		return s.fail(id, err)
	}
	if r, ok := s.source.(legacyPinRestorer); ok {
		r.RestoreLegacyPins(root, attached.Ino)
	}
	open := &openCounter{}
	fm := &fuseMount{src: options.source(s.source), root: attached.Root, point: point, uid: uint32(os.Getuid()), gid: uint32(os.Getgid()), open: open, options: options}
	top := &node{m: fm}
	active := &activeMount{id: id, root: root, hubRoot: attached.Root, rootIno: attached.Ino, top: top, mount: fm, open: open, done: make(chan struct{})}
	open.changed = func() { s.publish(active) }
	fm.nodes.Store(attached.Ino, top.EmbeddedInode())
	server, err := fs.Mount(point, top, serverOptions(point, attached.Ino, options))
	if err != nil {
		return s.fail(id, err)
	}
	active.server = server
	s.mu.Lock()
	s.mounts[id] = active
	s.mu.Unlock()
	go s.watch(active)
	s.report.status(id, stateMounted, "")
	s.publish(active)
	return nil
}

func (s *mountSet) publish(active *activeMount) {
	s.report.usage(active.id, s.source.Usage(active.hubRoot), s.source.PinnedBytes(active.hubRoot), active.open.count.Load(), s.source.Pending(active.hubRoot))
}

func (s *mountSet) cache(policy cachePolicy) error {
	return s.source.SetPolicy(policy)
}

func (s *mountSet) fail(id string, err error) error {
	s.report.status(id, stateFailed, err.Error())
	return err
}

const networkSourcePrefix = "//smarteverything/"

func mountSource(point string) string {
	return networkSourcePrefix + strings.ReplaceAll(filepath.Base(point), " ", "_")
}

func serverOptions(point string, rootIno uint64, options mountOptions) *fs.Options {
	forever := untilInvalidated
	allowOther, directMount := rigMountFlags()
	kernel := []string{"default_permissions"}
	if options.readOnly {
		kernel = append(kernel, "ro")
	}
	return &fs.Options{
		EntryTimeout:    &forever,
		AttrTimeout:     &forever,
		NegativeTimeout: &forever,
		NullPermissions: true,
		RootStableAttr:  &fs.StableAttr{Ino: rootIno},
		MountOptions: fuse.MountOptions{
			FsName:               mountSource(point),
			Name:                 "smarteverything",
			MaxReadAhead:         maxTransfer,
			MaxWrite:             maxTransfer,
			MaxBackground:        backgroundCalls,
			EnableLocks:          true,
			EnableSymlinkCaching: true,
			ExtraCapabilities:    fuse.CAP_WRITEBACK_CACHE | fuse.CAP_ATOMIC_O_TRUNC,
			Options:              kernel,
			DirectMount:          directMount,
			AllowOther:           allowOther,
		},
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

func (s *mountSet) resolve(ctx context.Context, active *activeMount, path string) (uint64, error) {
	ino := active.rootIno
	for _, segment := range strings.Split(strings.Trim(path, "/"), "/") {
		if segment == "" {
			continue
		}
		e, err := s.source.Lookup(ctx, ino, segment)
		if err != nil {
			return 0, err
		}
		ino = e.Ino
	}
	return ino, nil
}

func (s *mountSet) pin(id, path string) error {
	active, err := s.take(id)
	if err != nil {
		return err
	}
	defer s.publish(active)
	ino, err := s.resolve(context.Background(), active, path)
	if err != nil {
		return err
	}
	return s.source.Pin(context.Background(), ino)
}

func (s *mountSet) unpin(id, path string) error {
	active, err := s.take(id)
	if err != nil {
		return err
	}
	defer s.publish(active)
	ino, err := s.resolve(context.Background(), active, path)
	if err != nil {
		return err
	}
	return s.source.Unpin(context.Background(), ino)
}
