package wire

type Attr struct {
	Ino     uint64
	Type    uint8
	Mode    uint32
	Nlink   uint32
	UID     *uint32
	GID     *uint32
	Size    uint64
	Blocks  uint64
	AtimeNs int64
	MtimeNs int64
	CtimeNs int64
	BtimeNs int64
	Rdev    uint32
	Rev     uint64
	Etag    string
}

type Entry struct {
	Ino  uint64
	Attr Attr
}

type DirEntry struct {
	Name string
	Entry
}

type DirPage struct {
	Entries []DirEntry
	Next    *uint64
}

type Statfs struct {
	Blocks  uint64
	Free    uint64
	Avail   uint64
	Files   uint64
	Ffree   uint64
	Bsize   uint32
	Namelen uint32
}

type Root struct {
	Root string
	Ino  uint64
	Attr Attr
	Seq  uint64
}

type Committed struct {
	Attr Attr
	Rev  uint64
}

type Lock struct {
	Type  uint8
	Start uint64
	End   uint64
	Pid   uint32
}

type CommitProgress struct {
	Commit uint64
	Ranges [][2]uint64
}

func u32(v uint64, key uint64) (uint32, error) {
	if v > 0xffff_ffff {
		return 0, &FieldError{key, "32 bit unsigned integer", v}
	}
	return uint32(v), nil
}

type reader struct {
	m   Meta
	err error
}

func (r *reader) uint(key uint64) uint64 {
	v, err := r.m.Uint(key)
	r.fail(err)
	return v
}

func (r *reader) int(key uint64) int64 {
	v, err := r.m.Int(key)
	r.fail(err)
	return v
}

func (r *reader) u32(key uint64) uint32 {
	v, err := u32(r.uint(key), key)
	r.fail(err)
	return v
}

func (r *reader) text(key uint64) string {
	v, err := r.m.String(key)
	r.fail(err)
	return v
}

func (r *reader) fail(err error) {
	if r.err == nil {
		r.err = err
	}
}

func ParseAttr(m Meta) (Attr, error) {
	r := reader{m: m}
	a := Attr{
		Ino:     r.uint(KeyIno),
		Type:    uint8(r.uint(KeyType)),
		Mode:    r.u32(KeyMode),
		Nlink:   r.u32(KeyNlink),
		Size:    r.uint(KeySize),
		Blocks:  r.uint(KeyBlocks),
		AtimeNs: r.int(KeyAtimeNs),
		MtimeNs: r.int(KeyMtimeNs),
		CtimeNs: r.int(KeyCtimeNs),
		BtimeNs: r.int(KeyBtimeNs),
		Rdev:    r.u32(KeyRdev),
		Rev:     r.uint(KeyRev),
		Etag:    r.text(KeyEtag),
	}
	var err error
	if a.UID, err = m.OptUint32(KeyUid); err != nil {
		r.fail(err)
	}
	if a.GID, err = m.OptUint32(KeyGid); err != nil {
		r.fail(err)
	}
	return a, r.err
}

func (m Meta) Attr(key uint64) (Attr, error) {
	inner, err := m.Map(key)
	if err != nil {
		return Attr{}, err
	}
	return ParseAttr(inner)
}

func ParseEntry(m Meta) (Entry, error) {
	ino, err := m.Uint(KeyIno)
	if err != nil {
		return Entry{}, err
	}
	attr, err := m.Attr(KeyAttr)
	if err != nil {
		return Entry{}, err
	}
	return Entry{Ino: ino, Attr: attr}, nil
}

func ParseDirPage(m Meta) (DirPage, error) {
	items, err := m.Array(KeyEntries)
	if err != nil {
		return DirPage{}, err
	}
	page := DirPage{Entries: make([]DirEntry, 0, len(items))}
	for _, item := range items {
		tuple, ok := item.([]any)
		if !ok || len(tuple) != 3 {
			return DirPage{}, &FieldError{KeyEntries, "[name, ino, attr] tuples", item}
		}
		name, ok := tuple[0].(string)
		if !ok {
			return DirPage{}, &FieldError{KeyName, "text", tuple[0]}
		}
		ino, err := asUint(tuple[1], KeyIno)
		if err != nil {
			return DirPage{}, err
		}
		inner, err := asMeta(tuple[2], KeyAttr)
		if err != nil {
			return DirPage{}, err
		}
		attr, err := ParseAttr(inner)
		if err != nil {
			return DirPage{}, err
		}
		page.Entries = append(page.Entries, DirEntry{Name: name, Entry: Entry{Ino: ino, Attr: attr}})
	}
	if m[KeyNext] != nil {
		next, err := m.Uint(KeyNext)
		if err != nil {
			return DirPage{}, err
		}
		page.Next = &next
	}
	return page, nil
}

func ParseStatfs(m Meta) (Statfs, error) {
	r := reader{m: m}
	s := Statfs{
		Blocks:  r.uint(KeyBlocks),
		Free:    r.uint(KeyFree),
		Avail:   r.uint(KeyAvail),
		Files:   r.uint(KeyFiles),
		Ffree:   r.uint(KeyFfree),
		Bsize:   r.u32(KeyBsize),
		Namelen: r.u32(KeyNamelen),
	}
	return s, r.err
}

func ParseRoot(m Meta) (Root, error) {
	r := reader{m: m}
	root := Root{Root: r.text(KeyRoot), Ino: r.uint(KeyIno), Seq: r.uint(KeySeq)}
	if r.err != nil {
		return Root{}, r.err
	}
	attr, err := m.Attr(KeyAttr)
	root.Attr = attr
	return root, err
}

func ParseCommitted(m Meta) (Committed, error) {
	attr, err := m.Attr(KeyAttr)
	if err != nil {
		return Committed{}, err
	}
	rev, err := m.Uint(KeyRev)
	return Committed{Attr: attr, Rev: rev}, err
}

func ParseRanges(v any, key uint64) ([][2]uint64, error) {
	items, ok := v.([]any)
	if !ok {
		return nil, &FieldError{key, "array of [start, length] pairs", v}
	}
	out := make([][2]uint64, 0, len(items))
	for _, item := range items {
		pair, ok := item.([]any)
		if !ok || len(pair) != 2 {
			return nil, &FieldError{key, "[start, length] pair", item}
		}
		start, err := asUint(pair[0], key)
		if err != nil {
			return nil, err
		}
		length, err := asUint(pair[1], key)
		if err != nil {
			return nil, err
		}
		out = append(out, [2]uint64{start, length})
	}
	return out, nil
}

func ParseLock(v any) (*Lock, error) {
	if v == nil {
		return nil, nil
	}
	m, err := asMeta(v, KeyLock)
	if err != nil {
		return nil, err
	}
	r := reader{m: m}
	lock := Lock{Type: uint8(r.uint(KeyType)), Start: r.uint(KeyStart), End: r.uint(KeyEnd), Pid: r.u32(KeyPid)}
	return &lock, r.err
}

func ParseNames(m Meta) ([]string, error) {
	items, err := m.Array(KeyNames)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(items))
	for _, item := range items {
		name, ok := item.(string)
		if !ok {
			return nil, &FieldError{KeyNames, "text", item}
		}
		names = append(names, name)
	}
	return names, nil
}
