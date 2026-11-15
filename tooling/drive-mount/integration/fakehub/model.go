package fakehub

import (
	"context"
	"fmt"
	"path"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/smarteverything/drive-mount/wire"
)

const (
	SpaceTotal = 200 << 30
	SpaceUsed  = 50 << 30
	SpaceFree  = 150 << 30
	blockSize  = 4096
)

const (
	FlagCreate  = 1
	FlagReplace = 2
)

type Change struct {
	Inodes  []uint64
	Entries []wire.NameRef
	Removed []uint64
}

func fail(code wire.ErrorCode) error { return &wire.RemoteError{Code: code} }

type inode struct {
	ino    uint64
	typ    uint8
	mode   uint32
	uid    *uint32
	gid    *uint32
	rdev   uint32
	target string
	data   []byte
	atime  int64
	mtime  int64
	ctime  int64
	btime  int64
	rev    uint64
	names  map[string]uint64
	parent uint64
	links  int
	xattrs map[string][]byte
}

type heldLock struct {
	session string
	owner   uint64
	typ     uint8
	start   uint64
	end     uint64
	pid     uint32
	flock   bool
}

type Model struct {
	mu       sync.Mutex
	inodes   map[uint64]*inode
	next     uint64
	root     uint64
	PageSize int
	subs     map[int]func(by string, c Change)
	subSeq   int
	locks    map[uint64][]heldLock
	quiet    bool
	lockWake chan struct{}
}

func NewModel() *Model {
	m := &Model{inodes: map[uint64]*inode{}, next: 1, PageSize: 1000, subs: map[int]func(string, Change){}, locks: map[uint64][]heldLock{}, lockWake: make(chan struct{})}
	root := m.add(wire.InodeTypeDirectory, 0o755, nil, nil)
	root.parent = root.ino
	m.root = root.ino
	return m
}

func (m *Model) Root() uint64 { return m.root }

func (m *Model) now() int64 { return time.Now().UnixNano() }

func (m *Model) add(typ uint8, mode uint32, uid, gid *uint32) *inode {
	n := &inode{ino: m.next, typ: typ, mode: mode & 0o7777, uid: uid, gid: gid, rev: 1, xattrs: map[string][]byte{}}
	m.next++
	n.atime, n.mtime, n.ctime, n.btime = m.now(), m.now(), m.now(), m.now()
	if typ == wire.InodeTypeDirectory {
		n.names = map[string]uint64{}
	}
	m.inodes[n.ino] = n
	return n
}

func (m *Model) Subscribe(fn func(by string, c Change)) func() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.subSeq++
	id := m.subSeq
	m.subs[id] = fn
	return func() {
		m.mu.Lock()
		defer m.mu.Unlock()
		delete(m.subs, id)
	}
}

func (m *Model) SetQuiet(quiet bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.quiet = quiet
}

func (m *Model) emit(by string, c Change) {
	if m.quiet {
		return
	}
	for _, fn := range m.subs {
		fn(by, c)
	}
}

func (m *Model) attr(n *inode) wire.Attr {
	nlink := uint32(n.links)
	size := uint64(len(n.data))
	switch n.typ {
	case wire.InodeTypeDirectory:
		nlink = 2
		for _, child := range n.names {
			if m.inodes[child].typ == wire.InodeTypeDirectory {
				nlink++
			}
		}
		size = blockSize
	case wire.InodeTypeSymlink:
		size = uint64(len(n.target))
	}
	return wire.Attr{
		Ino: n.ino, Type: n.typ, Mode: n.mode, Nlink: nlink, UID: n.uid, GID: n.gid, Size: size,
		Blocks: (size + 511) / 512, AtimeNs: n.atime, MtimeNs: n.mtime, CtimeNs: n.ctime, BtimeNs: n.btime,
		Rdev: n.rdev, Rev: n.rev, Etag: fmt.Sprintf("%d:%d", n.ino, n.rev),
	}
}

func (m *Model) get(ino uint64) (*inode, error) {
	n, ok := m.inodes[ino]
	if !ok {
		return nil, fail(wire.ErrESTALE)
	}
	return n, nil
}

func (m *Model) dir(ino uint64) (*inode, error) {
	n, err := m.get(ino)
	if err != nil {
		return nil, err
	}
	if n.typ != wire.InodeTypeDirectory {
		return nil, fail(wire.ErrENOTDIR)
	}
	return n, nil
}

func checkName(name string) error {
	switch {
	case name == "" || name == "." || name == "..":
		return fail(wire.ErrEINVAL)
	case len(name) > wire.NameMaxBytes:
		return fail(wire.ErrENAMETOOLONG)
	case !utf8.ValidString(name) || strings.ContainsRune(name, '/'):
		return fail(wire.ErrEILSEQ)
	}
	return nil
}

func (m *Model) modified(n *inode) {
	n.mtime = m.now()
	n.ctime = n.mtime
	n.rev++
}

func (m *Model) Attach() wire.Root {
	m.mu.Lock()
	defer m.mu.Unlock()
	return wire.Root{Root: "root", Ino: m.root, Attr: m.attr(m.inodes[m.root]), Seq: 0}
}

func (m *Model) Lookup(parent uint64, name string) (wire.Entry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, err := m.dir(parent)
	if err != nil {
		return wire.Entry{}, err
	}
	if err := checkName(name); err != nil {
		return wire.Entry{}, err
	}
	child, ok := p.names[name]
	if !ok {
		return wire.Entry{}, fail(wire.ErrENOENT)
	}
	return wire.Entry{Ino: child, Attr: m.attr(m.inodes[child])}, nil
}

func (m *Model) Getattr(ino uint64) (wire.Attr, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.get(ino)
	if err != nil {
		return wire.Attr{}, err
	}
	return m.attr(n), nil
}

func (m *Model) Readdir(ino, cursor uint64) (wire.DirPage, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	d, err := m.dir(ino)
	if err != nil {
		return wire.DirPage{}, err
	}
	names := make([]string, 0, len(d.names))
	for name := range d.names {
		names = append(names, name)
	}
	sort.Strings(names)
	start := int(cursor)
	if start > len(names) {
		start = len(names)
	}
	end := len(names)
	var next *uint64
	if m.PageSize > 0 && start+m.PageSize < end {
		end = start + m.PageSize
		more := uint64(end)
		next = &more
	}
	page := wire.DirPage{Next: next}
	for _, name := range names[start:end] {
		child := m.inodes[d.names[name]]
		page.Entries = append(page.Entries, wire.DirEntry{Name: name, Entry: wire.Entry{Ino: child.ino, Attr: m.attr(child)}})
	}
	return page, nil
}

func (m *Model) Statfs() wire.Statfs {
	m.mu.Lock()
	defer m.mu.Unlock()
	return wire.Statfs{
		Blocks: SpaceTotal / blockSize, Free: SpaceFree / blockSize, Avail: SpaceFree / blockSize,
		Files: 1 << 20, Ffree: 1<<20 - uint64(len(m.inodes)), Bsize: blockSize, Namelen: wire.NameMaxBytes,
	}
}

func (m *Model) Readlink(ino uint64) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.get(ino)
	if err != nil {
		return "", err
	}
	if n.typ != wire.InodeTypeSymlink {
		return "", fail(wire.ErrEINVAL)
	}
	return n.target, nil
}

func (m *Model) create(by string, parent uint64, name string, typ uint8, mode uint32, uid, gid *uint32) (*inode, *inode, error) {
	p, err := m.dir(parent)
	if err != nil {
		return nil, nil, err
	}
	if err := checkName(name); err != nil {
		return nil, nil, err
	}
	if _, exists := p.names[name]; exists {
		return nil, nil, fail(wire.ErrEEXIST)
	}
	n := m.add(typ, mode, uid, gid)
	n.links = 1
	if typ == wire.InodeTypeDirectory {
		n.parent = p.ino
	}
	p.names[name] = n.ino
	m.modified(p)
	m.emit(by, Change{Inodes: []uint64{p.ino}, Entries: []wire.NameRef{{Parent: p.ino, Name: name}}})
	return p, n, nil
}

func (m *Model) Mkdir(by string, parent uint64, name string, mode uint32, uid, gid *uint32) (wire.Entry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, n, err := m.create(by, parent, name, wire.InodeTypeDirectory, mode, uid, gid)
	if err != nil {
		return wire.Entry{}, err
	}
	return wire.Entry{Ino: n.ino, Attr: m.attr(n)}, nil
}

func (m *Model) Create(by string, parent uint64, name string, mode uint32, uid, gid *uint32, exclusive bool) (wire.Entry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if p, err := m.dir(parent); err == nil && !exclusive && checkName(name) == nil {
		if existing, ok := p.names[name]; ok {
			n := m.inodes[existing]
			if n.typ == wire.InodeTypeDirectory {
				return wire.Entry{}, fail(wire.ErrEISDIR)
			}
			return wire.Entry{Ino: n.ino, Attr: m.attr(n)}, nil
		}
	}
	_, n, err := m.create(by, parent, name, wire.InodeTypeFile, mode, uid, gid)
	if err != nil {
		return wire.Entry{}, err
	}
	return wire.Entry{Ino: n.ino, Attr: m.attr(n)}, nil
}

func (m *Model) Mknod(by string, parent uint64, name string, typ uint8, mode uint32, rdev uint32, uid, gid *uint32) (wire.Entry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, n, err := m.create(by, parent, name, typ, mode, uid, gid)
	if err != nil {
		return wire.Entry{}, err
	}
	n.rdev = rdev
	return wire.Entry{Ino: n.ino, Attr: m.attr(n)}, nil
}

func (m *Model) Symlink(by string, parent uint64, name, target string, uid, gid *uint32) (wire.Entry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(target) == 0 || len(target) > wire.PathMaxBytes-1 {
		return wire.Entry{}, fail(wire.ErrEINVAL)
	}
	_, n, err := m.create(by, parent, name, wire.InodeTypeSymlink, 0o777, uid, gid)
	if err != nil {
		return wire.Entry{}, err
	}
	n.target = target
	return wire.Entry{Ino: n.ino, Attr: m.attr(n)}, nil
}

func (m *Model) Tmpfile(parent uint64, mode uint32, uid, gid *uint32) (wire.Entry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, err := m.dir(parent); err != nil {
		return wire.Entry{}, err
	}
	n := m.add(wire.InodeTypeFile, mode, uid, gid)
	return wire.Entry{Ino: n.ino, Attr: m.attr(n)}, nil
}

func (m *Model) Link(by string, ino, parent uint64, name string) (wire.Attr, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.get(ino)
	if err != nil {
		return wire.Attr{}, err
	}
	if n.typ == wire.InodeTypeDirectory {
		return wire.Attr{}, fail(wire.ErrEPERM)
	}
	p, err := m.dir(parent)
	if err != nil {
		return wire.Attr{}, err
	}
	if err := checkName(name); err != nil {
		return wire.Attr{}, err
	}
	if _, exists := p.names[name]; exists {
		return wire.Attr{}, fail(wire.ErrEEXIST)
	}
	p.names[name] = n.ino
	n.links++
	n.ctime = m.now()
	m.modified(p)
	m.emit(by, Change{Inodes: []uint64{p.ino, n.ino}, Entries: []wire.NameRef{{Parent: p.ino, Name: name}}})
	return m.attr(n), nil
}

func (m *Model) remove(by string, parent uint64, name string, dir bool) error {
	p, err := m.dir(parent)
	if err != nil {
		return err
	}
	if err := checkName(name); err != nil {
		return err
	}
	child, ok := p.names[name]
	if !ok {
		return fail(wire.ErrENOENT)
	}
	n := m.inodes[child]
	switch {
	case dir && n.typ != wire.InodeTypeDirectory:
		return fail(wire.ErrENOTDIR)
	case !dir && n.typ == wire.InodeTypeDirectory:
		return fail(wire.ErrEISDIR)
	case dir && len(n.names) > 0:
		return fail(wire.ErrENOTEMPTY)
	}
	delete(p.names, name)
	m.modified(p)
	change := Change{Inodes: []uint64{p.ino}, Entries: []wire.NameRef{{Parent: p.ino, Name: name}}}
	if n.typ == wire.InodeTypeDirectory {
		change.Removed = []uint64{n.ino}
	} else {
		n.links--
		n.ctime = m.now()
		change.Inodes = append(change.Inodes, n.ino)
	}
	m.emit(by, change)
	return nil
}

func (m *Model) Unlink(by string, parent uint64, name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.remove(by, parent, name, false)
}

func (m *Model) Rmdir(by string, parent uint64, name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.remove(by, parent, name, true)
}

func (m *Model) isAncestor(ancestor, of uint64) bool {
	for {
		if of == ancestor {
			return true
		}
		n := m.inodes[of]
		if n.parent == of {
			return false
		}
		of = n.parent
	}
}

func (m *Model) Rename(by string, parent uint64, name string, newParent uint64, newName string, flags uint32) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	from, err := m.dir(parent)
	if err != nil {
		return err
	}
	to, err := m.dir(newParent)
	if err != nil {
		return err
	}
	if err := checkName(name); err != nil {
		return err
	}
	if err := checkName(newName); err != nil {
		return err
	}
	if flags&wire.RenameFlagWhiteout != 0 {
		return fail(wire.ErrEINVAL)
	}
	srcIno, ok := from.names[name]
	if !ok {
		return fail(wire.ErrENOENT)
	}
	src := m.inodes[srcIno]
	dstIno, replaced := to.names[newName]
	if replaced && dstIno == srcIno {
		return nil
	}
	if flags&wire.RenameFlagExchange != 0 {
		if !replaced {
			return fail(wire.ErrENOENT)
		}
		dst := m.inodes[dstIno]
		from.names[name], to.names[newName] = dstIno, srcIno
		if src.typ == wire.InodeTypeDirectory {
			src.parent = to.ino
		}
		if dst.typ == wire.InodeTypeDirectory {
			dst.parent = from.ino
		}
		m.modified(from)
		m.modified(to)
		m.emit(by, Change{Inodes: []uint64{from.ino, to.ino, srcIno, dstIno}, Entries: []wire.NameRef{{Parent: from.ino, Name: name}, {Parent: to.ino, Name: newName}}})
		return nil
	}
	if replaced && flags&wire.RenameFlagNoReplace != 0 {
		return fail(wire.ErrEEXIST)
	}
	if src.typ == wire.InodeTypeDirectory && m.isAncestor(src.ino, to.ino) {
		return fail(wire.ErrEINVAL)
	}
	change := Change{Inodes: []uint64{from.ino, to.ino, srcIno}, Entries: []wire.NameRef{{Parent: from.ino, Name: name}, {Parent: to.ino, Name: newName}}}
	if replaced {
		dst := m.inodes[dstIno]
		switch {
		case src.typ == wire.InodeTypeDirectory && dst.typ != wire.InodeTypeDirectory:
			return fail(wire.ErrENOTDIR)
		case src.typ != wire.InodeTypeDirectory && dst.typ == wire.InodeTypeDirectory:
			return fail(wire.ErrEISDIR)
		case dst.typ == wire.InodeTypeDirectory && len(dst.names) > 0:
			return fail(wire.ErrENOTEMPTY)
		}
		if dst.typ == wire.InodeTypeDirectory {
			change.Removed = append(change.Removed, dst.ino)
		} else {
			dst.links--
			change.Inodes = append(change.Inodes, dst.ino)
		}
	}
	delete(from.names, name)
	to.names[newName] = srcIno
	if src.typ == wire.InodeTypeDirectory {
		src.parent = to.ino
	}
	src.ctime = m.now()
	m.modified(from)
	m.modified(to)
	m.emit(by, change)
	return nil
}

func (m *Model) Setattr(by string, ino uint64, valid uint32, mode uint32, uid, gid *uint32, size uint64, atime, mtime *int64) (wire.Attr, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.get(ino)
	if err != nil {
		return wire.Attr{}, err
	}
	if valid&wire.SetattrValidSize != 0 {
		if n.typ == wire.InodeTypeDirectory {
			return wire.Attr{}, fail(wire.ErrEISDIR)
		}
		n.data = resize(n.data, size)
		m.modified(n)
	}
	if valid&wire.SetattrValidMode != 0 {
		n.mode = mode & 0o7777
	}
	if valid&wire.SetattrValidUid != 0 {
		n.uid = uid
	}
	if valid&wire.SetattrValidGid != 0 {
		n.gid = gid
	}
	if valid&wire.SetattrValidAtime != 0 {
		n.atime = *atime
	}
	if valid&wire.SetattrValidMtime != 0 {
		n.mtime = *mtime
	}
	n.ctime = m.now()
	m.emit(by, Change{Inodes: []uint64{n.ino}})
	return m.attr(n), nil
}

func resize(data []byte, size uint64) []byte {
	if uint64(len(data)) >= size {
		return data[:size:size]
	}
	grown := make([]byte, size)
	copy(grown, data)
	return grown
}

func (m *Model) Getxattr(ino uint64, name string) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.get(ino)
	if err != nil {
		return nil, err
	}
	value, ok := n.xattrs[name]
	if !ok {
		return nil, fail(wire.ErrENODATA)
	}
	return append([]byte(nil), value...), nil
}

func (m *Model) Setxattr(by string, ino uint64, name string, value []byte, flags uint32) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.get(ino)
	if err != nil {
		return err
	}
	_, exists := n.xattrs[name]
	switch {
	case flags == FlagCreate && exists:
		return fail(wire.ErrEEXIST)
	case flags == FlagReplace && !exists:
		return fail(wire.ErrENODATA)
	}
	n.xattrs[name] = append([]byte(nil), value...)
	n.ctime = m.now()
	m.emit(by, Change{Inodes: []uint64{n.ino}})
	return nil
}

func (m *Model) Listxattr(ino uint64) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.get(ino)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(n.xattrs))
	for name := range n.xattrs {
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}

func (m *Model) Removexattr(by string, ino uint64, name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.get(ino)
	if err != nil {
		return err
	}
	if _, ok := n.xattrs[name]; !ok {
		return fail(wire.ErrENODATA)
	}
	delete(n.xattrs, name)
	n.ctime = m.now()
	m.emit(by, Change{Inodes: []uint64{n.ino}})
	return nil
}

func (m *Model) ReadAt(ino uint64, off uint64, length int) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.get(ino)
	if err != nil {
		return nil, err
	}
	if n.typ == wire.InodeTypeDirectory {
		return nil, fail(wire.ErrEISDIR)
	}
	if off >= uint64(len(n.data)) {
		return nil, nil
	}
	end := min(off+uint64(length), uint64(len(n.data)))
	return append([]byte(nil), n.data[off:end]...), nil
}

func (m *Model) WriteAt(by string, ino uint64, off uint64, data []byte) (wire.Attr, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.get(ino)
	if err != nil {
		return wire.Attr{}, err
	}
	if end := off + uint64(len(data)); end > uint64(len(n.data)) {
		n.data = resize(n.data, end)
	}
	copy(n.data[off:], data)
	m.modified(n)
	m.emit(by, Change{Inodes: []uint64{n.ino}})
	return m.attr(n), nil
}

func (m *Model) SetSize(by string, ino uint64, size uint64) (wire.Attr, error) {
	return m.Setattr(by, ino, wire.SetattrValidSize, 0, nil, nil, size, nil, nil)
}

func (m *Model) Allocate(by string, ino uint64, mode uint32, off, length uint64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.get(ino)
	if err != nil {
		return err
	}
	end := off + length
	switch mode {
	case wire.AllocateAllocate:
		if end > uint64(len(n.data)) {
			n.data = resize(n.data, end)
		}
	case wire.AllocateKeepSize:
	case wire.AllocatePunchHole, wire.AllocateZeroRangeKeepSize:
		clear(n.data[min(off, uint64(len(n.data))):min(end, uint64(len(n.data)))])
	case wire.AllocateZeroRange:
		if end > uint64(len(n.data)) {
			n.data = resize(n.data, end)
		}
		clear(n.data[off:end])
	}
	m.modified(n)
	m.emit(by, Change{Inodes: []uint64{n.ino}})
	return nil
}

func (m *Model) Seek(ino uint64, off uint64, whence uint32) (uint64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.get(ino)
	if err != nil {
		return 0, err
	}
	size := uint64(len(n.data))
	switch whence {
	case wire.WhenceData:
		if off >= size {
			return 0, fail(wire.ErrEINVAL)
		}
		return off, nil
	case wire.WhenceHole:
		if off > size {
			return 0, fail(wire.ErrEINVAL)
		}
		return size, nil
	}
	return 0, fail(wire.ErrEINVAL)
}

func (m *Model) conflict(ino uint64, want heldLock) *heldLock {
	var found *heldLock
	for i, held := range m.locks[ino] {
		if held.flock != want.flock || (held.session == want.session && held.owner == want.owner) {
			continue
		}
		if held.start > want.end || want.start > held.end {
			continue
		}
		if held.typ != wire.LockTypeWrite && want.typ != wire.LockTypeWrite {
			continue
		}
		if found == nil || held.start < found.start {
			found = &m.locks[ino][i]
		}
	}
	return found
}

func (m *Model) Getlk(session string, ino, owner uint64, lock wire.Lock, flock bool) (*wire.Lock, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, err := m.get(ino); err != nil {
		return nil, err
	}
	found := m.conflict(ino, heldLock{session: session, owner: owner, typ: lock.Type, start: lock.Start, end: lock.End, flock: flock})
	if found == nil {
		return nil, nil
	}
	return &wire.Lock{Type: found.typ, Start: found.start, End: found.end, Pid: found.pid}, nil
}

func (m *Model) subtract(ino uint64, session string, owner uint64, flock bool, start, end uint64) {
	var kept []heldLock
	for _, held := range m.locks[ino] {
		if held.session != session || held.owner != owner || held.flock != flock || held.start > end || start > held.end {
			kept = append(kept, held)
			continue
		}
		if held.start < start {
			piece := held
			piece.end = start - 1
			kept = append(kept, piece)
		}
		if held.end > end {
			piece := held
			piece.start = end + 1
			kept = append(kept, piece)
		}
	}
	if len(kept) == 0 {
		delete(m.locks, ino)
		return
	}
	m.locks[ino] = kept
}

func (m *Model) wake() {
	close(m.lockWake)
	m.lockWake = make(chan struct{})
}

func (m *Model) Setlk(ctx context.Context, session string, ino, owner uint64, lock wire.Lock, wait, flock bool) error {
	for {
		m.mu.Lock()
		if _, err := m.get(ino); err != nil {
			m.mu.Unlock()
			return err
		}
		want := heldLock{session: session, owner: owner, typ: lock.Type, start: lock.Start, end: lock.End, pid: lock.Pid, flock: flock}
		if flock {
			m.subtract(ino, session, owner, true, 0, wire.EndOfFile)
		}
		if m.conflict(ino, want) == nil {
			m.subtract(ino, session, owner, flock, want.start, want.end)
			m.locks[ino] = append(m.locks[ino], want)
			m.wake()
			m.mu.Unlock()
			return nil
		}
		if !wait {
			m.mu.Unlock()
			return fail(wire.ErrEAGAIN)
		}
		wake := m.lockWake
		m.mu.Unlock()
		select {
		case <-wake:
		case <-ctx.Done():
			return fail(wire.ErrEINTR)
		}
	}
}

func (m *Model) Unlock(session string, ino, owner uint64, flock bool, start, end uint64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.subtract(ino, session, owner, flock, start, end)
	m.wake()
}

func (m *Model) ReleaseSession(session string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for ino, held := range m.locks {
		var kept []heldLock
		for _, lock := range held {
			if lock.session != session {
				kept = append(kept, lock)
			}
		}
		if len(kept) == 0 {
			delete(m.locks, ino)
		} else {
			m.locks[ino] = kept
		}
	}
	m.wake()
}

func (m *Model) Held(ino uint64) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.locks[ino])
}

func (m *Model) resolve(p string) (*inode, error) {
	n := m.inodes[m.root]
	for _, segment := range strings.Split(strings.Trim(path.Clean("/"+p), "/"), "/") {
		if segment == "" {
			continue
		}
		if n.typ != wire.InodeTypeDirectory {
			return nil, fail(wire.ErrENOTDIR)
		}
		child, ok := n.names[segment]
		if !ok {
			return nil, fail(wire.ErrENOENT)
		}
		n = m.inodes[child]
	}
	return n, nil
}

func (m *Model) ensureDir(by, p string) (*inode, error) {
	cur := m.inodes[m.root]
	for _, segment := range strings.Split(strings.Trim(path.Clean("/"+p), "/"), "/") {
		if segment == "" {
			continue
		}
		if child, ok := cur.names[segment]; ok {
			cur = m.inodes[child]
			continue
		}
		_, n, err := m.create(by, cur.ino, segment, wire.InodeTypeDirectory, 0o755, nil, nil)
		if err != nil {
			return nil, err
		}
		cur = n
	}
	return cur, nil
}

func (m *Model) Put(p, content string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	dir, err := m.ensureDir("test", path.Dir(p))
	if err != nil {
		panic(err)
	}
	if child, ok := dir.names[path.Base(p)]; ok {
		n := m.inodes[child]
		n.data = []byte(content)
		m.modified(n)
		m.emit("test", Change{Inodes: []uint64{n.ino}})
		return
	}
	_, n, err := m.create("test", dir.ino, path.Base(p), wire.InodeTypeFile, 0o644, nil, nil)
	if err != nil {
		panic(err)
	}
	n.data = []byte(content)
}

func (m *Model) EnsureDir(p string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, err := m.ensureDir("test", p); err != nil {
		panic(err)
	}
}

func (m *Model) Content(p string) (string, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.resolve(p)
	if err != nil || n.typ != wire.InodeTypeFile {
		return "", false
	}
	return string(n.data), true
}

func (m *Model) Exists(p string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, err := m.resolve(p)
	return err == nil
}

func (m *Model) Names(dir string) []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.resolve(dir)
	if err != nil || n.typ != wire.InodeTypeDirectory {
		return nil
	}
	names := make([]string, 0, len(n.names))
	for name := range n.names {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func (m *Model) InodeOf(p string) uint64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.resolve(p)
	if err != nil {
		return 0
	}
	return n.ino
}

func (m *Model) Rev(p string) uint64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.resolve(p)
	if err != nil {
		return 0
	}
	return n.rev
}

func (m *Model) Notify(c Change) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.emit("test", c)
}

type Write struct {
	Offset uint64
	Data   []byte
}

func (m *Model) Commit(by string, ino, baseRev, size uint64, writes []Write) (wire.Attr, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n, err := m.get(ino)
	if err != nil {
		return wire.Attr{}, err
	}
	if baseRev != 0 && baseRev != n.rev {
		return wire.Attr{}, &wire.RemoteError{Code: wire.ErrESTALE, Rev: n.rev, HasRev: true}
	}
	data := resize(append([]byte(nil), n.data...), max(size, uint64(len(n.data))))
	for _, w := range writes {
		if end := w.Offset + uint64(len(w.Data)); end > uint64(len(data)) {
			data = resize(data, end)
		}
		copy(data[w.Offset:], w.Data)
	}
	n.data = resize(data, size)
	m.modified(n)
	m.emit(by, Change{Inodes: []uint64{n.ino}})
	return m.attr(n), nil
}
