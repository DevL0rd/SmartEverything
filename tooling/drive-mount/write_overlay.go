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
	if !s.busyLocked() {
		return
	}
	s.overlayLocked(attr)
}

type writeOverlay struct {
	InodeSource
	w *writeBack
}

func newWriteOverlay(source InodeSource, w *writeBack) *writeOverlay {
	return &writeOverlay{InodeSource: source, w: w}
}

func (o *writeOverlay) pendingAttr(p *pendingName) Attr {
	attr := o.w.ns.attrOf(p)
	o.w.overlayAttr(&attr)
	return attr
}

func (o *writeOverlay) Getattr(ctx context.Context, ino uint64) (Attr, error) {
	if p := o.w.ns.made(ino); p != nil {
		return o.pendingAttr(p), nil
	}
	attr, err := o.InodeSource.Getattr(ctx, ino)
	if err == nil {
		o.w.overlayAttr(&attr)
	}
	return attr, err
}

func (o *writeOverlay) Lookup(ctx context.Context, parent uint64, name string) (Entry, error) {
	if p := o.w.ns.madeAt(parent, name); p != nil {
		return Entry{Ino: p.Ino, Attr: o.pendingAttr(p)}, nil
	}
	if o.w.ns.goneAt(parent, name) || o.w.ns.made(parent) != nil {
		return Entry{}, notFound()
	}
	entry, err := o.InodeSource.Lookup(ctx, parent, name)
	if err == nil {
		o.w.overlayAttr(&entry.Attr)
		entry.Ino = entry.Attr.Ino
	}
	return entry, err
}

func (o *writeOverlay) Readdir(ctx context.Context, ino, cursor uint64) (DirPage, error) {
	pending := o.w.ns.children(ino)
	local := make([]wire.DirEntry, 0, len(pending))
	names := make(map[string]bool, len(pending))
	for _, p := range pending {
		name := p.at().name
		local = append(local, wire.DirEntry{Name: name, Entry: Entry{Ino: p.Ino, Attr: o.w.ns.attrOf(p)}})
		names[name] = true
	}
	var entries []wire.DirEntry
	if o.w.ns.made(ino) == nil {
		page, err := o.InodeSource.Readdir(ctx, ino, 0)
		if err != nil {
			return page, err
		}
		for _, e := range page.Entries {
			if !names[e.Name] && !o.w.ns.goneAt(ino, e.Name) && o.w.ns.madeAt(ino, e.Name) == nil {
				entries = append(entries, e)
			}
		}
	}
	entries = append(entries, local...)
	if cursor >= uint64(len(entries)) {
		return DirPage{}, nil
	}
	entries = entries[cursor:]
	for i := range entries {
		o.w.overlayAttr(&entries[i].Attr)
	}
	return DirPage{Entries: entries}, nil
}

func (o *writeOverlay) Readlink(ctx context.Context, ino uint64) (string, error) {
	if target, ok := o.w.ns.linkTarget(ino); ok {
		return target, nil
	}
	return o.InodeSource.Readlink(ctx, ino)
}

func (o *writeOverlay) Getxattr(ctx context.Context, ino uint64, name string) ([]byte, error) {
	if o.w.ns.made(ino) != nil {
		return nil, &wire.RemoteError{Code: wire.ErrENODATA}
	}
	return o.InodeSource.Getxattr(ctx, ino, name)
}

func (o *writeOverlay) Listxattr(ctx context.Context, ino uint64) ([]string, error) {
	if o.w.ns.made(ino) != nil {
		return nil, nil
	}
	return o.InodeSource.Listxattr(ctx, ino)
}

func (o *writeOverlay) Open(ctx context.Context, ino uint64) (ReadHandle, error) {
	pending := o.w.ns.made(ino) != nil
	if s := o.w.sessionOf(ino); s != nil && (pending || s.busy()) {
		if h, ok := s.attachHandle(false); ok {
			return &overlayRead{h: h.(*sessionHandle)}, nil
		}
	}
	if pending {
		return emptyRead{}, nil
	}
	return o.InodeSource.Open(ctx, ino)
}

type emptyRead struct{}

func (emptyRead) ReadAt(context.Context, []byte, int64) (int, error) { return 0, nil }

func (emptyRead) Seek(_ context.Context, off int64, whence uint32) (int64, error) {
	if off != 0 {
		return 0, syscall.ENXIO
	}
	if whence == wire.WhenceData {
		return 0, syscall.ENXIO
	}
	return 0, nil
}

func (emptyRead) Release(context.Context) error { return nil }

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
