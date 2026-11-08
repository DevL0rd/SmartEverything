package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
)

type fileState struct {
	Root   mountRoot `json:"root"`
	Path   string    `json:"path"`
	Size   int64     `json:"size"`
	Etag   string    `json:"etag"`
	Block  int64     `json:"block"`
	Pinned bool      `json:"pinned"`
	Have   []byte    `json:"have"`
}

type loadedState struct {
	key string
	st  fileState
}

func digest(parts ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(sum[:16])
}

func fileKey(root mountRoot, filePath string, size int64, etag string) string {
	return digest(root.RootID, root.FolderID, filePath, fmt.Sprint(size), etag)
}

func writeJSON[T fileState | mountListings | journalRecord](target string, value T) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	temp := target + ".tmp"
	if err := os.WriteFile(temp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(temp, target)
}

func readJSON[T fileState | mountListings | journalRecord](source string) (T, error) {
	var value T
	raw, err := os.ReadFile(source)
	if err != nil {
		return value, err
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	return value, decoder.Decode(&value)
}

func modTime(name string) time.Time {
	info, err := os.Stat(name)
	if err != nil {
		return time.Time{}
	}
	return info.ModTime()
}

func saveState(dir, key string, st fileState) error {
	return writeJSON(filepath.Join(dir, key+".json"), st)
}

func loadStates(dir string) ([]loadedState, error) {
	names, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil {
		return nil, err
	}
	slices.SortFunc(names, func(a, b string) int { return modTime(a).Compare(modTime(b)) })
	out := make([]loadedState, 0, len(names))
	for _, name := range names {
		st, err := readJSON[fileState](name)
		if err != nil {
			return nil, fmt.Errorf("cache state %s: %w", filepath.Base(name), err)
		}
		out = append(out, loadedState{key: strings.TrimSuffix(filepath.Base(name), ".json"), st: st})
	}
	return out, nil
}

type mountListings struct {
	Root mountRoot          `json:"root"`
	Dirs map[string][]entry `json:"dirs"`
}

type listingStore struct {
	dir    string
	mu     sync.Mutex
	mounts map[mountRoot]*mountListings
	fresh  map[mountRoot]map[string]bool
}

func openListings(dir string) (*listingStore, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	store := &listingStore{dir: dir, mounts: map[mountRoot]*mountListings{}, fresh: map[mountRoot]map[string]bool{}}
	names, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil {
		return nil, err
	}
	for _, name := range names {
		loaded, err := readJSON[mountListings](name)
		if err != nil {
			return nil, fmt.Errorf("cache listings %s: %w", filepath.Base(name), err)
		}
		store.mounts[loaded.Root] = &loaded
	}
	return store, nil
}

func (s *listingStore) file(root mountRoot) string {
	return filepath.Join(s.dir, digest(root.RootID, root.FolderID)+".json")
}

func (s *listingStore) get(root mountRoot, dir string, freshOnly bool) ([]entry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	m := s.mounts[root]
	if m == nil || (freshOnly && !s.fresh[root][dir]) {
		return nil, false
	}
	items, ok := m.Dirs[dir]
	return slices.Clone(items), ok
}

func (s *listingStore) put(root mountRoot, dir string, items []entry) ([]entry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	m := s.mounts[root]
	if m == nil {
		m = &mountListings{Root: root, Dirs: map[string][]entry{}}
		s.mounts[root] = m
	}
	if s.fresh[root] == nil {
		s.fresh[root] = map[string]bool{}
	}
	s.fresh[root][dir] = true
	previous, had := m.Dirs[dir]
	if had && slices.Equal(previous, items) {
		return previous, nil
	}
	m.Dirs[dir] = slices.Clone(items)
	return previous, writeJSON(s.file(root), *m)
}

func (s *listingStore) invalidate(root mountRoot, paths []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(paths) == 0 {
		delete(s.fresh, root)
		return
	}
	for _, p := range paths {
		clean := path.Clean("/" + p)
		delete(s.fresh[root], clean)
		delete(s.fresh[root], path.Dir(clean))
		for dir := range s.fresh[root] {
			if strings.HasPrefix(dir, strings.TrimSuffix(clean, "/")+"/") {
				delete(s.fresh[root], dir)
			}
		}
	}
}

type lruNode struct {
	id         blockID
	bytes      int64
	prev, next *lruNode
}

type pool struct {
	limit, used int64
	head, tail  *lruNode
	at          map[blockID]*lruNode
}

func newPool() *pool {
	return &pool{limit: noLimit, at: map[blockID]*lruNode{}}
}

func (p *pool) unlink(n *lruNode) {
	if n.prev != nil {
		n.prev.next = n.next
	} else {
		p.head = n.next
	}
	if n.next != nil {
		n.next.prev = n.prev
	} else {
		p.tail = n.prev
	}
	n.prev, n.next = nil, nil
}

func (p *pool) front(n *lruNode) {
	n.next = p.head
	if p.head != nil {
		p.head.prev = n
	}
	p.head = n
	if p.tail == nil {
		p.tail = n
	}
}

func (p *pool) add(id blockID, bytes int64) {
	if _, ok := p.at[id]; ok {
		return
	}
	n := &lruNode{id: id, bytes: bytes}
	p.at[id] = n
	p.used += bytes
	p.front(n)
}

func (p *pool) touch(id blockID) {
	if n, ok := p.at[id]; ok {
		p.unlink(n)
		p.front(n)
	}
}

func (p *pool) remove(id blockID) {
	if n, ok := p.at[id]; ok {
		p.unlink(n)
		delete(p.at, id)
		p.used -= n.bytes
	}
}

func (p *pool) oldest() (blockID, bool) {
	if p.tail == nil {
		return blockID{}, false
	}
	return p.tail.id, true
}
