package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

const (
	leaseBatch  = 4096
	leaseRefill = leaseBatch / 2
	leasesFile  = "leases.json"
)

var errNoLease = fmt.Errorf("%w: no leased inode numbers are left for new files", errOffline)

type leasePool struct {
	mu     sync.Mutex
	saving sync.Mutex
	path   string
	spans  [][2]uint64
}

func loadLeases(dir string) (*leasePool, error) {
	p := &leasePool{path: filepath.Join(dir, leasesFile)}
	raw, err := os.ReadFile(p.path)
	if errors.Is(err, os.ErrNotExist) {
		return p, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(raw, &p.spans); err != nil {
		return nil, fmt.Errorf("leases: %s is not a list of ranges: %w", p.path, err)
	}
	for _, span := range p.spans {
		if span[1] <= span[0] {
			return nil, fmt.Errorf("leases: %s holds the empty range %v", p.path, span)
		}
	}
	return p, nil
}

func (p *leasePool) take() (uint64, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.spans) == 0 {
		return 0, false
	}
	ino := p.spans[0][0]
	p.spans[0][0]++
	if p.spans[0][0] == p.spans[0][1] {
		p.spans = p.spans[1:]
	}
	return ino, true
}

func (p *leasePool) left() uint64 {
	p.mu.Lock()
	defer p.mu.Unlock()
	var n uint64
	for _, span := range p.spans {
		n += span[1] - span[0]
	}
	return n
}

func (p *leasePool) consumed(ino uint64) {
	p.mu.Lock()
	defer p.mu.Unlock()
	var kept [][2]uint64
	for _, span := range p.spans {
		switch {
		case ino < span[0] || ino >= span[1]:
			kept = append(kept, span)
		default:
			if span[0] < ino {
				kept = append(kept, [2]uint64{span[0], ino})
			}
			if ino+1 < span[1] {
				kept = append(kept, [2]uint64{ino + 1, span[1]})
			}
		}
	}
	p.spans = kept
}

func (p *leasePool) add(start, count uint64) error {
	p.mu.Lock()
	p.spans = append(p.spans, [2]uint64{start, start + count})
	p.mu.Unlock()
	return p.save()
}

func (p *leasePool) save() error {
	p.saving.Lock()
	defer p.saving.Unlock()
	p.mu.Lock()
	raw, err := json.Marshal(p.spans)
	p.mu.Unlock()
	if err != nil {
		return err
	}
	tmp := p.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, p.path)
}
