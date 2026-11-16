package main

import (
	"context"
	"syscall"

	"github.com/smarteverything/drive-mount/wire"
)

func (w *writeBack) Mkdir(ctx context.Context, args CreateArgs) (Entry, error) {
	p, err := w.ns.make(nameMkdir, args, w.rootOfDir(args.Parent))
	if err != nil {
		return Entry{}, err
	}
	return Entry{Ino: p.Ino, Attr: w.ns.attrOf(p)}, nil
}

func (w *writeBack) Mknod(ctx context.Context, args CreateArgs) (Entry, error) {
	return w.makeEntry(ctx, wire.OpMknod, wire.Meta{
		wire.KeyParent: args.Parent, wire.KeyName: args.Name, wire.KeyMode: uint64(args.Mode),
		wire.KeyType: uint64(args.Type), wire.KeyRdev: uint64(args.Rdev),
		wire.KeyUid: optID(args.UID), wire.KeyGid: optID(args.GID),
	})
}

func (w *writeBack) Symlink(ctx context.Context, args CreateArgs) (Entry, error) {
	return w.makeEntry(ctx, wire.OpSymlink, wire.Meta{
		wire.KeyParent: args.Parent, wire.KeyName: args.Name, wire.KeyTarget: args.Target,
		wire.KeyUid: optID(args.UID), wire.KeyGid: optID(args.GID),
	})
}

func (w *writeBack) makeEntry(ctx context.Context, op wire.Op, meta wire.Meta) (Entry, error) {
	if err := w.ns.drain(ctx); err != nil {
		return Entry{}, err
	}
	reply, err := w.mutate(ctx, op, meta, nil)
	if err != nil {
		return Entry{}, err
	}
	return wire.ParseEntry(reply.Meta)
}

func (w *writeBack) victim(ctx context.Context, parent uint64, name string) (Entry, error) {
	if w.ns.goneAt(parent, name) {
		return Entry{}, notFound()
	}
	if p := w.ns.madeAt(parent, name); p != nil {
		return Entry{Ino: p.Ino, Attr: w.ns.attrOf(p)}, nil
	}
	if w.ns.made(parent) != nil {
		return Entry{}, notFound()
	}
	return w.lookupBase(ctx, parent, name)
}

func (w *writeBack) Unlink(ctx context.Context, parent uint64, name string) error {
	victim, err := w.victim(ctx, parent, name)
	if err != nil {
		return err
	}
	if victim.Attr.Type == wire.InodeTypeDirectory {
		return syscall.EISDIR
	}
	if victim.Attr.Nlink <= 1 {
		w.orphaned(victim.Ino)
	}
	if made := w.ns.madeAt(parent, name); made != nil && made.Ino == victim.Ino && w.ns.cancel(made) {
		w.broadcast()
		return nil
	}
	return w.ns.addRemoval(nameEntry{Kind: nameUnlink, Ino: victim.Ino, Parent: parent, Name: name, Root: w.rootOfDir(parent)}, victim.Attr)
}

func (w *writeBack) Rmdir(ctx context.Context, parent uint64, name string) error {
	victim, err := w.victim(ctx, parent, name)
	if err != nil {
		return err
	}
	if victim.Attr.Type != wire.InodeTypeDirectory {
		return syscall.ENOTDIR
	}
	if err := w.requireEmpty(ctx, victim.Ino); err != nil {
		return err
	}
	if made := w.ns.madeAt(parent, name); made != nil && made.Ino == victim.Ino && w.ns.cancel(made) {
		w.broadcast()
		return nil
	}
	return w.ns.addRemoval(nameEntry{Kind: nameRmdir, Ino: victim.Ino, Parent: parent, Name: name, Root: w.rootOfDir(parent)}, victim.Attr)
}

func (w *writeBack) requireEmpty(ctx context.Context, ino uint64) error {
	if len(w.ns.children(ino)) > 0 {
		return syscall.ENOTEMPTY
	}
	if w.ns.made(ino) != nil {
		return nil
	}
	page, err := w.listBase(ctx, ino)
	if err != nil {
		return err
	}
	for _, e := range page.Entries {
		if !w.ns.goneAt(ino, e.Name) {
			return syscall.ENOTEMPTY
		}
	}
	return nil
}

func (w *writeBack) Setxattr(ctx context.Context, ino uint64, name string, value []byte, flags uint32) error {
	if err := w.ns.settle(ctx, ino); err != nil {
		return err
	}
	_, err := w.mutate(ctx, wire.OpSetxattr, wire.Meta{wire.KeyIno: ino, wire.KeyName: name, wire.KeyFlags: uint64(flags)}, value)
	return err
}

func (w *writeBack) Removexattr(ctx context.Context, ino uint64, name string) error {
	if err := w.ns.settle(ctx, ino); err != nil {
		return err
	}
	_, err := w.mutate(ctx, wire.OpRemovexattr, wire.Meta{wire.KeyIno: ino, wire.KeyName: name}, nil)
	return err
}

func lockMeta(args LockArgs) wire.Meta {
	return wire.Meta{
		wire.KeyIno: args.Ino, wire.KeyOwner: args.Owner, wire.KeyType: uint64(args.Type),
		wire.KeyStart: args.Start, wire.KeyEnd: args.End, wire.KeyPid: uint64(args.Pid),
	}
}

func (w *writeBack) Getlk(ctx context.Context, args LockArgs) (*Lock, error) {
	if err := w.ns.settle(ctx, args.Ino); err != nil {
		return nil, err
	}
	reply, err := w.ask(ctx, wire.OpGetlk, lockMeta(args))
	if err != nil {
		return nil, err
	}
	return wire.ParseLock(reply.Meta[wire.KeyLock])
}

func (w *writeBack) Setlk(ctx context.Context, args LockArgs) error {
	if err := w.ns.settle(ctx, args.Ino); err != nil {
		return err
	}
	meta := lockMeta(args)
	meta[wire.KeyWait] = args.Wait
	meta[wire.KeyFlock] = args.Flock
	if _, err := w.ask(ctx, wire.OpSetlk, meta); err != nil {
		return err
	}
	w.locks.record(lockKey{args.Ino, args.Owner}, heldRange{args.Start, args.End, args.Type, args.Pid, args.Flock})
	return w.rebaseIdle(ctx, args.Ino)
}

func (w *writeBack) rebaseIdle(ctx context.Context, ino uint64) error {
	s := w.sessionOf(ino)
	if s == nil || s.busy() {
		return nil
	}
	attr, err := w.fetchAttr(ctx, ino)
	if err != nil {
		return err
	}
	s.rebase(attr)
	return nil
}

func (w *writeBack) Unlock(ctx context.Context, args UnlockArgs) error {
	key := lockKey{args.Ino, args.Owner}
	if !w.locks.holds(key, args.Start, args.End, args.Flock) {
		return nil
	}
	if err := w.flushWait(ctx, args.Ino); err != nil {
		return err
	}
	if _, err := w.ask(ctx, wire.OpUnlock, wire.Meta{
		wire.KeyIno: args.Ino, wire.KeyOwner: args.Owner,
		wire.KeyStart: args.Start, wire.KeyEnd: args.End, wire.KeyFlock: args.Flock,
	}); err != nil {
		return err
	}
	w.locks.cut(key, args.Start, args.End, args.Flock)
	return nil
}
