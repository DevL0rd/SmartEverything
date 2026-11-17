package main

import (
	"cmp"
	"errors"
	"fmt"
	"os"
	"slices"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

type namePost struct {
	p       *pendingName
	op      wire.Op
	meta    wire.Meta
	payload []byte
	s       *session
	unit    *unitRecord
}

func (n *namespaceLog) run() {
	defer n.w.workers.Done()
	for {
		select {
		case <-n.wake:
		case <-n.w.ctx.Done():
			return
		}
		for n.w.online.Load() && n.w.ctx.Err() == nil {
			post := n.next()
			if post == nil {
				break
			}
			n.send(post)
		}
	}
}

func (n *namespaceLog) next() *namePost {
	n.mu.Lock()
	defer n.mu.Unlock()
	for i, p := range n.order {
		if p.posted && p.Kind == nameRename {
			return nil
		}
		if p.posted || p.failed != nil {
			continue
		}
		if isRemoval(p.Kind) && n.inflight > 0 && n.urgent.Load() == 0 {
			return nil
		}
		later := i+1 < len(n.order)
		post, ready := n.prepare(p, later)
		if !ready {
			return nil
		}
		p.posted = true
		n.inflight++
		return post
	}
	return nil
}

func (n *namespaceLog) prepare(p *pendingName, later bool) (*namePost, bool) {
	meta := wire.Meta{wire.KeyParent: p.Parent, wire.KeyName: p.Name, wire.KeyOpKey: keyBytes(p.OpKey)}
	switch p.Kind {
	case nameUnlink, nameRmdir:
		meta[wire.KeyIno] = p.Ino
		op := wire.OpUnlink
		if p.Kind == nameRmdir {
			op = wire.OpRmdir
		}
		if len(p.folded) > 0 {
			op = wire.OpRmtree
			meta[wire.KeyInodes] = treeInodes(p, make([]any, 0, treeSize(p)))
		}
		return &namePost{p: p, op: op, meta: meta}, true
	case nameRename:
		if n.inflight > 0 {
			return nil, false
		}
		if n.w.contentFlying(p.Ino) {
			n.awaiting.Store(true)
			return nil, false
		}
		n.awaiting.Store(false)
		meta[wire.KeyNewParent], meta[wire.KeyNewName], meta[wire.KeyFlags] = p.NewParent, p.NewName, uint64(p.Flags)
		return &namePost{p: p, op: wire.OpRename, meta: meta}, true
	}
	meta[wire.KeyIno] = p.Ino
	meta[wire.KeyUid] = optID(p.UID)
	meta[wire.KeyGid] = optID(p.GID)
	switch p.Kind {
	case nameSymlink:
		meta[wire.KeyTarget] = p.Target
		return &namePost{p: p, op: wire.OpSymlink, meta: meta}, true
	case nameMknod:
		meta[wire.KeyMode] = uint64(p.Mode)
		meta[wire.KeyType] = uint64(p.Type)
		meta[wire.KeyRdev] = uint64(p.Rdev)
		return &namePost{p: p, op: wire.OpMknod, meta: meta}, true
	}
	meta[wire.KeyMode] = uint64(p.Mode)
	meta[wire.KeyMtimeNs] = p.MtimeNs
	if p.Kind == nameMkdir {
		return &namePost{p: p, op: wire.OpMkdir, meta: meta}, true
	}
	post := &namePost{p: p, op: wire.OpCreate, meta: meta, payload: []byte{}}
	meta[wire.KeyFsync] = false
	s := n.w.sessionOf(p.Ino)
	if s == nil {
		return post, true
	}
	unit, payload, state := s.inlineUnit()
	switch state {
	case inlineReady:
		post.s, post.unit, post.payload = s, unit, payload
		meta[wire.KeyMtimeNs] = unit.WrittenNs
		meta[wire.KeyFsync] = unit.Fsync
		unit.stampAtime(meta)
		return post, true
	case inlineLater:
		return post, true
	}
	return post, later || n.urgent.Load() > 0
}

func (n *namespaceLog) send(post *namePost) {
	posted, err := n.w.caller.Post(n.w.ctx, post.op, post.meta, post.payload)
	if err != nil {
		n.answered(post, wire.Reply{}, err)
		return
	}
	go func() {
		reply, err := posted.Wait(n.w.ctx)
		n.answered(post, reply, err)
	}()
}

func (n *namespaceLog) answered(post *namePost, reply wire.Reply, err error) {
	if err == nil {
		err = n.acked(post, reply)
	}
	if err == nil {
		return
	}
	if post.s != nil {
		post.s.unclaimInline(post.unit)
	}
	if n.w.ctx.Err() != nil || isTransient(err) {
		n.retry(post.p)
		return
	}
	n.refused(post.p, err)
}

func (n *namespaceLog) retry(p *pendingName) {
	n.mu.Lock()
	n.unpostLocked(p)
	n.mu.Unlock()
	time.AfterFunc(retryDelay, n.signal)
}

func (n *namespaceLog) acked(post *namePost, reply wire.Reply) error {
	p := post.p
	switch p.Kind {
	case nameRename:
		n.w.cache().NoteMoved(p.renameArgs(), p.Ino, p.Replaced)
		n.finish(p)
		return nil
	case nameUnlink, nameRmdir:
		eachFolded(p, func(c *pendingName) {
			n.w.cache().NoteLocalGone(c.Parent, c.Name, c.Ino)
		})
		n.w.cache().NoteLocalGone(p.Parent, p.Name, p.Ino)
		n.finish(p)
		return nil
	}
	entry, err := wire.ParseEntry(reply.Meta)
	if err != nil {
		return err
	}
	if parent := n.pendingParent(p); parent != nil {
		select {
		case <-parent.landed:
		case <-n.w.ctx.Done():
			return n.w.ctx.Err()
		}
	}
	n.mu.Lock()
	p.hub = &entry.Attr
	n.mu.Unlock()
	if post.s != nil {
		n.ackInline(post, entry.Attr)
	} else if s := n.w.sessionOf(p.Ino); s != nil {
		s.adoptCreated(entry.Attr)
	}
	n.w.cache().NoteLocal(p.Parent, p.Name, entry)
	if p.Kind == nameMkdir {
		n.w.cache().NoteLocalDir(entry.Ino)
	}
	n.finish(p)
	if s := n.w.sessionOf(p.Ino); s != nil && s.wantsTurn() {
		n.w.enqueue(s)
	}
	return nil
}

func (n *namespaceLog) ackInline(post *namePost, attr wire.Attr) {
	s := post.s
	if n.w.ack(s, post.unit, attr) {
		s.mu.Lock()
		s.sending = false
		s.mu.Unlock()
		n.w.enqueue(s)
		return
	}
	s.finishIfIdle()
}

func (n *namespaceLog) finish(p *pendingName) {
	n.mu.Lock()
	n.dropLocked(p)
	close(p.landed)
	eachFolded(p, func(c *pendingName) {
		if err := n.journal.done(c.Seq); err != nil {
			logJournal(c.Ino, err)
		}
	})
	if err := n.journal.done(p.Seq); err != nil {
		logJournal(p.Ino, err)
	}
	if len(n.order) == 0 {
		n.compactLocked()
	}
	n.mu.Unlock()
	n.w.broadcast()
	n.signal()
}

func (n *namespaceLog) compactLocked() {
	if err := n.leases.save(); err != nil {
		fmt.Fprintln(os.Stderr, "leases:", err)
		return
	}
	if err := n.journal.compact(); err != nil {
		fmt.Fprintln(os.Stderr, "names:", err)
	}
}

func (n *namespaceLog) refused(p *pendingName, err error) {
	code, _ := wire.CodeOf(err)
	switch {
	case isCreation(p.Kind):
		n.refusedCreate(p, code, err)
	case len(p.folded) > 0:
		fmt.Fprintln(os.Stderr, "names: removing", p.Name, "item by item:", err)
		n.unfold(p)
	default:
		fmt.Fprintln(os.Stderr, "names:", p.Kind, p.Name, err)
		n.w.cache().NoteName(p.Parent, p.Name)
		n.w.cache().NoteChanged(p.Parent)
		if p.Kind == nameRename {
			n.w.cache().NoteName(p.NewParent, p.NewName)
			n.w.cache().NoteChanged(p.NewParent)
			n.w.cache().NoteChanged(p.Ino)
		}
		n.finish(p)
	}
}

func (n *namespaceLog) refusedCreate(p *pendingName, code wire.ErrorCode, err error) {
	if code == wire.ErrEEXIST || code == wire.ErrENOENT || code == wire.ErrESTALE {
		if rerr := n.reroute(p, code); rerr == nil {
			n.signal()
			return
		} else {
			err = errors.Join(err, rerr)
		}
	}
	fmt.Fprintln(os.Stderr, "names: keeping", p.Name, "locally:", err)
	n.mu.Lock()
	n.unpostLocked(p)
	p.failed = err
	n.mu.Unlock()
	if s := n.w.sessionOf(p.Ino); s != nil {
		s.fail(err)
	}
	n.w.broadcast()
}

func (n *namespaceLog) reroute(p *pendingName, code wire.ErrorCode) error {
	parent := p.Parent
	if code != wire.ErrEEXIST {
		root, ok := n.w.cache().RootIno(p.Root)
		if !ok {
			return fmt.Errorf("the drive root of %s is unknown", p.Name)
		}
		parent = root
	}
	n.mu.Lock()
	defer n.mu.Unlock()
	n.dropLocked(p)
	p.attempt++
	if p.Origin == "" {
		p.Origin = p.Name
	}
	p.Parent, p.Name = parent, conflictName(p.Origin, time.Now(), p.attempt)
	p.OpKey = newKeyHex()
	n.order = append(n.order, p)
	n.count(p, 1)
	n.created[nameKey{p.Parent, p.Name}] = p
	n.byIno[p.Ino] = p
	slices.SortFunc(n.order, func(a, b *pendingName) int { return cmp.Compare(a.Seq, b.Seq) })
	return n.journal.set(p.nameEntry)
}

func (n *namespaceLog) reachable() {
	n.mu.Lock()
	for _, p := range n.order {
		p.failed = nil
	}
	n.mu.Unlock()
	n.signal()
}
