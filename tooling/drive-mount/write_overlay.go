package main

import (
	"context"
	"syscall"

	"github.com/smarteverything/drive-mount/wire"
)

func (w *writeBack) overlayAttr(attr *wire.Attr) {
	s := w.sessionOf(attr.Ino)
	if s == nil || attr.Type != wire.InodeTypeFile {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.sending && s.resume == nil && !s.needsCommit() {
		return
	}
	attr.Size = s.size
	if s.touched > attr.MtimeNs {
		attr.MtimeNs = s.touched
		attr.CtimeNs = s.touched
	}
}

type writeOverlay struct {
	InodeSource
	w *writeBack
}

func newWriteOverlay(source InodeSource, w *writeBack) *writeOverlay {
	return &writeOverlay{InodeSource: source, w: w}
}

func (o *writeOverlay) Getattr(ctx context.Context, ino uint64) (Attr, error) {
	attr, err := o.InodeSource.Getattr(ctx, ino)
	if err == nil {
		o.w.overlayAttr(&attr)
	}
	return attr, err
}

func (o *writeOverlay) Lookup(ctx context.Context, parent uint64, name string) (Entry, error) {
	entry, err := o.InodeSource.Lookup(ctx, parent, name)
	if err == nil {
		o.w.overlayAttr(&entry.Attr)
		entry.Ino = entry.Attr.Ino
	}
	return entry, err
}

func (o *writeOverlay) Readdir(ctx context.Context, ino, cursor uint64) (DirPage, error) {
	page, err := o.InodeSource.Readdir(ctx, ino, cursor)
	if err != nil {
		return page, err
	}
	for i := range page.Entries {
		o.w.overlayAttr(&page.Entries[i].Attr)
	}
	return page, nil
}

func (o *writeOverlay) Open(ctx context.Context, ino uint64) (ReadHandle, error) {
	if s := o.w.sessionOf(ino); s != nil && s.busy() {
		if h, ok := s.attachHandle(false); ok {
			return &overlayRead{h: h.(*sessionHandle)}, nil
		}
	}
	return o.InodeSource.Open(ctx, ino)
}

type overlayRead struct {
	h *sessionHandle
}

func (r *overlayRead) ReadAt(_ context.Context, dst []byte, off int64) (int, error) {
	return r.h.ReadAt(dst, off)
}

func (r *overlayRead) Seek(_ context.Context, off int64, whence uint32) (int64, error) {
	size := r.h.Size()
	if off < 0 || off > size {
		return 0, syscall.ENXIO
	}
	switch whence {
	case wire.WhenceData:
		if off == size {
			return 0, syscall.ENXIO
		}
		return off, nil
	case wire.WhenceHole:
		return size, nil
	}
	return 0, syscall.EINVAL
}

func (r *overlayRead) Release(context.Context) error { return r.h.Close() }
