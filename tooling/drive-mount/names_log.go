package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

const (
	namesDir  = "names"
	namesFile = "names.log"
)

const (
	nameCreate = "file"
	nameMkdir  = "dir"
	nameUnlink = "unlink"
	nameRmdir  = "rmdir"
)

type nameEntry struct {
	Seq     uint64  `json:"seq"`
	Kind    string  `json:"kind"`
	Ino     uint64  `json:"ino"`
	Parent  uint64  `json:"parent"`
	Name    string  `json:"name"`
	Root    string  `json:"root"`
	Mode    uint32  `json:"mode"`
	UID     *uint32 `json:"uid,omitempty"`
	GID     *uint32 `json:"gid,omitempty"`
	MtimeNs int64   `json:"mtimeNs"`
	OpKey   string  `json:"opKey"`
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

func openNameJournal(dir string) (*nameJournal, []nameEntry, error) {
	path := filepath.Join(dir, namesFile)
	entries, err := readNameLines(path)
	if err != nil {
		return nil, nil, err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return nil, nil, err
	}
	return &nameJournal{path: path, file: file, out: bufio.NewWriter(file)}, entries, nil
}

func readNameLines(path string) ([]nameEntry, error) {
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()
	var order []uint64
	live := map[uint64]nameEntry{}
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64<<10), 1<<20)
	for scanner.Scan() {
		var line nameLine
		if err := json.Unmarshal(scanner.Bytes(), &line); err != nil {
			return nil, fmt.Errorf("names: %s has a torn line: %w", path, err)
		}
		switch {
		case line.Op == "set" && line.Entry != nil:
			if _, known := live[line.Entry.Seq]; !known {
				order = append(order, line.Entry.Seq)
			}
			live[line.Entry.Seq] = *line.Entry
		case line.Op == "done":
			delete(live, line.Seq)
		default:
			return nil, fmt.Errorf("names: %s has an unknown line %q", path, scanner.Text())
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	out := make([]nameEntry, 0, len(live))
	for _, seq := range order {
		if e, ok := live[seq]; ok {
			out = append(out, e)
		}
	}
	return out, nil
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
