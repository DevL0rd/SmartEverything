package main

import "sync/atomic"

type uploads struct {
	Files     int64 `json:"files"`
	Bytes     int64 `json:"bytes"`
	SentFiles int64 `json:"sentFiles"`
	SentBytes int64 `json:"sentBytes"`
}

type sentTotals struct {
	files atomic.Int64
	bytes atomic.Int64
}

func (n *namespaceLog) heldInodes() map[uint64]struct{} {
	n.mu.Lock()
	defer n.mu.Unlock()
	held := map[uint64]struct{}{}
	for _, inos := range n.inRoot {
		for ino := range inos {
			held[ino] = struct{}{}
		}
	}
	return held
}

func (s *session) leftBytes() (int64, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.busyLocked() {
		return 0, false
	}
	return int64(s.ranges.total() - min(s.unitSent, s.ranges.total())), true
}

func (s *session) noteSent(n uint64) {
	s.mu.Lock()
	s.unitSent += n
	s.mu.Unlock()
	s.w.sent.bytes.Add(int64(n))
	s.w.noteProgress()
}

func (s *session) startUnit(received uint64) {
	s.mu.Lock()
	s.unitSent = received
	s.mu.Unlock()
}

func (w *writeBack) noteLanded(s *session, unit *unitRecord) {
	s.mu.Lock()
	all := spansToSet(unit.Ranges)
	left := all.total() - min(s.unitSent, all.total())
	s.unitSent = 0
	s.mu.Unlock()
	w.sent.bytes.Add(int64(left))
	w.sent.files.Add(1)
}

func (w *writeBack) noteProgress() {
	w.mu.Lock()
	hook := w.progress
	w.mu.Unlock()
	if hook != nil {
		hook()
	}
}

func (w *writeBack) OnProgress(fn func()) {
	w.mu.Lock()
	w.progress = fn
	w.mu.Unlock()
}

func (w *writeBack) Uploads() uploads {
	held := w.ns.heldInodes()
	w.mu.Lock()
	sessions := make(map[uint64]*session, len(w.sessions))
	for ino, s := range w.sessions {
		sessions[ino] = s
	}
	w.mu.Unlock()
	out := uploads{Files: int64(len(held)), SentFiles: w.sent.files.Load(), SentBytes: w.sent.bytes.Load()}
	for ino, s := range sessions {
		left, busy := s.leftBytes()
		if !busy {
			continue
		}
		out.Bytes += left
		if _, counted := held[ino]; !counted {
			out.Files++
		}
	}
	return out
}
