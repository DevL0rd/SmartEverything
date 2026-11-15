package main

import (
	"context"
	"errors"

	"github.com/smarteverything/drive-mount/wire"
)

func (c *blockCache) freshLocked(root string, epoch uint64) bool {
	rs := c.roots[root]
	return rs != nil && epoch == rs.epoch
}

func epochIf(fresh bool, epoch uint64) uint64 {
	if fresh {
		return epoch
	}
	return 0
}

func (c *blockCache) epochLocked(root string) uint64 {
	if rs := c.roots[root]; rs != nil {
		return rs.epoch
	}
	return 0
}

func (c *blockCache) once(ctx context.Context, key flightKey, fn func(context.Context) error) error {
	for {
		c.mu.Lock()
		if running, ok := c.flights[key]; ok {
			c.mu.Unlock()
			select {
			case <-running.done:
			case <-ctx.Done():
				return ctx.Err()
			}
			if errors.Is(running.err, context.Canceled) && ctx.Err() == nil {
				continue
			}
			return running.err
		}
		mine := &flight{done: make(chan struct{})}
		c.flights[key] = mine
		c.mu.Unlock()
		mine.err = fn(ctx)
		c.mu.Lock()
		delete(c.flights, key)
		c.mu.Unlock()
		close(mine.done)
		return mine.err
	}
}

func (c *blockCache) inodeLocked(ino uint64, root string) *inodeMeta {
	in := c.inodes[ino]
	if in == nil {
		in = &inodeMeta{ino: ino, root: root}
		c.inodes[ino] = in
	}
	if in.root == "" {
		in.root = root
	}
	return in
}

func (c *blockCache) applyAttrLocked(root string, attr wire.Attr, epoch uint64) *inodeMeta {
	in := c.inodeLocked(attr.Ino, root)
	if f := c.byIno[attr.Ino]; f != nil && (f.st.Etag != attr.Etag || f.st.Size != int64(attr.Size)) {
		pinned := f.st.Pinned
		c.discard(f)
		if pinned && !c.offline.Load() {
			c.spawn(func() { c.repin(attr.Ino) })
		}
	}
	in.attr, in.hasAttr = attr, true
	in.attrEpoch = epoch
	if in.root != "" {
		c.touchRoot(in.root)
	}
	return in
}

func (c *blockCache) rootOf(ino uint64) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	in := c.inodes[ino]
	if in == nil || in.root == "" {
		return "", false
	}
	return in.root, true
}

func (c *blockCache) Attach(ctx context.Context, placementID string) (wire.Root, error) {
	if c.startErr != nil {
		return wire.Root{}, c.startErr
	}
	if root, ok := c.attached(placementID); ok {
		return root, nil
	}
	if c.offline.Load() {
		if root, ok := c.persisted(placementID); ok {
			return root, nil
		}
		return wire.Root{}, errOffline
	}
	reply, err := c.call.Call(ctx, wire.OpAttach, wire.Meta{wire.KeyPlacementId: placementID}, nil)
	if err != nil {
		if unreachable(err) {
			if root, ok := c.persisted(placementID); ok {
				return root, nil
			}
		}
		return wire.Root{}, err
	}
	root, err := wire.ParseRoot(reply.Meta)
	if err != nil {
		return wire.Root{}, err
	}
	c.recordAttach(placementID, root)
	return root, nil
}

func (c *blockCache) attached(placementID string) (wire.Root, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for id, rs := range c.roots {
		in := c.inodes[rs.ino]
		if rs.placement == placementID && rs.attached && in != nil && in.hasAttr && c.freshLocked(id, in.attrEpoch) {
			return wire.Root{Root: id, Ino: rs.ino, Attr: in.attr, Seq: rs.seq}, true
		}
	}
	return wire.Root{}, false
}

func (c *blockCache) persisted(placementID string) (wire.Root, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for id, rs := range c.roots {
		if in := c.inodes[rs.ino]; rs.placement == placementID && in != nil && in.hasAttr {
			return wire.Root{Root: id, Ino: rs.ino, Attr: in.attr}, true
		}
	}
	return wire.Root{}, false
}

func (c *blockCache) recordAttach(placementID string, root wire.Root) {
	c.mu.Lock()
	defer c.mu.Unlock()
	rs := c.roots[root.Root]
	if rs == nil {
		rs = &rootState{id: root.Root, epoch: 1}
		c.roots[root.Root] = rs
	}
	rs.placement, rs.ino, rs.seq, rs.attached = placementID, root.Ino, root.Seq, true
	c.applyAttrLocked(root.Root, root.Attr, rs.epoch)
	c.touchRoot(root.Root)
}

func (c *blockCache) Getattr(ctx context.Context, ino uint64) (wire.Attr, error) {
	if c.startErr != nil {
		return wire.Attr{}, c.startErr
	}
	c.mu.Lock()
	in := c.inodes[ino]
	if in != nil && in.hasAttr && c.freshLocked(in.root, in.attrEpoch) {
		attr := in.attr
		c.mu.Unlock()
		return attr, nil
	}
	have := in != nil && in.hasAttr
	var stale wire.Attr
	if have {
		stale = in.attr
	}
	c.mu.Unlock()
	if c.offline.Load() {
		if have {
			return stale, nil
		}
		return wire.Attr{}, errOffline
	}
	err := c.once(ctx, flightKey{flightAttr, ino}, func(ctx context.Context) error { return c.fetchAttr(ctx, ino) })
	if err != nil {
		if have && unreachable(err) {
			return stale, nil
		}
		return wire.Attr{}, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	in = c.inodes[ino]
	if in == nil || !in.hasAttr {
		return wire.Attr{}, notFound()
	}
	return in.attr, nil
}

func (c *blockCache) fetchAttr(ctx context.Context, ino uint64) error {
	c.mu.Lock()
	var gen, epoch uint64
	root := ""
	if in := c.inodes[ino]; in != nil {
		gen, root = in.gen, in.root
		epoch = c.epochLocked(root)
	}
	c.mu.Unlock()
	reply, err := c.call.Call(ctx, wire.OpGetattr, wire.Meta{wire.KeyIno: ino}, nil)
	if err != nil {
		if remoteCode(err, wire.ErrENOENT) || remoteCode(err, wire.ErrESTALE) {
			c.forgetInode(ino)
		}
		return err
	}
	attr, err := reply.Meta.Attr(wire.KeyAttr)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	in := c.inodeLocked(ino, root)
	c.applyAttrLocked(in.root, attr, epochIf(in.gen == gen, epoch))
	return nil
}

func (c *blockCache) forgetInode(ino uint64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.dropInodeLocked(ino)
}

func (c *blockCache) dropInodeLocked(ino uint64) {
	in := c.inodes[ino]
	if f := c.byIno[ino]; f != nil {
		c.discard(f)
	}
	if in == nil {
		return
	}
	for parent := range in.listed {
		if dir := c.inodes[parent]; dir != nil && dir.dir != nil {
			dir.dir.invalidate()
		}
	}
	delete(c.inodes, ino)
	if in.root != "" {
		c.touchRoot(in.root)
	}
}

func (c *blockCache) Lookup(ctx context.Context, parent uint64, name string) (wire.Entry, error) {
	if c.startErr != nil {
		return wire.Entry{}, c.startErr
	}
	c.mu.Lock()
	dir := c.inodes[parent]
	if dir == nil || dir.dir == nil {
		c.mu.Unlock()
		return c.lookupRemote(ctx, parent, name, false, wire.Entry{})
	}
	slot, known := dir.dir.names[name]
	slotFresh := known && c.freshLocked(dir.root, slot.epoch)
	listFresh := dir.dir.complete && c.freshLocked(dir.root, dir.dir.epoch)
	if (slotFresh && slot.ino == 0) || (!known && listFresh) {
		c.mu.Unlock()
		return wire.Entry{}, notFound()
	}
	var cached wire.Entry
	haveCached := false
	if known && slot.ino != 0 {
		if child := c.inodes[slot.ino]; child != nil && child.hasAttr {
			cached = wire.Entry{Ino: slot.ino, Attr: child.attr}
			haveCached = true
			if slotFresh && c.freshLocked(child.root, child.attrEpoch) {
				c.mu.Unlock()
				return cached, nil
			}
		}
	}
	if !known && !listFresh && dir.dir.complete && c.offline.Load() {
		c.mu.Unlock()
		return wire.Entry{}, notFound()
	}
	c.mu.Unlock()
	if c.offline.Load() {
		if haveCached {
			return cached, nil
		}
		return wire.Entry{}, errOffline
	}
	return c.lookupRemote(ctx, parent, name, haveCached, cached)
}

func (c *blockCache) lookupRemote(ctx context.Context, parent uint64, name string, haveCached bool, cached wire.Entry) (wire.Entry, error) {
	c.mu.Lock()
	var gen, epoch uint64
	root := ""
	if dir := c.inodes[parent]; dir != nil {
		root = dir.root
		epoch = c.epochLocked(root)
		if dir.dir != nil {
			gen = dir.dir.gen
		}
	}
	c.mu.Unlock()
	reply, err := c.call.Call(ctx, wire.OpLookup, wire.Meta{wire.KeyParent: parent, wire.KeyName: name}, nil)
	if err != nil {
		switch {
		case remoteCode(err, wire.ErrENOENT):
			c.recordName(parent, root, name, nameSlot{}, gen, epoch, wire.Entry{})
		case haveCached && unreachable(err):
			return cached, nil
		}
		return wire.Entry{}, err
	}
	entry, err := wire.ParseEntry(reply.Meta)
	if err != nil {
		return wire.Entry{}, err
	}
	c.recordName(parent, root, name, nameSlot{ino: entry.Ino}, gen, epoch, entry)
	return entry, nil
}

func (c *blockCache) recordName(parent uint64, root, name string, slot nameSlot, gen, epoch uint64, entry wire.Entry) {
	c.mu.Lock()
	defer c.mu.Unlock()
	dir := c.inodeLocked(parent, root)
	if dir.dir == nil {
		dir.dir = &dirMeta{names: map[string]nameSlot{}}
	}
	epoch = epochIf(dir.dir.gen == gen, epoch)
	slot.epoch = epoch
	dir.dir.names[name] = slot
	if slot.ino != 0 {
		child := c.applyAttrLocked(dir.root, entry.Attr, epoch)
		child.markListed(parent)
	}
	c.touchRoot(dir.root)
}

func (c *blockCache) listing(ctx context.Context, ino uint64) ([]wire.DirEntry, error) {
	c.mu.Lock()
	dir := c.inodes[ino]
	if dir != nil && dir.dir != nil && dir.dir.complete && c.freshLocked(dir.root, dir.dir.epoch) {
		out := c.entriesLocked(dir)
		c.mu.Unlock()
		return out, nil
	}
	have := dir != nil && dir.dir != nil && dir.dir.complete
	c.mu.Unlock()
	if c.offline.Load() {
		return c.staleListing(ino, have)
	}
	err := c.once(ctx, flightKey{flightList, ino}, func(ctx context.Context) error { return c.fetchListing(ctx, ino) })
	if err != nil {
		if have && unreachable(err) {
			return c.staleListing(ino, have)
		}
		return nil, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	dir = c.inodes[ino]
	if dir == nil || dir.dir == nil {
		return nil, notFound()
	}
	return c.entriesLocked(dir), nil
}

func (c *blockCache) staleListing(ino uint64, have bool) ([]wire.DirEntry, error) {
	if !have {
		return nil, errOffline
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	dir := c.inodes[ino]
	if dir == nil || dir.dir == nil {
		return nil, notFound()
	}
	return c.entriesLocked(dir), nil
}

func (c *blockCache) entriesLocked(dir *inodeMeta) []wire.DirEntry {
	if dir.dir.snap != nil {
		return dir.dir.snap
	}
	out := make([]wire.DirEntry, 0, len(dir.dir.order))
	for _, name := range dir.dir.order {
		slot := dir.dir.names[name]
		child := c.inodes[slot.ino]
		if slot.ino == 0 || child == nil || !child.hasAttr {
			continue
		}
		out = append(out, wire.DirEntry{Name: name, Entry: wire.Entry{Ino: slot.ino, Attr: child.attr}})
	}
	dir.dir.snap = out
	return out
}

func (c *blockCache) fetchListing(ctx context.Context, ino uint64) error {
	c.mu.Lock()
	var gen, epoch uint64
	root := ""
	if dir := c.inodes[ino]; dir != nil {
		root = dir.root
		epoch = c.epochLocked(root)
		if dir.dir != nil {
			gen = dir.dir.gen
		}
	}
	c.mu.Unlock()
	var entries []wire.DirEntry
	cursor := uint64(0)
	for {
		reply, err := c.call.Call(ctx, wire.OpReaddir, wire.Meta{wire.KeyIno: ino, wire.KeyCursor: cursor}, nil)
		if err != nil {
			return err
		}
		page, err := wire.ParseDirPage(reply.Meta)
		if err != nil {
			return err
		}
		entries = append(entries, page.Entries...)
		if page.Next == nil {
			break
		}
		cursor = *page.Next
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	dir := c.inodeLocked(ino, root)
	if dir.dir == nil {
		dir.dir = &dirMeta{names: map[string]nameSlot{}}
	}
	slotEpoch := epochIf(dir.dir.gen == gen, epoch)
	dir.dir.snap = nil
	dir.dir.names = make(map[string]nameSlot, len(entries))
	dir.dir.order = make([]string, 0, len(entries))
	for _, e := range entries {
		dir.dir.names[e.Name] = nameSlot{ino: e.Ino, epoch: slotEpoch}
		dir.dir.order = append(dir.dir.order, e.Name)
		c.applyAttrLocked(dir.root, e.Attr, slotEpoch).markListed(ino)
	}
	dir.dir.complete = true
	dir.dir.epoch = slotEpoch
	c.touchRoot(dir.root)
	return nil
}

func (c *blockCache) Readdir(ctx context.Context, ino, cursor uint64) (wire.DirPage, error) {
	if c.startErr != nil {
		return wire.DirPage{}, c.startErr
	}
	entries, err := c.listing(ctx, ino)
	if err != nil {
		return wire.DirPage{}, err
	}
	if cursor >= uint64(len(entries)) {
		return wire.DirPage{}, nil
	}
	return wire.DirPage{Entries: entries[cursor:]}, nil
}

func (c *blockCache) Readlink(ctx context.Context, ino uint64) (string, error) {
	if c.startErr != nil {
		return "", c.startErr
	}
	c.mu.Lock()
	in := c.inodes[ino]
	if in != nil && in.hasLink && c.freshLocked(in.root, in.linkEpoch) {
		target := in.link
		c.mu.Unlock()
		return target, nil
	}
	have := in != nil && in.hasLink
	stale := ""
	if have {
		stale = in.link
	}
	var gen, epoch uint64
	root := ""
	if in != nil {
		gen, root = in.gen, in.root
		epoch = c.epochLocked(root)
	}
	c.mu.Unlock()
	if c.offline.Load() {
		if have {
			return stale, nil
		}
		return "", errOffline
	}
	reply, err := c.call.Call(ctx, wire.OpReadlink, wire.Meta{wire.KeyIno: ino}, nil)
	if err != nil {
		if have && unreachable(err) {
			return stale, nil
		}
		return "", err
	}
	target, err := reply.Meta.String(wire.KeyTarget)
	if err != nil {
		return "", err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	in = c.inodeLocked(ino, root)
	in.link, in.hasLink = target, true
	in.linkEpoch = epochIf(in.gen == gen, epoch)
	if in.root != "" {
		c.touchRoot(in.root)
	}
	return target, nil
}

func (c *blockCache) Statfs(ctx context.Context, ino uint64) (wire.Statfs, error) {
	if c.startErr != nil {
		return wire.Statfs{}, c.startErr
	}
	root, _ := c.rootOf(ino)
	remembered := func() (wire.Statfs, bool) {
		c.mu.Lock()
		defer c.mu.Unlock()
		if rs := c.roots[root]; rs != nil && rs.hasSpace {
			return rs.space, true
		}
		return wire.Statfs{}, false
	}
	if c.offline.Load() {
		if space, ok := remembered(); ok {
			return space, nil
		}
		return wire.Statfs{}, errOffline
	}
	reply, err := c.call.Call(ctx, wire.OpStatfs, wire.Meta{wire.KeyIno: ino}, nil)
	if err != nil {
		if unreachable(err) {
			if space, ok := remembered(); ok {
				return space, nil
			}
		}
		return wire.Statfs{}, err
	}
	space, err := wire.ParseStatfs(reply.Meta)
	if err != nil {
		return wire.Statfs{}, err
	}
	c.mu.Lock()
	if rs := c.roots[root]; rs != nil {
		rs.space, rs.hasSpace = space, true
	}
	c.mu.Unlock()
	return space, nil
}

func (c *blockCache) Getxattr(ctx context.Context, ino uint64, name string) ([]byte, error) {
	if c.startErr != nil {
		return nil, c.startErr
	}
	c.mu.Lock()
	in := c.inodes[ino]
	if in != nil && in.xattrs != nil && c.freshLocked(in.root, in.xattrEpoch) {
		if slot, ok := in.xattrs[name]; ok {
			c.mu.Unlock()
			if slot.absent {
				return nil, &wire.RemoteError{Code: wire.ErrENODATA}
			}
			return append([]byte(nil), slot.value...), nil
		}
	}
	var gen uint64
	root := ""
	if in != nil {
		gen, root = in.gen, in.root
	}
	c.mu.Unlock()
	if c.offline.Load() {
		return nil, errOffline
	}
	reply, err := c.call.Call(ctx, wire.OpGetxattr, wire.Meta{wire.KeyIno: ino, wire.KeyName: name}, nil)
	if err != nil && !remoteCode(err, wire.ErrENODATA) {
		return nil, err
	}
	slot := xattrSlot{absent: err != nil}
	if err == nil {
		slot.value = append([]byte(nil), reply.Payload...)
	}
	c.rememberXattr(ino, root, gen, func(in *inodeMeta) { in.xattrs[name] = slot })
	if slot.absent {
		return nil, err
	}
	return append([]byte(nil), slot.value...), nil
}

func (c *blockCache) rememberXattr(ino uint64, root string, gen uint64, set func(*inodeMeta)) {
	c.mu.Lock()
	defer c.mu.Unlock()
	in := c.inodeLocked(ino, root)
	if in.gen != gen || in.root == "" {
		return
	}
	epoch := c.epochLocked(in.root)
	if in.xattrs == nil || in.xattrEpoch != epoch {
		in.xattrs, in.xattrNames, in.hasNames = map[string]xattrSlot{}, nil, false
		in.xattrEpoch = epoch
	}
	set(in)
}

func (c *blockCache) Listxattr(ctx context.Context, ino uint64) ([]string, error) {
	if c.startErr != nil {
		return nil, c.startErr
	}
	c.mu.Lock()
	in := c.inodes[ino]
	if in != nil && in.hasNames && c.freshLocked(in.root, in.xattrEpoch) {
		names := append([]string(nil), in.xattrNames...)
		c.mu.Unlock()
		return names, nil
	}
	var gen uint64
	root := ""
	if in != nil {
		gen, root = in.gen, in.root
	}
	c.mu.Unlock()
	if c.offline.Load() {
		return nil, errOffline
	}
	reply, err := c.call.Call(ctx, wire.OpListxattr, wire.Meta{wire.KeyIno: ino}, nil)
	if err != nil {
		return nil, err
	}
	names, err := wire.ParseNames(reply.Meta)
	if err != nil {
		return nil, err
	}
	c.rememberXattr(ino, root, gen, func(in *inodeMeta) {
		in.xattrNames, in.hasNames = append([]string(nil), names...), true
	})
	return names, nil
}
