package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/smarteverything/drive-mount/wire"
)

const (
	untilInvalidated  = time.Duration(math.MaxInt64)
	maxFuseBackground = 65535
	followBackground  = "follow"
	untilChangedName  = "untilChanged"
)

type readdirPlusMode string

const (
	readdirPlusOff    readdirPlusMode = "off"
	readdirPlusAuto   readdirPlusMode = "auto"
	readdirPlusAlways readdirPlusMode = "always"
)

type lifetime struct {
	untilChanged bool
	seconds      int64
}

func (l lifetime) duration() time.Duration {
	if l.untilChanged {
		return untilInvalidated
	}
	return time.Duration(l.seconds) * time.Second
}

func (l lifetime) report() any {
	if l.untilChanged {
		return untilChangedName
	}
	return l.seconds
}

type tuning struct {
	maxBackground        int64
	congestionFollows    bool
	congestionThreshold  int64
	maxRequestBytes      int64
	kernelReadaheadBytes int64
	asyncRead            bool
	writebackCache       bool
	readdirPlus          readdirPlusMode
	parallelDirops       bool
	live                 liveFields
}

type liveFields struct {
	readAheadBytes       int64
	entry                lifetime
	attr                 lifetime
	negative             lifetime
	closeWaitsForUpload  bool
	uploadDelay          time.Duration
	fsyncWaitsForHub     bool
	uploadFiles          int64
	uploadFramesInFlight int64
	ping                 time.Duration
	deadAfter            time.Duration
	bulkFrameBytes       int64
	prefetchSmallFiles   bool
}

func defaultTuning() tuning {
	return tuning{
		maxBackground:        64,
		congestionFollows:    true,
		maxRequestBytes:      1 << 20,
		kernelReadaheadBytes: 128 << 10,
		asyncRead:            true,
		writebackCache:       true,
		readdirPlus:          readdirPlusAuto,
		parallelDirops:       true,
		live: liveFields{
			readAheadBytes:       16 << 20,
			entry:                lifetime{untilChanged: true},
			attr:                 lifetime{untilChanged: true},
			negative:             lifetime{untilChanged: true},
			fsyncWaitsForHub:     true,
			uploadFiles:          4,
			uploadFramesInFlight: 64,
			ping:                 10 * time.Second,
			deadAfter:            30 * time.Second,
			bulkFrameBytes:       1 << 20,
		},
	}
}

func (t tuning) effectiveCongestion() int64 {
	if t.congestionFollows {
		return t.maxBackground * 3 / 4
	}
	return t.congestionThreshold
}

type liveTuning struct {
	value atomic.Pointer[liveFields]
	mu    sync.Mutex
	subs  []func(liveFields)
}

var live = newLiveTuning(defaultTuning().live)

func newLiveTuning(initial liveFields) *liveTuning {
	l := &liveTuning{}
	l.value.Store(&initial)
	return l
}

func (l *liveTuning) load() liveFields {
	return *l.value.Load()
}

func (l *liveTuning) store(fields liveFields) {
	l.mu.Lock()
	l.value.Store(&fields)
	subs := append([]func(liveFields){}, l.subs...)
	l.mu.Unlock()
	for _, notify := range subs {
		notify(fields)
	}
}

func (l *liveTuning) subscribe(notify func(liveFields)) {
	l.mu.Lock()
	l.subs = append(l.subs, notify)
	l.mu.Unlock()
}

type required[T any] struct {
	value T
	set   bool
}

func (r *required[T]) UnmarshalJSON(raw []byte) error {
	if string(raw) == "null" {
		return errors.New("must not be null")
	}
	if err := json.Unmarshal(raw, &r.value); err != nil {
		return err
	}
	r.set = true
	return nil
}

type choice struct {
	word    string
	number  int64
	numeric bool
}

func (c *choice) UnmarshalJSON(raw []byte) error {
	if len(raw) > 0 && raw[0] == '"' {
		return json.Unmarshal(raw, &c.word)
	}
	c.numeric = true
	return json.Unmarshal(raw, &c.number)
}

type tuningLine struct {
	MaxBackground        required[int64]           `json:"maxBackground"`
	CongestionThreshold  required[choice]          `json:"congestionThreshold"`
	MaxRequestBytes      required[int64]           `json:"maxRequestBytes"`
	KernelReadaheadBytes required[int64]           `json:"kernelReadaheadBytes"`
	ReadAheadBytes       required[int64]           `json:"readAheadBytes"`
	AsyncRead            required[bool]            `json:"asyncRead"`
	WritebackCache       required[bool]            `json:"writebackCache"`
	ReaddirPlus          required[readdirPlusMode] `json:"readdirPlus"`
	ParallelDirops       required[bool]            `json:"parallelDirops"`
	EntrySeconds         required[choice]          `json:"entrySeconds"`
	AttrSeconds          required[choice]          `json:"attrSeconds"`
	NegativeSeconds      required[choice]          `json:"negativeSeconds"`
	CloseWaitsForUpload  required[bool]            `json:"closeWaitsForUpload"`
	UploadDelaySeconds   required[int64]           `json:"uploadDelaySeconds"`
	FsyncWaitsForHub     required[bool]            `json:"fsyncWaitsForHub"`
	UploadFiles          required[int64]           `json:"uploadFiles"`
	UploadFramesInFlight required[int64]           `json:"uploadFramesInFlight"`
	PingSeconds          required[int64]           `json:"pingSeconds"`
	DeadAfterSeconds     required[int64]           `json:"deadAfterSeconds"`
	BulkFrameBytes       required[int64]           `json:"bulkFrameBytes"`
	PrefetchSmallFiles   required[bool]            `json:"prefetchSmallFiles"`
}

type presence struct {
	name string
	set  bool
}

func (l *tuningLine) presences() []presence {
	return []presence{
		{"maxBackground", l.MaxBackground.set}, {"congestionThreshold", l.CongestionThreshold.set},
		{"maxRequestBytes", l.MaxRequestBytes.set}, {"kernelReadaheadBytes", l.KernelReadaheadBytes.set},
		{"readAheadBytes", l.ReadAheadBytes.set}, {"asyncRead", l.AsyncRead.set},
		{"writebackCache", l.WritebackCache.set}, {"readdirPlus", l.ReaddirPlus.set},
		{"parallelDirops", l.ParallelDirops.set}, {"entrySeconds", l.EntrySeconds.set},
		{"attrSeconds", l.AttrSeconds.set}, {"negativeSeconds", l.NegativeSeconds.set},
		{"closeWaitsForUpload", l.CloseWaitsForUpload.set}, {"uploadDelaySeconds", l.UploadDelaySeconds.set},
		{"fsyncWaitsForHub", l.FsyncWaitsForHub.set}, {"uploadFiles", l.UploadFiles.set},
		{"uploadFramesInFlight", l.UploadFramesInFlight.set}, {"pingSeconds", l.PingSeconds.set},
		{"deadAfterSeconds", l.DeadAfterSeconds.set}, {"bulkFrameBytes", l.BulkFrameBytes.set},
		{"prefetchSmallFiles", l.PrefetchSmallFiles.set},
	}
}

func seconds(name string, c choice, allowUntilChanged bool) (lifetime, error) {
	if c.numeric {
		return lifetime{seconds: c.number}, nil
	}
	if allowUntilChanged && c.word == untilChangedName {
		return lifetime{untilChanged: true}, nil
	}
	return lifetime{}, fmt.Errorf("tuning: %s must be a number of seconds or %q, not %q", name, untilChangedName, c.word)
}

func (l *tuningLine) resolve() (tuning, error) {
	if l == nil {
		return tuning{}, errors.New("tuning: missing")
	}
	for _, p := range l.presences() {
		if !p.set {
			return tuning{}, fmt.Errorf("tuning: %s missing", p.name)
		}
	}
	t := tuning{
		maxBackground:        l.MaxBackground.value,
		maxRequestBytes:      l.MaxRequestBytes.value,
		kernelReadaheadBytes: l.KernelReadaheadBytes.value,
		asyncRead:            l.AsyncRead.value,
		writebackCache:       l.WritebackCache.value,
		readdirPlus:          l.ReaddirPlus.value,
		parallelDirops:       l.ParallelDirops.value,
	}
	switch c := l.CongestionThreshold.value; {
	case c.numeric:
		t.congestionThreshold = c.number
	case c.word == followBackground:
		t.congestionFollows = true
	default:
		return tuning{}, fmt.Errorf("tuning: congestionThreshold must be a number or %q, not %q", followBackground, c.word)
	}
	var err error
	t.live.readAheadBytes = l.ReadAheadBytes.value
	if t.live.entry, err = seconds("entrySeconds", l.EntrySeconds.value, true); err != nil {
		return tuning{}, err
	}
	if t.live.attr, err = seconds("attrSeconds", l.AttrSeconds.value, true); err != nil {
		return tuning{}, err
	}
	if t.live.negative, err = seconds("negativeSeconds", l.NegativeSeconds.value, true); err != nil {
		return tuning{}, err
	}
	t.live.closeWaitsForUpload = l.CloseWaitsForUpload.value
	t.live.uploadDelay = time.Duration(l.UploadDelaySeconds.value) * time.Second
	t.live.fsyncWaitsForHub = l.FsyncWaitsForHub.value
	t.live.uploadFiles = l.UploadFiles.value
	t.live.uploadFramesInFlight = l.UploadFramesInFlight.value
	t.live.ping = time.Duration(l.PingSeconds.value) * time.Second
	t.live.deadAfter = time.Duration(l.DeadAfterSeconds.value) * time.Second
	t.live.bulkFrameBytes = l.BulkFrameBytes.value
	t.live.prefetchSmallFiles = l.PrefetchSmallFiles.value
	return t, nil
}

type kernelLimits struct {
	MaxUserBgreq      int64
	MaxUserCongThresh int64
	MaxPagesLimit     int64
	PageSize          int64
	ReadaheadOffer    int64
}

func (k kernelLimits) maxRequestBytes() int64 {
	return min(k.MaxPagesLimit*k.PageSize, wire.MaxPayloadBytes)
}

func (t tuning) validate(kernel *kernelLimits) error {
	if t.live.readAheadBytes < 0 {
		return fmt.Errorf("tuning: readAheadBytes %d is below 0", t.live.readAheadBytes)
	}
	for name, l := range map[string]lifetime{"entrySeconds": t.live.entry, "attrSeconds": t.live.attr, "negativeSeconds": t.live.negative} {
		if !l.untilChanged && l.seconds < 0 {
			return fmt.Errorf("tuning: %s %d is below 0", name, l.seconds)
		}
	}
	if t.live.uploadDelay < 0 {
		return fmt.Errorf("tuning: uploadDelaySeconds %d is below 0", t.live.uploadDelay/time.Second)
	}
	if t.live.uploadFiles < 1 {
		return fmt.Errorf("tuning: uploadFiles %d is below 1", t.live.uploadFiles)
	}
	if t.live.uploadFramesInFlight < 1 {
		return fmt.Errorf("tuning: uploadFramesInFlight %d is below 1", t.live.uploadFramesInFlight)
	}
	if t.live.ping < time.Second {
		return fmt.Errorf("tuning: pingSeconds %d is below 1", t.live.ping/time.Second)
	}
	if t.live.deadAfter <= t.live.ping {
		return fmt.Errorf("tuning: deadAfterSeconds %d must be greater than pingSeconds %d", t.live.deadAfter/time.Second, t.live.ping/time.Second)
	}
	if t.live.bulkFrameBytes < 1 || t.live.bulkFrameBytes > wire.MaxPayloadBytes {
		return fmt.Errorf("tuning: bulkFrameBytes %d must be from 1 to %d", t.live.bulkFrameBytes, wire.MaxPayloadBytes)
	}
	switch t.readdirPlus {
	case readdirPlusOff, readdirPlusAuto, readdirPlusAlways:
	default:
		return fmt.Errorf("tuning: readdirPlus must be off, auto or always, not %q", t.readdirPlus)
	}
	if kernel == nil {
		return nil
	}
	if bound := min(int64(maxFuseBackground), kernel.MaxUserBgreq); t.maxBackground < 1 || t.maxBackground > bound {
		return fmt.Errorf("tuning: maxBackground %d must be from 1 to %d (the kernel allows up to %d here, the protocol up to %d)", t.maxBackground, bound, kernel.MaxUserBgreq, maxFuseBackground)
	}
	if !t.congestionFollows {
		bound := min(t.maxBackground, kernel.MaxUserCongThresh)
		if t.congestionThreshold < 1 || t.congestionThreshold > bound {
			return fmt.Errorf("tuning: congestionThreshold %d must be from 1 to %d (maxBackground %d, the kernel allows up to %d here)", t.congestionThreshold, bound, t.maxBackground, kernel.MaxUserCongThresh)
		}
	} else if t.effectiveCongestion() > kernel.MaxUserCongThresh {
		return fmt.Errorf("tuning: following maxBackground gives a congestion threshold of %d, above the %d the kernel allows here", t.effectiveCongestion(), kernel.MaxUserCongThresh)
	}
	if bound := kernel.maxRequestBytes(); t.maxRequestBytes < kernel.PageSize || t.maxRequestBytes > bound {
		return fmt.Errorf("tuning: maxRequestBytes %d must be from %d to %d", t.maxRequestBytes, kernel.PageSize, bound)
	}
	if t.kernelReadaheadBytes < kernel.PageSize {
		return fmt.Errorf("tuning: kernelReadaheadBytes %d is below the page size %d", t.kernelReadaheadBytes, kernel.PageSize)
	}
	if kernel.ReadaheadOffer > 0 && t.kernelReadaheadBytes > kernel.ReadaheadOffer {
		return fmt.Errorf("tuning: kernelReadaheadBytes %d is above the %d the kernel offers", t.kernelReadaheadBytes, kernel.ReadaheadOffer)
	}
	return nil
}

type tuningState struct {
	mu      sync.Mutex
	current tuning
	offer   int64
	report  *reporter
	read    func() (*kernelLimits, error)
}

func newTuningState(report *reporter) *tuningState {
	s := &tuningState{current: defaultTuning(), report: report, read: readKernelLimits}
	if _, err := s.limits(); err != nil {
		report.failure("", err)
	}
	return s
}

func (s *tuningState) limits() (*kernelLimits, error) {
	kernel, err := s.read()
	if err != nil {
		return nil, err
	}
	if kernel != nil {
		kernel.ReadaheadOffer = s.offer
	}
	s.report.limits(kernel)
	return kernel, nil
}

func (s *tuningState) apply(t tuning) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	kernel, err := s.limits()
	if err != nil {
		return err
	}
	if err := t.validate(kernel); err != nil {
		return err
	}
	s.current = t
	live.store(t.live)
	return nil
}

func (s *tuningState) forMount() (tuning, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	kernel, err := s.limits()
	if err != nil {
		return tuning{}, err
	}
	if err := s.current.validate(kernel); err != nil {
		return tuning{}, err
	}
	return s.current, nil
}

func (s *tuningState) offered(readahead int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.offer = readahead
	if _, err := s.limits(); err != nil {
		s.report.failure("", err)
	}
}

func pageSize() int64 {
	return int64(os.Getpagesize())
}
