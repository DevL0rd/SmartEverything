package main

import (
	"context"

	"github.com/smarteverything/drive-mount/wire"
)

func (w *writeBack) lookup(ctx context.Context, parent uint64, name string) (Entry, error) {
	reply, err := w.ask(ctx, wire.OpLookup, wire.Meta{wire.KeyParent: parent, wire.KeyName: name})
	if err != nil {
		return Entry{}, err
	}
	return wire.ParseEntry(reply.Meta)
}

func (w *writeBack) Rename(ctx context.Context, args RenameArgs) error {
	if err := w.ns.drain(ctx); err != nil {
		return err
	}
	source, err := w.lookup(ctx, args.Parent, args.Name)
	if err != nil {
		return err
	}
	target, targetErr := w.lookup(ctx, args.NewParent, args.NewName)
	if err := w.flushWait(ctx, source.Ino); err != nil {
		return err
	}
	if targetErr == nil && args.Flags&wire.RenameFlagExchange != 0 {
		if err := w.flushWait(ctx, target.Ino); err != nil {
			return err
		}
	}
	if _, err := w.mutate(ctx, wire.OpRename, wire.Meta{
		wire.KeyParent: args.Parent, wire.KeyName: args.Name,
		wire.KeyNewParent: args.NewParent, wire.KeyNewName: args.NewName,
		wire.KeyFlags: uint64(args.Flags),
	}, nil); err != nil {
		return err
	}
	w.renamed(source.Ino, args.Parent, args.Name, args.NewParent, args.NewName)
	switch {
	case targetErr != nil:
	case args.Flags&wire.RenameFlagExchange != 0:
		w.renamed(target.Ino, args.NewParent, args.NewName, args.Parent, args.Name)
	case target.Attr.Nlink <= 1:
		w.orphaned(target.Ino)
	}
	return nil
}

func (w *writeBack) renamed(ino, parent uint64, name string, newParent uint64, newName string) {
	s := w.sessionOf(ino)
	if s == nil {
		return
	}
	s.mu.Lock()
	if s.rec.Parent == parent && s.rec.Name == name {
		s.rec.Parent, s.rec.Name = newParent, newName
	}
	s.mu.Unlock()
}

func (w *writeBack) orphaned(ino uint64) {
	if s := w.sessionOf(ino); s != nil {
		s.mu.Lock()
		s.rec.Orphan = true
		s.mu.Unlock()
	}
}

func (w *writeBack) Link(ctx context.Context, ino, parent uint64, name string) (Attr, error) {
	if err := w.ns.drain(ctx); err != nil {
		return Attr{}, err
	}
	if err := w.flushWait(ctx, ino); err != nil {
		return Attr{}, err
	}
	reply, err := w.mutate(ctx, wire.OpLink, wire.Meta{wire.KeyIno: ino, wire.KeyParent: parent, wire.KeyName: name}, nil)
	if err != nil {
		return Attr{}, err
	}
	attr, err := reply.Meta.Attr(wire.KeyAttr)
	if err != nil {
		return Attr{}, err
	}
	if s := w.sessionOf(ino); s != nil {
		s.mu.Lock()
		if s.rec.Orphan {
			s.rec.Orphan = false
			s.rec.Parent, s.rec.Name = parent, name
		}
		s.mu.Unlock()
	}
	w.overlayAttr(&attr)
	return attr, nil
}
