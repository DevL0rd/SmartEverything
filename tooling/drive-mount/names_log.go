package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/smarteverything/drive-mount/wire"
)

const (
	namesDir  = "names"
	namesFile = "names.log"
)

const (
	nameCreate  = "file"
	nameMkdir   = "dir"
	nameSymlink = "symlink"
	nameMknod   = "node"
	nameUnlink  = "unlink"
	nameRmdir   = "rmdir"
	nameRename  = "rename"
)

const symlinkMode = 0o777

func isCreation(kind string) bool {
	return kind == nameCreate || kind == nameMkdir || kind == nameSymlink || kind == nameMknod
}

type nameEntry struct {
	Seq       uint64     `json:"seq"`
	Kind      string     `json:"kind"`
	Ino       uint64     `json:"ino"`
	Parent    uint64     `json:"parent"`
	Name      string     `json:"name"`
	Origin    string     `json:"origin,omitempty"`
	Root      string     `json:"root"`
	Mode      uint32     `json:"mode"`
	UID       *uint32    `json:"uid,omitempty"`
	GID       *uint32    `json:"gid,omitempty"`
	MtimeNs   int64      `json:"mtimeNs"`
	OpKey     string     `json:"opKey"`
	Target    string     `json:"target,omitempty"`
	Type      uint8      `json:"type,omitempty"`
	Rdev      uint32     `json:"rdev,omitempty"`
	NewParent uint64     `json:"newParent,omitempty"`
	NewName   string     `json:"newName,omitempty"`
	Flags     uint32     `json:"flags,omitempty"`
	Moved     *wire.Attr `json:"moved,omitempty"`
	Replaced  uint64     `json:"replaced,omitempty"`
}

type nameLine struct {
	Op    string     `json:"op"`
	Entry *nameEntry `json:"entry,omitempty"`
	Seq   uint64     `json:"seq,omitempty"`
}

type nameJournal struct {
	mu     sync.Mutex
	path   string
	file   *os.File
	out    *bufio.Writer
	closed bool
}

type journalContents struct {
	live   []nameEntry
	leased []uint64
}

func openNameJournal(dir string) (*nameJournal, journalContents, error) {
	path := filepath.Join(dir, namesFile)
	contents, err := readNameLines(path)
	if err != nil {
		return nil, journalContents{}, err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return nil, journalContents{}, err
	}
	return &nameJournal{path: path, file: file, out: bufio.NewWriter(file)}, contents, nil
}

func readNameLines(path string) (journalContents, error) {
	raw, err := completeLines(path)
	if err != nil {
		return journalContents{}, err
	}
	var leased []uint64
	var order []uint64
	live := map[uint64]nameEntry{}
	scanner := bufio.NewScanner(bytes.NewReader(raw))
	scanner.Buffer(make([]byte, 64<<10), 1<<20)
	for scanner.Scan() {
		var line nameLine
		if err := json.Unmarshal(scanner.Bytes(), &line); err != nil {
			return journalContents{}, fmt.Errorf("names: %s has a torn line: %w", path, err)
		}
		switch {
		case line.Op == "set" && line.Entry != nil:
			if _, known := live[line.Entry.Seq]; !known {
				order = append(order, line.Entry.Seq)
			}
			live[line.Entry.Seq] = *line.Entry
			if isCreation(line.Entry.Kind) {
				leased = append(leased, line.Entry.Ino)
			}
		case line.Op == "done":
			delete(live, line.Seq)
		default:
			return journalContents{}, fmt.Errorf("names: %s has an unknown line %q", path, scanner.Text())
		}
	}
	if err := scanner.Err(); err != nil {
		return journalContents{}, err
	}
	out := make([]nameEntry, 0, len(live))
	for _, seq := range order {
		if e, ok := live[seq]; ok {
			out = append(out, e)
		}
	}
	return journalContents{live: out, leased: leased}, nil
}

func (j *nameJournal) write(line nameLine) error {
	raw, err := json.Marshal(line)
	if err != nil {
		return err
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.closed {
		return errJournalClosed
	}
	if _, err := j.out.Write(append(raw, '\n')); err != nil {
		return err
	}
	return j.out.Flush()
}

func (j *nameJournal) set(e nameEntry) error { return j.write(nameLine{Op: "set", Entry: &e}) }

func (j *nameJournal) done(seq uint64) error { return j.write(nameLine{Op: "done", Seq: seq}) }

func (j *nameJournal) sync() error {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.closed {
		return errJournalClosed
	}
	if err := j.out.Flush(); err != nil {
		return err
	}
	return j.file.Sync()
}

func (j *nameJournal) compact() error {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.closed {
		return nil
	}
	if err := j.out.Flush(); err != nil {
		return err
	}
	return j.file.Truncate(0)
}

func (j *nameJournal) close() error {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.closed {
		return nil
	}
	j.closed = true
	if err := j.out.Flush(); err != nil {
		return err
	}
	return j.file.Close()
}

var errJournalClosed = errors.New("names: the journal is closed")
