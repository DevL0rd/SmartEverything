//go:build linux

package main

import (
	"errors"
	"slices"
	"strings"
	"syscall"

	"golang.org/x/sys/unix"
)

type unixMeta struct{}

func errnoName(err error) string {
	var errno syscall.Errno
	if errors.As(err, &errno) {
		return unix.ErrnoName(errno)
	}
	return "EIO"
}

func (unixMeta) names(path string) ([]string, error) {
	for {
		size, err := unix.Llistxattr(path, nil)
		if err != nil {
			return nil, err
		}
		if size == 0 {
			return nil, nil
		}
		buffer := make([]byte, size)
		read, err := unix.Llistxattr(path, buffer)
		if errors.Is(err, syscall.ERANGE) {
			continue
		}
		if err != nil {
			return nil, err
		}
		var names []string
		for _, name := range strings.Split(string(buffer[:read]), "\x00") {
			if strings.HasPrefix(name, userXattrPrefix) {
				names = append(names, name)
			}
		}
		slices.Sort(names)
		return names, nil
	}
}

func (unixMeta) value(path, name string) ([]byte, error) {
	for {
		size, err := unix.Lgetxattr(path, name, nil)
		if err != nil {
			return nil, err
		}
		buffer := make([]byte, size)
		read, err := unix.Lgetxattr(path, name, buffer)
		if errors.Is(err, syscall.ERANGE) {
			continue
		}
		if err != nil {
			return nil, err
		}
		return buffer[:read], nil
	}
}

func (backend unixMeta) list(path string) ([]metaXattr, error) {
	names, err := backend.names(path)
	if err != nil {
		return nil, err
	}
	found := make([]metaXattr, 0, len(names))
	for _, name := range names {
		value, err := backend.value(path, name)
		if errors.Is(err, syscall.ENODATA) {
			continue
		}
		if err != nil {
			return nil, err
		}
		found = append(found, metaXattr{Name: name, Value: value})
	}
	return found, nil
}

func (backend unixMeta) replace(path string, want []metaXattr) error {
	held, err := backend.names(path)
	if err != nil {
		if errors.Is(err, syscall.ENOTSUP) && len(want) == 0 {
			return nil
		}
		return err
	}
	wanted := make(map[string][]byte, len(want))
	for _, xattr := range want {
		wanted[xattr.Name] = xattr.Value
	}
	for _, name := range held {
		if _, keep := wanted[name]; keep {
			continue
		}
		if err := unix.Lremovexattr(path, name); err != nil && !errors.Is(err, syscall.ENODATA) {
			return err
		}
	}
	for _, xattr := range want {
		if current, err := backend.value(path, xattr.Name); err == nil && string(current) == string(xattr.Value) {
			continue
		}
		if err := unix.Lsetxattr(path, xattr.Name, xattr.Value, 0); err != nil {
			return err
		}
	}
	return nil
}

func (unixMeta) setMtime(path string, mtimeNs int64) error {
	times := []unix.Timespec{{Sec: 0, Nsec: unix.UTIME_OMIT}, unix.NsecToTimespec(mtimeNs)}
	return unix.UtimesNanoAt(unix.AT_FDCWD, path, times, unix.AT_SYMLINK_NOFOLLOW)
}

func platformMeta() metaBackend { return unixMeta{} }
