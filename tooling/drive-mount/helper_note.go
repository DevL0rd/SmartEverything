package main

import "context"

func (c *blockCache) RootOf(ino uint64) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	if in := c.inodes[ino]; in != nil {
		return in.root
	}
	return ""
}

func (c *blockCache) NameOf(ino uint64) (uint64, string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	in := c.inodes[ino]
	if in == nil {
		return 0, "", false
	}
	for parent := range in.listed {
		dir := c.inodes[parent]
		if dir == nil || dir.dir == nil {
			continue
		}
		for name, slot := range dir.dir.names {
			if slot.ino == ino {
				return parent, name, true
			}
		}
	}
	return 0, "", false
}

func (c *blockCache) NoteName(parent uint64, name string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	dir := c.inodes[parent]
	if dir == nil {
		return
	}
	if dir.dir != nil {
		delete(dir.dir.names, name)
	}
	c.staleDirLocked(dir)
}

type noteWrites struct {
	InodeWriter
	cache *blockCache
}

func (n noteWrites) made(parent uint64, name string, entry Entry) {
	n.cache.NoteEntry(parent, name, entry)
	n.cache.NoteChanged(parent)
}

func (n noteWrites) Create(ctx context.Context, args CreateArgs) (Entry, InodeWriteHandle, error) {
	entry, handle, err := n.InodeWriter.Create(ctx, args)
	if err == nil {
		n.made(args.Parent, args.Name, entry)
	}
	return entry, handle, err
}

func (n noteWrites) Mkdir(ctx context.Context, args CreateArgs) (Entry, error) {
	entry, err := n.InodeWriter.Mkdir(ctx, args)
	if err == nil {
		n.made(args.Parent, args.Name, entry)
	}
	return entry, err
}

func (n noteWrites) Mknod(ctx context.Context, args CreateArgs) (Entry, error) {
	entry, err := n.InodeWriter.Mknod(ctx, args)
	if err == nil {
		n.made(args.Parent, args.Name, entry)
	}
	return entry, err
}

func (n noteWrites) Symlink(ctx context.Context, args CreateArgs) (Entry, error) {
	entry, err := n.InodeWriter.Symlink(ctx, args)
	if err == nil {
		n.made(args.Parent, args.Name, entry)
	}
	return entry, err
}

func (n noteWrites) Link(ctx context.Context, ino, parent uint64, name string) (Attr, error) {
	attr, err := n.InodeWriter.Link(ctx, ino, parent, name)
	if err == nil {
		n.made(parent, name, Entry{Ino: attr.Ino, Attr: attr})
		n.cache.NoteAttr(attr)
	}
	return attr, err
}

func (n noteWrites) victim(ctx context.Context, parent uint64, name string) uint64 {
	entry, err := n.cache.Lookup(ctx, parent, name)
	if err != nil {
		return 0
	}
	return entry.Ino
}

func (n noteWrites) Unlink(ctx context.Context, parent uint64, name string) error {
	ino := n.victim(ctx, parent, name)
	err := n.InodeWriter.Unlink(ctx, parent, name)
	if err == nil {
		n.cache.NoteGone(parent, name, ino)
		n.cache.NoteChanged(parent)
	}
	return err
}

func (n noteWrites) Rmdir(ctx context.Context, parent uint64, name string) error {
	ino := n.victim(ctx, parent, name)
	err := n.InodeWriter.Rmdir(ctx, parent, name)
	if err == nil {
		n.cache.NoteGone(parent, name, ino)
		n.cache.NoteChanged(parent)
	}
	return err
}

func (n noteWrites) Rename(ctx context.Context, args RenameArgs) error {
	source := n.victim(ctx, args.Parent, args.Name)
	target := n.victim(ctx, args.NewParent, args.NewName)
	if err := n.InodeWriter.Rename(ctx, args); err != nil {
		return err
	}
	n.cache.NoteName(args.Parent, args.Name)
	n.cache.NoteName(args.NewParent, args.NewName)
	n.cache.NoteChanged(args.Parent)
	n.cache.NoteChanged(args.NewParent)
	for _, ino := range []uint64{source, target} {
		if ino != 0 {
			n.cache.NoteChanged(ino)
		}
	}
	return nil
}

func (n noteWrites) Setattr(ctx context.Context, args SetattrArgs) (Attr, error) {
	return n.InodeWriter.Setattr(ctx, args)
}

func (n noteWrites) Setxattr(ctx context.Context, ino uint64, name string, value []byte, flags uint32) error {
	err := n.InodeWriter.Setxattr(ctx, ino, name, value, flags)
	if err == nil {
		n.cache.NoteChanged(ino)
	}
	return err
}

func (n noteWrites) Removexattr(ctx context.Context, ino uint64, name string) error {
	err := n.InodeWriter.Removexattr(ctx, ino, name)
	if err == nil {
		n.cache.NoteChanged(ino)
	}
	return err
}
