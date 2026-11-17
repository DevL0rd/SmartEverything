package wire

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

const probeVariable = "SE_DRIVE_MOUNT_BENCH"

type opSummary struct {
	Count   int     `json:"count"`
	TotalMs float64 `json:"totalMs"`
	P50Ms   float64 `json:"p50Ms"`
	P95Ms   float64 `json:"p95Ms"`
	P99Ms   float64 `json:"p99Ms"`
	MaxMs   float64 `json:"maxMs"`
}

type callProbe struct {
	dir     string
	mu      sync.Mutex
	samples map[string][]time.Duration
	segment int
}

var probe = newCallProbe(os.Getenv(probeVariable))

func newCallProbe(dir string) *callProbe {
	if dir == "" {
		return nil
	}
	p := &callProbe{dir: dir, samples: map[string][]time.Duration{}}
	p.onDumpSignal()
	return p
}

func (p *callProbe) record(op Op, started time.Time) {
	if p == nil {
		return
	}
	took := time.Since(started)
	name := op.Name()
	p.mu.Lock()
	p.samples[name] = append(p.samples[name], took)
	p.mu.Unlock()
}

func summarize(values []time.Duration) opSummary {
	sort.Slice(values, func(i, j int) bool { return values[i] < values[j] })
	at := func(q float64) float64 {
		index := int(q * float64(len(values)-1))
		return float64(values[index]) / float64(time.Millisecond)
	}
	var total time.Duration
	for _, value := range values {
		total += value
	}
	return opSummary{
		Count:   len(values),
		TotalMs: float64(total) / float64(time.Millisecond),
		P50Ms:   at(0.5),
		P95Ms:   at(0.95),
		P99Ms:   at(0.99),
		MaxMs:   float64(values[len(values)-1]) / float64(time.Millisecond),
	}
}

func (p *callProbe) dump() error {
	p.mu.Lock()
	samples := p.samples
	p.samples = map[string][]time.Duration{}
	p.segment++
	segment := p.segment
	p.mu.Unlock()
	ops := map[string]opSummary{}
	for name, values := range samples {
		ops[name] = summarize(values)
	}
	data, err := json.Marshal(map[string]any{"segment": segment, "ops": ops})
	if err != nil {
		return err
	}
	final := filepath.Join(p.dir, fmt.Sprintf("helper-%d.json", segment))
	staged := final + ".tmp"
	if err := os.WriteFile(staged, data, 0o600); err != nil {
		return err
	}
	return os.Rename(staged, final)
}

func Probing() bool { return probe != nil }

func RecordOperation(name string, started time.Time) {
	if probe == nil {
		return
	}
	took := time.Since(started)
	probe.mu.Lock()
	probe.samples[name] = append(probe.samples[name], took)
	probe.mu.Unlock()
}
