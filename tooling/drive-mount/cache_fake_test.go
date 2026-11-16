package main

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"testing"

	"github.com/smarteverything/drive-mount/wire"
)

type fakeNode struct {
	ino      uint64
	typ      uint8
	children map[string]uint64
	data     []byte
	size     uint64
	target   string
	xattrs   map[string][]byte
	rev      uint64
}

type fakeHub struct {
	mu          sync.Mutex
	nodes       map[uint64]*fakeNode
	next        uint64
	handles     map[uint64]uint64
	nextHandle  uint64
	calls       map[wire.Op]int
	root        string
	placement   string
	rootIno     uint64
	down        error
	pageSize    int
	lastRead    int
	readHook    func(op wire.Op, meta wire.Meta) error
	space       wire.Statfs
	attachCount int
}

func newFakeHub() *fakeHub {
	h := &fakeHub{
		nodes: map[uint64]*fakeNode{}, handles: map[uint64]uint64{}, calls: map[wire.Op]int{},
		root: "11111111-1111-4111-8111-111111111111", placement: "22222222-2222-4222-8222-222222222222",
		pageSize: 2, nextHandle: 100, space: wire.Statfs{Blocks: 100, Free: 60, Avail: 50, Files: 10, Ffree: 5, Bsize: 4096, Namelen: 255},
	}
	h.rootIno = h.add(wire.InodeTypeDirectory)
	return h
}

func (h *fakeHub) add(typ uint8) uint64 {
	h.next++
	n := &fakeNode{ino: h.next, typ: typ, rev: 1, xattrs: map[string][]byte{}}
	if typ == wire.InodeTypeDirectory {
		n.children = map[string]uint64{}
	}
	h.nodes[n.ino] = n
	return n.ino
}

func (h *fakeHub) file(parent uint64, name string, content []byte) uint64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	ino := h.add(wire.InodeTypeFile)
	h.nodes[ino].data = content
	h.nodes[ino].size = uint64(len(content))
	h.nodes[parent].children[name] = ino
	return ino
}

func (h *fakeHub) generated(parent uint64, name string, size uint64) uint64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	ino := h.add(wire.InodeTypeFile)
	h.nodes[ino].size = size
	h.nodes[parent].children[name] = ino
	return ino
}

func (h *fakeHub) dir(parent uint64, name string) uint64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	ino := h.add(wire.InodeTypeDirectory)
	h.nodes[parent].children[name] = ino
	return ino
}

func (h *fakeHub) link(parent uint64, name, target string) uint64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	ino := h.add(wire.InodeTypeSymlink)
	h.nodes[ino].target = target
	h.nodes[parent].children[name] = ino
	return ino
}

func (h *fakeHub) rewrite(ino uint64, content []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := h.nodes[ino]
	n.data, n.size = content, uint64(len(content))
	n.rev++
}

func (h *fakeHub) remove(parent uint64, name string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.nodes[parent].children, name)
}

func (h *fakeHub) setDown(err error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.down = err
}

func (h *fakeHub) expireSession() {
	h.mu.Lock()
	defer h.mu.Unlock()
	clear(h.handles)
}

func (h *fakeHub) count(op wire.Op) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.calls[op]
}

func (h *fakeHub) openHandles() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.handles)
}

func (n *fakeNode) attr() wire.Meta {
	mode := uint64(0o644)
	if n.typ == wire.InodeTypeDirectory {
		mode = 0o755
	}
	return wire.Meta{
		wire.KeyIno: n.ino, wire.KeyType: uint64(n.typ), wire.KeyMode: mode, wire.KeyNlink: uint64(1),
		wire.KeyUid: nil, wire.KeyGid: nil, wire.KeySize: n.size, wire.KeyBlocks: uint64(0),
		wire.KeyAtimeNs: int64(1), wire.KeyMtimeNs: int64(2), wire.KeyCtimeNs: int64(3), wire.KeyBtimeNs: int64(4),
		wire.KeyRdev: uint64(0), wire.KeyRev: n.rev, wire.KeyEtag: fmt.Sprintf("e%d-%d", n.ino, n.rev),
	}
}

func normalise(m wire.Meta) (wire.Meta, error) {
	raw, err := wire.EncodeMeta(m)
	if err != nil {
		return nil, err
	}
	return wire.DecodeMeta(raw)
}

func (h *fakeHub) Post(ctx context.Context, op wire.Op, meta wire.Meta, payload []byte) (wire.Posted, error) {
	return wire.PostByCall(ctx, h, op, meta, payload)
}

func (h *fakeHub) Do(ctx context.Context, op wire.Op, meta wire.Meta, payload []byte) ([]wire.Reply, error) {
	reply, err := h.Call(ctx, op, meta, payload)
	if err != nil {
		return nil, err
	}
	return []wire.Reply{reply}, nil
}

func (h *fakeHub) Call(_ context.Context, op wire.Op, meta wire.Meta, payload []byte) (wire.Reply, error) {
	req, err := normalise(meta)
	if err != nil {
		return wire.Reply{}, err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.calls[op]++
	if h.down != nil {
		return wire.Reply{}, h.down
	}
	if h.readHook != nil {
		if err := h.readHook(op, req); err != nil {
			return wire.Reply{}, err
		}
	}
	out, body, err := h.handle(op, req)
	if err != nil {
		return wire.Reply{}, err
	}
	reply, err := normalise(out)
	return wire.Reply{Meta: reply, Payload: body}, err
}

func remote(code wire.ErrorCode) error { return &wire.RemoteError{Code: code} }

func (h *fakeHub) node(req wire.Meta, key uint64) (*fakeNode, error) {
	ino, err := req.Uint(key)
	if err != nil {
		return nil, err
	}
	n := h.nodes[ino]
	if n == nil {
		return nil, remote(wire.ErrENOENT)
	}
	return n, nil
}

func (h *fakeHub) handle(op wire.Op, req wire.Meta) (wire.Meta, []byte, error) {
	switch op {
	case wire.OpAttach:
		h.attachCount++
		n := h.nodes[h.rootIno]
		return wire.Meta{wire.KeyRoot: h.root, wire.KeyIno: n.ino, wire.KeyAttr: n.attr(), wire.KeySeq: uint64(7)}, nil, nil
	case wire.OpLookup:
		parent, err := h.node(req, wire.KeyParent)
		if err != nil {
			return nil, nil, err
		}
		name, _ := req.String(wire.KeyName)
		child, ok := parent.children[name]
		if !ok {
			return nil, nil, remote(wire.ErrENOENT)
		}
		return wire.Meta{wire.KeyIno: child, wire.KeyAttr: h.nodes[child].attr()}, nil, nil
	case wire.OpGetattr:
		n, err := h.node(req, wire.KeyIno)
		if err != nil {
			return nil, nil, err
		}
		return wire.Meta{wire.KeyAttr: n.attr()}, nil, nil
	case wire.OpReaddir:
		return h.readdir(req)
	case wire.OpReadlink:
		n, err := h.node(req, wire.KeyIno)
		if err != nil {
			return nil, nil, err
		}
		return wire.Meta{wire.KeyTarget: n.target}, nil, nil
	case wire.OpStatfs:
		s := h.space
		return wire.Meta{
			wire.KeyBlocks: s.Blocks, wire.KeyFree: s.Free, wire.KeyAvail: s.Avail, wire.KeyFiles: s.Files,
			wire.KeyFfree: s.Ffree, wire.KeyBsize: uint64(s.Bsize), wire.KeyNamelen: uint64(s.Namelen),
		}, nil, nil
	case wire.OpGetxattr:
		n, err := h.node(req, wire.KeyIno)
		if err != nil {
			return nil, nil, err
		}
		name, _ := req.String(wire.KeyName)
		value, ok := n.xattrs[name]
		if !ok {
			return nil, nil, remote(wire.ErrENODATA)
		}
		return wire.Meta{}, value, nil
	case wire.OpListxattr:
		n, err := h.node(req, wire.KeyIno)
		if err != nil {
			return nil, nil, err
		}
		names := make([]any, 0, len(n.xattrs))
		keys := make([]string, 0, len(n.xattrs))
		for k := range n.xattrs {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			names = append(names, k)
		}
		return wire.Meta{wire.KeyNames: names}, nil, nil
	case wire.OpOpen:
		n, err := h.node(req, wire.KeyIno)
		if err != nil {
			return nil, nil, err
		}
		h.nextHandle++
		h.handles[h.nextHandle] = n.ino
		return wire.Meta{wire.KeyHandle: h.nextHandle}, nil, nil
	case wire.OpRead:
		return h.read(req)
	case wire.OpRelease:
		id, _ := req.Uint(wire.KeyHandle)
		delete(h.handles, id)
		return wire.Meta{}, nil, nil
	case wire.OpSeek:
		off, _ := req.Uint(wire.KeyOffset)
		return wire.Meta{wire.KeyOffset: off}, nil, nil
	}
	return nil, nil, fmt.Errorf("fake hub: unhandled %s", op.Name())
}

func (h *fakeHub) readdir(req wire.Meta) (wire.Meta, []byte, error) {
	n, err := h.node(req, wire.KeyIno)
	if err != nil {
		return nil, nil, err
	}
	cursor, _ := req.Uint(wire.KeyCursor)
	names := make([]string, 0, len(n.children))
	for name := range n.children {
		names = append(names, name)
	}
	sort.Strings(names)
	end := min(len(names), int(cursor)+h.pageSize)
	items := make([]any, 0)
	for _, name := range names[min(int(cursor), len(names)):end] {
		child := h.nodes[n.children[name]]
		items = append(items, []any{name, child.ino, child.attr()})
	}
	out := wire.Meta{wire.KeyEntries: items, wire.KeyNext: nil}
	if end < len(names) {
		out[wire.KeyNext] = uint64(end)
	}
	return out, nil, nil
}

func generatedByte(i uint64) byte { return byte(i % 251) }

func (h *fakeHub) read(req wire.Meta) (wire.Meta, []byte, error) {
	id, _ := req.Uint(wire.KeyHandle)
	ino, ok := h.handles[id]
	if !ok {
		return nil, nil, remote(wire.ErrESTALE)
	}
	off, _ := req.Uint(wire.KeyOffset)
	length, _ := req.Uint(wire.KeyLength)
	n := h.nodes[ino]
	h.lastRead = int(length)
	if off >= n.size {
		return wire.Meta{}, nil, nil
	}
	end := min(n.size, off+length)
	if n.data == nil {
		out := make([]byte, end-off)
		for i := range out {
			out[i] = generatedByte(off + uint64(i))
		}
		return wire.Meta{}, out, nil
	}
	return wire.Meta{}, append([]byte(nil), n.data[off:end]...), nil
}

func pattern(size int) []byte {
	out := make([]byte, size)
	for i := range out {
		out[i] = generatedByte(uint64(i))
	}
	return out
}

func cacheDirFor(t *testing.T) string {
	t.Helper()
	return t.TempDir()
}

func newTestCache(t *testing.T, hub *fakeHub, dir string) *blockCache {
	t.Helper()
	c := newBlockCache(hub, dir)
	if err := c.Ready(); err != nil {
		t.Fatalf("cache not ready: %v", err)
	}
	t.Cleanup(c.Close)
	return c
}

func attached(t *testing.T, hub *fakeHub, dir string) (*blockCache, wire.Root) {
	t.Helper()
	c := newTestCache(t, hub, dir)
	root, err := c.Attach(context.Background(), hub.placement)
	if err != nil {
		t.Fatal(err)
	}
	return c, root
}

func lookup(t *testing.T, c *blockCache, parent uint64, name string) wire.Entry {
	t.Helper()
	e, err := c.Lookup(context.Background(), parent, name)
	if err != nil {
		t.Fatalf("lookup %s: %v", name, err)
	}
	return e
}

func openFile(t *testing.T, c *blockCache, ino uint64) ReadHandle {
	t.Helper()
	h, err := c.Open(context.Background(), ino)
	if err != nil {
		t.Fatalf("open %d: %v", ino, err)
	}
	t.Cleanup(func() { h.Release(context.Background()) })
	return h
}

func readAll(t *testing.T, h ReadHandle, off int64, n int) []byte {
	t.Helper()
	buf := make([]byte, n)
	got, err := h.ReadAt(context.Background(), buf, off)
	if err != nil {
		t.Fatalf("read @%d: %v", off, err)
	}
	return buf[:got]
}

func present(c *blockCache, ino uint64, idx int64) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	f := c.byIno[ino]
	return f != nil && f.has(idx)
}
