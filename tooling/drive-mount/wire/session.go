package wire

import (
	"context"
	"crypto/rand"
)

type RootSeq struct {
	Root string
	Seq  uint64
}

type HeldHandle struct {
	Handle uint64
	Ino    uint64
}

type HeldLock struct {
	Ino   uint64
	Owner uint64
	Lock
	Flock bool
}

type Resume struct {
	Seqs    []RootSeq
	Handles []HeldHandle
	Locks   []HeldLock
	Commits []uint64
}

type NameRef struct {
	Parent uint64
	Name   string
}

type Changed struct {
	Root    string
	Seq     uint64
	Inodes  []uint64
	Entries []NameRef
	Removed []uint64
}

type Reset struct {
	Root string
	Seq  uint64
}

type LockLost struct {
	Ino   uint64
	Owner uint64
}

type Caller interface {
	Call(ctx context.Context, op Op, meta Meta, payload []byte) (Reply, error)
	Do(ctx context.Context, op Op, meta Meta, payload []byte) ([]Reply, error)
	Post(ctx context.Context, op Op, meta Meta, payload []byte) (Posted, error)
}

type Handler interface {
	Resume() Resume
	Established(ctx context.Context, c Caller, resumed bool) error
	Offline()
	Changed(Changed)
	Reset(Reset)
	LockLost(LockLost)
}

type Reply struct {
	Meta    Meta
	Payload []byte
}

type Settled struct {
	Reply Reply
	Err   error
}

func (s Settled) Wait(context.Context) (Reply, error) { return s.Reply, s.Err }

func (Settled) Forget() {}

func PostByCall(ctx context.Context, c Caller, op Op, meta Meta, payload []byte) (Posted, error) {
	reply, err := c.Call(ctx, op, meta, payload)
	return Settled{Reply: reply, Err: err}, nil
}

func NewOpKey() []byte {
	key := make([]byte, OpKeyBytes)
	if _, err := rand.Read(key); err != nil {
		panic(err)
	}
	return key
}

func (r Resume) meta(session []byte) Meta {
	seqs := make([]any, 0, len(r.Seqs))
	for _, s := range r.Seqs {
		seqs = append(seqs, Meta{KeyRoot: s.Root, KeySeq: s.Seq})
	}
	handles := make([]any, 0, len(r.Handles))
	for _, h := range r.Handles {
		handles = append(handles, Meta{KeyHandle: h.Handle, KeyIno: h.Ino})
	}
	locks := make([]any, 0, len(r.Locks))
	for _, l := range r.Locks {
		locks = append(locks, Meta{
			KeyIno: l.Ino, KeyOwner: l.Owner, KeyType: uint64(l.Type),
			KeyStart: l.Start, KeyEnd: l.End, KeyPid: uint64(l.Pid), KeyFlock: l.Flock,
		})
	}
	commits := make([]any, 0, len(r.Commits))
	for _, c := range r.Commits {
		commits = append(commits, c)
	}
	var sess any
	if session != nil {
		sess = session
	}
	return Meta{KeySession: sess, KeySeqs: seqs, KeyHandles: handles, KeyLocks: locks, KeyCommits: commits}
}

func parseChanged(m Meta) (Changed, error) {
	r := reader{m: m}
	out := Changed{Root: r.text(KeyRoot), Seq: r.uint(KeySeq)}
	if r.err != nil {
		return Changed{}, r.err
	}
	var err error
	if out.Inodes, err = uintList(m, KeyInodes); err != nil {
		return Changed{}, err
	}
	if out.Removed, err = uintList(m, KeyRemoved); err != nil {
		return Changed{}, err
	}
	pairs, err := m.Array(KeyEntries)
	if err != nil {
		return Changed{}, err
	}
	for _, pair := range pairs {
		tuple, ok := pair.([]any)
		if !ok || len(tuple) != 2 {
			return Changed{}, &FieldError{KeyEntries, "[parent, name] pairs", pair}
		}
		parent, err := asUint(tuple[0], KeyParent)
		if err != nil {
			return Changed{}, err
		}
		name, ok := tuple[1].(string)
		if !ok {
			return Changed{}, &FieldError{KeyName, "text", tuple[1]}
		}
		out.Entries = append(out.Entries, NameRef{Parent: parent, Name: name})
	}
	return out, nil
}

func uintList(m Meta, key uint64) ([]uint64, error) {
	items, err := m.Array(key)
	if err != nil {
		return nil, err
	}
	out := make([]uint64, 0, len(items))
	for _, item := range items {
		v, err := asUint(item, key)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}

func pushAction(op Op, m Meta) (func(Handler), error) {
	switch op {
	case PushChanged:
		changed, err := parseChanged(m)
		if err != nil {
			return nil, err
		}
		return func(h Handler) { h.Changed(changed) }, nil
	case PushReset:
		r := reader{m: m}
		reset := Reset{Root: r.text(KeyRoot), Seq: r.uint(KeySeq)}
		if r.err != nil {
			return nil, r.err
		}
		return func(h Handler) { h.Reset(reset) }, nil
	case PushLockLost:
		r := reader{m: m}
		lost := LockLost{Ino: r.uint(KeyIno), Owner: r.uint(KeyOwner)}
		if r.err != nil {
			return nil, r.err
		}
		return func(h Handler) { h.LockLost(lost) }, nil
	default:
		return nil, ErrProtocol
	}
}
