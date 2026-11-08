package main

func (h *sessionHandle) Sync() error { return h.wb.syncSession(h.s) }

func (w *writeBack) syncSession(s *session) error {
	if err := s.data.Sync(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.dirty {
		return nil
	}
	s.rec.Size = s.size
	s.rec.Phase = phaseSealed
	return w.journal.save(s.rec)
}
