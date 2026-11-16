package main

import (
	"bytes"
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

type wbNode struct {
	ino   uint64
	typ   uint8
	data  []byte
	rev   uint64
	mode  uint32
	nlink uint32
	mtime int64
	atime int64
	names map[string]uint64
}

type wbCommit struct {
	id     uint64
	ino    uint64
	base   uint64
	chunks map[uint64][]byte
	got    rangeSet
	zeros  rangeSet
}

type wbHub struct {
	t         *testing.T
	mu        sync.Mutex
	nodes     map[uint64]*wbNode
	next      uint64
	commits   map[uint64]*wbCommit
	nextID    uint64
	dedupe    map[string]wire.Reply
	ops       []string
	before    func(op wire.Op, meta wire.Meta) error
	after     func(op wire.Op, meta wire.Meta) error
	written   uint64
	inflight  int
	peak      int
	forgot    []uint64
	fsyncs    int
	lockCalls []wire.Meta
	clock     int64
}

func newWbHub(t *testing.T) *wbHub {
	h := &wbHub{t: t, nodes: map[uint64]*wbNode{}, commits: map[uint64]*wbCommit{}, dedupe: map[string]wire.Reply{}, next: 1, nextID: 100}
	h.nodes[1] = &wbNode{ino: 1, typ: wire.InodeTypeDirectory, rev: 1, mode: 0o755, nlink: 2, names: map[string]uint64{}}
	return h
}

func (h *wbHub) tick() int64 {
	h.clock += 1000
	return h.clock
}

func (h *wbHub) addFile(parent uint64, name string, content string) uint64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.next++
	n := &wbNode{ino: h.next, typ: wire.InodeTypeFile, data: []byte(content), rev: 1, mode: 0o644, nlink: 1, mtime: h.tick()}
	h.nodes[n.ino] = n
	h.nodes[parent].names[name] = n.ino
	return n.ino
}

func (h *wbHub) change(ino uint64, content string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := h.nodes[ino]
	n.data = []byte(content)
	n.rev++
	n.mtime = h.tick()
}

func (h *wbHub) content(ino uint64) string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return string(h.nodes[ino].data)
}

func (h *wbHub) rev(ino uint64) uint64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.nodes[ino].rev
}

func (h *wbHub) count(op string) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := 0
	for _, o := range h.ops {
		if o == op {
			n++
		}
	}
	return n
}

func (h *wbHub) lookupName(parent uint64, name string) (uint64, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	ino, ok := h.nodes[parent].names[name]
	return ino, ok
}

func (h *wbHub) attr(n *wbNode) wire.Meta {
	return wire.Meta{
		wire.KeyIno: n.ino, wire.KeyType: uint64(n.typ), wire.KeyMode: uint64(n.mode), wire.KeyNlink: uint64(n.nlink),
		wire.KeyUid: nil, wire.KeyGid: nil, wire.KeySize: uint64(len(n.data)), wire.KeyBlocks: uint64(0),
		wire.KeyAtimeNs: n.atime, wire.KeyMtimeNs: n.mtime, wire.KeyCtimeNs: n.mtime, wire.KeyBtimeNs: n.mtime,
		wire.KeyRdev: uint64(0), wire.KeyRev: n.rev, wire.KeyEtag: fmt.Sprint(n.ino, ":", n.rev),
	}
}

func wbRemote(code wire.ErrorCode) error { return &wire.RemoteError{Code: code} }

func (h *wbHub) Post(ctx context.Context, op wire.Op, meta wire.Meta, payload []byte) (wire.Posted, error) {
	return wire.PostByCall(ctx, h, op, meta, payload)
}

func (h *wbHub) Do(ctx context.Context, op wire.Op, meta wire.Meta, payload []byte) ([]wire.Reply, error) {
	r, err := h.Call(ctx, op, meta, payload)
	return []wire.Reply{r}, err
}

func (h *wbHub) Call(ctx context.Context, op wire.Op, meta wire.Meta, payload []byte) (wire.Reply, error) {
	if h.before != nil {
		if err := h.before(op, meta); err != nil {
			return wire.Reply{}, err
		}
	}
	h.mu.Lock()
	h.ops = append(h.ops, op.Name())
	if op == wire.OpWrite {
		h.inflight++
		h.peak = max(h.peak, h.inflight)
	}
	reply, err := h.handle(op, meta, payload)
	if op == wire.OpWrite {
		h.inflight--
	}
	h.mu.Unlock()
	if err == nil && h.after != nil {
		if aerr := h.after(op, meta); aerr != nil {
			return wire.Reply{}, aerr
		}
	}
	return reply, err
}

func wbKeyOf(meta wire.Meta) string {
	key, _ := meta.Bytes(wire.KeyOpKey)
	return fmt.Sprintf("%x", key)
}

func (h *wbHub) node(meta wire.Meta, key uint64) (*wbNode, error) {
	ino, err := meta.Uint(key)
	if err != nil {
		return nil, err
	}
	n := h.nodes[ino]
	if n == nil {
		return nil, wbRemote(wire.ErrENOENT)
	}
	return n, nil
}

func (h *wbHub) handle(op wire.Op, meta wire.Meta, payload []byte) (wire.Reply, error) {
	switch op {
	case wire.OpGetattr:
		n, err := h.node(meta, wire.KeyIno)
		if err != nil {
			return wire.Reply{}, err
		}
		return wire.Reply{Meta: wire.Meta{wire.KeyAttr: h.attr(n)}}, nil
	case wire.OpLookup:
		parent, _ := meta.Uint(wire.KeyParent)
		name, _ := meta.String(wire.KeyName)
		ino, ok := h.nodes[parent].names[name]
		if !ok {
			return wire.Reply{}, wbRemote(wire.ErrENOENT)
		}
		return wire.Reply{Meta: wire.Meta{wire.KeyIno: ino, wire.KeyAttr: h.attr(h.nodes[ino])}}, nil
	case wire.OpLease:
		count, _ := meta.Uint(wire.KeyCount)
		start := h.next + 1
		h.next += count
		return wire.Reply{Meta: wire.Meta{wire.KeyStart: start, wire.KeyCount: count}}, nil
	case wire.OpCreate, wire.OpMkdir:
		return h.made(op, meta, payload)
	case wire.OpTmpfile:
		h.next++
		n := &wbNode{ino: h.next, typ: wire.InodeTypeFile, rev: 1, mode: 0o644, nlink: 0, mtime: h.tick()}
		h.nodes[n.ino] = n
		return wire.Reply{Meta: wire.Meta{wire.KeyIno: n.ino, wire.KeyAttr: h.attr(n)}}, nil
	case wire.OpPut:
		key := wbKeyOf(meta)
		if done, ok := h.dedupe[key]; ok {
			return done, nil
		}
		n, err := h.node(meta, wire.KeyIno)
		if err != nil {
			return wire.Reply{}, err
		}
		base, _ := meta.Uint(wire.KeyBaseRev)
		if base != n.rev {
			return wire.Reply{}, &wire.RemoteError{Code: wire.ErrESTALE, Rev: n.rev, HasRev: true}
		}
		size, _ := meta.Uint(wire.KeySize)
		if uint64(len(payload)) != size {
			h.t.Errorf("put payload %d for size %d", len(payload), size)
		}
		n.data = bytes.Clone(payload)
		h.written += uint64(len(payload))
		return h.finish(key, n, meta), nil
	case wire.OpBegin:
		key := wbKeyOf(meta)
		if done, ok := h.dedupe[key]; ok {
			return done, nil
		}
		n, err := h.node(meta, wire.KeyIno)
		if err != nil {
			return wire.Reply{}, err
		}
		h.nextID++
		base, _ := meta.Uint(wire.KeyBaseRev)
		c := &wbCommit{id: h.nextID, ino: n.ino, base: base, chunks: map[uint64][]byte{}}
		h.commits[c.id] = c
		reply := wire.Reply{Meta: wire.Meta{wire.KeyCommit: c.id, wire.KeyRanges: []any{}}}
		h.dedupe[key] = reply
		return reply, nil
	case wire.OpWrite:
		id, _ := meta.Uint(wire.KeyCommit)
		off, _ := meta.Uint(wire.KeyOffset)
		c := h.commits[id]
		if c == nil {
			return wire.Reply{}, wbRemote(wire.ErrESTALE)
		}
		c.chunks[off] = bytes.Clone(payload)
		c.got.add(off, off+uint64(len(payload)))
		h.written += uint64(len(payload))
		return wire.Reply{Meta: wire.Meta{}}, nil
	case wire.OpAllocate:
		id, _ := meta.Uint(wire.KeyCommit)
		off, _ := meta.Uint(wire.KeyOffset)
		length, _ := meta.Uint(wire.KeyLength)
		c := h.commits[id]
		if c == nil {
			return wire.Reply{}, wbRemote(wire.ErrESTALE)
		}
		c.zeros.add(off, off+length)
		return wire.Reply{Meta: wire.Meta{}}, nil
	case wire.OpState:
		id, _ := meta.Uint(wire.KeyCommit)
		c := h.commits[id]
		if c == nil {
			return wire.Reply{Meta: wire.Meta{wire.KeyRanges: nil}}, nil
		}
		ranges := []any{}
		for _, s := range c.got.spans {
			ranges = append(ranges, []any{s[0], s[1] - s[0]})
		}
		return wire.Reply{Meta: wire.Meta{wire.KeyRanges: ranges}}, nil
	case wire.OpEnd:
		key := wbKeyOf(meta)
		if done, ok := h.dedupe[key]; ok {
			return done, nil
		}
		id, _ := meta.Uint(wire.KeyCommit)
		c := h.commits[id]
		if c == nil {
			return wire.Reply{}, wbRemote(wire.ErrESTALE)
		}
		covered := c.got.clone()
		for _, z := range c.zeros.spans {
			covered.add(z[0], z[1])
		}
		if length, _ := meta.Uint(wire.KeyLength); covered.total() != length {
			return wire.Reply{}, wbRemote(wire.ErrEAGAIN)
		}
		n := h.nodes[c.ino]
		if c.base != n.rev {
			return wire.Reply{}, &wire.RemoteError{Code: wire.ErrESTALE, Rev: n.rev, HasRev: true}
		}
		size, _ := meta.Uint(wire.KeySize)
		data := bytes.Clone(n.data)
		for len(data) < int(size) {
			data = append(data, 0)
		}
		for off, chunk := range c.chunks {
			for len(data) < int(off)+len(chunk) {
				data = append(data, 0)
			}
			copy(data[off:], chunk)
		}
		for _, z := range c.zeros.spans {
			for p := z[0]; p < z[1] && p < uint64(len(data)); p++ {
				data[p] = 0
			}
		}
		n.data = data[:size]
		return h.finish(key, n, meta), nil
	case wire.OpForget:
		ids, _ := meta.Array(wire.KeyCommits)
		for _, id := range ids {
			v, _ := wire.Meta{1: id}.Uint(1)
			h.forgot = append(h.forgot, v)
			delete(h.commits, v)
		}
		return wire.Reply{Meta: wire.Meta{}}, nil
	case wire.OpFsync:
		h.fsyncs++
		return wire.Reply{Meta: wire.Meta{}}, nil
	case wire.OpRename:
		parent, _ := meta.Uint(wire.KeyParent)
		name, _ := meta.String(wire.KeyName)
		np, _ := meta.Uint(wire.KeyNewParent)
		nn, _ := meta.String(wire.KeyNewName)
		ino := h.nodes[parent].names[name]
		delete(h.nodes[parent].names, name)
		h.nodes[np].names[nn] = ino
		return wire.Reply{Meta: wire.Meta{}}, nil
	case wire.OpSetattr:
		n, err := h.node(meta, wire.KeyIno)
		if err != nil {
			return wire.Reply{}, err
		}
		if meta.Has(wire.KeyMtime) {
			if v, ok := meta[wire.KeyMtime].(int64); ok {
				n.mtime = v
			}
		}
		if v, ok := meta[wire.KeyAtime].(int64); ok {
			n.atime = v
		}
		if meta.Has(wire.KeyMode) {
			mode, _ := meta.Uint(wire.KeyMode)
			n.mode = uint32(mode)
		}
		return wire.Reply{Meta: wire.Meta{wire.KeyAttr: h.attr(n)}}, nil
	case wire.OpLink:
		n, err := h.node(meta, wire.KeyIno)
		if err != nil {
			return wire.Reply{}, err
		}
		parent, _ := meta.Uint(wire.KeyParent)
		name, _ := meta.String(wire.KeyName)
		h.nodes[parent].names[name] = n.ino
		n.nlink++
		return wire.Reply{Meta: wire.Meta{wire.KeyAttr: h.attr(n)}}, nil
	case wire.OpSetlk, wire.OpUnlock:
		h.lockCalls = append(h.lockCalls, meta)
		return wire.Reply{Meta: wire.Meta{}}, nil
	case wire.OpUnlink, wire.OpRmdir:
		parent, _ := meta.Uint(wire.KeyParent)
		name, _ := meta.String(wire.KeyName)
		want, _ := meta.Uint(wire.KeyIno)
		ino, ok := h.nodes[parent].names[name]
		if !ok {
			return wire.Reply{}, wbRemote(wire.ErrENOENT)
		}
		if ino != want {
			return wire.Reply{}, wbRemote(wire.ErrESTALE)
		}
		if op == wire.OpRmdir && len(h.nodes[ino].names) > 0 {
			return wire.Reply{}, wbRemote(wire.ErrENOTEMPTY)
		}
		delete(h.nodes[parent].names, name)
		h.nodes[ino].nlink--
		if h.nodes[ino].nlink == 0 {
			delete(h.nodes, ino)
		}
		return wire.Reply{Meta: wire.Meta{}}, nil
	}
	h.t.Fatalf("fake hub: unhandled %s", op.Name())
	return wire.Reply{}, nil
}

func (h *wbHub) made(op wire.Op, meta wire.Meta, payload []byte) (wire.Reply, error) {
	key := wbKeyOf(meta)
	if done, ok := h.dedupe[key]; ok {
		return done, nil
	}
	parent, _ := meta.Uint(wire.KeyParent)
	name, _ := meta.String(wire.KeyName)
	ino, _ := meta.Uint(wire.KeyIno)
	mode, _ := meta.Uint(wire.KeyMode)
	dir := h.nodes[parent]
	if dir == nil || dir.typ != wire.InodeTypeDirectory {
		return wire.Reply{}, wbRemote(wire.ErrENOENT)
	}
	if _, taken := dir.names[name]; taken {
		return wire.Reply{}, wbRemote(wire.ErrEEXIST)
	}
	if _, taken := h.nodes[ino]; taken || ino > h.next {
		return wire.Reply{}, wbRemote(wire.ErrEINVAL)
	}
	mtime, _ := meta[wire.KeyMtimeNs].(int64)
	n := &wbNode{ino: ino, typ: wire.InodeTypeFile, rev: 1, mode: uint32(mode), nlink: 1, mtime: mtime, data: bytes.Clone(payload)}
	if op == wire.OpMkdir {
		n.typ, n.nlink, n.names = wire.InodeTypeDirectory, 2, map[string]uint64{}
	}
	h.nodes[ino] = n
	dir.names[name] = ino
	h.written += uint64(len(payload))
	reply := wire.Reply{Meta: wire.Meta{wire.KeyIno: ino, wire.KeyAttr: h.attr(n)}}
	h.dedupe[key] = reply
	return reply, nil
}

func (h *wbHub) finish(key string, n *wbNode, meta wire.Meta) wire.Reply {
	n.rev++
	h.tick()
	n.mtime = meta[wire.KeyMtimeNs].(int64)
	if v, ok := meta[wire.KeyAtimeNs].(int64); ok {
		n.atime = v
	}
	reply := wire.Reply{Meta: wire.Meta{wire.KeyAttr: h.attr(n), wire.KeyRev: n.rev}}
	h.dedupe[key] = reply
	return reply
}

type wbBase struct{ hub *wbHub }

type wbRead struct {
	data    []byte
	release func()
}

func (b wbBase) Open(_ context.Context, ino uint64) (ReadHandle, error) {
	b.hub.mu.Lock()
	defer b.hub.mu.Unlock()
	n := b.hub.nodes[ino]
	if n == nil {
		return nil, wbRemote(wire.ErrENOENT)
	}
	return &wbRead{data: bytes.Clone(n.data)}, nil
}

func (b wbBase) Getattr(ctx context.Context, ino uint64) (wire.Attr, error) {
	reply, err := b.hub.Call(ctx, wire.OpGetattr, wire.Meta{wire.KeyIno: ino}, nil)
	if err != nil {
		return wire.Attr{}, err
	}
	return reply.Meta.Attr(wire.KeyAttr)
}

func (b wbBase) Lookup(ctx context.Context, parent uint64, name string) (Entry, error) {
	reply, err := b.hub.Call(ctx, wire.OpLookup, wire.Meta{wire.KeyParent: parent, wire.KeyName: name}, nil)
	if err != nil {
		return Entry{}, err
	}
	return wire.ParseEntry(reply.Meta)
}

func (b wbBase) Readdir(_ context.Context, ino, _ uint64) (DirPage, error) {
	b.hub.mu.Lock()
	defer b.hub.mu.Unlock()
	n := b.hub.nodes[ino]
	if n == nil {
		return DirPage{}, wbRemote(wire.ErrENOENT)
	}
	var page DirPage
	for name, child := range n.names {
		page.Entries = append(page.Entries, wire.DirEntry{Name: name, Entry: Entry{Ino: child}})
	}
	return page, nil
}

type wbNames struct{}

func (wbNames) NoteLocal(uint64, string, wire.Entry) {}
func (wbNames) NoteLocalDir(uint64)                  {}
func (wbNames) NoteLocalGone(uint64, string, uint64) {}
func (wbNames) NoteName(uint64, string)              {}
func (wbNames) NoteChanged(uint64)                   {}
func (wbNames) RootIno(string) (uint64, bool)        { return 1, true }

func (r *wbRead) ReadAt(_ context.Context, dst []byte, off int64) (int, error) {
	if off >= int64(len(r.data)) {
		return 0, nil
	}
	return copy(dst, r.data[off:]), nil
}

func (r *wbRead) Seek(context.Context, int64, uint32) (int64, error) { return 0, nil }

func (r *wbRead) Release(context.Context) error { return nil }

type wbRig struct {
	t   *testing.T
	hub *wbHub
	w   *writeBack
	dir string
}

func newWbRig(t *testing.T) *wbRig {
	t.Helper()
	r := &wbRig{t: t, hub: newWbHub(t), dir: t.TempDir()}
	r.w = r.open()
	return r
}

func (r *wbRig) open() *writeBack {
	r.t.Helper()
	w, err := newWriteBack(writeConfig{Caller: r.hub, Base: wbBase{r.hub}, Names: wbNames{}, Dir: r.dir})
	if err != nil {
		r.t.Fatal(err)
	}
	r.t.Cleanup(w.Close)
	return w
}

func (r *wbRig) crash() {
	r.t.Helper()
	r.w.cancel()
	r.w.workers.Wait()
	for _, s := range r.w.sessions {
		s.closeFiles()
	}
}

func (r *wbRig) reopen() {
	r.t.Helper()
	r.crash()
	r.w = r.open()
}

func (r *wbRig) online() {
	r.w.SetReachable(true)
}

func (r *wbRig) drain() {
	r.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := r.w.Drain(ctx); err != nil {
		r.w.mu.Lock()
		var dump []string
		for ino, s := range r.w.sessions {
			s.mu.Lock()
			dump = append(dump, fmt.Sprintf("ino %d sealed %v sending %v queued %v handles %d needs %v resume %v failure %v wanted %d served %d", ino, s.sealed, s.sending, s.queued, s.handles, s.needsCommit(), s.resume != nil, s.failure, s.wanted, s.served))
			s.mu.Unlock()
		}
		r.w.mu.Unlock()
		r.t.Fatalf("drain: %v %v queue %d", err, dump, len(r.w.queue))
	}
}

func wbEventually(t *testing.T, what string, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !ok() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(5 * time.Millisecond)
	}
}
