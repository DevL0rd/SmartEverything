package wire

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"sync"
	"time"
)

type Config struct {
	Token        string
	Route        Route
	Dialer       Dialer
	Handler      Handler
	PingInterval time.Duration
	PongTimeout  time.Duration
	BackoffMin   time.Duration
	BackoffMax   time.Duration
	Log          func(event string, err error)
}

type pending struct {
	id       uint64
	op       Op
	frame    []byte
	recovery bool
	bulk     bool
	replies  []Reply
	err      error
	done     chan struct{}
}

type Client struct {
	cfg     Config
	ctx     context.Context
	cancel  context.CancelFunc
	stopped chan struct{}
	pushes  *pushQueue

	mu          sync.Mutex
	route       Route
	routeCtx    context.Context
	routeCancel context.CancelFunc
	out         *sender
	recoverOut  *sender
	ping        time.Duration
	dead        time.Duration
	liveChanged chan struct{}
	session     []byte
	hadSession  bool
	nextID      uint64
	table       map[uint64]*pending
	closed      bool
}

var sessionScoped = map[Op]bool{
	OpRead: true, OpRelease: true, OpSeek: true, OpCopy: true,
	OpWrite: true, OpAllocate: true, OpState: true, OpEnd: true, OpAbort: true,
}

func NewClient(cfg Config) (*Client, error) {
	if cfg.Handler == nil {
		return nil, errors.New("drive mount wire client needs a handler")
	}
	if cfg.Dialer == nil {
		cfg.Dialer = WebsocketDialer{}
	}
	if cfg.PingInterval == 0 {
		cfg.PingInterval = PingIntervalMs * time.Millisecond
	}
	if cfg.PongTimeout == 0 {
		cfg.PongTimeout = PongTimeoutMs * time.Millisecond
	}
	if err := validateLiveness(cfg.PingInterval, cfg.PongTimeout); err != nil {
		return nil, err
	}
	if cfg.BackoffMin == 0 {
		cfg.BackoffMin = 100 * time.Millisecond
	}
	if cfg.BackoffMax == 0 {
		cfg.BackoffMax = 5 * time.Second
	}
	if err := validateRoute(cfg.Route); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	c := &Client{
		cfg:     cfg,
		ctx:     ctx,
		cancel:  cancel,
		stopped: make(chan struct{}),
		pushes:  newPushQueue(cfg.Handler),
		route:   cfg.Route,
		table:   map[uint64]*pending{},

		ping:        cfg.PingInterval,
		dead:        cfg.PongTimeout,
		liveChanged: make(chan struct{}),
	}
	c.routeCtx, c.routeCancel = context.WithCancel(ctx)
	go c.pushes.run()
	go c.supervise()
	return c, nil
}

func validateLiveness(ping, dead time.Duration) error {
	if ping <= 0 {
		return fmt.Errorf("drive mount ping interval %s must be positive", ping)
	}
	if dead <= ping {
		return fmt.Errorf("drive mount dead-after %s must be greater than the ping interval %s", dead, ping)
	}
	return nil
}

func (c *Client) SetLiveness(ping, dead time.Duration) error {
	if err := validateLiveness(ping, dead); err != nil {
		return err
	}
	c.mu.Lock()
	c.ping, c.dead = ping, dead
	changed := c.liveChanged
	c.liveChanged = make(chan struct{})
	c.mu.Unlock()
	close(changed)
	return nil
}

func (c *Client) Liveness() (time.Duration, time.Duration) {
	ping, dead, _ := c.liveness()
	return ping, dead
}

func (c *Client) liveness() (time.Duration, time.Duration, <-chan struct{}) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.ping, c.dead, c.liveChanged
}

func (c *Client) deadAfter() time.Duration {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.dead
}

func validateRoute(route Route) error {
	if route.URL == "" {
		return nil
	}
	parsed, err := url.Parse(route.URL)
	if err != nil {
		return err
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return fmt.Errorf("drive mount route %q needs a scheme and a host", route.URL)
	}
	return nil
}

func (c *Client) log(event string, err error) {
	if c.cfg.Log != nil {
		c.cfg.Log(event, err)
	}
}

func (c *Client) SwitchRoute(route Route) error {
	if err := validateRoute(route); err != nil {
		return err
	}
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return ErrClosed
	}
	old := c.routeCancel
	c.route = route
	c.routeCtx, c.routeCancel = context.WithCancel(c.ctx)
	var dropped []*pending
	if route.Empty() {
		dropped = c.takeLocked(func(p *pending) bool { return !p.recovery })
	}
	c.mu.Unlock()
	old()
	finish(dropped, ErrNoRoute)
	return nil
}

func (c *Client) Connected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.out != nil
}

func (c *Client) SessionID() []byte {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]byte(nil), c.session...)
}

func (c *Client) Close() error {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return nil
	}
	c.closed = true
	c.mu.Unlock()
	c.cancel()
	<-c.stopped
	c.mu.Lock()
	dropped := c.takeLocked(func(*pending) bool { return true })
	c.mu.Unlock()
	finish(dropped, ErrClosed)
	c.pushes.stop()
	return nil
}

func (c *Client) takeLocked(match func(*pending) bool) []*pending {
	var out []*pending
	for id, p := range c.table {
		if match(p) {
			delete(c.table, id)
			out = append(out, p)
		}
	}
	return out
}

func finish(list []*pending, err error) {
	for _, p := range list {
		p.err = err
		close(p.done)
	}
}

func (c *Client) Call(ctx context.Context, op Op, meta Meta, payload []byte) (Reply, error) {
	replies, err := c.Do(ctx, op, meta, payload)
	if err != nil {
		return Reply{}, err
	}
	if len(replies) != 1 {
		return Reply{}, fmt.Errorf("%w: %s answered %d replies", ErrUnexpected, op.Name(), len(replies))
	}
	return replies[0], nil
}

func (c *Client) Do(ctx context.Context, op Op, meta Meta, payload []byte) ([]Reply, error) {
	return c.do(ctx, op, meta, payload, false)
}

type recoveryCaller struct{ c *Client }

func (r recoveryCaller) Call(ctx context.Context, op Op, meta Meta, payload []byte) (Reply, error) {
	replies, err := r.c.do(ctx, op, meta, payload, true)
	if err != nil {
		return Reply{}, err
	}
	if len(replies) != 1 {
		return Reply{}, fmt.Errorf("%w: %s answered %d replies", ErrUnexpected, op.Name(), len(replies))
	}
	return replies[0], nil
}

func (r recoveryCaller) Do(ctx context.Context, op Op, meta Meta, payload []byte) ([]Reply, error) {
	return r.c.do(ctx, op, meta, payload, true)
}

type bulkKey struct{}

func WithBulk(ctx context.Context) context.Context {
	return context.WithValue(ctx, bulkKey{}, true)
}

func isBulk(ctx context.Context, op Op) bool {
	if op == OpWrite || op == OpPut {
		return true
	}
	return ctx.Value(bulkKey{}) != nil
}

func (c *Client) do(ctx context.Context, op Op, meta Meta, payload []byte, recovery bool) ([]Reply, error) {
	if probe != nil {
		defer probe.record(op, time.Now())
	}
	metaBytes, err := EncodeMeta(meta)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return nil, ErrClosed
	}
	out := c.out
	if recovery {
		out = c.recoverOut
		if out == nil {
			c.mu.Unlock()
			return nil, ErrConnLost
		}
	} else if c.route.Empty() {
		c.mu.Unlock()
		return nil, ErrNoRoute
	}
	c.nextID++
	p := &pending{id: c.nextID, op: op, recovery: recovery, bulk: isBulk(ctx, op), done: make(chan struct{})}
	p.frame, err = EncodeFrame(Frame{Type: FrameRequest, Op: op, RequestID: p.id, Meta: metaBytes, Payload: payload})
	if err != nil {
		c.mu.Unlock()
		return nil, err
	}
	c.table[p.id] = p
	c.mu.Unlock()
	if out != nil {
		out.enqueue(p.frame, p.bulk, p)
	}
	select {
	case <-p.done:
		return p.replies, p.err
	case <-ctx.Done():
	}
	c.mu.Lock()
	_, stillPending := c.table[p.id]
	delete(c.table, p.id)
	live := c.out
	c.mu.Unlock()
	if !stillPending {
		<-p.done
		return p.replies, p.err
	}
	if live != nil && !live.remove(p) {
		c.sendCancel(live, p.id)
	}
	return nil, ctx.Err()
}

func (c *Client) sendCancel(out *sender, target uint64) {
	meta, err := EncodeMeta(Meta{KeyRequestId: target})
	if err != nil {
		return
	}
	c.mu.Lock()
	c.nextID++
	id := c.nextID
	c.mu.Unlock()
	frame, err := EncodeFrame(Frame{Type: FrameRequest, Op: OpCancel, RequestID: id, Meta: meta})
	if err != nil {
		return
	}
	out.enqueue(frame, false, nil)
}

func (c *Client) supervise() {
	defer close(c.stopped)
	backoff := c.cfg.BackoffMin
	for c.ctx.Err() == nil {
		c.mu.Lock()
		route, routeCtx := c.route, c.routeCtx
		c.mu.Unlock()
		if route.Empty() {
			<-routeCtx.Done()
			continue
		}
		conn, err := c.cfg.Dialer.Dial(routeCtx, route, c.cfg.Token)
		established := false
		if err == nil {
			established, err = c.serve(routeCtx, conn)
		}
		if routeCtx.Err() != nil {
			continue
		}
		c.log("drive_mount.wire_lost", err)
		if established {
			backoff = c.cfg.BackoffMin
		}
		timer := time.NewTimer(backoff)
		select {
		case <-timer.C:
		case <-routeCtx.Done():
			timer.Stop()
		}
		backoff = min(backoff*2, c.cfg.BackoffMax)
	}
}

type helloReply struct {
	session []byte
	resumed bool
}

func (c *Client) hello(ctx context.Context, conn Conn) (helloReply, error) {
	ctx, cancel := context.WithTimeout(ctx, c.deadAfter())
	defer cancel()
	c.mu.Lock()
	session := c.session
	c.nextID++
	id := c.nextID
	c.mu.Unlock()
	metaBytes, err := EncodeMeta(c.cfg.Handler.Resume().meta(session))
	if err != nil {
		return helloReply{}, err
	}
	frame, err := EncodeFrame(Frame{Type: FrameRequest, Op: OpHello, RequestID: id, Meta: metaBytes})
	if err != nil {
		return helloReply{}, err
	}
	if err := conn.Write(ctx, frame); err != nil {
		return helloReply{}, err
	}
	raw, err := conn.Read(ctx)
	if err != nil {
		return helloReply{}, err
	}
	f, err := DecodeFrame(raw)
	if err != nil {
		return helloReply{}, err
	}
	if f.Op != OpHello || f.RequestID != id {
		return helloReply{}, fmt.Errorf("%w: the first frame is not the HELLO reply", ErrHandshake)
	}
	m, err := DecodeMeta(f.Meta)
	if err != nil {
		return helloReply{}, err
	}
	if f.Type == FrameError {
		remote, err := parseRemoteError(m)
		if err != nil {
			return helloReply{}, err
		}
		return helloReply{}, remote
	}
	if f.Type != FrameReply || f.More {
		return helloReply{}, fmt.Errorf("%w: the HELLO answer is not a single reply", ErrHandshake)
	}
	var out helloReply
	if out.session, err = m.Bytes(KeySession); err != nil {
		return helloReply{}, err
	}
	if len(out.session) != SessionBytes {
		return helloReply{}, fmt.Errorf("%w: session id of %d bytes", ErrHandshake, len(out.session))
	}
	if out.resumed, err = m.Bool(KeyResumed); err != nil {
		return helloReply{}, err
	}
	limit, err := m.Uint(KeyFrameLimit)
	if err != nil {
		return helloReply{}, err
	}
	if limit != MaxFrameBytes {
		return helloReply{}, fmt.Errorf("%w: frame limit %d differs from %d", ErrHandshake, limit, MaxFrameBytes)
	}
	return out, nil
}

func (c *Client) serve(parent context.Context, conn Conn) (bool, error) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	defer conn.Close()
	greeting, err := c.hello(ctx, conn)
	if err != nil {
		c.mu.Lock()
		c.session = nil
		c.mu.Unlock()
		return false, err
	}
	readFailed := make(chan error, 1)
	out := newSender(ctx, conn, c.deadAfter)
	go out.run()
	c.mu.Lock()
	c.session = greeting.session
	c.recoverOut = out
	hadSession := c.hadSession
	c.hadSession = true
	var lost []*pending
	if !greeting.resumed && hadSession {
		lost = c.takeLocked(func(p *pending) bool { return !p.recovery && sessionScoped[p.op] })
	}
	c.mu.Unlock()
	finish(lost, ErrSessionLost)
	go func() { readFailed <- c.readLoop(ctx, conn) }()
	go c.pingLoop(ctx, cancel, conn)
	recovered := make(chan error, 1)
	go func() { recovered <- c.cfg.Handler.Established(ctx, recoveryCaller{c}, greeting.resumed) }()
	select {
	case err = <-recovered:
	case err = <-readFailed:
		readFailed <- err
	}
	if err != nil {
		c.mu.Lock()
		c.session = nil
		c.mu.Unlock()
		c.dropRecovery()
		return true, err
	}
	c.mu.Lock()
	c.out = out
	ids := make([]uint64, 0, len(c.table))
	for id, p := range c.table {
		if !p.recovery {
			p.replies = nil
			ids = append(ids, id)
		}
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	resend := make([]*pending, 0, len(ids))
	for _, id := range ids {
		resend = append(resend, c.table[id])
	}
	c.mu.Unlock()
	for _, p := range resend {
		out.enqueue(p.frame, p.bulk, p)
	}
	select {
	case err = <-readFailed:
	case <-ctx.Done():
		err = ctx.Err()
	}
	c.mu.Lock()
	c.out = nil
	c.mu.Unlock()
	c.dropRecovery()
	return true, err
}

func (c *Client) dropRecovery() {
	c.mu.Lock()
	c.recoverOut = nil
	dropped := c.takeLocked(func(p *pending) bool { return p.recovery })
	c.mu.Unlock()
	finish(dropped, ErrConnLost)
}

func (c *Client) readLoop(ctx context.Context, conn Conn) error {
	for {
		raw, err := conn.Read(ctx)
		if err != nil {
			return err
		}
		f, err := DecodeFrame(raw)
		if err != nil {
			return err
		}
		switch f.Type {
		case FramePush:
			meta, err := DecodeMeta(f.Meta)
			if err != nil {
				return err
			}
			action, err := pushAction(f.Op, meta)
			if err != nil {
				return err
			}
			c.pushes.put(action)
		case FrameReply, FrameError:
			if err := c.deliver(f); err != nil {
				return err
			}
		default:
			return fmt.Errorf("%w: the hub sent a request frame", ErrProtocol)
		}
	}
}

func (c *Client) deliver(f Frame) error {
	c.mu.Lock()
	p := c.table[f.RequestID]
	var op Op
	if p != nil {
		op = p.op
	}
	c.mu.Unlock()
	if p == nil {
		return nil
	}
	if f.Op != op {
		return fmt.Errorf("%w: request %d is %s but the answer is %s", ErrProtocol, f.RequestID, op.Name(), f.Op.Name())
	}
	meta, err := DecodeMeta(f.Meta)
	if err != nil {
		return err
	}
	var remote *RemoteError
	if f.Type == FrameError {
		if remote, err = parseRemoteError(meta); err != nil {
			return err
		}
	}
	c.mu.Lock()
	if c.table[f.RequestID] != p {
		c.mu.Unlock()
		return nil
	}
	if remote == nil {
		p.replies = append(p.replies, Reply{Meta: meta, Payload: f.Payload})
		if f.More {
			c.mu.Unlock()
			return nil
		}
	}
	delete(c.table, p.id)
	c.mu.Unlock()
	if remote != nil {
		p.err = remote
	}
	close(p.done)
	return nil
}

func (c *Client) pingLoop(ctx context.Context, cancel context.CancelFunc, conn Conn) {
	for {
		ping, dead, changed := c.liveness()
		timer := time.NewTimer(ping)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-changed:
			timer.Stop()
			continue
		case <-timer.C:
		}
		pingCtx, stop := context.WithTimeout(ctx, dead)
		err := conn.Ping(pingCtx)
		stop()
		if err != nil {
			if ctx.Err() == nil {
				c.log("drive_mount.ping_failed", err)
			}
			cancel()
			_ = conn.Close()
			return
		}
	}
}

type pushQueue struct {
	handler Handler
	mu      sync.Mutex
	wake    *sync.Cond
	items   []func(Handler)
	done    bool
	exited  chan struct{}
}

func newPushQueue(h Handler) *pushQueue {
	q := &pushQueue{handler: h, exited: make(chan struct{})}
	q.wake = sync.NewCond(&q.mu)
	return q
}

func (q *pushQueue) put(action func(Handler)) {
	q.mu.Lock()
	q.items = append(q.items, action)
	q.mu.Unlock()
	q.wake.Signal()
}

func (q *pushQueue) stop() {
	q.mu.Lock()
	q.done = true
	q.mu.Unlock()
	q.wake.Signal()
	<-q.exited
}

func (q *pushQueue) run() {
	defer close(q.exited)
	for {
		q.mu.Lock()
		for len(q.items) == 0 && !q.done {
			q.wake.Wait()
		}
		if len(q.items) == 0 {
			q.mu.Unlock()
			return
		}
		action := q.items[0]
		q.items[0] = nil
		q.items = q.items[1:]
		q.mu.Unlock()
		action(q.handler)
	}
}
