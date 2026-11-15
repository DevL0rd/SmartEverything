package main

import (
	"errors"
	"fmt"
	"path"
	"strings"
	"sync"

	"github.com/winfsp/cgofuse/fuse"
)

const (
	notifyContent   = fuse.NOTIFY_CHMOD | fuse.NOTIFY_UTIME | fuse.NOTIFY_TRUNCATE
	notifyDirectory = fuse.NOTIFY_CREATE | fuse.NOTIFY_UNLINK | fuse.NOTIFY_MKDIR | fuse.NOTIFY_RMDIR
)

type pathBook struct {
	mu     sync.Mutex
	byPath map[string]uint64
	byIno  map[uint64]map[string]struct{}
}

func newPathBook() *pathBook {
	return &pathBook{byPath: map[string]uint64{}, byIno: map[uint64]map[string]struct{}{}}
}

func cleanPath(p string) string {
	return path.Clean("/" + strings.Trim(p, "/"))
}

func (b *pathBook) note(p string, ino uint64) {
	p = cleanPath(p)
	b.mu.Lock()
	defer b.mu.Unlock()
	b.set(p, ino)
}

func (b *pathBook) set(p string, ino uint64) {
	if previous, ok := b.byPath[p]; ok && previous != ino {
		b.unset(p, previous)
	}
	b.byPath[p] = ino
	if b.byIno[ino] == nil {
		b.byIno[ino] = map[string]struct{}{}
	}
	b.byIno[ino][p] = struct{}{}
}

func (b *pathBook) unset(p string, ino uint64) {
	delete(b.byPath, p)
	delete(b.byIno[ino], p)
	if len(b.byIno[ino]) == 0 {
		delete(b.byIno, ino)
	}
}

func under(p, root string) bool {
	return p == root || strings.HasPrefix(p, strings.TrimSuffix(root, "/")+"/")
}

func (b *pathBook) forget(p string) {
	p = cleanPath(p)
	b.mu.Lock()
	defer b.mu.Unlock()
	b.drop(p)
}

func (b *pathBook) drop(root string) {
	for known, ino := range b.byPath {
		if under(known, root) {
			b.unset(known, ino)
		}
	}
}

func (b *pathBook) rename(from, to string) {
	from, to = cleanPath(from), cleanPath(to)
	b.mu.Lock()
	defer b.mu.Unlock()
	b.drop(to)
	moved := map[string]uint64{}
	for known, ino := range b.byPath {
		if under(known, from) {
			moved[to+strings.TrimPrefix(known, from)] = ino
			b.unset(known, ino)
		}
	}
	for known, ino := range moved {
		b.set(known, ino)
	}
}

func (b *pathBook) of(ino uint64) []string {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]string, 0, len(b.byIno[ino]))
	for known := range b.byIno[ino] {
		out = append(out, known)
	}
	return out
}

func (b *pathBook) all() []string {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]string, 0, len(b.byPath))
	for known := range b.byPath {
		out = append(out, known)
	}
	return out
}

func (w *winFS) apply(host *fuse.FileSystemHost, change Change) {
	if change.Reset {
		for _, known := range w.paths.all() {
			notifyChange(host, known)
		}
		return
	}
	for _, ino := range change.Inodes {
		for _, known := range w.paths.of(ino) {
			notifyChange(host, known)
		}
	}
	for _, ino := range change.Removed {
		for _, known := range w.paths.of(ino) {
			notifyChange(host, known)
			w.paths.forget(known)
		}
	}
	for _, ref := range change.Entries {
		for _, parent := range w.paths.of(ref.Parent) {
			child := path.Join(parent, ref.Name)
			notifyChange(host, child)
			w.paths.forget(child)
		}
	}
}

func (s *mountSet) invalidate(id string, paths []string) error {
	active, err := s.take(id)
	if err != nil {
		return err
	}
	if len(paths) == 0 {
		paths = active.fs.paths.all()
	}
	var failures []error
	for _, p := range paths {
		failures = append(failures, notifyChange(active.host, cleanPath(p)))
	}
	return errors.Join(failures...)
}

func notifyChange(host *fuse.FileSystemHost, p string) error {
	if p == "/" {
		return notifyAction(host, p, notifyContent|notifyDirectory)
	}
	content := notifyAction(host, p, notifyContent)
	return errors.Join(content, notifyAction(host, path.Dir(p), notifyDirectory))
}

func notifyAction(host *fuse.FileSystemHost, p string, action uint32) error {
	if !host.Notify(p, action) {
		return fmt.Errorf("notify %s refused", p)
	}
	return nil
}
