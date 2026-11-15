package main

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"

	"github.com/smarteverything/drive-mount/wire"
)

type wireHandle struct {
	c       *blockCache
	ino     uint64
	id      atomic.Uint64
	refs    atomic.Int32
	dead    atomic.Bool
	opening sync.Mutex
	failed  error
}

func staleHandle() error { return &wire.RemoteError{Code: wire.ErrESTALE} }

func (c *blockCache) openWire(ctx context.Context, ino uint64) (*wireHandle, error) {
	h := &wireHandle{c: c, ino: ino}
	h.refs.Store(1)
	h.opening.Lock()
	defer h.opening.Unlock()
	if err := h.openWith(ctx, c.call); err != nil {
		return nil, err
	}
	return h, nil
}

func (h *wireHandle) openWith(ctx context.Context, call wire.Caller) error {
	reply, err := call.Call(ctx, wire.OpOpen, wire.Meta{wire.KeyIno: h.ino}, nil)
	if err != nil {
		return err
	}
	id, err := reply.Meta.Uint(wire.KeyHandle)
	if err != nil {
		return err
	}
	h.id.Store(id)
	h.c.mu.Lock()
	h.c.wires[h] = struct{}{}
	h.c.mu.Unlock()
	return nil
}

func (h *wireHandle) markDead(err error) {
	h.failed = err
	h.dead.Store(true)
}

func (h *wireHandle) ensure(ctx context.Context) (uint64, error) {
	if id := h.id.Load(); id != 0 {
		return id, nil
	}
	h.opening.Lock()
	defer h.opening.Unlock()
	if h.dead.Load() {
		return 0, h.failed
	}
	if id := h.id.Load(); id != 0 {
		return id, nil
	}
	if h.c.offline.Load() {
		return 0, errOffline
	}
	if err := h.openWith(ctx, h.c.call); err != nil {
		return 0, err
	}
	return h.id.Load(), nil
}

func (h *wireHandle) reopen(ctx context.Context, failed uint64) error {
	h.opening.Lock()
	defer h.opening.Unlock()
	if h.dead.Load() {
		return h.failed
	}
	if h.id.Load() != failed {
		return nil
	}
	err := h.openWith(ctx, h.c.call)
	if remoteCode(err, wire.ErrESTALE) || remoteCode(err, wire.ErrENOENT) {
		h.markDead(staleHandle())
		return h.failed
	}
	return err
}

func (h *wireHandle) do(ctx context.Context, op wire.Op, build func(id uint64) wire.Meta) (wire.Reply, error) {
	reopened := false
	for {
		id, err := h.ensure(ctx)
		if err != nil {
			return wire.Reply{}, err
		}
		reply, err := h.c.call.Call(ctx, op, build(id), nil)
		if err == nil {
			return reply, nil
		}
		lost := errors.Is(err, wire.ErrSessionLost)
		if !lost && !(remoteCode(err, wire.ErrESTALE) && !reopened) {
			return wire.Reply{}, err
		}
		if !lost {
			reopened = true
		}
		if err := h.reopen(ctx, id); err != nil {
			return wire.Reply{}, err
		}
	}
}

func (h *wireHandle) read(ctx context.Context, off int64, n int) ([]byte, error) {
	reply, err := h.do(ctx, wire.OpRead, func(id uint64) wire.Meta {
		return wire.Meta{wire.KeyHandle: id, wire.KeyOffset: uint64(off), wire.KeyLength: uint64(n)}
	})
	return reply.Payload, err
}

func (h *wireHandle) acquire() { h.refs.Add(1) }

func (h *wireHandle) drop() {
	if h.refs.Add(-1) > 0 {
		return
	}
	c := h.c
	c.mu.Lock()
	delete(c.wires, h)
	c.mu.Unlock()
	id := h.id.Load()
	if id == 0 || h.dead.Load() {
		return
	}
	c.spawn(func() {
		c.call.Call(c.ctx, wire.OpRelease, wire.Meta{wire.KeyHandle: id}, nil)
	})
}

type readHandle struct {
	c    *blockCache
	wh   *wireHandle
	ino  uint64
	hold func()
	once sync.Once
}

func (c *blockCache) Open(ctx context.Context, ino uint64) (ReadHandle, error) {
	if c.startErr != nil {
		return nil, c.startErr
	}
	wh := &wireHandle{c: c, ino: ino}
	wh.refs.Store(1)
	if c.offline.Load() {
		if _, err := c.Getattr(ctx, ino); err != nil {
			return nil, err
		}
	} else {
		opened, err := c.openWire(ctx, ino)
		switch {
		case err == nil:
			wh = opened
		case unreachable(err):
			if _, attrErr := c.Getattr(ctx, ino); attrErr != nil {
				return nil, err
			}
		default:
			return nil, err
		}
	}
	return &readHandle{c: c, wh: wh, ino: ino, hold: c.Hold(ino)}, nil
}

func (h *readHandle) ReadAt(ctx context.Context, dst []byte, off int64) (int, error) {
	return h.c.readInode(ctx, h.wh, h.ino, off, dst)
}

func (h *readHandle) Seek(ctx context.Context, off int64, whence uint32) (int64, error) {
	reply, err := h.wh.do(ctx, wire.OpSeek, func(id uint64) wire.Meta {
		return wire.Meta{wire.KeyHandle: id, wire.KeyOffset: uint64(off), wire.KeyWhence: uint64(whence)}
	})
	if err != nil {
		return 0, err
	}
	pos, err := reply.Meta.Uint(wire.KeyOffset)
	return int64(pos), err
}

func (h *readHandle) Release(context.Context) error {
	h.once.Do(func() {
		h.hold()
		h.wh.drop()
	})
	return nil
}

func (c *blockCache) spawn(fn func()) bool {
	c.spawning.Lock()
	if c.closing {
		c.spawning.Unlock()
		return false
	}
	c.tasks.Add(1)
	c.spawning.Unlock()
	go func() {
		defer c.tasks.Done()
		fn()
	}()
	return true
}
