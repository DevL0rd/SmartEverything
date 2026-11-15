package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

type fileState struct {
	Root   string `json:"root"`
	Ino    uint64 `json:"ino"`
	Size   int64  `json:"size"`
	Etag   string `json:"etag"`
	Block  int64  `json:"block"`
	Pinned bool   `json:"pinned"`
	Have   []byte `json:"have"`
}

type loadedState struct {
	key string
	st  fileState
	at  time.Time
}

type storedDir struct {
	Order    []string          `json:"order"`
	Names    map[string]uint64 `json:"names"`
	Complete bool              `json:"complete"`
}

type storedInode struct {
	Attr wire.Attr  `json:"attr"`
	Link *string    `json:"link,omitempty"`
	Dir  *storedDir `json:"dir,omitempty"`
}

type storedRoot struct {
	Root      string                 `json:"root"`
	Placement string                 `json:"placement"`
	Ino       uint64                 `json:"ino"`
	Inodes    map[uint64]storedInode `json:"inodes"`
}

func digest(parts ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(sum[:16])
}

func fileKey(ino uint64, etag string, size int64) string {
	return digest(strconv.FormatUint(ino, 10), etag, strconv.FormatInt(size, 10))
}

func writeJSON[T any](target string, value T) error {
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

func readJSON[T any](source string) (T, error) {
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
		out = append(out, loadedState{key: strings.TrimSuffix(filepath.Base(name), ".json"), st: st, at: modTime(name)})
	}
	return out, nil
}

func rootFile(dir, root string) string { return filepath.Join(dir, digest(root)+".json") }

func loadRoots(dir string) ([]storedRoot, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	names, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil {
		return nil, err
	}
	out := make([]storedRoot, 0, len(names))
	for _, name := range names {
		loaded, err := readJSON[storedRoot](name)
		if err != nil {
			return nil, fmt.Errorf("cache metadata %s: %w", filepath.Base(name), err)
		}
		out = append(out, loaded)
	}
	return out, nil
}

func saveRoot(dir string, root storedRoot) error {
	return writeJSON(rootFile(dir, root.Root), root)
}

type lruNode struct {
	id         blockID
	bytes      int64
	used       time.Time
	prev, next *lruNode
}

type pool struct {
	used       int64
	head, tail *lruNode
	at         map[blockID]*lruNode
}

func newPool() *pool {
	return &pool{at: map[blockID]*lruNode{}}
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

func (p *pool) add(id blockID, bytes int64, at time.Time) {
	if _, ok := p.at[id]; ok {
		return
	}
	n := &lruNode{id: id, bytes: bytes, used: at}
	p.at[id] = n
	p.used += bytes
	p.front(n)
}

func (p *pool) touch(id blockID, at time.Time) {
	if n, ok := p.at[id]; ok {
		n.used = at
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
