package main

import (
	"crypto/rand"
	"encoding/hex"
	"slices"
	"sort"
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
	AtimeNs   *int64      `json:"atimeNs,omitempty"`
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
	Touched    int64       `json:"touched,omitempty"`
	Atime      *int64      `json:"atime,omitempty"`
	Mtime      *int64      `json:"mtime,omitempty"`
}

func newSessionID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw), nil
}
