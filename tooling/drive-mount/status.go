package main

import (
	"encoding/json"
	"io"
	"strings"
	"sync"
	"sync/atomic"
	"time"
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
	Pinned  int64  `json:"pinnedBytes"`
	Open    int64  `json:"openFiles"`
	Pending int64  `json:"pendingUploads"`
}

type uploadsLine struct {
	Type string `json:"type"`
	uploads
}

type limitsLine struct {
	Type              string `json:"type"`
	Platform          string `json:"platform"`
	Kernel            bool   `json:"kernel"`
	MaxUserBgreq      int64  `json:"maxUserBgreq,omitempty"`
	MaxUserCongThresh int64  `json:"maxUserCongThresh,omitempty"`
	MaxPagesLimit     int64  `json:"maxPagesLimit,omitempty"`
	PageSize          int64  `json:"pageSize,omitempty"`
	ReadaheadOffer    int64  `json:"readaheadOffer,omitempty"`
	MaxRequestBytes   int64  `json:"maxRequestBytes,omitempty"`
}

type remountApplied struct {
	MaxBackground        int64  `json:"maxBackground"`
	CongestionThreshold  int64  `json:"congestionThreshold"`
	MaxRequestBytes      int64  `json:"maxRequestBytes"`
	KernelReadaheadBytes int64  `json:"kernelReadaheadBytes"`
	AsyncRead            bool   `json:"asyncRead"`
	WritebackCache       bool   `json:"writebackCache"`
	ReaddirPlus          string `json:"readdirPlus"`
	ParallelDirops       bool   `json:"parallelDirops"`
}

type liveApplied struct {
	ReadAheadBytes       int64 `json:"readAheadBytes"`
	EntrySeconds         any   `json:"entrySeconds"`
	AttrSeconds          any   `json:"attrSeconds"`
	NegativeSeconds      any   `json:"negativeSeconds"`
	CloseWaitsForUpload  bool  `json:"closeWaitsForUpload"`
	UploadDelaySeconds   int64 `json:"uploadDelaySeconds"`
	FsyncWaitsForHub     bool  `json:"fsyncWaitsForHub"`
	UploadFiles          int64 `json:"uploadFiles"`
	UploadFramesInFlight int64 `json:"uploadFramesInFlight"`
	PingSeconds          int64 `json:"pingSeconds"`
	DeadAfterSeconds     int64 `json:"deadAfterSeconds"`
	BulkFrameBytes       int64 `json:"bulkFrameBytes"`
	PrefetchSmallFiles   bool  `json:"prefetchSmallFiles"`
}

type appliedLine struct {
	Type     string          `json:"type"`
	Mount    string          `json:"mount"`
	Platform string          `json:"platform"`
	Remount  *remountApplied `json:"remount"`
	Live     liveApplied     `json:"live"`
}

func liveReport(f liveFields) liveApplied {
	return liveApplied{
		ReadAheadBytes: f.readAheadBytes, EntrySeconds: f.entry.report(), AttrSeconds: f.attr.report(),
		NegativeSeconds: f.negative.report(), CloseWaitsForUpload: f.closeWaitsForUpload,
		UploadDelaySeconds: int64(f.uploadDelay / time.Second), FsyncWaitsForHub: f.fsyncWaitsForHub,
		UploadFiles: f.uploadFiles, UploadFramesInFlight: f.uploadFramesInFlight,
		PingSeconds: int64(f.ping / time.Second), DeadAfterSeconds: int64(f.deadAfter / time.Second),
		BulkFrameBytes: f.bulkFrameBytes, PrefetchSmallFiles: f.prefetchSmallFiles,
	}
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
	lim  string
	app  map[string]string
	up   *uploads
}

func newReporter(out io.Writer) *reporter {
	return &reporter{enc: json.NewEncoder(out), last: map[string]statusLine{}, seen: map[string]usageLine{}, app: map[string]string{}}
}

func (r *reporter) status(mount, state, reason string, readOnly bool) {
	line := statusLine{Type: "status", Mount: mount, State: state, Reason: strings.TrimSpace(reason), ReadOnly: readOnly}
	r.mu.Lock()
	defer r.mu.Unlock()
	if previous, ok := r.last[mount]; ok && previous == line {
		return
	}
	r.last[mount] = line
	r.enc.Encode(line)
}

func (r *reporter) usage(mount string, cache, pinned, open, pending int64) {
	line := usageLine{Type: "counters", Mount: mount, Cache: cache, Pinned: pinned, Open: open, Pending: pending}
	r.mu.Lock()
	defer r.mu.Unlock()
	if previous, ok := r.seen[mount]; ok && previous == line {
		return
	}
	r.seen[mount] = line
	r.enc.Encode(line)
}

func (r *reporter) uploads(now uploads) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.up != nil && *r.up == now {
		return
	}
	r.up = &now
	r.enc.Encode(uploadsLine{Type: "uploads", uploads: now})
}

func (r *reporter) forget(mount string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.last, mount)
	delete(r.seen, mount)
	delete(r.app, mount)
}

func (r *reporter) limits(kernel *kernelLimits) {
	line := limitsLine{Type: "limits", Platform: platformName}
	if kernel != nil {
		line.Kernel = true
		line.MaxUserBgreq = kernel.MaxUserBgreq
		line.MaxUserCongThresh = kernel.MaxUserCongThresh
		line.MaxPagesLimit = kernel.MaxPagesLimit
		line.PageSize = kernel.PageSize
		line.ReadaheadOffer = kernel.ReadaheadOffer
		line.MaxRequestBytes = kernel.maxRequestBytes()
	}
	raw, err := json.Marshal(line)
	if err != nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.lim == string(raw) {
		return
	}
	r.lim = string(raw)
	r.enc.Encode(line)
}

func (r *reporter) applied(mount string, remount *remountApplied, f liveFields) {
	line := appliedLine{Type: "applied", Mount: mount, Platform: platformName, Remount: remount, Live: liveReport(f)}
	raw, err := json.Marshal(line)
	if err != nil {
		r.failure(mount, err)
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.app[mount] == string(raw) {
		return
	}
	r.app[mount] = string(raw)
	r.enc.Encode(line)
}

func (r *reporter) failure(mount string, err error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.enc.Encode(errorLine{Type: "error", Mount: mount, Reason: strings.TrimSpace(err.Error())})
}
