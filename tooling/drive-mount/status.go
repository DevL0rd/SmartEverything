package main

import (
	"encoding/json"
	"io"
	"sync"
	"sync/atomic"
)

const (
	stateMounted = "mounted"
	stateStopped = "stopped"
	stateFailed  = "failed"
)

type statusLine struct {
	Type     string `json:"type"`
	Mount    string `json:"mount"`
	State    string `json:"state"`
	Reason   string `json:"reason,omitempty"`
	ReadOnly bool   `json:"readOnly"`
}

type usageLine struct {
	Type    string `json:"type"`
	Mount   string `json:"mount"`
	Cache   int64  `json:"cacheBytes"`
	Open    int64  `json:"openFiles"`
	Pending int64  `json:"pendingUploads"`
}

type errorLine struct {
	Type   string `json:"type"`
	Mount  string `json:"mount,omitempty"`
	Reason string `json:"reason"`
}

type openCounter struct {
	count   atomic.Int64
	changed func()
}

func (o *openCounter) add(delta int64) {
	o.count.Add(delta)
	if o.changed != nil {
		o.changed()
	}
}

type reporter struct {
	mu   sync.Mutex
	enc  *json.Encoder
	last map[string]statusLine
	seen map[string]usageLine
}

func newReporter(out io.Writer) *reporter {
	return &reporter{enc: json.NewEncoder(out), last: map[string]statusLine{}, seen: map[string]usageLine{}}
}

func (r *reporter) status(mount, state, reason string) {
	line := statusLine{Type: "status", Mount: mount, State: state, Reason: reason}
	r.mu.Lock()
	defer r.mu.Unlock()
	if previous, ok := r.last[mount]; ok && previous == line {
		return
	}
	r.last[mount] = line
	r.enc.Encode(line)
}

func (r *reporter) usage(mount string, cache, open, pending int64) {
	line := usageLine{Type: "usage", Mount: mount, Cache: cache, Open: open, Pending: pending}
	r.mu.Lock()
	defer r.mu.Unlock()
	if previous, ok := r.seen[mount]; ok && previous == line {
		return
	}
	r.seen[mount] = line
	r.enc.Encode(line)
}

func (r *reporter) forget(mount string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.last, mount)
	delete(r.seen, mount)
}

func (r *reporter) failure(mount string, err error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.enc.Encode(errorLine{Type: "error", Mount: mount, Reason: err.Error()})
}
