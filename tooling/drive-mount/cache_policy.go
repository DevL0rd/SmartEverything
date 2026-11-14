package main

import (
	"errors"
	"fmt"
	"os"
	"time"
)

type cachePolicy struct {
	maxBytes int64
	maxAge   time.Duration
	minFree  int64
	every    time.Duration
}

var defaultPolicy = cachePolicy{maxBytes: noLimit, maxAge: time.Hour, minFree: 0, every: time.Minute}

var errPolicy = errors.New("cache settings need a positive age and cleanup interval")

func (c *blockCache) SetPolicy(policy cachePolicy) error {
	if policy.maxAge <= 0 || policy.every <= 0 || policy.maxBytes <= 0 || policy.minFree < 0 {
		return errPolicy
	}
	c.mu.Lock()
	changed := c.policy.every != policy.every
	c.policy = policy
	err := c.evict()
	c.mu.Unlock()
	if changed {
		select {
		case <-c.retime:
		default:
		}
		c.retime <- policy.every
	}
	c.announce()
	return err
}

func (c *blockCache) Hold(root mountRoot, p string) func() {
	at := location{root, p}
	c.mu.Lock()
	c.held[at]++
	c.mu.Unlock()
	return func() {
		c.mu.Lock()
		c.held[at]--
		if c.held[at] <= 0 {
			delete(c.held, at)
		}
		c.mu.Unlock()
	}
}

func (c *blockCache) OnEvict(fn func(root mountRoot)) {
	c.mu.Lock()
	c.evicted = fn
	c.mu.Unlock()
}

func (c *blockCache) isHeld(id blockID) bool {
	f := c.files[id.key]
	return f != nil && c.held[location{f.st.Root, f.st.Path}] > 0
}

func (c *blockCache) shortfall() int64 {
	if c.policy.minFree == 0 {
		return 0
	}
	free, err := diskFree(c.dir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "cache free space:", err)
		return 0
	}
	return max(0, c.policy.minFree-free)
}

func (c *blockCache) evict() error {
	now := c.now()
	need := c.shortfall()
	for n := c.lru.tail; n != nil; {
		previous := n.prev
		over := c.lru.used > c.policy.maxBytes
		old := now.Sub(n.used) > c.policy.maxAge
		if !over && !old && need <= 0 {
			return nil
		}
		if !c.isHeld(n.id) {
			bytes := n.bytes
			if err := c.release(c.files[n.id.key], n.id.index); err != nil {
				return err
			}
			need -= bytes
		}
		n = previous
	}
	return nil
}

func (c *blockCache) announce() {
	c.mu.Lock()
	roots := make([]mountRoot, 0, len(c.released))
	for root := range c.released {
		roots = append(roots, root)
	}
	clear(c.released)
	notify := c.evicted
	c.mu.Unlock()
	if notify == nil {
		return
	}
	for _, root := range roots {
		notify(root)
	}
}

func (c *blockCache) sweeper() {
	defer c.background.Done()
	c.mu.Lock()
	ticker := time.NewTicker(c.policy.every)
	c.mu.Unlock()
	defer ticker.Stop()
	for {
		select {
		case <-c.stop:
			return
		case every := <-c.retime:
			ticker.Reset(every)
		case <-ticker.C:
			c.mu.Lock()
			err := c.evict()
			c.mu.Unlock()
			if err != nil {
				fmt.Fprintln(os.Stderr, "cache cleanup:", err)
			}
			c.announce()
		}
	}
}
