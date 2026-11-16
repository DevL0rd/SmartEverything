package main

import (
	"bytes"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

type wbShapes struct {
	mu   sync.Mutex
	keys map[wire.Op][]uint64
}

func (s *wbShapes) record(op wire.Op, meta wire.Meta) {
	s.mu.Lock()
	defer s.mu.Unlock()
	keys := make([]uint64, 0, len(meta))
	for k := range meta {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	s.keys[op] = keys
}

func sortedKeys(keys ...uint64) []uint64 {
	slices.Sort(keys)
	return keys
}

func TestRequestShapesMatchTheHubSchemas(t *testing.T) {
	r := newWbRig(t)
	r.online()
	shapes := &wbShapes{keys: map[wire.Op][]uint64{}}
	r.hub.before = func(op wire.Op, meta wire.Meta) error {
		shapes.record(op, meta)
		return nil
	}
	_, fresh := r.make("fresh")
	wbPut(t, fresh, 0, "new")
	fresh.Close()
	small := r.openExisting(r.hub.addFile(1, "small", "old"), true)
	wbPut(t, small, 0, "tiny")
	small.Close()
	_, big := r.create("big")
	big.WriteAt(bytes.Repeat([]byte("b"), 2<<20), 0)
	big.Close()
	ino := r.hub.addFile(1, "patched", "0123456789")
	patched := r.openExisting(ino, false)
	if err := patched.Allocate(wire.AllocatePunchHole, 2, 3); err != nil {
		t.Fatal(err)
	}
	patched.Close()
	r.drain()
	wbEventually(t, "forget", func() bool { return r.hub.count("FORGET") > 0 })
	want := map[wire.Op][]uint64{
		wire.OpPut:      sortedKeys(wire.KeyIno, wire.KeyBaseRev, wire.KeySize, wire.KeyMtimeNs, wire.KeyFsync, wire.KeyOpKey),
		wire.OpBegin:    sortedKeys(wire.KeyIno, wire.KeyBaseRev, wire.KeyOpKey),
		wire.OpWrite:    sortedKeys(wire.KeyCommit, wire.KeyOffset),
		wire.OpAllocate: sortedKeys(wire.KeyCommit, wire.KeyMode, wire.KeyOffset, wire.KeyLength),
		wire.OpEnd:      sortedKeys(wire.KeyCommit, wire.KeySize, wire.KeyLength, wire.KeyMtimeNs, wire.KeyFsync, wire.KeyOpKey),
		wire.OpCreate: sortedKeys(wire.KeyParent, wire.KeyName, wire.KeyIno, wire.KeyMode, wire.KeyUid, wire.KeyGid,
			wire.KeyMtimeNs, wire.KeyFsync, wire.KeyOpKey),
		wire.OpLease:  sortedKeys(wire.KeyCount),
		wire.OpForget: sortedKeys(wire.KeyCommits),
	}
	shapes.mu.Lock()
	defer shapes.mu.Unlock()
	for op, keys := range want {
		if !slices.Equal(shapes.keys[op], keys) {
			t.Errorf("%s sent keys %v, the Hub schema takes %v", op.Name(), shapes.keys[op], keys)
		}
	}
}

func TestStateRequestCarriesOnlyTheCommit(t *testing.T) {
	r := newWbRig(t)
	r.online()
	shapes := &wbShapes{keys: map[wire.Op][]uint64{}}
	r.hub.before = func(op wire.Op, meta wire.Meta) error {
		shapes.record(op, meta)
		return nil
	}
	entry, h := r.create("c")
	h.WriteAt(bytes.Repeat([]byte("s"), 2<<20), 0)
	failed := false
	r.hub.before = func(op wire.Op, meta wire.Meta) error {
		shapes.record(op, meta)
		if op == wire.OpEnd && !failed {
			failed = true
			return wire.ErrConnLost
		}
		return nil
	}
	h.Close()
	r.drain()
	if r.hub.content(entry.Ino) != string(bytes.Repeat([]byte("s"), 2<<20)) {
		t.Fatal("content differs")
	}
	shapes.mu.Lock()
	defer shapes.mu.Unlock()
	if !slices.Equal(shapes.keys[wire.OpState], sortedKeys(wire.KeyCommit)) {
		t.Fatalf("STATE sent keys %v", shapes.keys[wire.OpState])
	}
}

func TestBeginReplyRangesAreStartAndLengthPairs(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("c")
	payload := bytes.Repeat([]byte("r"), 2<<20)
	h.WriteAt(payload, 0)
	const first = 1 << 20
	seeded := false
	r.hub.after = func(op wire.Op, meta wire.Meta) error {
		if op != wire.OpBegin || seeded {
			return nil
		}
		seeded = true
		r.hub.mu.Lock()
		id, _ := r.hub.dedupe[wbKeyOf(meta)].Meta.Uint(wire.KeyCommit)
		c := r.hub.commits[id]
		c.chunks[0] = bytes.Clone(payload[:first])
		c.got.add(0, first)
		r.hub.dedupe[wbKeyOf(meta)] = wire.Reply{Meta: wire.Meta{
			wire.KeyCommit: id, wire.KeyRanges: []any{[]any{uint64(0), uint64(first)}},
		}}
		r.hub.mu.Unlock()
		return wire.ErrConnLost
	}
	var offsets []uint64
	var mu sync.Mutex
	r.hub.before = func(op wire.Op, meta wire.Meta) error {
		if op == wire.OpWrite {
			off, _ := meta.Uint(wire.KeyOffset)
			mu.Lock()
			offsets = append(offsets, off)
			mu.Unlock()
		}
		return nil
	}
	h.Close()
	r.drain()
	if r.hub.content(entry.Ino) != string(payload) {
		t.Fatal("content differs")
	}
	mu.Lock()
	defer mu.Unlock()
	if !slices.Equal(offsets, []uint64{first}) {
		t.Fatalf("the helper wrote offsets %v after the Hub reported [0, %d] received", offsets, first)
	}
}

func TestStuckCommitRetriesAfterARouteSwitch(t *testing.T) {
	for name, fault := range map[string]error{"no route": wire.ErrNoRoute, "connection lost": wire.ErrConnLost} {
		t.Run(name, func(t *testing.T) {
			r := newWbRig(t)
			r.online()
			entry, h := r.create("c")
			payload := bytes.Repeat([]byte("p"), 3<<20)
			h.WriteAt(payload, 0)
			var mu sync.Mutex
			blocked := 0
			switching := true
			r.hub.before = func(op wire.Op, _ wire.Meta) error {
				mu.Lock()
				defer mu.Unlock()
				if switching && (op == wire.OpWrite || op == wire.OpEnd) {
					blocked++
					return fault
				}
				return nil
			}
			h.Close()
			wbEventually(t, "commit stuck on the switch", func() bool {
				mu.Lock()
				defer mu.Unlock()
				return blocked > 0
			})
			if got := r.hub.content(entry.Ino); got != "" {
				t.Fatalf("the Hub holds %d bytes before the switch ended", len(got))
			}
			mu.Lock()
			switching = false
			mu.Unlock()
			r.drain()
			wbEventually(t, "journal gone", func() bool { return len(wbJournalFiles(t, r.dir)) == 0 })
			if r.hub.content(entry.Ino) != string(payload) {
				t.Fatal("content differs")
			}
			if r.hub.count("BEGIN") != 1 || r.hub.count("END") != 1 {
				t.Fatalf("ops %v", r.hub.ops)
			}
			if r.hub.rev(entry.Ino) != 2 {
				t.Fatalf("rev %d, the commit applied more than once", r.hub.rev(entry.Ino))
			}
		})
	}
}

func TestStuckPutRetriesAfterARouteSwitch(t *testing.T) {
	r := newWbRig(t)
	r.online()
	entry, h := r.create("c")
	wbPut(t, h, 0, "small")
	var mu sync.Mutex
	failures := 0
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		mu.Lock()
		defer mu.Unlock()
		if op == wire.OpPut && failures < 3 {
			failures++
			return wire.ErrNoRoute
		}
		return nil
	}
	h.Close()
	r.drain()
	if r.hub.content(entry.Ino) != "small" {
		t.Fatalf("hub %q", r.hub.content(entry.Ino))
	}
	if r.hub.count("PUT") != 1 || r.hub.rev(entry.Ino) != 2 {
		t.Fatalf("ops %v rev %d", r.hub.ops, r.hub.rev(entry.Ino))
	}
}

func TestCommitsCarryTheLastWriteTime(t *testing.T) {
	r := newWbRig(t)
	r.online()
	sent := map[wire.Op]int64{}
	var mu sync.Mutex
	r.hub.before = func(op wire.Op, meta wire.Meta) error {
		if op == wire.OpPut || op == wire.OpEnd {
			at, err := meta.Int(wire.KeyMtimeNs)
			if err != nil {
				return err
			}
			mu.Lock()
			sent[op] = at
			mu.Unlock()
		}
		return nil
	}
	before := time.Now().UnixNano()
	_, fresh := r.make("fresh")
	wbPut(t, fresh, 0, "new")
	fresh.Close()
	small := r.openExisting(r.hub.addFile(1, "small", "old"), true)
	wbPut(t, small, 0, "tiny")
	small.Close()
	_, big := r.create("big")
	big.WriteAt(bytes.Repeat([]byte("b"), 2<<20), 0)
	big.Close()
	after := time.Now().UnixNano()
	r.drain()
	mu.Lock()
	defer mu.Unlock()
	for _, op := range []wire.Op{wire.OpPut, wire.OpEnd} {
		if at := sent[op]; at < before || at > after {
			t.Fatalf("%s carried write time %d outside the writes %d to %d", op.Name(), at, before, after)
		}
	}
}
