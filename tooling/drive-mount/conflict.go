package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

const conflictDevice = "mount"

var errNoName = errors.New("the file has no known name to keep a conflict copy beside")

func conflictName(name string, at time.Time, attempt int) string {
	extension := filepath.Ext(name)
	stem := strings.TrimSuffix(name, extension)
	if stem == "" {
		stem, extension = name, ""
	}
	suffix := ""
	if attempt > 0 {
		suffix = fmt.Sprintf("-%d", attempt+1)
	}
	return fmt.Sprintf("%s.sync-conflict-%s-%s%s%s", stem, at.UTC().Format("20060102-150405"), conflictDevice, suffix, extension)
}

func (s *session) materialize(ctx context.Context) error {
	s.mu.Lock()
	var missing rangeSet
	missing.add(0, min(s.size, s.cleanLimit))
	missing.subtract(s.ranges)
	missing.subtract(s.zeros)
	spans := missing.clone().spans
	s.mu.Unlock()
	if len(spans) == 0 {
		return nil
	}
	ref, err := s.acquireBase()
	if err != nil {
		return err
	}
	defer s.releaseBase(ref)
	for _, span := range spans {
		for off := span[0]; off < span[1]; off += copyChunk {
			buf := make([]byte, min(span[1]-off, copyChunk))
			if err := readFull(ctx, ref.handle, buf, int64(off)); err != nil {
				return err
			}
			s.mu.Lock()
			_, err := s.data.WriteAt(buf, int64(off))
			if err == nil {
				s.ranges.add(off, off+uint64(len(buf)))
			}
			s.mu.Unlock()
			if err != nil {
				return err
			}
		}
	}
	return nil
}

const copyChunk = 1 << 20

func (s *session) keepBoth(ctx context.Context) error {
	w := s.w
	s.mu.Lock()
	parent, name, old := s.rec.Parent, s.rec.Name, s.rec.Ino
	mode, uid, gid := s.attr.Mode, s.attr.UID, s.attr.GID
	s.mu.Unlock()
	if name == "" {
		return errNoName
	}
	if err := s.materialize(ctx); err != nil {
		return err
	}
	now := time.Now()
	for attempt := 0; ; attempt++ {
		copyName := conflictName(name, now, attempt)
		ino, err := w.ns.inode()
		if err != nil {
			return err
		}
		reply, err := w.mutate(ctx, wire.OpCreate, wire.Meta{
			wire.KeyParent: parent, wire.KeyName: copyName, wire.KeyIno: ino, wire.KeyMode: uint64(mode),
			wire.KeyUid: optID(uid), wire.KeyGid: optID(gid), wire.KeyMtimeNs: now.UnixNano(), wire.KeyFsync: false,
		}, []byte{})
		if code, ok := wire.CodeOf(err); ok && code == wire.ErrEEXIST {
			continue
		}
		if err != nil {
			return err
		}
		entry, err := wire.ParseEntry(reply.Meta)
		if err != nil {
			return err
		}
		if err := w.rekey(s, old, entry, copyName); err != nil {
			return err
		}
		fmt.Fprintln(os.Stderr, "conflict: the hub changed", name, "so this edit is kept beside it as", copyName)
		w.mu.Lock()
		hook := w.created
		w.mu.Unlock()
		if hook != nil {
			hook(parent, copyName)
		}
		return nil
	}
}

func (w *writeBack) rekey(s *session, old uint64, entry Entry, name string) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if taken := w.sessions[entry.Ino]; taken != nil && taken != s {
		return errSessionExists
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if w.sessions[old] == s {
		delete(w.sessions, old)
	}
	w.sessions[entry.Ino] = s
	s.rec.Ino = entry.Ino
	s.rec.Name = name
	s.rec.BaseRev = entry.Attr.Rev
	s.attr = entry.Attr
	s.baseSize = 0
	s.cleanLimit = 0
	s.sealed = true
	s.forced = true
	s.unit = nil
	s.resume = nil
	s.since.clear()
	s.retireBaseLocked()
	return s.saveLocked(true)
}
