package fakehub

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/coder/websocket"
	"github.com/smarteverything/drive-mount/wire"
)

const Token = "device-token"

type commit struct {
	ino     uint64
	baseRev uint64
	writes  []Write
	ranges  [][2]uint64
}

type session struct {
	id      string
	raw     []byte
	mu      sync.Mutex
	handles map[uint64]uint64
	commits map[uint64]*commit
	next    uint64
}

type Hub struct {
	*Model
	URL      string
	server   *httptest.Server
	mu       sync.Mutex
	sessions map[string]*session
	conns    map[*conn]struct{}
	seq      atomic.Uint64
}

type conn struct {
	ws      *websocket.Conn
	ctx     context.Context
	cancel  context.CancelFunc
	session *session
	mu      sync.Mutex
	pending map[uint64]context.CancelFunc
	pushes  chan []byte
}

func New(t testing.TB) *Hub {
	t.Helper()
	h := &Hub{Model: NewModel(), sessions: map[string]*session{}, conns: map[*conn]struct{}{}}
	mux := http.NewServeMux()
	mux.HandleFunc(wire.MountPath, h.accept)
	h.server = httptest.NewServer(mux)
	h.URL = h.server.URL
	t.Cleanup(func() {
		h.DropConnections()
		h.server.Close()
	})
	return h
}

func (h *Hub) DropConnections() {
	h.mu.Lock()
	var open []*conn
	for c := range h.conns {
		open = append(open, c)
	}
	h.mu.Unlock()
	for _, c := range open {
		c.cancel()
		c.ws.CloseNow()
	}
}

func (h *Hub) Connections() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.conns)
}

func (h *Hub) accept(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "Bearer "+Token {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{wire.Subprotocol}, CompressionMode: websocket.CompressionDisabled})
	if err != nil {
		return
	}
	ws.SetReadLimit(wire.MaxFrameBytes)
	ctx, cancel := context.WithCancel(context.Background())
	c := &conn{ws: ws, ctx: ctx, cancel: cancel, pending: map[uint64]context.CancelFunc{}, pushes: make(chan []byte, 4096)}
	h.mu.Lock()
	h.conns[c] = struct{}{}
	h.mu.Unlock()
	defer func() {
		cancel()
		ws.CloseNow()
		h.mu.Lock()
		delete(h.conns, c)
		h.mu.Unlock()
		if c.session != nil {
			h.Model.ReleaseSession(c.session.id)
		}
	}()
	go c.pump()
	h.serve(c)
}

func (c *conn) pump() {
	for {
		select {
		case frame := <-c.pushes:
			if c.ws.Write(c.ctx, websocket.MessageBinary, frame) != nil {
				return
			}
		case <-c.ctx.Done():
			return
		}
	}
}

func (h *Hub) serve(c *conn) {
	for {
		_, raw, err := c.ws.Read(c.ctx)
		if err != nil {
			return
		}
		f, err := wire.DecodeFrame(raw)
		if err != nil || f.Type != wire.FrameRequest {
			return
		}
		meta, err := wire.DecodeMeta(f.Meta)
		if err != nil {
			return
		}
		if c.session == nil && f.Op != wire.OpHello {
			return
		}
		switch f.Op {
		case wire.OpHello:
			h.hello(c, f, meta)
		case wire.OpCancel:
			h.cancel(c, meta)
			c.reply(f, nil, nil)
		case wire.OpSetlk:
			ctx, cancel := context.WithCancel(c.ctx)
			c.mu.Lock()
			c.pending[f.RequestID] = cancel
			c.mu.Unlock()
			go func() {
				defer cancel()
				h.answer(ctx, c, f, meta)
				c.mu.Lock()
				delete(c.pending, f.RequestID)
				c.mu.Unlock()
			}()
		default:
			h.answer(c.ctx, c, f, meta)
		}
	}
}

func (h *Hub) cancel(c *conn, meta wire.Meta) {
	id, err := meta.Uint(wire.KeyRequestId)
	if err != nil {
		return
	}
	c.mu.Lock()
	cancel := c.pending[id]
	c.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (c *conn) send(f wire.Frame, meta wire.Meta) {
	var err error
	if f.Meta, err = wire.EncodeMeta(meta); err != nil {
		panic(err)
	}
	raw, err := wire.EncodeFrame(f)
	if err != nil {
		panic(err)
	}
	c.ws.Write(c.ctx, websocket.MessageBinary, raw)
}

func (c *conn) reply(req wire.Frame, meta wire.Meta, payload []byte) {
	c.send(wire.Frame{Type: wire.FrameReply, Op: req.Op, RequestID: req.RequestID, Payload: payload}, meta)
}

func (c *conn) fail(req wire.Frame, err error) {
	remote, ok := err.(*wire.RemoteError)
	if !ok {
		remote = &wire.RemoteError{Code: wire.ErrEIO, Message: err.Error()}
	}
	meta := wire.Meta{wire.KeyCode: uint64(remote.Code), wire.KeyMessage: remote.Message}
	if remote.HasRev {
		meta[wire.KeyRev] = remote.Rev
	}
	c.send(wire.Frame{Type: wire.FrameError, Op: req.Op, RequestID: req.RequestID}, meta)
}

func (h *Hub) hello(c *conn, f wire.Frame, meta wire.Meta) {
	var existing []byte
	if raw, err := meta.Bytes(wire.KeySession); err == nil {
		existing = raw
	}
	h.mu.Lock()
	var s *session
	resumed := false
	if known, ok := h.sessions[hex.EncodeToString(existing)]; ok && existing != nil {
		s, resumed = known, true
	} else {
		raw := make([]byte, wire.SessionBytes)
		rand.Read(raw)
		s = &session{id: hex.EncodeToString(raw), raw: raw, handles: map[uint64]uint64{}, commits: map[uint64]*commit{}}
		h.sessions[s.id] = s
	}
	h.mu.Unlock()
	c.session = s
	unsubscribe := h.Model.Subscribe(func(by string, change Change) {
		if by == s.id {
			return
		}
		frame, err := h.pushFrame(change)
		if err != nil {
			return
		}
		select {
		case c.pushes <- frame:
		default:
		}
	})
	go func() {
		<-c.ctx.Done()
		unsubscribe()
	}()
	c.reply(f, wire.Meta{wire.KeySession: s.raw, wire.KeyResumed: resumed, wire.KeyLeaseMs: uint64(wire.LeaseMs), wire.KeyFrameLimit: uint64(wire.MaxFrameBytes)}, nil)
}

func (h *Hub) pushFrame(change Change) ([]byte, error) {
	inodes := make([]any, 0, len(change.Inodes))
	for _, ino := range change.Inodes {
		inodes = append(inodes, ino)
	}
	removed := make([]any, 0, len(change.Removed))
	for _, ino := range change.Removed {
		removed = append(removed, ino)
	}
	entries := make([]any, 0, len(change.Entries))
	for _, e := range change.Entries {
		entries = append(entries, []any{e.Parent, e.Name})
	}
	meta, err := wire.EncodeMeta(wire.Meta{wire.KeyRoot: "root", wire.KeySeq: h.seq.Add(1), wire.KeyInodes: inodes, wire.KeyEntries: entries, wire.KeyRemoved: removed})
	if err != nil {
		return nil, err
	}
	return wire.EncodeFrame(wire.Frame{Type: wire.FramePush, Op: wire.PushChanged, Meta: meta})
}

func attrMeta(a wire.Attr) wire.Meta {
	m := wire.Meta{
		wire.KeyIno: a.Ino, wire.KeyType: uint64(a.Type), wire.KeyMode: uint64(a.Mode), wire.KeyNlink: uint64(a.Nlink),
		wire.KeySize: a.Size, wire.KeyBlocks: a.Blocks, wire.KeyAtimeNs: a.AtimeNs, wire.KeyMtimeNs: a.MtimeNs,
		wire.KeyCtimeNs: a.CtimeNs, wire.KeyBtimeNs: a.BtimeNs, wire.KeyRdev: uint64(a.Rdev), wire.KeyRev: a.Rev,
		wire.KeyEtag: a.Etag, wire.KeyUid: nil, wire.KeyGid: nil,
	}
	if a.UID != nil {
		m[wire.KeyUid] = uint64(*a.UID)
	}
	if a.GID != nil {
		m[wire.KeyGid] = uint64(*a.GID)
	}
	return m
}

func entryMeta(e wire.Entry) wire.Meta {
	return wire.Meta{wire.KeyIno: e.Ino, wire.KeyAttr: attrMeta(e.Attr)}
}

func rangesMeta(ranges [][2]uint64) []any {
	out := make([]any, 0, len(ranges))
	for _, r := range ranges {
		out = append(out, []any{r[0], r[1]})
	}
	return out
}

type args struct {
	m   wire.Meta
	err error
}

func (a *args) u(key uint64) uint64 {
	v, err := a.m.Uint(key)
	if err != nil && a.err == nil {
		a.err = err
	}
	return v
}

func (a *args) s(key uint64) string {
	v, err := a.m.String(key)
	if err != nil && a.err == nil {
		a.err = err
	}
	return v
}

func (a *args) b(key uint64) bool {
	v, err := a.m.Bool(key)
	if err != nil && a.err == nil {
		a.err = err
	}
	return v
}

func (a *args) owner(key uint64) *uint32 {
	v, err := a.m.OptUint32(key)
	if err != nil && a.err == nil {
		a.err = err
	}
	return v
}

func (a *args) ns(key uint64, now func() int64) *int64 {
	switch v := a.m[key].(type) {
	case int64:
		return &v
	case uint64:
		n := int64(v)
		return &n
	case string:
		n := now()
		return &n
	}
	if a.err == nil {
		a.err = &wire.FieldError{Key: key, Expect: "time", Got: a.m[key]}
	}
	return nil
}

func (h *Hub) answer(ctx context.Context, c *conn, f wire.Frame, meta wire.Meta) {
	reply, payload, err := h.dispatch(ctx, c, f, meta)
	if err != nil {
		c.fail(f, err)
		return
	}
	c.reply(f, reply, payload)
}

func (h *Hub) dispatch(ctx context.Context, c *conn, f wire.Frame, meta wire.Meta) (wire.Meta, []byte, error) {
	s := c.session
	a := &args{m: meta}
	by := s.id
	switch f.Op {
	case wire.OpAttach:
		root := h.Model.Attach()
		return wire.Meta{wire.KeyRoot: root.Root, wire.KeyIno: root.Ino, wire.KeyAttr: attrMeta(root.Attr), wire.KeySeq: h.seq.Load()}, nil, nil
	case wire.OpLookup:
		e, err := h.Model.Lookup(a.u(wire.KeyParent), a.s(wire.KeyName))
		return entryOrErr(e, err, a)
	case wire.OpGetattr:
		attr, err := h.Model.Getattr(a.u(wire.KeyIno))
		return attrOrErr(attr, err, a)
	case wire.OpReaddir:
		page, err := h.Model.Readdir(a.u(wire.KeyIno), a.u(wire.KeyCursor))
		if err != nil {
			return nil, nil, err
		}
		entries := make([]any, 0, len(page.Entries))
		for _, e := range page.Entries {
			entries = append(entries, []any{e.Name, e.Ino, attrMeta(e.Attr)})
		}
		var next any
		if page.Next != nil {
			next = *page.Next
		}
		return wire.Meta{wire.KeyEntries: entries, wire.KeyNext: next}, nil, nil
	case wire.OpSetattr:
		return h.setattr(by, a)
	case wire.OpStatfs:
		st := h.Model.Statfs()
		return wire.Meta{wire.KeyBlocks: st.Blocks, wire.KeyFree: st.Free, wire.KeyAvail: st.Avail, wire.KeyFiles: st.Files, wire.KeyFfree: st.Ffree, wire.KeyBsize: uint64(st.Bsize), wire.KeyNamelen: uint64(st.Namelen)}, nil, nil
	case wire.OpReadlink:
		target, err := h.Model.Readlink(a.u(wire.KeyIno))
		return wire.Meta{wire.KeyTarget: target}, nil, err
	case wire.OpMkdir:
		e, err := h.Model.Mkdir(by, a.u(wire.KeyParent), a.s(wire.KeyName), uint32(a.u(wire.KeyMode)), a.owner(wire.KeyUid), a.owner(wire.KeyGid))
		return entryOrErr(e, err, a)
	case wire.OpCreate:
		e, err := h.Model.Create(by, a.u(wire.KeyParent), a.s(wire.KeyName), uint32(a.u(wire.KeyMode)), a.owner(wire.KeyUid), a.owner(wire.KeyGid), a.b(wire.KeyExclusive))
		return entryOrErr(e, err, a)
	case wire.OpMknod:
		e, err := h.Model.Mknod(by, a.u(wire.KeyParent), a.s(wire.KeyName), uint8(a.u(wire.KeyType)), uint32(a.u(wire.KeyMode)), uint32(a.u(wire.KeyRdev)), a.owner(wire.KeyUid), a.owner(wire.KeyGid))
		return entryOrErr(e, err, a)
	case wire.OpSymlink:
		e, err := h.Model.Symlink(by, a.u(wire.KeyParent), a.s(wire.KeyName), a.s(wire.KeyTarget), a.owner(wire.KeyUid), a.owner(wire.KeyGid))
		return entryOrErr(e, err, a)
	case wire.OpLink:
		attr, err := h.Model.Link(by, a.u(wire.KeyIno), a.u(wire.KeyParent), a.s(wire.KeyName))
		return attrOrErr(attr, err, a)
	case wire.OpUnlink:
		return empty(h.Model.Unlink(by, a.u(wire.KeyParent), a.s(wire.KeyName)), a)
	case wire.OpRmdir:
		return empty(h.Model.Rmdir(by, a.u(wire.KeyParent), a.s(wire.KeyName)), a)
	case wire.OpRename:
		return empty(h.Model.Rename(by, a.u(wire.KeyParent), a.s(wire.KeyName), a.u(wire.KeyNewParent), a.s(wire.KeyNewName), uint32(a.u(wire.KeyFlags))), a)
	case wire.OpTmpfile:
		e, err := h.Model.Tmpfile(a.u(wire.KeyParent), uint32(a.u(wire.KeyMode)), a.owner(wire.KeyUid), a.owner(wire.KeyGid))
		return entryOrErr(e, err, a)
	case wire.OpGetxattr:
		value, err := h.Model.Getxattr(a.u(wire.KeyIno), a.s(wire.KeyName))
		if err == nil && value == nil {
			value = []byte{}
		}
		return wire.Meta{}, value, err
	case wire.OpSetxattr:
		return empty(h.Model.Setxattr(by, a.u(wire.KeyIno), a.s(wire.KeyName), bytes.Clone(framePayload(f)), uint32(a.u(wire.KeyFlags))), a)
	case wire.OpListxattr:
		names, err := h.Model.Listxattr(a.u(wire.KeyIno))
		list := make([]any, 0, len(names))
		for _, n := range names {
			list = append(list, n)
		}
		return wire.Meta{wire.KeyNames: list}, nil, err
	case wire.OpRemovexattr:
		return empty(h.Model.Removexattr(by, a.u(wire.KeyIno), a.s(wire.KeyName)), a)
	case wire.OpOpen:
		ino := a.u(wire.KeyIno)
		if _, err := h.Model.Getattr(ino); err != nil {
			return nil, nil, err
		}
		s.mu.Lock()
		s.next++
		handle := s.next
		s.handles[handle] = ino
		s.mu.Unlock()
		return wire.Meta{wire.KeyHandle: handle}, nil, nil
	case wire.OpRead:
		ino, err := s.handle(a.u(wire.KeyHandle))
		if err != nil {
			return nil, nil, err
		}
		data, err := h.Model.ReadAt(ino, a.u(wire.KeyOffset), int(a.u(wire.KeyLength)))
		if err == nil && data == nil {
			data = []byte{}
		}
		return wire.Meta{}, data, err
	case wire.OpRelease:
		s.mu.Lock()
		delete(s.handles, a.u(wire.KeyHandle))
		s.mu.Unlock()
		return wire.Meta{}, nil, a.err
	case wire.OpSeek:
		ino, err := s.handle(a.u(wire.KeyHandle))
		if err != nil {
			return nil, nil, err
		}
		off, err := h.Model.Seek(ino, a.u(wire.KeyOffset), uint32(a.u(wire.KeyWhence)))
		return wire.Meta{wire.KeyOffset: off}, nil, err
	case wire.OpCopy:
		return nil, nil, fail(wire.ErrEOPNOTSUPP)
	case wire.OpBegin:
		return h.begin(s, a)
	case wire.OpWrite:
		return h.write(s, f, a)
	case wire.OpAllocate:
		cm, err := s.commit(a.u(wire.KeyCommit))
		if err != nil {
			return nil, nil, err
		}
		return empty(h.Model.Allocate(by, cm.ino, uint32(a.u(wire.KeyMode)), a.u(wire.KeyOffset), a.u(wire.KeyLength)), a)
	case wire.OpState:
		cm, err := s.commit(a.u(wire.KeyCommit))
		if err != nil {
			return wire.Meta{wire.KeyRanges: nil}, nil, nil
		}
		return wire.Meta{wire.KeyRanges: rangesMeta(cm.ranges)}, nil, nil
	case wire.OpEnd:
		return h.end(by, s, a)
	case wire.OpPut:
		attr, err := h.Model.Commit(by, a.u(wire.KeyIno), a.u(wire.KeyBaseRev), a.u(wire.KeySize), []Write{{Data: bytes.Clone(framePayload(f))}})
		if err != nil {
			return nil, nil, err
		}
		return wire.Meta{wire.KeyAttr: attrMeta(attr), wire.KeyRev: attr.Rev}, nil, nil
	case wire.OpAbort:
		s.mu.Lock()
		delete(s.commits, a.u(wire.KeyCommit))
		s.mu.Unlock()
		return wire.Meta{}, nil, a.err
	case wire.OpForget:
		return wire.Meta{}, nil, nil
	case wire.OpFsync:
		_, err := h.Model.Getattr(a.u(wire.KeyIno))
		return wire.Meta{}, nil, err
	case wire.OpGetlk:
		lock := wire.Lock{Type: uint8(a.u(wire.KeyType)), Start: a.u(wire.KeyStart), End: a.u(wire.KeyEnd), Pid: uint32(a.u(wire.KeyPid))}
		found, err := h.Model.Getlk(by, a.u(wire.KeyIno), a.u(wire.KeyOwner), lock, false)
		if err != nil {
			return nil, nil, err
		}
		if found == nil {
			return wire.Meta{wire.KeyLock: nil}, nil, nil
		}
		return wire.Meta{wire.KeyLock: wire.Meta{wire.KeyType: uint64(found.Type), wire.KeyStart: found.Start, wire.KeyEnd: found.End, wire.KeyPid: uint64(found.Pid)}}, nil, nil
	case wire.OpSetlk:
		lock := wire.Lock{Type: uint8(a.u(wire.KeyType)), Start: a.u(wire.KeyStart), End: a.u(wire.KeyEnd), Pid: uint32(a.u(wire.KeyPid))}
		return empty(h.Model.Setlk(ctx, by, a.u(wire.KeyIno), a.u(wire.KeyOwner), lock, a.b(wire.KeyWait), a.b(wire.KeyFlock)), a)
	case wire.OpUnlock:
		h.Model.Unlock(by, a.u(wire.KeyIno), a.u(wire.KeyOwner), a.b(wire.KeyFlock), a.u(wire.KeyStart), a.u(wire.KeyEnd))
		return wire.Meta{}, nil, a.err
	}
	return nil, nil, fail(wire.ErrEOPNOTSUPP)
}

func framePayload(f wire.Frame) []byte { return f.Payload }

func (s *session) handle(id uint64) (uint64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ino, ok := s.handles[id]
	if !ok {
		return 0, fail(wire.ErrESTALE)
	}
	return ino, nil
}

func (s *session) commit(id uint64) (*commit, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cm, ok := s.commits[id]
	if !ok {
		return nil, fail(wire.ErrESTALE)
	}
	return cm, nil
}

func entryOrErr(e wire.Entry, err error, a *args) (wire.Meta, []byte, error) {
	if err == nil {
		err = a.err
	}
	if err != nil {
		return nil, nil, err
	}
	return entryMeta(e), nil, nil
}

func attrOrErr(attr wire.Attr, err error, a *args) (wire.Meta, []byte, error) {
	if err == nil {
		err = a.err
	}
	if err != nil {
		return nil, nil, err
	}
	return wire.Meta{wire.KeyAttr: attrMeta(attr)}, nil, nil
}

func empty(err error, a *args) (wire.Meta, []byte, error) {
	if err == nil {
		err = a.err
	}
	return wire.Meta{}, nil, err
}

func (h *Hub) setattr(by string, a *args) (wire.Meta, []byte, error) {
	valid := uint32(a.u(wire.KeyValid))
	ino := a.u(wire.KeyIno)
	var mode uint32
	var uid, gid *uint32
	var size uint64
	var atime, mtime *int64
	if valid&wire.SetattrValidMode != 0 {
		mode = uint32(a.u(wire.KeyMode))
	}
	if valid&wire.SetattrValidUid != 0 {
		uid = a.owner(wire.KeyUid)
	}
	if valid&wire.SetattrValidGid != 0 {
		gid = a.owner(wire.KeyGid)
	}
	if valid&wire.SetattrValidSize != 0 {
		size = a.u(wire.KeySize)
	}
	if valid&wire.SetattrValidAtime != 0 {
		atime = a.ns(wire.KeyAtime, h.Model.now)
	}
	if valid&wire.SetattrValidMtime != 0 {
		mtime = a.ns(wire.KeyMtime, h.Model.now)
	}
	if a.err != nil {
		return nil, nil, a.err
	}
	attr, err := h.Model.Setattr(by, ino, valid, mode, uid, gid, size, atime, mtime)
	return attrOrErr(attr, err, a)
}

func (h *Hub) begin(s *session, a *args) (wire.Meta, []byte, error) {
	ino := a.u(wire.KeyIno)
	baseRev := a.u(wire.KeyBaseRev)
	if a.err != nil {
		return nil, nil, a.err
	}
	if _, err := h.Model.Getattr(ino); err != nil {
		return nil, nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.next++
	s.commits[s.next] = &commit{ino: ino, baseRev: baseRev}
	return wire.Meta{wire.KeyCommit: s.next, wire.KeyRanges: []any{}}, nil, nil
}

func (h *Hub) write(s *session, f wire.Frame, a *args) (wire.Meta, []byte, error) {
	cm, err := s.commit(a.u(wire.KeyCommit))
	if err != nil {
		return nil, nil, err
	}
	offset := a.u(wire.KeyOffset)
	s.mu.Lock()
	cm.writes = append(cm.writes, Write{Offset: offset, Data: bytes.Clone(f.Payload)})
	cm.ranges = append(cm.ranges, [2]uint64{offset, offset + uint64(len(f.Payload))})
	s.mu.Unlock()
	return wire.Meta{}, nil, a.err
}

func (h *Hub) end(by string, s *session, a *args) (wire.Meta, []byte, error) {
	cm, err := s.commit(a.u(wire.KeyCommit))
	if err != nil {
		return nil, nil, err
	}
	size := a.u(wire.KeySize)
	if a.err != nil {
		return nil, nil, a.err
	}
	attr, err := h.Model.Commit(by, cm.ino, cm.baseRev, size, cm.writes)
	if err != nil {
		return nil, nil, err
	}
	s.mu.Lock()
	delete(s.commits, a.u(wire.KeyCommit))
	s.mu.Unlock()
	return wire.Meta{wire.KeyAttr: attrMeta(attr), wire.KeyRev: attr.Rev}, nil, nil
}
