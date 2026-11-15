package main

import (
	"slices"
	"sync"

	"github.com/smarteverything/drive-mount/wire"
)

type heldRange struct {
	start uint64
	end   uint64
	typ   uint8
	pid   uint32
	flock bool
}

type lockKey struct {
	ino   uint64
	owner uint64
}

type lockBook struct {
	mu   sync.Mutex
	held map[lockKey][]heldRange
}

func (b *lockBook) cut(key lockKey, start, end uint64, flock bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.replaceLocked(key, b.cutLocked(key, start, end, flock))
}

func (b *lockBook) cutLocked(key lockKey, start, end uint64, flock bool) []heldRange {
	var kept []heldRange
	for _, r := range b.held[key] {
		if r.flock != flock || r.start > end || start > r.end {
			kept = append(kept, r)
			continue
		}
		if r.start < start {
			kept = append(kept, heldRange{r.start, start - 1, r.typ, r.pid, r.flock})
		}
		if r.end > end {
			kept = append(kept, heldRange{end + 1, r.end, r.typ, r.pid, r.flock})
		}
	}
	return kept
}

func (b *lockBook) replaceLocked(key lockKey, ranges []heldRange) {
	if len(ranges) == 0 {
		delete(b.held, key)
		return
	}
	if b.held == nil {
		b.held = map[lockKey][]heldRange{}
	}
	b.held[key] = ranges
}

func (b *lockBook) holds(key lockKey, start, end uint64, flock bool) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, r := range b.held[key] {
		if r.flock == flock && r.start <= end && start <= r.end {
			return true
		}
	}
	return false
}

func mergeRanges(ranges []heldRange) []heldRange {
	slices.SortFunc(ranges, func(a, b heldRange) int {
		switch {
		case a.flock != b.flock:
			if a.flock {
				return 1
			}
			return -1
		case a.start < b.start:
			return -1
		case a.start > b.start:
			return 1
		}
		return 0
	})
	var merged []heldRange
	for _, r := range ranges {
		last := len(merged) - 1
		if last >= 0 && merged[last].flock == r.flock && merged[last].typ == r.typ && merged[last].end != wire.EndOfFile && r.start <= merged[last].end+1 {
			if r.end > merged[last].end {
				merged[last].end = r.end
			}
			continue
		}
		merged = append(merged, r)
	}
	return merged
}

func (b *lockBook) record(key lockKey, r heldRange) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.replaceLocked(key, mergeRanges(append(b.cutLocked(key, r.start, r.end, r.flock), r)))
}

func (b *lockBook) all() []wire.HeldLock {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []wire.HeldLock
	for key, ranges := range b.held {
		for _, r := range ranges {
			out = append(out, wire.HeldLock{
				Ino:   key.ino,
				Owner: key.owner,
				Lock:  wire.Lock{Type: r.typ, Start: r.start, End: r.end, Pid: r.pid},
				Flock: r.flock,
			})
		}
	}
	slices.SortFunc(out, func(a, b wire.HeldLock) int {
		switch {
		case a.Ino != b.Ino:
			return cmpUint(a.Ino, b.Ino)
		case a.Owner != b.Owner:
			return cmpUint(a.Owner, b.Owner)
		}
		return cmpUint(a.Start, b.Start)
	})
	return out
}

func cmpUint(a, b uint64) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	}
	return 0
}

func (b *lockBook) drop(ino, owner uint64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.held, lockKey{ino, owner})
}

func (w *writeBack) HeldLocks() []wire.HeldLock { return w.locks.all() }

func (w *writeBack) LockLost(ino, owner uint64) { w.locks.drop(ino, owner) }
