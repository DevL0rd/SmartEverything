package main

import (
	"context"
	"errors"
	"io"
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

type baseRef struct {
	handle ReadHandle
	refs   int
	dead   bool
}

type session struct {
	w          *writeBack
	mu         sync.Mutex
	baseMu     sync.Mutex
	rec        journalRecord
	data       *os.File
	ranges     rangeSet
	zeros      rangeSet
	since      rangeSet
	size       uint64
	baseSize   uint64
	cleanLimit uint64
	attr       wire.Attr
	forced     bool
	touched    int64
	base       *baseRef
	baseGen    uint64
	handles    int
	sealed     bool
	queued     bool
	sending    bool
	unit       *unitRecord
	resume     *unitRecord
	unitSync   uint64
	wanted     uint64
	served     uint64
	failure    error
	gone       bool
}

func newSession(w *writeBack, rec journalRecord, data *os.File) *session {
	return &session{
		w: w, rec: rec, data: data, size: rec.Size, baseSize: rec.BaseSize, cleanLimit: rec.CleanLimit,
	}
}

func (s *session) ino() uint64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.rec.Ino
}

func (s *session) commitID() uint64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	switch {
	case s.unit != nil:
		return s.unit.Commit
	case s.resume != nil:
		return s.resume.Commit
	}
	return 0
}

func (s *session) needsCommit() bool {
	return !s.ranges.empty() || !s.zeros.empty() || s.size != s.baseSize || s.forced
}

func (s *session) busy() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sending || s.resume != nil || s.needsCommit()
}

func (s *session) inFlight() (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.failure != nil {
		return false, s.failure
	}
	return s.sending || s.resume != nil || (s.sealed && s.needsCommit()), nil
}

func (s *session) closeFiles() {
	s.mu.Lock()
	data := s.data
	base := s.base
	s.base = nil
	closeBase := false
	if base != nil {
		base.dead = true
		closeBase = base.refs == 0
	}
	s.mu.Unlock()
	if data != nil {
		data.Close()
	}
	if closeBase {
		_ = base.handle.Release(context.Background())
	}
}

func (s *session) recordLocked() journalRecord {
	rec := s.rec
	rec.BaseSize, rec.CleanLimit, rec.Size = s.baseSize, s.cleanLimit, s.size
	rec.Ranges, rec.Zeros, rec.Since, rec.Forced = s.ranges.spans, s.zeros.spans, s.since.spans, s.forced
	switch {
	case s.unit != nil:
		rec.Unit = s.unit
	default:
		rec.Unit = s.resume
	}
	if s.sealed || s.sending || s.resume != nil {
		rec.Phase = phaseSealed
	} else {
		rec.Phase = phaseOpen
	}
	return rec
}

func (s *session) saveLocked(durable bool) error {
	rec := s.recordLocked()
	if durable {
		return s.w.journal.saveDurable(rec)
	}
	return s.w.journal.save(rec)
}

func (s *session) touchLocked() { s.touched = time.Now().UnixNano() }

func (s *session) markZeroLocked(lo, hi uint64) {
	if lo >= hi {
		return
	}
	s.ranges.remove(lo, hi)
	s.zeros.add(lo, hi)
	if s.sending || s.resume != nil {
		s.since.add(lo, hi)
	}
}

func (s *session) hubSizeLocked() uint64 {
	unit := s.unit
	if unit == nil {
		unit = s.resume
	}
	if unit == nil {
		return s.baseSize
	}
	return max(s.baseSize, unit.Size)
}

func (s *session) growLocked(newSize uint64) {
	if newSize <= s.size {
		return
	}
	s.markZeroLocked(s.size, min(newSize, s.hubSizeLocked()))
}

func (s *session) truncateLocked(size uint64) error {
	switch {
	case size < s.size:
		s.ranges.cut(size)
		s.zeros.cut(size)
		s.since.cut(size)
		if err := s.data.Truncate(int64(size)); err != nil {
			return err
		}
		s.cleanLimit = min(s.cleanLimit, size)
	case size > s.size:
		s.growLocked(size)
	}
	s.size = size
	s.forced = true
	s.touchLocked()
	return nil
}

func (s *session) attachHandle(truncate bool) (InodeWriteHandle, bool) {
	s.mu.Lock()
	if s.gone {
		s.mu.Unlock()
		return nil, false
	}
	s.handles++
	var err error
	if truncate {
		err = s.truncateLocked(0)
	}
	s.mu.Unlock()
	h := &sessionHandle{s: s}
	if err != nil {
		h.failed = err
	}
	return h, true
}

type sessionHandle struct {
	s      *session
	closed sync.Once
	err    error
	failed error
}

func (h *sessionHandle) WriteAt(p []byte, off int64) (int, error) {
	if h.failed != nil {
		return 0, h.failed
	}
	return h.s.writeAt(p, uint64(off))
}

func (h *sessionHandle) ReadAt(p []byte, off int64) (int, error) {
	return h.s.readAt(p, uint64(off))
}

func (h *sessionHandle) Size() int64 {
	h.s.mu.Lock()
	defer h.s.mu.Unlock()
	return int64(h.s.size)
}

func (h *sessionHandle) Truncate(size uint64) error { return h.s.truncate(size) }

func (h *sessionHandle) Allocate(mode uint32, off, length uint64) error {
	return h.s.allocate(mode, off, length)
}

func (h *sessionHandle) Flush() error { return h.s.flush() }

func (h *sessionHandle) Sync() error { return h.s.syncSession() }

func (h *sessionHandle) Close() error {
	h.closed.Do(func() { h.err = h.s.release() })
	return h.err
}

func (s *session) writeAt(p []byte, off uint64) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(p) == 0 {
		return 0, nil
	}
	if off > s.size {
		s.growLocked(off)
		s.size = off
	}
	n, err := s.data.WriteAt(p, int64(off))
	if n > 0 {
		end := off + uint64(n)
		s.ranges.add(off, end)
		s.zeros.remove(off, end)
		if s.sending || s.resume != nil {
			s.since.add(off, end)
		}
		s.size = max(s.size, end)
		s.touchLocked()
	}
	return n, err
}

func (s *session) truncate(size uint64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.truncateLocked(size)
}

func (s *session) allocate(mode uint32, off, length uint64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	end := off + length
	switch mode {
	case wire.AllocateAllocate:
		if end > s.size {
			return s.truncateLocked(end)
		}
	case wire.AllocatePunchHole, wire.AllocateZeroRangeKeepSize:
		s.markZeroLocked(off, min(end, s.size))
		s.forced = true
		s.touchLocked()
	case wire.AllocateZeroRange:
		if end > s.size {
			if err := s.truncateLocked(end); err != nil {
				return err
			}
		}
		s.markZeroLocked(off, end)
		s.forced = true
		s.touchLocked()
	}
	return nil
}

type baseRead struct {
	start, end uint64
	dst        []byte
}

func (s *session) readAt(p []byte, off uint64) (int, error) {
	s.mu.Lock()
	if off >= s.size || len(p) == 0 {
		s.mu.Unlock()
		return 0, nil
	}
	end := min(off+uint64(len(p)), s.size)
	var jobs []baseRead
	for pos := off; pos < end; {
		if z, ok := s.zeros.at(pos); ok {
			stop := min(end, z[1])
			clear(p[pos-off : stop-off])
			pos = stop
			continue
		}
		if r, ok := s.ranges.at(pos); ok {
			stop := min(end, r[1])
			if _, err := s.data.ReadAt(p[pos-off:stop-off], int64(pos)); err != nil && !errors.Is(err, io.EOF) {
				s.mu.Unlock()
				return 0, err
			}
			pos = stop
			continue
		}
		stop := end
		if next, ok := s.ranges.nextStart(pos); ok {
			stop = min(stop, next)
		}
		if next, ok := s.zeros.nextStart(pos); ok {
			stop = min(stop, next)
		}
		clean := min(stop, s.cleanLimit)
		if pos < clean {
			jobs = append(jobs, baseRead{start: pos, end: clean, dst: p[pos-off : clean-off]})
			pos = clean
		}
		if pos < stop {
			clear(p[pos-off : stop-off])
			pos = stop
		}
	}
	s.mu.Unlock()
	if len(jobs) > 0 {
		ref, err := s.acquireBase()
		if err != nil {
			return 0, err
		}
		defer s.releaseBase(ref)
		for _, job := range jobs {
			if err := readFull(s.w.ctx, ref.handle, job.dst, int64(job.start)); err != nil {
				return 0, err
			}
		}
	}
	return int(end - off), nil
}

func readFull(ctx context.Context, h ReadHandle, dst []byte, off int64) error {
	for done := 0; done < len(dst); {
		n, err := h.ReadAt(ctx, dst[done:], off+int64(done))
		done += n
		if err != nil && !errors.Is(err, io.EOF) {
			return err
		}
		if n == 0 {
			return io.ErrUnexpectedEOF
		}
	}
	return nil
}

func (s *session) acquireBase() (*baseRef, error) {
	s.baseMu.Lock()
	defer s.baseMu.Unlock()
	s.mu.Lock()
	ref := s.base
	ino := s.rec.Ino
	if ref != nil {
		ref.refs++
		s.mu.Unlock()
		return ref, nil
	}
	s.mu.Unlock()
	if s.w.base == nil {
		return nil, errNoBase
	}
	s.mu.Lock()
	gen := s.baseGen
	s.mu.Unlock()
	handle, err := s.w.base.Open(s.w.ctx, ino)
	if err != nil {
		return nil, err
	}
	ref = &baseRef{handle: handle, refs: 1}
	s.mu.Lock()
	if s.baseGen == gen {
		s.base = ref
	} else {
		ref.dead = true
	}
	s.mu.Unlock()
	return ref, nil
}

var errNoBase = errors.New("the file has no readable base content")

func (s *session) releaseBase(ref *baseRef) {
	s.mu.Lock()
	ref.refs--
	closeIt := ref.dead && ref.refs == 0
	s.mu.Unlock()
	if closeIt {
		_ = ref.handle.Release(context.Background())
	}
}

func (s *session) retireBaseLocked() {
	s.baseGen++
	if s.base == nil {
		return
	}
	ref := s.base
	s.base = nil
	ref.dead = true
	if ref.refs == 0 {
		go func() { _ = ref.handle.Release(context.Background()) }()
	}
}

func (s *session) flush() error {
	s.mu.Lock()
	failure := s.failure
	s.mu.Unlock()
	if err := s.seal(); err != nil {
		return err
	}
	if live.load().closeWaitsForUpload {
		err := s.w.awaitCommits(s.w.ctx, s.ino())
		if errors.Is(err, wire.ErrNoRoute) {
			return nil
		}
		return err
	}
	return failure
}

func (s *session) seal() error {
	s.mu.Lock()
	if s.gone {
		s.mu.Unlock()
		return nil
	}
	if !s.needsCommit() && s.resume == nil {
		s.mu.Unlock()
		return nil
	}
	s.sealed = true
	err := s.saveLocked(false)
	queue := !s.sending
	if s.failure != nil {
		s.failure = nil
	}
	s.mu.Unlock()
	if queue {
		s.w.enqueueSealed(s)
	}
	return err
}

func (s *session) release() error {
	s.mu.Lock()
	s.handles--
	last := s.handles <= 0
	s.mu.Unlock()
	if !last {
		return nil
	}
	if err := s.seal(); err != nil {
		return err
	}
	s.finishIfIdle()
	return nil
}

func (s *session) finishIfIdle() {
	s.mu.Lock()
	if s.gone || s.handles > 0 || s.sending || s.resume != nil || s.needsCommit() {
		s.mu.Unlock()
		return
	}
	s.gone = true
	ino := s.rec.Ino
	id := s.rec.ID
	s.mu.Unlock()
	w := s.w
	w.mu.Lock()
	if w.sessions[ino] == s {
		delete(w.sessions, ino)
	}
	w.mu.Unlock()
	s.closeFiles()
	if err := w.journal.remove(id); err != nil {
		logJournal(ino, err)
	}
	w.broadcast()
}

func yieldOnce() { runtime.Gosched() }
