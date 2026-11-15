package wire

import (
	"context"
	"sync"
	"time"
)

type outFrame struct {
	frame   []byte
	pending *pending
}

type sender struct {
	ctx     context.Context
	conn    Conn
	timeout func() time.Duration
	wake    chan struct{}

	mu      sync.Mutex
	control []outFrame
	bulk    []outFrame
	dead    bool
}

func newSender(ctx context.Context, conn Conn, timeout func() time.Duration) *sender {
	return &sender{ctx: ctx, conn: conn, timeout: timeout, wake: make(chan struct{}, 1)}
}

func (s *sender) enqueue(frame []byte, bulk bool, p *pending) {
	s.mu.Lock()
	if s.dead {
		s.mu.Unlock()
		return
	}
	item := outFrame{frame: frame, pending: p}
	if bulk {
		s.bulk = append(s.bulk, item)
	} else {
		s.control = append(s.control, item)
	}
	s.mu.Unlock()
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

func (s *sender) remove(p *pending) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, queue := range []*[]outFrame{&s.control, &s.bulk} {
		for i, item := range *queue {
			if item.pending == p {
				*queue = append((*queue)[:i:i], (*queue)[i+1:]...)
				return true
			}
		}
	}
	return false
}

func (s *sender) next() (outFrame, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, queue := range []*[]outFrame{&s.control, &s.bulk} {
		if len(*queue) > 0 {
			item := (*queue)[0]
			(*queue)[0] = outFrame{}
			*queue = (*queue)[1:]
			return item, true
		}
	}
	return outFrame{}, false
}

func (s *sender) stop() {
	s.mu.Lock()
	s.dead = true
	s.control, s.bulk = nil, nil
	s.mu.Unlock()
}

func (s *sender) run() {
	defer s.stop()
	for {
		item, ok := s.next()
		if !ok {
			select {
			case <-s.wake:
				continue
			case <-s.ctx.Done():
				return
			}
		}
		ctx, cancel := context.WithTimeout(s.ctx, s.timeout())
		err := s.conn.Write(ctx, item.frame)
		cancel()
		if err != nil {
			_ = s.conn.Close()
			return
		}
	}
}
