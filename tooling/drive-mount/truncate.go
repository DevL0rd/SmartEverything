package main

import (
	"context"

	"github.com/smarteverything/drive-mount/wire"
)

func (s *session) localAttr() wire.Attr {
	s.mu.Lock()
	defer s.mu.Unlock()
	attr := s.attr
	s.overlayLocked(&attr)
	return attr
}

func (w *writeBack) truncateInode(ctx context.Context, ino, size uint64) (wire.Attr, error) {
	h, err := w.OpenWrite(ctx, ino, false)
	if err != nil {
		return wire.Attr{}, err
	}
	handle := h.(*sessionHandle)
	if err := handle.Truncate(size); err != nil {
		handle.Close()
		return wire.Attr{}, err
	}
	attr := handle.s.localAttr()
	return attr, handle.Close()
}

func (w *writeBack) Setattr(ctx context.Context, args SetattrArgs) (Attr, error) {
	var attr Attr
	haveAttr := false
	if args.Valid&wire.SetattrValidSize != 0 {
		local, err := w.truncateInode(ctx, args.Ino, args.Size)
		if err != nil {
			return Attr{}, err
		}
		attr, haveAttr = local, true
	}
	valid := args.Valid & (wire.SetattrValidMode | wire.SetattrValidUid | wire.SetattrValidGid)
	if valid != 0 && w.ns.foldMode(args) {
		valid = 0
	}
	meta := wire.Meta{wire.KeyIno: args.Ino}
	if valid&wire.SetattrValidMode != 0 {
		meta[wire.KeyMode] = uint64(args.Mode)
	}
	if valid&wire.SetattrValidUid != 0 {
		meta[wire.KeyUid] = optID(args.UID)
	}
	if valid&wire.SetattrValidGid != 0 {
		meta[wire.KeyGid] = optID(args.GID)
	}
	folded := false
	if args.Atime.Set || args.Mtime.Set {
		if s := w.sessionOf(args.Ino); s != nil {
			folded = s.foldTimes(args.Atime, args.Mtime)
		}
		if !folded {
			folded = w.ns.foldTimes(args.Ino, args.Mtime)
		}
	}
	if !folded && args.Atime.Set {
		valid |= wire.SetattrValidAtime
		meta[wire.KeyAtime] = timeValue(args.Atime)
	}
	if !folded && args.Mtime.Set {
		valid |= wire.SetattrValidMtime
		meta[wire.KeyMtime] = timeValue(args.Mtime)
		if err := w.awaitCommits(ctx, args.Ino); err != nil {
			return Attr{}, err
		}
	}
	meta[wire.KeyValid] = uint64(valid)
	if valid == 0 {
		if s := w.sessionOf(args.Ino); folded && s != nil {
			return s.localAttr(), nil
		}
		if haveAttr {
			return attr, nil
		}
		return w.localOrHubAttr(ctx, args.Ino)
	}
	if valid == wire.SetattrValidMtime && !args.Mtime.Now {
		if attr, same, err := w.mtimeUnchanged(ctx, args.Ino, args.Mtime.At.UnixNano()); err != nil || same {
			return attr, err
		}
	}
	if err := w.ns.settle(ctx, args.Ino); err != nil {
		return Attr{}, err
	}
	reply, err := w.mutate(ctx, wire.OpSetattr, meta, nil)
	if err != nil {
		return Attr{}, err
	}
	hub, err := reply.Meta.Attr(wire.KeyAttr)
	if err != nil {
		return Attr{}, err
	}
	w.noteHubAttr(hub)
	w.overlayAttr(&hub)
	return hub, nil
}

func (w *writeBack) mtimeUnchanged(ctx context.Context, ino uint64, mtime int64) (Attr, bool, error) {
	if attr, removed := w.ns.removedAttr(ino); removed {
		attr.MtimeNs = mtime
		return attr, true, nil
	}
	if w.ns.made(ino) != nil {
		return Attr{}, false, nil
	}
	attr, err := w.base.Getattr(ctx, ino)
	if err != nil {
		return Attr{}, false, err
	}
	if attr.MtimeNs != mtime {
		return Attr{}, false, nil
	}
	w.overlayAttr(&attr)
	return attr, true, nil
}

func (w *writeBack) Access(ctx context.Context, ino uint64, strict bool) (Attr, error) {
	if p := w.ns.made(ino); p != nil {
		attr := w.ns.attrOf(p)
		w.overlayAttr(&attr)
		return attr, nil
	}
	reply, err := w.ask(ctx, wire.OpAccess, wire.Meta{wire.KeyIno: ino, wire.KeyStrict: strict})
	if err != nil {
		return Attr{}, err
	}
	hub, err := reply.Meta.Attr(wire.KeyAttr)
	if err != nil {
		return Attr{}, err
	}
	w.noteHubAttr(hub)
	w.overlayAttr(&hub)
	return hub, nil
}

func (w *writeBack) noteHubAttr(attr Attr) {
	if s := w.sessionOf(attr.Ino); s != nil {
		s.mu.Lock()
		s.attr = attr
		s.mu.Unlock()
	}
	w.mu.Lock()
	hook := w.committed
	w.mu.Unlock()
	if hook != nil {
		hook(attr.Ino, attr)
	}
}

func (w *writeBack) localOrHubAttr(ctx context.Context, ino uint64) (Attr, error) {
	if p := w.ns.made(ino); p != nil {
		attr := w.ns.attrOf(p)
		w.overlayAttr(&attr)
		return attr, nil
	}
	attr, err := w.fetchAttr(ctx, ino)
	if err != nil {
		return Attr{}, err
	}
	w.overlayAttr(&attr)
	return attr, nil
}

func timeValue(t TimeSpec) any {
	if t.Now {
		return "now"
	}
	return t.At.UnixNano()
}
