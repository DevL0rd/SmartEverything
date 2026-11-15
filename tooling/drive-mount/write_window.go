package main

import (
	"context"
	"sync"
)

type frameWindow struct {
	mu      sync.Mutex
	limit   int64
	used    int64
	waiters []chan struct{}
}

func newFrameWindow(limit int64) *frameWindow {
	return &frameWindow{limit: limit}
}

func (f *frameWindow) acquire(ctx context.Context) error {
	for {
		f.mu.Lock()
		if f.used < f.limit {
			f.used++
			f.mu.Unlock()
			return nil
		}
		ch := make(chan struct{})
		f.waiters = append(f.waiters, ch)
		f.mu.Unlock()
		select {
		case <-ch:
		case <-ctx.Done():
			f.mu.Lock()
			removed := false
			for i, w := range f.waiters {
				if w == ch {
					f.waiters = append(f.waiters[:i], f.waiters[i+1:]...)
					removed = true
					break
				}
			}
			if !removed {
				f.wakeLocked()
			}
			f.mu.Unlock()
			return ctx.Err()
		}
	}
}

func (f *frameWindow) release() {
	f.mu.Lock()
	f.used--
	f.wakeLocked()
	f.mu.Unlock()
}

func (f *frameWindow) resize(limit int64) {
	f.mu.Lock()
	f.limit = limit
	for room := limit - f.used; room > 0 && len(f.waiters) > 0; room-- {
		f.wakeLocked()
	}
	f.mu.Unlock()
}

func (f *frameWindow) wakeLocked() {
	if len(f.waiters) == 0 {
		return
	}
	close(f.waiters[0])
	f.waiters = f.waiters[1:]
}
