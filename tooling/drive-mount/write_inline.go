package main

import (
	"slices"

	"github.com/smarteverything/drive-mount/wire"
)

const (
	inlineWait = iota
	inlineReady
	inlineLater
)

func (s *session) inlineUnit() (*unitRecord, []byte, int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.gone || s.sending {
		return nil, nil, inlineLater
	}
	if s.resume == nil && !s.sealed {
		return nil, nil, inlineWait
	}
	limit := uint64(live.load().bulkFrameBytes)
	if (s.resume == nil && s.size > limit) || (s.resume != nil && s.resume.Size > limit) {
		return nil, nil, inlineLater
	}
	unit := s.resume
	if unit == nil {
		unit = s.freshUnitLocked()
	}
	payload := make([]byte, unit.Size)
	for _, span := range unit.Ranges {
		if err := readData(s.data, payload[span[0]:min(span[1], unit.Size)], span[0]); err != nil {
			logJournal(s.rec.Ino, err)
			return nil, nil, inlineLater
		}
	}
	s.resume = nil
	s.unit = unit
	s.sending = true
	if err := s.saveLocked(unit.Fsync); err != nil {
		logJournal(s.rec.Ino, err)
	}
	return unit, payload, inlineReady
}

func (s *session) freshUnitLocked() *unitRecord {
	unit := &unitRecord{
		Ranges: slices.Clone(s.ranges.spans), Zeros: slices.Clone(s.zeros.spans), Size: s.size,
		BeginKey: newKeyHex(), EndKey: newKeyHex(), Fsync: s.wanted > s.served,
		WrittenNs: s.touched, AtimeNs: s.atime,
	}
	if s.mtime != nil {
		unit.WrittenNs = *s.mtime
	}
	s.atime, s.mtime = nil, nil
	s.unitSync = s.wanted
	s.forced = false
	s.sealed = false
	s.since.clear()
	return unit
}

func (s *session) unclaimInline(unit *unitRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.unit == unit {
		s.unit = nil
		s.resume = unit
	}
	s.sending = false
	if err := s.saveLocked(false); err != nil {
		logJournal(s.rec.Ino, err)
	}
}

func (s *session) adoptCreated(attr wire.Attr) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.rec.BaseRev != 0 {
		return
	}
	s.rec.BaseRev = attr.Rev
	s.attr = attr
	if err := s.saveLocked(false); err != nil {
		logJournal(s.rec.Ino, err)
	}
}

func (s *session) wantsTurn() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return !s.sending && ((s.sealed && s.needsCommit()) || s.resume != nil || s.hasTimes() || s.wanted > s.served)
}

func (s *session) fail(err error) {
	s.mu.Lock()
	s.failure = err
	s.mu.Unlock()
	s.w.broadcast()
}
