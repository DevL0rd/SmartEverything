package main

import (
	"context"
	"errors"
	"math"
	"syscall"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

var errCopyDeclined error = syscall.EOPNOTSUPP

type serverCopier interface {
	ServerCopy(ctx context.Context, src ReadHandle, srcOff uint64, dst InodeWriteHandle, dstOff, length uint64) (uint64, error)
}

type copySource interface {
	ino() uint64
	copyInto(ctx context.Context, meta func(handle uint64) wire.Meta) (wire.Reply, error)
}

func (h *readHandle) copyInto(ctx context.Context, meta func(handle uint64) wire.Meta) (wire.Reply, error) {
	return h.wh.do(ctx, wire.OpCopy, meta)
}

type hubCopySource struct{ *readHandle }

func (s hubCopySource) ino() uint64 { return s.readHandle.ino }

func (f *helperFS) ServerCopy(ctx context.Context, src ReadHandle, srcOff uint64, dst InodeWriteHandle, dstOff, length uint64) (uint64, error) {
	from, ok := src.(*readHandle)
	if !ok {
		return 0, errCopyDeclined
	}
	to, ok := dst.(*sessionHandle)
	if !ok {
		return 0, errCopyDeclined
	}
	return to.s.copyFrom(ctx, hubCopySource{from}, srcOff, dstOff, length)
}

func (s *session) copyFrom(ctx context.Context, from copySource, srcOff, dstOff, length uint64) (uint64, error) {
	length = min(length, math.MaxUint32)
	w := s.w
	s.mu.Lock()
	if s.gone || s.sending || s.resume != nil || s.needsCommit() || s.rec.Ino == from.ino() || !w.online.Load() || length == 0 {
		s.mu.Unlock()
		return 0, errCopyDeclined
	}
	copied, attr, commit, err := s.copyLocked(ctx, from, srcOff, dstOff, length)
	if err == nil && copied > 0 {
		s.attr = attr
		s.rec.BaseRev = attr.Rev
		s.baseSize, s.size, s.cleanLimit = attr.Size, attr.Size, attr.Size
		s.retireBaseLocked()
		s.touchLocked()
		if serr := s.saveLocked(false); serr != nil {
			logJournal(s.rec.Ino, serr)
		}
	}
	s.mu.Unlock()
	if commit != 0 {
		w.mu.Lock()
		w.forgets = append(w.forgets, commit)
		w.mu.Unlock()
		w.flushForgets()
	}
	if err != nil {
		if unreachable(err) {
			return 0, errCopyDeclined
		}
		return 0, err
	}
	if copied > 0 {
		w.noteHubAttr(attr)
	}
	return copied, nil
}

func (s *session) copyLocked(ctx context.Context, from copySource, srcOff, dstOff, length uint64) (uint64, wire.Attr, uint64, error) {
	w := s.w
	begin, err := w.caller.Call(ctx, wire.OpBegin, wire.Meta{
		wire.KeyIno: s.rec.Ino, wire.KeyBaseRev: s.rec.BaseRev, wire.KeyOpKey: wire.NewOpKey(),
	}, nil)
	if err != nil {
		return 0, wire.Attr{}, 0, err
	}
	commit, err := begin.Meta.Uint(wire.KeyCommit)
	if err != nil {
		return 0, wire.Attr{}, 0, err
	}
	copied, err := s.copyRange(ctx, from, commit, srcOff, dstOff, length)
	if err == nil && copied == 0 {
		err = w.abortCommit(ctx, commit)
		return 0, wire.Attr{}, 0, err
	}
	if err != nil {
		return 0, wire.Attr{}, commit, errors.Join(err, w.abortCommit(ctx, commit))
	}
	end, err := w.caller.Call(ctx, wire.OpEnd, wire.Meta{
		wire.KeyCommit: commit, wire.KeySize: max(s.size, dstOff+copied), wire.KeyMtimeNs: time.Now().UnixNano(),
		wire.KeyFsync: false, wire.KeyOpKey: wire.NewOpKey(),
	}, nil)
	if err != nil {
		return 0, wire.Attr{}, commit, errors.Join(err, w.abortCommit(ctx, commit))
	}
	attr, err := committedAttr(end)
	return copied, attr, commit, err
}

func (s *session) copyRange(ctx context.Context, from copySource, commit, srcOff, dstOff, length uint64) (uint64, error) {
	reply, err := from.copyInto(ctx, func(handle uint64) wire.Meta {
		return wire.Meta{
			wire.KeySrcHandle: handle, wire.KeyOffset: srcOff, wire.KeyCommit: commit,
			wire.KeyDstOffset: dstOff, wire.KeyLength: length,
		}
	})
	if err != nil {
		return 0, err
	}
	return reply.Meta.Uint(wire.KeyCopied)
}

func (w *writeBack) abortCommit(ctx context.Context, commit uint64) error {
	_, err := w.caller.Call(ctx, wire.OpAbort, wire.Meta{wire.KeyCommit: commit}, nil)
	return err
}
