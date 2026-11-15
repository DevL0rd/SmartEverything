package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"time"
)

const (
	phaseOpen   = "open"
	phaseSealed = "sealed"
)

type rangeSet struct {
	spans [][2]uint64
}

func (r *rangeSet) empty() bool { return len(r.spans) == 0 }

func (r *rangeSet) clone() rangeSet { return rangeSet{spans: slices.Clone(r.spans)} }

func (r *rangeSet) clear() { r.spans = nil }

func (r *rangeSet) add(start, end uint64) {
	if start >= end {
		return
	}
	at := sort.Search(len(r.spans), func(i int) bool { return r.spans[i][1] >= start })
	merged := [2]uint64{start, end}
	last := at
	for last < len(r.spans) && r.spans[last][0] <= end {
		merged[0] = min(merged[0], r.spans[last][0])
		merged[1] = max(merged[1], r.spans[last][1])
		last++
	}
	r.spans = slices.Replace(r.spans, at, last, merged)
}

func (r *rangeSet) remove(start, end uint64) {
	if start >= end || len(r.spans) == 0 {
		return
	}
	out := make([][2]uint64, 0, len(r.spans)+1)
	for _, span := range r.spans {
		if span[1] <= start || span[0] >= end {
			out = append(out, span)
			continue
		}
		if span[0] < start {
			out = append(out, [2]uint64{span[0], start})
		}
		if span[1] > end {
			out = append(out, [2]uint64{end, span[1]})
		}
	}
	r.spans = out
}

func (r *rangeSet) cut(size uint64) { r.remove(size, ^uint64(0)) }

func (r *rangeSet) intersect(other rangeSet) rangeSet {
	var out rangeSet
	for _, a := range r.spans {
		for _, b := range other.spans {
			lo, hi := max(a[0], b[0]), min(a[1], b[1])
			if lo < hi {
				out.spans = append(out.spans, [2]uint64{lo, hi})
			}
		}
	}
	return out
}

func (r *rangeSet) subtract(other rangeSet) {
	for _, span := range other.spans {
		r.remove(span[0], span[1])
	}
}

func (r *rangeSet) covers(start, end uint64) bool {
	if start >= end {
		return true
	}
	for _, span := range r.spans {
		if span[0] <= start && span[1] >= end {
			return true
		}
	}
	return false
}

func (r *rangeSet) at(pos uint64) ([2]uint64, bool) {
	i := sort.Search(len(r.spans), func(i int) bool { return r.spans[i][1] > pos })
	if i < len(r.spans) && r.spans[i][0] <= pos {
		return r.spans[i], true
	}
	return [2]uint64{}, false
}

func (r *rangeSet) nextStart(pos uint64) (uint64, bool) {
	i := sort.Search(len(r.spans), func(i int) bool { return r.spans[i][0] > pos })
	if i < len(r.spans) {
		return r.spans[i][0], true
	}
	return 0, false
}

func (r *rangeSet) total() uint64 {
	var sum uint64
	for _, span := range r.spans {
		sum += span[1] - span[0]
	}
	return sum
}

type unitRecord struct {
	Ranges    [][2]uint64 `json:"ranges"`
	Zeros     [][2]uint64 `json:"zeros"`
	Size      uint64      `json:"size"`
	BeginKey  string      `json:"beginKey"`
	EndKey    string      `json:"endKey"`
	Commit    uint64      `json:"commit"`
	Fsync     bool        `json:"fsync"`
	WrittenNs int64       `json:"writtenNs"`
}

type journalRecord struct {
	ID         string      `json:"id"`
	Ino        uint64      `json:"ino"`
	Parent     uint64      `json:"parent"`
	Name       string      `json:"name"`
	Orphan     bool        `json:"orphan"`
	Phase      string      `json:"phase"`
	BaseRev    uint64      `json:"baseRev"`
	BaseSize   uint64      `json:"baseSize"`
	CleanLimit uint64      `json:"cleanLimit"`
	Size       uint64      `json:"size"`
	Mode       uint32      `json:"mode"`
	UID        *uint32     `json:"uid"`
	GID        *uint32     `json:"gid"`
	Ranges     [][2]uint64 `json:"ranges"`
	Zeros      [][2]uint64 `json:"zeros"`
	Since      [][2]uint64 `json:"since"`
	Forced     bool        `json:"forced"`
	Unit       *unitRecord `json:"unit,omitempty"`
}

type journal struct {
	dir string
}

func openJournal(dir string) (*journal, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	return &journal{dir: dir}, nil
}

func newSessionID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw), nil
}

func (j *journal) recordPath(id string) string { return filepath.Join(j.dir, id+".json") }

func (j *journal) dataPath(id string) string { return filepath.Join(j.dir, id+".data") }

func (j *journal) openData(id string) (*os.File, error) {
	return os.OpenFile(j.dataPath(id), os.O_RDWR|os.O_CREATE, 0o600)
}

func (j *journal) save(rec journalRecord) error {
	return writeRecord(j.recordPath(rec.ID), rec, false)
}

func (j *journal) saveDurable(rec journalRecord) error {
	return writeRecord(j.recordPath(rec.ID), rec, true)
}

func (j *journal) remove(id string) error {
	if err := os.Remove(j.recordPath(id)); err != nil && !os.IsNotExist(err) {
		return err
	}
	if err := os.Remove(j.dataPath(id)); err != nil && !os.IsNotExist(err) {
		return err
	}
	return syncDir(j.dir)
}

func (j *journal) load() ([]journalRecord, error) {
	names, err := filepath.Glob(filepath.Join(j.dir, "*.json"))
	if err != nil {
		return nil, err
	}
	slices.SortFunc(names, func(a, b string) int { return recordTime(a).Compare(recordTime(b)) })
	out := make([]journalRecord, 0, len(names))
	for _, name := range names {
		rec, err := readRecord(name)
		if err != nil {
			return nil, fmt.Errorf("journal %s: %w", filepath.Base(name), err)
		}
		if rec.ID != strings.TrimSuffix(filepath.Base(name), ".json") {
			return nil, fmt.Errorf("journal %s: record names another session", filepath.Base(name))
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
	temps, err := filepath.Glob(filepath.Join(j.dir, "*.tmp"))
	if err != nil {
		return err
	}
	for _, name := range temps {
		if err := os.Remove(name); err != nil {
			return err
		}
	}
	return nil
}

func writeRecord(target string, rec journalRecord, durable bool) error {
	raw, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	temp := target + ".tmp"
	f, err := os.OpenFile(temp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(raw); err != nil {
		f.Close()
		return err
	}
	if durable {
		if err := f.Sync(); err != nil {
			f.Close()
			return err
		}
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := os.Rename(temp, target); err != nil {
		return err
	}
	if durable {
		return syncDir(filepath.Dir(target))
	}
	return nil
}

func recordTime(name string) time.Time {
	info, err := os.Stat(name)
	if err != nil {
		return time.Time{}
	}
	return info.ModTime()
}

func readRecord(name string) (journalRecord, error) {
	raw, err := os.ReadFile(name)
	if err != nil {
		return journalRecord{}, err
	}
	var rec journalRecord
	if err := json.Unmarshal(raw, &rec); err != nil {
		return journalRecord{}, err
	}
	if rec.Unit != nil && rec.Unit.WrittenNs <= 0 {
		return journalRecord{}, fmt.Errorf("journal record %s: its unit has no write time", name)
	}
	return rec, nil
}
