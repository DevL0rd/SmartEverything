package main

import "context"

func (s *session) truncate(size int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.data.Truncate(size); err != nil {
		return err
	}
	s.size = size
	s.dirty = true
	return nil
}

func (h *sessionHandle) Truncate(size int64) error { return h.s.truncate(size) }

func (w *writeBack) Truncate(ctx context.Context, root mountRoot, p string, size int64) error {
	handle, err := w.OpenWrite(ctx, root, p, size == 0)
	if err != nil {
		return err
	}
	if handle.Size() != size {
		if err := handle.Truncate(size); err != nil {
			handle.Close()
			return err
		}
	}
	return handle.Close()
}
