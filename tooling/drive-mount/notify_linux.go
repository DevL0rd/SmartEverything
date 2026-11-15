package main

import (
	"errors"
	"fmt"
	"strings"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
)

func (m *fuseMount) node(ino uint64) *fs.Inode {
	if found, ok := m.nodes.Load(ino); ok {
		return found.(*fs.Inode)
	}
	return nil
}

func (m *fuseMount) apply(change Change) error {
	if change.Reset {
		return m.dropAll()
	}
	var failures []error
	for _, ino := range change.Inodes {
		failures = append(failures, m.dropInode(ino))
	}
	for _, ino := range change.Removed {
		failures = append(failures, m.dropInode(ino))
	}
	for _, ref := range change.Entries {
		if parent := m.node(ref.Parent); parent != nil {
			failures = append(failures, notifyEntry(parent, ref.Name))
		}
	}
	return errors.Join(failures...)
}

func (m *fuseMount) dropInode(ino uint64) error {
	if inode := m.node(ino); inode != nil {
		return notifyChanged(inode)
	}
	return nil
}

func (m *fuseMount) dropAll() error {
	var failures []error
	m.nodes.Range(func(_, value any) bool {
		failures = append(failures, notifyNode(value.(*fs.Inode)))
		return true
	})
	return errors.Join(failures...)
}

func (s *mountSet) invalidate(id string, paths []string) error {
	active, err := s.take(id)
	if err != nil {
		return err
	}
	if len(paths) == 0 {
		return active.mount.dropAll()
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
	var failures []error
	for name, child := range inode.Children() {
		failures = append(failures, notifySubtree(child), notifyEntry(inode, name))
	}
	failures = append(failures, notifyChanged(inode))
	return errors.Join(failures...)
}

func notifyNode(inode *fs.Inode) error {
	var failures []error
	for name := range inode.Children() {
		failures = append(failures, notifyEntry(inode, name))
	}
	failures = append(failures, notifyChanged(inode))
	return errors.Join(failures...)
}

func notifyContent(inode *fs.Inode) error {
	return notifyErrno("content", inode.NotifyContent(0, 0))
}

func notifyChanged(inode *fs.Inode) error {
	failures := []error{notifyContent(inode)}
	if inode.IsRoot() {
		return errors.Join(failures...)
	}
	if name, parent := inode.Parent(); parent != nil {
		failures = append(failures, notifyEntry(parent, name))
	}
	failures = append(failures, notifyErrno("prune", inode.NotifyPrune([]*fs.Inode{inode})))
	return errors.Join(failures...)
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
