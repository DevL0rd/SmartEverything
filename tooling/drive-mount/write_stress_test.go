package main

import (
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

func TestCreateStormLeavesNothingPending(t *testing.T) {
	r := newWbRig(t)
	r.online()
	var calls atomic.Int64
	r.hub.before = func(op wire.Op, meta wire.Meta) error {
		n := calls.Add(1)
		time.Sleep(time.Duration(n%7) * 300 * time.Microsecond)
		if n%53 == 0 && op == wire.OpPut {
			return wire.ErrConnLost
		}
		return nil
	}
	const threads, perThread = 16, 40
	var wg sync.WaitGroup
	for th := 0; th < threads; th++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < perThread; i++ {
				_, h := r.create(fmt.Sprintf("f-%d-%d", th, i))
				wbPut(t, h, 0, "payload")
				if i%3 == 0 {
					_ = h.Sync()
				}
				_ = h.Flush()
				if err := h.Close(); err != nil {
					t.Error(err)
				}
			}
		}()
	}
	wg.Wait()
	r.drain()
	if held := r.w.Pending(""); held != 0 {
		t.Fatalf("pending %d", held)
	}
}

func TestRandomHandleChurnLeavesNothingPending(t *testing.T) {
	r := newWbRig(t)
	r.online()
	var calls atomic.Int64
	r.hub.before = func(op wire.Op, meta wire.Meta) error {
		n := calls.Add(1)
		if n%3 == 0 {
			time.Sleep(time.Duration(n%5) * 200 * time.Microsecond)
		}
		return nil
	}
	const threads = 6
	var wg sync.WaitGroup
	stop := make(chan struct{})
	flapped := make(chan struct{})
	go func() {
		defer close(flapped)
		for up := false; ; up = !up {
			select {
			case <-stop:
				r.w.SetReachable(true)
				return
			case <-time.After(3 * time.Millisecond):
				r.w.SetReachable(up)
			}
		}
	}()
	for th := 0; th < threads; th++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rng := rand.New(rand.NewSource(int64(th) + 1))
			for i := 0; i < 15; i++ {
				var entry Entry
				var h InodeWriteHandle
				for {
					var err error
					entry, h, err = r.w.Create(wbCtx, CreateArgs{Parent: 1, Name: fmt.Sprintf("g-%d-%d", th, i), Mode: 0o644})
					if err == nil {
						break
					}
					time.Sleep(time.Millisecond)
				}
				handles := []InodeWriteHandle{h}
				for step := 0; step < 8; step++ {
					cur := handles[rng.Intn(len(handles))]
					switch rng.Intn(7) {
					case 0, 1:
						_, _ = cur.WriteAt([]byte("abcdefgh"), int64(rng.Intn(4096)))
					case 2:
						_ = cur.Flush()
					case 3:
						_ = cur.Sync()
					case 4:
						_ = cur.Truncate(uint64(rng.Intn(5000)))
					case 5:
						if nh, err := r.w.OpenWrite(wbCtx, entry.Ino, false); err == nil {
							handles = append(handles, nh)
						}
					case 6:
						_ = cur.Allocate(wire.AllocatePunchHole, 10, 100)
					}
				}
				for _, hh := range handles {
					_ = hh.Flush()
					_ = hh.Close()
				}
			}
		}()
	}
	wg.Wait()
	close(stop)
	<-flapped
	r.drain()
	if held := r.w.Pending(""); held != 0 {
		r.w.mu.Lock()
		for ino, s := range r.w.sessions {
			s.mu.Lock()
			t.Logf("ino %d sealed %v sending %v queued %v handles %d needs %v resume %v failure %v", ino, s.sealed, s.sending, s.queued, s.handles, s.needsCommit(), s.resume != nil, s.failure)
			s.mu.Unlock()
		}
		r.w.mu.Unlock()
		t.Fatalf("pending %d", held)
	}
}

func TestCommitRetriesAfterTheHubFailsInternally(t *testing.T) {
	r := newWbRig(t)
	r.online()
	var failures atomic.Int64
	r.hub.before = func(op wire.Op, meta wire.Meta) error {
		if op == wire.OpPut && failures.Add(1) <= 2 {
			return wbRemote(wire.ErrEIO)
		}
		return nil
	}
	entry, h := r.create("retry.txt")
	wbPut(t, h, 0, "payload")
	if err := h.Close(); err != nil {
		t.Fatal(err)
	}
	wbEventually(t, "the commit lands", func() bool { return r.hub.content(entry.Ino) == "payload" })
	r.drain()
	wbEventually(t, "nothing pending", func() bool { return r.w.Pending("") == 0 })
}

func TestFsyncRetriesWhenTheConnectionDropsDuringIt(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entered := make(chan struct{})
	release := make(chan struct{})
	var once sync.Once
	var failures atomic.Int64
	r.hub.before = func(op wire.Op, meta wire.Meta) error {
		switch op {
		case wire.OpPut:
			once.Do(func() {
				close(entered)
				<-release
			})
		case wire.OpFsync:
			if failures.Add(1) <= 2 {
				return wire.ErrConnLost
			}
		}
		return nil
	}
	entry, h := r.create("fsync.txt")
	wbPut(t, h, 0, "payload")
	if err := h.Flush(); err != nil {
		t.Fatal(err)
	}
	<-entered
	synced := make(chan error, 1)
	go func() { synced <- h.Sync() }()
	wbEventually(t, "the fsync is queued behind the commit", func() bool {
		s := r.w.sessionOf(entry.Ino)
		s.mu.Lock()
		defer s.mu.Unlock()
		return s.wanted > s.served
	})
	close(release)
	if err := <-synced; err != nil {
		t.Fatal(err)
	}
	if err := h.Close(); err != nil {
		t.Fatal(err)
	}
	wbEventually(t, "nothing pending", func() bool { return r.w.Pending("") == 0 })
	if failures.Load() < 3 {
		t.Fatalf("fsync attempts %d", failures.Load())
	}
}
