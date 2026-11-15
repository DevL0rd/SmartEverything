package main

import (
	"context"

	"github.com/smarteverything/drive-mount/wire"
)

func (w *writeBack) Mkdir(ctx context.Context, args CreateArgs) (Entry, error) {
	return w.makeEntry(ctx, wire.OpMkdir, wire.Meta{
		wire.KeyParent: args.Parent, wire.KeyName: args.Name, wire.KeyMode: uint64(args.Mode),
		wire.KeyUid: optID(args.UID), wire.KeyGid: optID(args.GID),
	})
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
	reply, err := w.mutate(ctx, op, meta, nil)
	if err != nil {
		return Entry{}, err
	}
	return wire.ParseEntry(reply.Meta)
}

func (w *writeBack) Unlink(ctx context.Context, parent uint64, name string) error {
	victim, lookupErr := w.lookup(ctx, parent, name)
	if _, err := w.mutate(ctx, wire.OpUnlink, wire.Meta{wire.KeyParent: parent, wire.KeyName: name}, nil); err != nil {
		return err
	}
	if lookupErr == nil && victim.Attr.Nlink <= 1 {
		w.orphaned(victim.Ino)
	}
	return nil
}

func (w *writeBack) Rmdir(ctx context.Context, parent uint64, name string) error {
	_, err := w.mutate(ctx, wire.OpRmdir, wire.Meta{wire.KeyParent: parent, wire.KeyName: name}, nil)
	return err
}

func (w *writeBack) Setxattr(ctx context.Context, ino uint64, name string, value []byte, flags uint32) error {
	_, err := w.mutate(ctx, wire.OpSetxattr, wire.Meta{wire.KeyIno: ino, wire.KeyName: name, wire.KeyFlags: uint64(flags)}, value)
	return err
}

func (w *writeBack) Removexattr(ctx context.Context, ino uint64, name string) error {
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
	reply, err := w.ask(ctx, wire.OpGetlk, lockMeta(args))
	if err != nil {
		return nil, err
	}
	return wire.ParseLock(reply.Meta[wire.KeyLock])
}

func (w *writeBack) Setlk(ctx context.Context, args LockArgs) error {
	meta := lockMeta(args)
	meta[wire.KeyWait] = args.Wait
	meta[wire.KeyFlock] = args.Flock
	if _, err := w.ask(ctx, wire.OpSetlk, meta); err != nil {
		return err
	}
	w.locks.record(lockKey{args.Ino, args.Owner}, heldRange{args.Start, args.End, args.Type, args.Pid, args.Flock})
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
