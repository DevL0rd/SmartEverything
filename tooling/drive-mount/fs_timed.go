//go:build linux

package main

import (
	"time"

	"github.com/hanwen/go-fuse/v2/fuse"
	"github.com/smarteverything/drive-mount/wire"
)

type timedFS struct {
	fuse.RawFileSystem
}

func (t timedFS) Lookup(cancel <-chan struct{}, header *fuse.InHeader, name string, out *fuse.EntryOut) fuse.Status {
	defer wire.RecordOperation("fs Lookup", time.Now())
	return t.RawFileSystem.Lookup(cancel, header, name, out)
}

func (t timedFS) GetAttr(cancel <-chan struct{}, input *fuse.GetAttrIn, out *fuse.AttrOut) fuse.Status {
	defer wire.RecordOperation("fs GetAttr", time.Now())
	return t.RawFileSystem.GetAttr(cancel, input, out)
}

func (t timedFS) SetAttr(cancel <-chan struct{}, input *fuse.SetAttrIn, out *fuse.AttrOut) fuse.Status {
	defer wire.RecordOperation("fs SetAttr", time.Now())
	return t.RawFileSystem.SetAttr(cancel, input, out)
}

func (t timedFS) Mkdir(cancel <-chan struct{}, input *fuse.MkdirIn, name string, out *fuse.EntryOut) fuse.Status {
	defer wire.RecordOperation("fs Mkdir", time.Now())
	return t.RawFileSystem.Mkdir(cancel, input, name, out)
}

func (t timedFS) Unlink(cancel <-chan struct{}, header *fuse.InHeader, name string) fuse.Status {
	defer wire.RecordOperation("fs Unlink", time.Now())
	return t.RawFileSystem.Unlink(cancel, header, name)
}

func (t timedFS) Rmdir(cancel <-chan struct{}, header *fuse.InHeader, name string) fuse.Status {
	defer wire.RecordOperation("fs Rmdir", time.Now())
	return t.RawFileSystem.Rmdir(cancel, header, name)
}

func (t timedFS) Rename(cancel <-chan struct{}, input *fuse.RenameIn, oldName string, newName string) fuse.Status {
	defer wire.RecordOperation("fs Rename", time.Now())
	return t.RawFileSystem.Rename(cancel, input, oldName, newName)
}

func (t timedFS) Link(cancel <-chan struct{}, input *fuse.LinkIn, filename string, out *fuse.EntryOut) fuse.Status {
	defer wire.RecordOperation("fs Link", time.Now())
	return t.RawFileSystem.Link(cancel, input, filename, out)
}

func (t timedFS) Symlink(cancel <-chan struct{}, header *fuse.InHeader, pointedTo string, linkName string, out *fuse.EntryOut) fuse.Status {
	defer wire.RecordOperation("fs Symlink", time.Now())
	return t.RawFileSystem.Symlink(cancel, header, pointedTo, linkName, out)
}

func (t timedFS) Access(cancel <-chan struct{}, input *fuse.AccessIn) fuse.Status {
	defer wire.RecordOperation("fs Access", time.Now())
	return t.RawFileSystem.Access(cancel, input)
}

func (t timedFS) SetXAttr(cancel <-chan struct{}, input *fuse.SetXAttrIn, attr string, data []byte) fuse.Status {
	defer wire.RecordOperation("fs SetXAttr", time.Now())
	return t.RawFileSystem.SetXAttr(cancel, input, attr, data)
}

func (t timedFS) Create(cancel <-chan struct{}, input *fuse.CreateIn, name string, out *fuse.CreateOut) fuse.Status {
	defer wire.RecordOperation("fs Create", time.Now())
	return t.RawFileSystem.Create(cancel, input, name, out)
}

func (t timedFS) Open(cancel <-chan struct{}, input *fuse.OpenIn, out *fuse.OpenOut) fuse.Status {
	defer wire.RecordOperation("fs Open", time.Now())
	return t.RawFileSystem.Open(cancel, input, out)
}

func (t timedFS) Flush(cancel <-chan struct{}, input *fuse.FlushIn) fuse.Status {
	defer wire.RecordOperation("fs Flush", time.Now())
	return t.RawFileSystem.Flush(cancel, input)
}

func (t timedFS) Fsync(cancel <-chan struct{}, input *fuse.FsyncIn) fuse.Status {
	defer wire.RecordOperation("fs Fsync", time.Now())
	return t.RawFileSystem.Fsync(cancel, input)
}

func (t timedFS) Fallocate(cancel <-chan struct{}, input *fuse.FallocateIn) fuse.Status {
	defer wire.RecordOperation("fs Fallocate", time.Now())
	return t.RawFileSystem.Fallocate(cancel, input)
}

func (t timedFS) OpenDir(cancel <-chan struct{}, input *fuse.OpenIn, out *fuse.OpenOut) fuse.Status {
	defer wire.RecordOperation("fs OpenDir", time.Now())
	return t.RawFileSystem.OpenDir(cancel, input, out)
}

func (t timedFS) ReadDir(cancel <-chan struct{}, input *fuse.ReadIn, out *fuse.DirEntryList) fuse.Status {
	defer wire.RecordOperation("fs ReadDir", time.Now())
	return t.RawFileSystem.ReadDir(cancel, input, out)
}

func (t timedFS) ReadDirPlus(cancel <-chan struct{}, input *fuse.ReadIn, out *fuse.DirEntryList) fuse.Status {
	defer wire.RecordOperation("fs ReadDirPlus", time.Now())
	return t.RawFileSystem.ReadDirPlus(cancel, input, out)
}

func (t timedFS) FsyncDir(cancel <-chan struct{}, input *fuse.FsyncIn) fuse.Status {
	defer wire.RecordOperation("fs FsyncDir", time.Now())
	return t.RawFileSystem.FsyncDir(cancel, input)
}

func (t timedFS) SetLk(cancel <-chan struct{}, input *fuse.LkIn) fuse.Status {
	defer wire.RecordOperation("fs SetLk", time.Now())
	return t.RawFileSystem.SetLk(cancel, input)
}

func (t timedFS) SetLkw(cancel <-chan struct{}, input *fuse.LkIn) fuse.Status {
	defer wire.RecordOperation("fs SetLkw", time.Now())
	return t.RawFileSystem.SetLkw(cancel, input)
}

func (t timedFS) Write(cancel <-chan struct{}, input *fuse.WriteIn, data []byte) (uint32, fuse.Status) {
	defer wire.RecordOperation("fs Write", time.Now())
	return t.RawFileSystem.Write(cancel, input, data)
}

func (t timedFS) Read(cancel <-chan struct{}, input *fuse.ReadIn, buf []byte) (fuse.ReadResult, fuse.Status) {
	defer wire.RecordOperation("fs Read", time.Now())
	return t.RawFileSystem.Read(cancel, input, buf)
}

func (t timedFS) Release(cancel <-chan struct{}, input *fuse.ReleaseIn) {
	defer wire.RecordOperation("fs Release", time.Now())
	t.RawFileSystem.Release(cancel, input)
}

func timed(raw fuse.RawFileSystem) fuse.RawFileSystem {
	if !wire.Probing() {
		return raw
	}
	return timedFS{raw}
}
