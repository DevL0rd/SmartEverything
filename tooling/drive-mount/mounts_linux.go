package main

import (
	"context"
	"errors"
	"fmt"
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
	attachTimeout = 30 * time.Second
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
	applied remountApplied
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
	source.OnProgress(coalesced(set.publishUploads))
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
	tuned, err := s.tuning.forMount()
	if err != nil {
		return s.fail(id, err)
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
	server, err := mountNodes(point, top, serverOptions(point, attached.Ino, options, tuned))
	if err != nil {
		return s.fail(id, err)
	}
	active.server = server
	settings := server.KernelSettings()
	s.tuning.offered(int64(settings.MaxReadAhead))
	active.applied = appliedKernel(tuned, settings.Flags64(), int64(settings.MaxReadAhead))
	s.mu.Lock()
	s.mounts[id] = active
	s.mu.Unlock()
	go s.watch(active)
	s.report.status(id, stateMounted, "", options.readOnly)
	s.report.applied(id, &active.applied, live.load())
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
		s.report.applied(active.id, &active.applied, live.load())
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
	s.publishUploads()
}

func (s *mountSet) publishUploads() {
	s.report.uploads(s.source.Uploads())
}

func (s *mountSet) publish(active *activeMount) {
	s.report.usage(active.id, s.source.Usage(active.hubRoot), s.source.PinnedBytes(active.hubRoot), active.open.count.Load(), s.source.Pending(active.hubRoot))
}

func (s *mountSet) cache(policy cachePolicy) error {
	return s.source.SetPolicy(policy)
}

func (s *mountSet) fail(id string, err error) error {
	s.report.status(id, stateFailed, err.Error(), false)
	return err
}

const networkSourcePrefix = "//smarteverything/"

func mountSource(point string) string {
	return networkSourcePrefix + strings.ReplaceAll(filepath.Base(point), " ", "_")
}

func serverOptions(point string, rootIno uint64, options mountOptions, t tuning) *fs.Options {
	setNegativeLifetime(t.live.negative.duration())
	allowOther, directMount := rigMountFlags()
	kernel := []string{"default_permissions"}
	if options.readOnly {
		kernel = append(kernel, "ro")
	}
	extra := uint64(fuse.CAP_ATOMIC_O_TRUNC)
	var disabled uint64
	if t.writebackCache {
		extra |= fuse.CAP_WRITEBACK_CACHE
	}
	switch t.readdirPlus {
	case readdirPlusAuto:
		extra |= fuse.CAP_READDIRPLUS_AUTO
	case readdirPlusOff:
		disabled |= fuse.CAP_READDIRPLUS | fuse.CAP_READDIRPLUS_AUTO
	}
	if !t.parallelDirops {
		disabled |= fuse.CAP_PARALLEL_DIROPS
	}
	congestion := 0
	if !t.congestionFollows {
		congestion = int(t.congestionThreshold)
	}
	return &fs.Options{
		NullPermissions: true,
		RootStableAttr:  &fs.StableAttr{Ino: rootIno},
		MountOptions: fuse.MountOptions{
			FsName:               mountSource(point),
			Name:                 "smarteverything",
			MaxReadAhead:         int(t.kernelReadaheadBytes),
			MaxWrite:             int(t.maxRequestBytes),
			MaxBackground:        int(t.maxBackground),
			CongestionThreshold:  congestion,
			SyncRead:             !t.asyncRead,
			EnableLocks:          true,
			EnableSymlinkCaching: true,
			ExtraCapabilities:    extra,
			DisabledCapabilities: disabled,
			Options:              kernel,
			DirectMount:          directMount,
			AllowOther:           allowOther,
		},
	}
}

func appliedKernel(t tuning, offered uint64, readaheadOffer int64) remountApplied {
	plus := t.readdirPlus
	switch {
	case offered&fuse.CAP_READDIRPLUS == 0:
		plus = readdirPlusOff
	case plus == readdirPlusAuto && offered&fuse.CAP_READDIRPLUS_AUTO == 0:
		plus = readdirPlusAlways
	}
	return remountApplied{
		MaxBackground:        t.maxBackground,
		CongestionThreshold:  min(t.effectiveCongestion(), t.maxBackground),
		MaxRequestBytes:      t.maxRequestBytes,
		KernelReadaheadBytes: min(t.kernelReadaheadBytes, readaheadOffer),
		AsyncRead:            t.asyncRead && offered&fuse.CAP_ASYNC_READ != 0,
		WritebackCache:       t.writebackCache && offered&fuse.CAP_WRITEBACK_CACHE != 0,
		ReaddirPlus:          string(plus),
		ParallelDirops:       t.parallelDirops && offered&fuse.CAP_PARALLEL_DIROPS != 0,
	}
}

func (s *mountSet) watch(active *activeMount) {
	active.server.Wait()
	s.mu.Lock()
	if s.mounts[active.id] == active {
		delete(s.mounts, active.id)
		s.report.status(active.id, stateStopped, "unmounted outside the helper", false)
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
