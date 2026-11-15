package main

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"slices"
	"sync"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

const retryDelay = 200 * time.Millisecond

func (w *writeBack) run() {
	defer w.workers.Done()
	for {
		s := w.nextSession()
		if s == nil {
			return
		}
		w.process(s)
	}
}

func (w *writeBack) nextSession() *session {
	for {
		w.mu.Lock()
		if len(w.queue) > 0 && w.online.Load() {
			s := w.queue[0]
			w.queue = w.queue[1:]
			s.queued = false
			more := len(w.queue) > 0
			w.mu.Unlock()
			if more {
				w.signal()
			}
			if s.claim() {
				return s
			}
			continue
		}
		w.mu.Unlock()
		select {
		case <-w.wake:
		case <-w.ctx.Done():
			return nil
		}
	}
}

func (s *session) claim() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.sending || s.gone {
		return false
	}
	s.sending = true
	return true
}

type turn struct {
	unit      *unitRecord
	fsyncOnly bool
	target    uint64
}

func (w *writeBack) process(s *session) {
	defer w.broadcast()
	for {
		t, ok := s.takeTurn()
		if !ok {
			s.finishIfIdle()
			return
		}
		if t.fsyncOnly {
			if err := w.fsyncRemote(w.ctx, s.ino(), false); err != nil {
				w.settleFailure(s, nil, err)
				return
			}
			s.mu.Lock()
			s.served = max(s.served, t.target)
			s.mu.Unlock()
			w.broadcast()
			continue
		}
		attr, err := w.sendUnit(s, t.unit)
		if err == nil {
			if !w.ack(s, t.unit, attr) {
				s.finishIfIdle()
				return
			}
			continue
		}
		if !w.settle(s, t.unit, err) {
			return
		}
	}
}

func (s *session) takeTurn() (turn, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.gone || s.w.ctx.Err() != nil {
		s.sending = false
		return turn{}, false
	}
	switch {
	case s.resume != nil:
		unit := s.resume
		s.resume = nil
		s.unit = unit
		s.sending = true
		s.unitSync = s.served
		return turn{unit: unit}, true
	case s.sealed && s.needsCommit():
		unit := &unitRecord{
			Ranges: slices.Clone(s.ranges.spans), Zeros: slices.Clone(s.zeros.spans), Size: s.size,
			BeginKey: newKeyHex(), EndKey: newKeyHex(), Fsync: s.wanted > s.served,
			WrittenNs: s.touched,
		}
		s.unitSync = s.wanted
		s.forced = false
		s.sealed = false
		s.since.clear()
		s.unit = unit
		s.sending = true
		if err := s.saveLocked(unit.Fsync); err != nil {
			logJournal(s.rec.Ino, err)
		}
		return turn{unit: unit}, true
	case s.wanted > s.served:
		s.sending = true
		return turn{fsyncOnly: true, target: s.wanted}, true
	}
	s.sending = false
	return turn{}, false
}

func newKeyHex() string { return hex.EncodeToString(wire.NewOpKey()) }

func keyBytes(key string) []byte {
	raw, err := hex.DecodeString(key)
	if err != nil {
		panic(err)
	}
	return raw
}

func (s *session) updateUnit(change func(u *unitRecord)) {
	s.mu.Lock()
	change(s.unit)
	if err := s.saveLocked(false); err != nil {
		logJournal(s.rec.Ino, err)
	}
	s.mu.Unlock()
}

func (w *writeBack) sendUnit(s *session, unit *unitRecord) (wire.Attr, error) {
	s.mu.Lock()
	ino, baseRev := s.rec.Ino, s.rec.BaseRev
	s.mu.Unlock()
	ranges, zeros := spansToSet(unit.Ranges), spansToSet(unit.Zeros)
	all := spansToSet(append(slices.Clone(unit.Ranges), unit.Zeros...))
	if unit.Commit == 0 && unit.Size <= wire.MaxPayloadBytes && all.covers(0, unit.Size) {
		payload := make([]byte, unit.Size)
		for _, span := range ranges.spans {
			if err := readData(s.data, payload[span[0]:span[1]], span[0]); err != nil {
				return wire.Attr{}, err
			}
		}
		reply, err := w.caller.Call(w.ctx, wire.OpPut, wire.Meta{
			wire.KeyIno: ino, wire.KeyBaseRev: baseRev, wire.KeySize: unit.Size,
			wire.KeyMtimeNs: unit.WrittenNs, wire.KeyFsync: unit.Fsync, wire.KeyOpKey: keyBytes(unit.EndKey),
		}, payload)
		if err != nil {
			return wire.Attr{}, err
		}
		return committedAttr(reply)
	}
	received, err := w.openCommit(s, unit, ino, baseRev)
	if err != nil {
		return wire.Attr{}, err
	}
	missing := ranges.clone()
	missing.subtract(received)
	if err := w.sendWrites(s, unit.Commit, missing.spans); err != nil {
		return wire.Attr{}, err
	}
	for _, span := range zeros.spans {
		if _, err := w.caller.Call(w.ctx, wire.OpAllocate, wire.Meta{
			wire.KeyCommit: unit.Commit, wire.KeyMode: uint64(wire.AllocateZeroRange),
			wire.KeyOffset: span[0], wire.KeyLength: span[1] - span[0],
		}, nil); err != nil {
			return wire.Attr{}, err
		}
	}
	reply, err := w.caller.Call(w.ctx, wire.OpEnd, wire.Meta{
		wire.KeyCommit: unit.Commit, wire.KeySize: unit.Size, wire.KeyMtimeNs: unit.WrittenNs,
		wire.KeyFsync: unit.Fsync, wire.KeyOpKey: keyBytes(unit.EndKey),
	}, nil)
	if err != nil {
		return wire.Attr{}, err
	}
	return committedAttr(reply)
}

func committedAttr(reply wire.Reply) (wire.Attr, error) {
	done, err := wire.ParseCommitted(reply.Meta)
	if err != nil {
		return wire.Attr{}, err
	}
	attr := done.Attr
	attr.Rev = done.Rev
	return attr, nil
}

func readData(f *os.File, dst []byte, off uint64) error {
	_, err := f.ReadAt(dst, int64(off))
	if err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	return nil
}

func (w *writeBack) openCommit(s *session, unit *unitRecord, ino, baseRev uint64) (rangeSet, error) {
	var received rangeSet
	if unit.Commit != 0 {
		reply, err := w.caller.Call(w.ctx, wire.OpState, wire.Meta{wire.KeyCommit: unit.Commit}, nil)
		if err != nil {
			return received, err
		}
		if reply.Meta[wire.KeyRanges] == nil {
			s.updateUnit(func(u *unitRecord) {
				u.Commit = 0
				u.BeginKey = newKeyHex()
			})
		} else {
			spans, err := wire.ParseRanges(reply.Meta[wire.KeyRanges], wire.KeyRanges)
			if err != nil {
				return received, err
			}
			return lengthsToSet(spans), nil
		}
	}
	reply, err := w.caller.Call(w.ctx, wire.OpBegin, wire.Meta{
		wire.KeyIno: ino, wire.KeyBaseRev: baseRev, wire.KeyOpKey: keyBytes(unit.BeginKey),
	}, nil)
	if err != nil {
		return received, err
	}
	commit, err := reply.Meta.Uint(wire.KeyCommit)
	if err != nil {
		return received, err
	}
	var spans [][2]uint64
	if reply.Meta[wire.KeyRanges] != nil {
		if spans, err = wire.ParseRanges(reply.Meta[wire.KeyRanges], wire.KeyRanges); err != nil {
			return received, err
		}
	}
	s.updateUnit(func(u *unitRecord) { u.Commit = commit })
	return lengthsToSet(spans), nil
}

func lengthsToSet(spans [][2]uint64) rangeSet {
	var out rangeSet
	for _, span := range spans {
		out.add(span[0], span[0]+span[1])
	}
	return out
}

func (w *writeBack) sendWrites(s *session, commit uint64, spans [][2]uint64) error {
	type chunk struct{ off, n uint64 }
	var chunks []chunk
	for _, span := range spans {
		for off := span[0]; off < span[1]; off += wire.MaxPayloadBytes {
			chunks = append(chunks, chunk{off, min(span[1]-off, wire.MaxPayloadBytes)})
		}
	}
	if len(chunks) == 0 {
		return nil
	}
	ctx, cancel := context.WithCancel(w.ctx)
	defer cancel()
	jobs := make(chan chunk)
	var wg sync.WaitGroup
	var once sync.Once
	var first error
	fail := func(err error) {
		once.Do(func() {
			first = err
			cancel()
		})
	}
	for lane := 0; lane < min(commitLanes, len(chunks)); lane++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for c := range jobs {
				if ctx.Err() != nil {
					continue
				}
				buf := make([]byte, c.n)
				if err := readData(s.data, buf, c.off); err != nil {
					fail(err)
					continue
				}
				if _, err := w.caller.Call(ctx, wire.OpWrite, wire.Meta{wire.KeyCommit: commit, wire.KeyOffset: c.off}, buf); err != nil {
					fail(err)
				}
			}
		}()
	}
feed:
	for _, c := range chunks {
		select {
		case jobs <- c:
		case <-ctx.Done():
			break feed
		}
	}
	close(jobs)
	wg.Wait()
	if first != nil {
		return first
	}
	return w.ctx.Err()
}

func isTransient(err error) bool {
	if errors.Is(err, wire.ErrNoRoute) || errors.Is(err, wire.ErrConnLost) || errors.Is(err, wire.ErrSessionLost) || errors.Is(err, wire.ErrClosed) {
		return true
	}
	code, ok := wire.CodeOf(err)
	return ok && code == wire.ErrENETUNREACH
}

func (w *writeBack) park(s *session, unit *unitRecord) {
	s.mu.Lock()
	s.resume = unit
	s.unit = nil
	s.sending = false
	if err := s.saveLocked(false); err != nil {
		logJournal(s.rec.Ino, err)
	}
	s.mu.Unlock()
}

func (w *writeBack) settle(s *session, unit *unitRecord, err error) bool {
	if w.ctx.Err() != nil {
		w.park(s, unit)
		return false
	}
	if isTransient(err) {
		w.park(s, unit)
		w.broadcast()
		time.AfterFunc(retryDelay, func() {
			if w.ctx.Err() == nil {
				w.enqueue(s)
			}
		})
		return false
	}
	if code, ok := wire.CodeOf(err); ok {
		switch {
		case (code == wire.ErrENOENT || code == wire.ErrESTALE) && s.isOrphan():
			s.discard()
			w.broadcast()
			s.finishIfIdle()
			return false
		case code == wire.ErrESTALE:
			if cerr := s.keepBoth(w.ctx); cerr != nil {
				w.settleFailure(s, unit, cerr)
				return false
			}
			return true
		}
	}
	w.settleFailure(s, unit, err)
	return false
}

func (s *session) isOrphan() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.rec.Orphan
}

func (s *session) discard() {
	s.mu.Lock()
	s.ranges.clear()
	s.zeros.clear()
	s.since.clear()
	s.size = s.baseSize
	s.forced = false
	s.unit = nil
	s.resume = nil
	s.sending = false
	s.served = max(s.served, s.unitSync)
	s.mu.Unlock()
}

func (w *writeBack) settleFailure(s *session, unit *unitRecord, err error) {
	fmt.Fprintln(os.Stderr, "commit:", s.ino(), err)
	s.mu.Lock()
	s.resume = unit
	s.unit = nil
	s.sending = false
	s.failure = err
	if serr := s.saveLocked(false); serr != nil {
		logJournal(s.rec.Ino, serr)
	}
	s.mu.Unlock()
	w.broadcast()
}

func (w *writeBack) ack(s *session, unit *unitRecord, attr wire.Attr) bool {
	w.noteHubAttr(attr)
	s.mu.Lock()
	ino := s.rec.Ino
	s.attr = attr
	s.rec.BaseRev = attr.Rev
	s.baseSize = unit.Size
	s.cleanLimit = min(unit.Size, s.size)
	s.ranges = s.ranges.intersect(s.since)
	s.zeros = s.zeros.intersect(s.since)
	s.since.clear()
	s.unit = nil
	s.resume = nil
	s.served = max(s.served, s.unitSync)
	s.failure = nil
	s.retireBaseLocked()
	more := s.sealed && s.needsCommit()
	if !more {
		s.sending = s.wanted > s.served
	}
	if err := s.saveLocked(false); err != nil {
		logJournal(ino, err)
	}
	pendingSync := s.sending
	s.mu.Unlock()
	w.mu.Lock()
	if unit.Commit != 0 {
		w.forgets = append(w.forgets, unit.Commit)
	}
	w.mu.Unlock()
	w.flushForgets()
	w.broadcast()
	return more || pendingSync
}

func (w *writeBack) flushForgets() {
	w.mu.Lock()
	ids := w.forgets
	w.forgets = nil
	w.mu.Unlock()
	if len(ids) == 0 {
		return
	}
	list := make([]any, 0, len(ids))
	for _, id := range ids {
		list = append(list, id)
	}
	if !w.online.Load() {
		w.restoreForgets(ids)
		return
	}
	if _, err := w.caller.Call(w.ctx, wire.OpForget, wire.Meta{wire.KeyCommits: list}, nil); err != nil {
		w.restoreForgets(ids)
	}
}

func (w *writeBack) restoreForgets(ids []uint64) {
	w.mu.Lock()
	w.forgets = append(ids, w.forgets...)
	w.mu.Unlock()
}
