package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
)

const (
	sessionsFile = "sessions.log"
	compactLines = 4096
)

type sessionLine struct {
	Op  string         `json:"op"`
	Rec *journalRecord `json:"rec,omitempty"`
	ID  string         `json:"id,omitempty"`
}

type journal struct {
	dir     string
	mu      sync.Mutex
	file    *os.File
	out     *bufio.Writer
	order   []string
	records map[string][]byte
	lines   int
	doomed  []string
	closed  bool
	compact func()
}

var errSessionsClosed = errors.New("journal: the session log is closed")

func openJournal(dir string) (*journal, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	j := &journal{dir: dir, records: map[string][]byte{}}
	path := filepath.Join(dir, sessionsFile)
	if err := j.read(path); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return nil, err
	}
	if err := syncDir(dir); err != nil {
		file.Close()
		return nil, err
	}
	j.file, j.out = file, bufio.NewWriter(file)
	j.compact = coalesced(j.compactNow)
	if err := j.migrateRecordFiles(); err != nil {
		j.close()
		return nil, err
	}
	return j, nil
}

func (j *journal) migrateRecordFiles() error {
	names, err := filepath.Glob(filepath.Join(j.dir, "*.json"))
	if err != nil || len(names) == 0 {
		return err
	}
	slices.SortFunc(names, func(a, b string) int { return modTime(a).Compare(modTime(b)) })
	for _, name := range names {
		raw, err := os.ReadFile(name)
		if err != nil {
			return err
		}
		var rec journalRecord
		if err := json.Unmarshal(raw, &rec); err != nil {
			return fmt.Errorf("journal: the record file %s cannot be read: %w", name, err)
		}
		if rec.ID != strings.TrimSuffix(filepath.Base(name), ".json") {
			return fmt.Errorf("journal: the record file %s names another session", name)
		}
		if err := j.saveDurable(rec); err != nil {
			return err
		}
	}
	for _, name := range names {
		if err := os.Remove(name); err != nil {
			return err
		}
	}
	fmt.Fprintln(os.Stderr, "journal: moved", len(names), "session records into", sessionsFile)
	return syncDir(j.dir)
}

func completeLines(path string) ([]byte, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	whole := raw[:bytes.LastIndexByte(raw, '\n')+1]
	if len(whole) != len(raw) {
		if err := os.Truncate(path, int64(len(whole))); err != nil {
			return nil, err
		}
	}
	return whole, nil
}

func (j *journal) read(path string) error {
	raw, err := completeLines(path)
	if err != nil {
		return err
	}
	for number, text := range strings.Split(strings.TrimSuffix(string(raw), "\n"), "\n") {
		if text == "" {
			continue
		}
		var line sessionLine
		if err := json.Unmarshal([]byte(text), &line); err != nil {
			return fmt.Errorf("journal: line %d of %s is not a session line: %w", number+1, path, err)
		}
		switch {
		case line.Op == "set" && line.Rec != nil:
			j.track(line.Rec.ID, []byte(text))
		case line.Op == "done" && line.ID != "":
			j.forget(line.ID)
		default:
			return fmt.Errorf("journal: line %d of %s has the unknown op %q", number+1, path, line.Op)
		}
		j.lines++
	}
	return nil
}

func (j *journal) track(id string, line []byte) {
	if _, known := j.records[id]; !known {
		j.order = append(j.order, id)
	}
	j.records[id] = line
}

func (j *journal) forget(id string) {
	if _, known := j.records[id]; !known {
		return
	}
	delete(j.records, id)
	j.order = slices.DeleteFunc(j.order, func(other string) bool { return other == id })
}

func (j *journal) dataPath(id string) string { return filepath.Join(j.dir, id+".data") }

func (j *journal) openData(id string) (*os.File, error) {
	return os.OpenFile(j.dataPath(id), os.O_RDWR|os.O_CREATE, 0o600)
}

func (j *journal) appendLocked(raw []byte) error {
	if j.closed {
		return errSessionsClosed
	}
	if _, err := j.out.Write(append(raw, '\n')); err != nil {
		return err
	}
	j.lines++
	return j.out.Flush()
}

func (j *journal) setLocked(rec journalRecord) error {
	raw, err := json.Marshal(sessionLine{Op: "set", Rec: &rec})
	if err != nil {
		return err
	}
	if err := j.appendLocked(raw); err != nil {
		return err
	}
	j.track(rec.ID, raw)
	return nil
}

func (j *journal) save(rec journalRecord) error {
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.setLocked(rec)
}

func (j *journal) saveDurable(rec journalRecord) error {
	j.mu.Lock()
	defer j.mu.Unlock()
	if err := j.setLocked(rec); err != nil {
		return err
	}
	if err := j.file.Sync(); err != nil {
		return err
	}
	return j.dropDoomedLocked()
}

func (j *journal) remove(id string) error {
	j.mu.Lock()
	defer j.mu.Unlock()
	raw, err := json.Marshal(sessionLine{Op: "done", ID: id})
	if err != nil {
		return err
	}
	if err := j.appendLocked(raw); err != nil {
		return err
	}
	j.forget(id)
	j.doomed = append(j.doomed, j.dataPath(id))
	if j.compactDue() || len(j.records) == 0 {
		j.compact()
	}
	return nil
}

func (j *journal) compactDue() bool {
	return j.lines >= compactLines && j.lines > 2*len(j.records)
}

func (j *journal) dropDoomedLocked() error {
	for _, path := range j.doomed {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	j.doomed = nil
	return nil
}

func (j *journal) compactNow() {
	if err := j.rewrite(); err != nil {
		fmt.Fprintln(os.Stderr, "journal:", err)
	}
}

func (j *journal) rewrite() error {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.closed {
		return nil
	}
	if len(j.records) == 0 && j.lines > 0 {
		return j.emptyLocked()
	}
	if !j.compactDue() {
		return nil
	}
	path := filepath.Join(j.dir, sessionsFile)
	temp := path + ".tmp"
	var buf bytes.Buffer
	for _, id := range j.order {
		buf.Write(append(j.records[id], '\n'))
	}
	if err := writeSynced(temp, buf.Bytes()); err != nil {
		return err
	}
	if err := j.out.Flush(); err != nil {
		return err
	}
	if err := os.Rename(temp, path); err != nil {
		return err
	}
	if err := syncDir(j.dir); err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return err
	}
	j.file.Close()
	j.file, j.out, j.lines = file, bufio.NewWriter(file), len(j.order)
	return j.dropDoomedLocked()
}

func (j *journal) emptyLocked() error {
	if err := j.out.Flush(); err != nil {
		return err
	}
	if err := j.file.Sync(); err != nil {
		return err
	}
	if err := j.dropDoomedLocked(); err != nil {
		return err
	}
	if err := j.file.Truncate(0); err != nil {
		return err
	}
	j.lines = 0
	return nil
}

func writeSynced(path string, raw []byte) error {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(raw); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

func (j *journal) load() ([]journalRecord, error) {
	j.mu.Lock()
	defer j.mu.Unlock()
	out := make([]journalRecord, 0, len(j.order))
	for _, id := range j.order {
		var line sessionLine
		if err := json.Unmarshal(j.records[id], &line); err != nil {
			return nil, err
		}
		rec := *line.Rec
		if rec.Unit != nil && rec.Unit.WrittenNs <= 0 {
			return nil, fmt.Errorf("journal record %s: its unit has no write time", id)
		}
		out = append(out, rec)
	}
	return out, nil
}

func (j *journal) sweepOrphans(known map[string]bool) error {
	names, err := filepath.Glob(filepath.Join(j.dir, "*.data"))
	if err != nil {
		return err
	}
	for _, name := range names {
		id := strings.TrimSuffix(filepath.Base(name), ".data")
		if !known[id] {
			if err := os.Remove(name); err != nil {
				return err
			}
		}
	}
	if err := os.Remove(filepath.Join(j.dir, sessionsFile+".tmp")); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (j *journal) close() error {
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
