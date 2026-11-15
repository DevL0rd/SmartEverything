package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync/atomic"

	"github.com/smarteverything/drive-mount/wire"
)

const wireLostEvent = "drive_mount.wire_lost"

var errNoWire = fmt.Errorf("%w: the wire client is not started", wire.ErrNoRoute)

type lateCaller struct {
	client atomic.Pointer[wire.Client]
}

func (l *lateCaller) Call(ctx context.Context, op wire.Op, meta wire.Meta, payload []byte) (wire.Reply, error) {
	client := l.client.Load()
	if client == nil {
		return wire.Reply{}, errNoWire
	}
	return client.Call(ctx, op, meta, payload)
}

func (l *lateCaller) Do(ctx context.Context, op wire.Op, meta wire.Meta, payload []byte) ([]wire.Reply, error) {
	client := l.client.Load()
	if client == nil {
		return nil, errNoWire
	}
	return client.Do(ctx, op, meta, payload)
}

type helperFS struct {
	InodeSource
	InodeWriter
	cache  *blockCache
	writes *writeBack
	client *wire.Client
}

func newFilesystem(spec routeSpec, token, cacheDir, journalDir string) (*helperFS, error) {
	late := &lateCaller{}
	cache := newBlockCache(late, cacheDir)
	if err := cache.Ready(); err != nil {
		cache.Close()
		return nil, err
	}
	writes, err := newWriteBack(writeConfig{
		Caller: late,
		Base:   cache,
		Dir:    journalDir,
		NameOf: cache.NameOf,
		RootOf: cache.RootOf,
	})
	if err != nil {
		cache.Close()
		return nil, err
	}
	fs := &helperFS{
		InodeSource: newWriteOverlay(cache, writes),
		InodeWriter: noteWrites{InodeWriter: writes, cache: cache},
		cache:       cache,
		writes:      writes,
	}
	writes.SetCommitted(func(ino uint64, attr wire.Attr) { cache.NoteAttr(attr) })
	writes.SetCreated(cache.NoteName)
	fs.SetReachable(spec.URL != "")
	initial := live.load()
	client, err := wire.NewClient(wire.Config{
		Token:        token,
		Route:        wire.Route{URL: spec.URL, Server: spec.Server, Pin: spec.Pin},
		Handler:      helperHandler{fs: fs},
		Log:          fs.wireEvent,
		PingInterval: initial.ping,
		PongTimeout:  initial.deadAfter,
	})
	if err != nil {
		writes.Close()
		cache.Close()
		return nil, err
	}
	fs.client = client
	late.client.Store(client)
	live.subscribe(func(f liveFields) {
		if err := client.SetLiveness(f.ping, f.deadAfter); err != nil {
			fmt.Fprintln(os.Stderr, "tuning:", err)
		}
	})
	if current := live.load(); current.ping != initial.ping || current.deadAfter != initial.deadAfter {
		if err := client.SetLiveness(current.ping, current.deadAfter); err != nil {
			fmt.Fprintln(os.Stderr, "tuning:", err)
		}
	}
	return fs, nil
}

func (f *helperFS) wireEvent(event string, err error) {
	if event != wireLostEvent {
		return
	}
	f.SetReachable(false)
	if err != nil && !errors.Is(err, context.Canceled) {
		fmt.Fprintln(os.Stderr, "wire:", err)
	}
}

func (f *helperFS) SetReachable(reachable bool) {
	f.cache.SetReachable(reachable)
	f.writes.SetReachable(reachable)
}

func (f *helperFS) SwitchRoute(route wire.Route) error {
	f.SetReachable(!route.Empty())
	if err := f.client.SwitchRoute(route); err != nil {
		f.SetReachable(false)
		return err
	}
	return nil
}

func (f *helperFS) Close() {
	f.writes.Close()
	_ = f.client.Close()
	f.cache.Close()
}

type helperHandler struct {
	fs *helperFS
}

func (h helperHandler) Resume() wire.Resume {
	return wire.Resume{
		Seqs:    h.fs.cache.Seqs(),
		Handles: h.fs.cache.Handles(),
		Locks:   h.fs.writes.HeldLocks(),
		Commits: h.fs.writes.CommitIDs(),
	}
}

func (h helperHandler) Established(ctx context.Context, call wire.Caller, resumed bool) error {
	if err := h.fs.cache.Reestablish(ctx, call, resumed); err != nil {
		return err
	}
	h.fs.SetReachable(true)
	return nil
}

func (h helperHandler) Changed(change wire.Changed) { h.fs.cache.Changed(change) }

func (h helperHandler) Reset(reset wire.Reset) { h.fs.cache.Reset(reset) }

func (h helperHandler) LockLost(lost wire.LockLost) {
	h.fs.writes.LockLost(lost.Ino, lost.Owner)
	fmt.Fprintln(os.Stderr, "lock lost:", lost.Ino, lost.Owner)
}
