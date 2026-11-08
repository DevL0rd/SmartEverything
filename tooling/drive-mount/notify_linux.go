package main

import (
	"errors"
	"fmt"
	"strings"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
)

func (s *mountSet) invalidate(id string, paths []string) error {
	active, err := s.take(id)
	if err != nil {
		return err
	}
	s.source.Invalidate(active.root, paths)
	if len(paths) == 0 {
		return notifySubtree(&active.top.Inode)
	}
	var failures []error
	for _, path := range paths {
		failures = append(failures, notifyPath(&active.top.Inode, path))
	}
	return errors.Join(failures...)
}

func notifyPath(top *fs.Inode, path string) error {
	parent, current := top, top
	name := ""
	for _, segment := range strings.Split(strings.Trim(path, "/"), "/") {
		if segment == "" {
			continue
		}
		next := current.GetChild(segment)
		if next == nil {
			return nil
		}
		parent, current, name = current, next, segment
	}
	if current == top {
		return notifySubtree(top)
	}
	if err := notifySubtree(current); err != nil {
		return err
	}
	return notifyEntry(parent, name)
}

func notifySubtree(inode *fs.Inode) error {
	for name, child := range inode.Children() {
		if err := notifySubtree(child); err != nil {
			return err
		}
		if err := notifyEntry(inode, name); err != nil {
			return err
		}
	}
	return notifyErrno("content", inode.NotifyContent(0, 0))
}

func notifyEntry(parent *fs.Inode, name string) error {
	return notifyErrno("entry "+name, parent.NotifyEntry(name))
}

func notifyErrno(what string, errno syscall.Errno) error {
	if errno == 0 || errno == syscall.ENOENT {
		return nil
	}
	return fmt.Errorf("notify %s: %w", what, errno)
}
