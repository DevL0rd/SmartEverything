package main

import (
	"context"
	"fmt"
	"os"
	"slices"

	"github.com/smarteverything/drive-mount/wire"
)

func (c *blockCache) OnChange(fn func(Change)) {
	c.mu.Lock()
	c.changed = append(c.changed, fn)
	c.mu.Unlock()
}

func (c *blockCache) notify(change Change) {
	c.mu.Lock()
	subscribers := slices.Clone(c.changed)
	c.mu.Unlock()
	for _, fn := range subscribers {
		fn(change)
	}
}

func (c *blockCache) Seqs() []wire.RootSeq {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]wire.RootSeq, 0, len(c.roots))
	for id, rs := range c.roots {
		if rs.attached {
			out = append(out, wire.RootSeq{Root: id, Seq: rs.seq})
		}
	}
	slices.SortFunc(out, func(a, b wire.RootSeq) int {
		switch {
		case a.Root < b.Root:
			return -1
		case a.Root > b.Root:
			return 1
		}
		return 0
	})
	return out
}

func (c *blockCache) Handles() []wire.HeldHandle {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]wire.HeldHandle, 0, len(c.wires))
	for h := range c.wires {
		if id := h.id.Load(); id != 0 && !h.dead.Load() {
			out = append(out, wire.HeldHandle{Handle: id, Ino: h.ino})
		}
	}
	slices.SortFunc(out, func(a, b wire.HeldHandle) int {
		switch {
		case a.Handle < b.Handle:
			return -1
		case a.Handle > b.Handle:
			return 1
		}
		return 0
	})
	return out
}

func (c *blockCache) staleInodeLocked(in *inodeMeta) {
	in.attrEpoch = 0
	in.linkEpoch = 0
	in.gen++
	in.xattrs, in.xattrNames, in.hasNames = nil, nil, false
	for parent := range in.listed {
		if dir := c.inodes[parent]; dir != nil && dir.dir != nil {
			dir.dir.invalidate()
		}
	}
}

func (c *blockCache) staleDirLocked(dir *inodeMeta) {
	dir.attrEpoch = 0
	dir.gen++
	if dir.dir != nil {
		dir.dir.invalidate()
	}
}

func (c *blockCache) Changed(ch wire.Changed) {
	c.mu.Lock()
	if rs := c.roots[ch.Root]; rs != nil {
		rs.seq = ch.Seq
	}
	var reconcile []uint64
	for _, ino := range ch.Inodes {
		if in := c.inodes[ino]; in != nil {
			c.staleInodeLocked(in)
		}
		if c.byIno[ino] != nil {
			reconcile = append(reconcile, ino)
		}
	}
	for _, e := range ch.Entries {
		dir := c.inodes[e.Parent]
		if dir == nil {
			continue
		}
		if dir.dir != nil {
			delete(dir.dir.names, e.Name)
		}
		c.staleDirLocked(dir)
	}
	for _, ino := range ch.Removed {
		c.dropInodeLocked(ino)
	}
	c.touchRoot(ch.Root)
	c.mu.Unlock()
	for _, ino := range reconcile {
		c.spawn(func() { c.reconcile(ino) })
	}
	c.notify(Change{Root: ch.Root, Inodes: ch.Inodes, Entries: ch.Entries, Removed: ch.Removed})
}

func (c *blockCache) Reset(r wire.Reset) {
	c.mu.Lock()
	if rs := c.roots[r.Root]; rs != nil {
		rs.seq = r.Seq
		rs.epoch++
	}
	c.mu.Unlock()
	c.reconcileRoot(r.Root)
	c.notify(Change{Root: r.Root, Reset: true})
}

func (c *blockCache) reconcileRoot(root string) {
	c.mu.Lock()
	var pinned []uint64
	for _, f := range c.files {
		if f.st.Root == root && f.st.Pinned {
			pinned = append(pinned, f.st.Ino)
		}
	}
	c.mu.Unlock()
	for _, ino := range pinned {
		c.spawn(func() { c.reconcile(ino) })
	}
}

func (c *blockCache) reconcile(ino uint64) {
	if c.offline.Load() {
		return
	}
	if _, err := c.Getattr(c.ctx, ino); err != nil && !remoteCode(err, wire.ErrENOENT) && !unreachable(err) {
		fmt.Fprintln(os.Stderr, "cache revalidate:", ino, err)
	}
}

func (c *blockCache) Reestablish(ctx context.Context, call wire.Caller, resumed bool) error {
	if resumed {
		return nil
	}
	c.mu.Lock()
	type attached struct{ id, placement string }
	var roots []attached
	for id, rs := range c.roots {
		if rs.attached {
			roots = append(roots, attached{id, rs.placement})
		}
	}
	handles := make([]*wireHandle, 0, len(c.wires))
	for h := range c.wires {
		if h.id.Load() != 0 {
			handles = append(handles, h)
		}
	}
	c.mu.Unlock()
	var reset []string
	for _, r := range roots {
		reply, err := call.Call(ctx, wire.OpAttach, wire.Meta{wire.KeyPlacementId: r.placement}, nil)
		if err != nil {
			if unreachable(err) || !isRemote(err) {
				return err
			}
			continue
		}
		root, err := wire.ParseRoot(reply.Meta)
		if err != nil {
			return err
		}
		c.mu.Lock()
		rs := c.roots[r.id]
		rs.seq = root.Seq
		rs.epoch++
		c.applyAttrLocked(r.id, root.Attr, rs.epoch)
		c.mu.Unlock()
		reset = append(reset, r.id)
	}
	for _, h := range handles {
		if err := h.reopenWith(ctx, call); err != nil {
			return err
		}
	}
	for _, id := range reset {
		c.reconcileRoot(id)
		c.notify(Change{Root: id, Reset: true})
	}
	return nil
}

func isRemote(err error) bool {
	_, ok := wire.CodeOf(err)
	return ok
}

func (h *wireHandle) reopenWith(ctx context.Context, call wire.Caller) error {
	h.opening.Lock()
	defer h.opening.Unlock()
	if h.dead.Load() {
		return nil
	}
	err := h.openWith(ctx, call)
	if remoteCode(err, wire.ErrESTALE) || remoteCode(err, wire.ErrENOENT) {
		h.markDead(staleHandle())
		return nil
	}
	return err
}

func (c *blockCache) NoteAttr(attr wire.Attr) {
	c.mu.Lock()
	defer c.mu.Unlock()
	in := c.inodes[attr.Ino]
	if in == nil || in.root == "" {
		return
	}
	c.applyAttrLocked(in.root, attr, c.epochLocked(in.root))
	in.gen++
	for parent := range in.listed {
		if dir := c.inodes[parent]; dir != nil && dir.dir != nil {
			dir.dir.invalidate()
		}
	}
}

func (c *blockCache) NoteEntry(parent uint64, name string, entry wire.Entry) {
	c.mu.Lock()
	defer c.mu.Unlock()
	dir := c.inodes[parent]
	if dir == nil || dir.root == "" {
		return
	}
	if dir.dir == nil {
		dir.dir = &dirMeta{names: map[string]nameSlot{}}
	}
	epoch := c.epochLocked(dir.root)
	dir.dir.names[name] = nameSlot{ino: entry.Ino, epoch: epoch}
	c.applyAttrLocked(dir.root, entry.Attr, epoch).markListed(parent)
	c.staleDirLocked(dir)
}

func (c *blockCache) NoteGone(parent uint64, name string, ino uint64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	dir := c.inodes[parent]
	if dir == nil || dir.root == "" {
		return
	}
	if dir.dir == nil {
		dir.dir = &dirMeta{names: map[string]nameSlot{}}
	}
	dir.dir.names[name] = nameSlot{epoch: c.epochLocked(dir.root)}
	c.staleDirLocked(dir)
	if in := c.inodes[ino]; in != nil {
		c.staleInodeLocked(in)
	}
}

func (c *blockCache) NoteChanged(ino uint64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if in := c.inodes[ino]; in != nil {
		c.staleInodeLocked(in)
	}
}
