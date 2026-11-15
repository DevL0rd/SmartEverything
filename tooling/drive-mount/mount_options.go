package main

import (
	"context"
	"fmt"
	"syscall"
	"time"
)

type atimeMode int

const (
	atimeRelative atimeMode = iota
	atimeStrict
	atimeNever
)

type mountOptions struct {
	atime    atimeMode
	readOnly bool
}

func parseMountOptions(names []string) (mountOptions, error) {
	var options mountOptions
	for _, name := range names {
		switch name {
		case "relatime":
			options.atime = atimeRelative
		case "strictatime":
			options.atime = atimeStrict
		case "noatime":
			options.atime = atimeNever
		case "ro":
			options.readOnly = true
		case "rw":
			options.readOnly = false
		case "defaults", "nodiratime", "diratime":
		default:
			return mountOptions{}, fmt.Errorf("mount option %q is not supported (relatime, strictatime, noatime, nodiratime, diratime, ro, rw and defaults are)", name)
		}
	}
	return options, nil
}

func (o mountOptions) notesAccess() (note, strict bool) {
	return !o.readOnly && o.atime != atimeNever, o.atime == atimeStrict
}

const relatimeWindowNs = int64(24 * 60 * 60 * 1_000_000_000)

func accessDue(ctx context.Context, src InodeSource, options mountOptions, ino uint64) bool {
	note, strict := options.notesAccess()
	if !note {
		return false
	}
	if strict {
		return true
	}
	attr, err := src.Getattr(ctx, ino)
	if err != nil {
		return true
	}
	return attr.AtimeNs <= attr.MtimeNs || attr.AtimeNs <= attr.CtimeNs || time.Now().UnixNano()-attr.AtimeNs >= relatimeWindowNs
}

func (o mountOptions) source(src InodeFilesystem) InodeFilesystem {
	if o.readOnly {
		return readOnlyFS{InodeFilesystem: src}
	}
	return src
}

type readOnlyFS struct {
	InodeFilesystem
}

var errReadOnly error = syscall.EROFS

func (readOnlyFS) Create(context.Context, CreateArgs) (Entry, InodeWriteHandle, error) {
	return Entry{}, nil, errReadOnly
}

func (readOnlyFS) OpenWrite(context.Context, uint64, bool) (InodeWriteHandle, error) {
	return nil, errReadOnly
}

func (readOnlyFS) Tmpfile(context.Context, CreateArgs) (Entry, InodeWriteHandle, error) {
	return Entry{}, nil, errReadOnly
}

func (readOnlyFS) Mkdir(context.Context, CreateArgs) (Entry, error) { return Entry{}, errReadOnly }

func (readOnlyFS) Mknod(context.Context, CreateArgs) (Entry, error) { return Entry{}, errReadOnly }

func (readOnlyFS) Symlink(context.Context, CreateArgs) (Entry, error) { return Entry{}, errReadOnly }

func (readOnlyFS) Link(context.Context, uint64, uint64, string) (Attr, error) {
	return Attr{}, errReadOnly
}

func (readOnlyFS) Unlink(context.Context, uint64, string) error { return errReadOnly }

func (readOnlyFS) Rmdir(context.Context, uint64, string) error { return errReadOnly }

func (readOnlyFS) Rename(context.Context, RenameArgs) error { return errReadOnly }

func (readOnlyFS) Setattr(context.Context, SetattrArgs) (Attr, error) { return Attr{}, errReadOnly }

func (readOnlyFS) Setxattr(context.Context, uint64, string, []byte, uint32) error {
	return errReadOnly
}

func (readOnlyFS) Removexattr(context.Context, uint64, string) error { return errReadOnly }

func (readOnlyFS) Access(context.Context, uint64, bool) (Attr, error) { return Attr{}, errReadOnly }
