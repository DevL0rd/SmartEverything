package main

import (
	"fmt"
	"path"
	"strings"

	"github.com/winfsp/cgofuse/fuse"
)

const (
	notifyContent   = fuse.NOTIFY_CHMOD | fuse.NOTIFY_UTIME | fuse.NOTIFY_TRUNCATE
	notifyDirectory = fuse.NOTIFY_CREATE | fuse.NOTIFY_UNLINK | fuse.NOTIFY_MKDIR | fuse.NOTIFY_RMDIR
)

func (s *mountSet) invalidate(id string, paths []string) error {
	active, err := s.take(id)
	if err != nil {
		return err
	}
	s.source.Invalidate(active.root, paths)
	if len(paths) == 0 {
		return notifyAction(active.host, "/", notifyContent|notifyDirectory)
	}
	var failed []string
	for _, p := range paths {
		clean := path.Clean("/" + strings.Trim(p, "/"))
		if err := notifyChange(active.host, clean); err != nil {
			failed = append(failed, clean)
		}
	}
	if len(failed) > 0 {
		return fmt.Errorf("notify failed for %s", strings.Join(failed, ", "))
	}
	return nil
}

func notifyChange(host *fuse.FileSystemHost, p string) error {
	if p == "/" {
		return notifyAction(host, p, notifyContent|notifyDirectory)
	}
	if err := notifyAction(host, p, notifyContent); err != nil {
		return err
	}
	return notifyAction(host, path.Dir(p), notifyDirectory)
}

func notifyAction(host *fuse.FileSystemHost, p string, action uint32) error {
	if !host.Notify(p, action) {
		return fmt.Errorf("notify %s refused", p)
	}
	return nil
}
