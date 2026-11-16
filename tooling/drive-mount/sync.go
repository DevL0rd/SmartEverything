package main

import (
	"context"

	"github.com/smarteverything/drive-mount/wire"
)

func (s *session) syncSession() error {
	w := s.w
	for {
		if !w.online.Load() || !live.load().fsyncWaitsForHub {
			return s.syncLocal()
		}
		s.mu.Lock()
		if s.failure != nil {
			err := s.failure
			s.mu.Unlock()
			return err
		}
		if !s.needsCommit() && !s.hasTimes() && !s.sending && s.resume == nil && s.wanted == s.served {
			ino := s.rec.Ino
			s.mu.Unlock()
			return w.fsyncRemote(w.ctx, ino, false)
		}
		s.wanted++
		ticket := s.wanted
		s.sealed = true
		if err := s.saveLocked(false); err != nil {
			logJournal(s.rec.Ino, err)
		}
		queue := !s.sending
		s.mu.Unlock()
		if queue {
			w.enqueue(s)
		}
		err := w.waitUntil(w.ctx, func() error {
			s.mu.Lock()
			defer s.mu.Unlock()
			switch {
			case s.served >= ticket:
				return nil
			case s.failure != nil:
				return s.failure
			case !w.online.Load():
				return wire.ErrNoRoute
			}
			return errPending
		})
		if err == wire.ErrNoRoute {
			continue
		}
		return err
	}
}

func (s *session) syncLocal() error {
	if err := s.data.Sync(); err != nil {
		return err
	}
	if err := s.w.ns.sync(); err != nil {
		return err
	}
	s.mu.Lock()
	if !s.needsCommit() && s.resume == nil && !s.hasTimes() {
		s.mu.Unlock()
		return nil
	}
	s.sealed = true
	err := s.saveLocked(true)
	queue := !s.sending
	s.mu.Unlock()
	if queue {
		s.w.enqueue(s)
	}
	return err
}

func (w *writeBack) fsyncRemote(ctx context.Context, ino uint64, directory bool) (err error) {
	if !w.online.Load() {
		return wire.ErrNoRoute
	}
	_, err = w.caller.Call(ctx, wire.OpFsync, wire.Meta{wire.KeyIno: ino, wire.KeyDirectory: directory}, nil)
	return err
}

func (w *writeBack) Fsync(ctx context.Context, ino uint64, directory bool) error {
	if !directory {
		if s := w.sessionOf(ino); s != nil {
			return s.syncSession()
		}
		if !live.load().fsyncWaitsForHub {
			return w.ns.sync()
		}
	}
	if !w.online.Load() {
		return w.ns.sync()
	}
	if directory {
		if err := w.ns.drain(ctx); err != nil {
			return err
		}
	} else if err := w.ns.settle(ctx, ino); err != nil {
		return err
	}
	return w.fsyncRemote(ctx, ino, directory)
}

func (w *writeBack) awaitCommits(ctx context.Context, ino uint64) error {
	if s := w.sessionOf(ino); s != nil {
		s.mu.Lock()
		ready := !s.sending && ((s.sealed && s.needsCommit()) || s.resume != nil || s.hasTimes())
		s.mu.Unlock()
		if ready {
			w.enqueue(s)
		}
	}
	return w.waitUntil(ctx, func() error {
		s := w.sessionOf(ino)
		if s == nil {
			return nil
		}
		flying, err := s.inFlight()
		if err != nil {
			return err
		}
		if !flying {
			return nil
		}
		if !w.online.Load() {
			return wire.ErrNoRoute
		}
		return errPending
	})
}

func (w *writeBack) flushWait(ctx context.Context, ino uint64) error {
	s := w.sessionOf(ino)
	if s == nil {
		return nil
	}
	if err := s.seal(); err != nil {
		return err
	}
	return w.awaitCommits(ctx, ino)
}
