package main

import (
	"slices"

	"github.com/smarteverything/drive-mount/wire"
)

func (c *blockCache) NoteLocal(parent uint64, name string, entry wire.Entry) {
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
	prior, known := dir.dir.names[name]
	if !known || (prior.ino == 0 && !slices.Contains(dir.dir.order, name)) {
		dir.dir.order = append(dir.dir.order, name)
	}
	dir.dir.names[name] = nameSlot{ino: entry.Ino, epoch: epoch}
	dir.dir.snap = nil
	c.applyAttrLocked(dir.root, entry.Attr, epoch).markListed(parent)
	c.touchRoot(dir.root)
}

func (c *blockCache) NoteLocalDir(ino uint64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	in := c.inodes[ino]
	if in == nil || in.root == "" {
		return
	}
	if in.dir == nil {
		in.dir = &dirMeta{names: map[string]nameSlot{}}
	}
	in.dir.complete = true
	in.dir.epoch = c.epochLocked(in.root)
	in.dir.snap = nil
}

func (c *blockCache) NoteLocalGone(parent uint64, name string, ino uint64) {
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
	dir.dir.snap = nil
	if in := c.inodes[ino]; in != nil {
		delete(in.listed, parent)
		if len(in.listed) == 0 {
			c.dropInodeLocked(ino)
		}
	}
	c.touchRoot(dir.root)
}

func (c *blockCache) RootIno(root string) (uint64, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	rs := c.roots[root]
	if rs == nil || rs.ino == 0 {
		return 0, false
	}
	return rs.ino, true
}
