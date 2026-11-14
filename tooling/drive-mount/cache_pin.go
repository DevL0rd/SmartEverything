package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path"
)

func (c *blockCache) PinnedFiles(root mountRoot) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	count := 0
	for _, f := range c.files {
		if f.st.Root == root && f.st.Pinned {
			count++
		}
	}
	return count
}

func (c *blockCache) repin(root mountRoot, p string) {
	defer c.background.Done()
	if err := c.Pin(context.Background(), root, p); err != nil && !errors.Is(err, errNotFound) {
		fmt.Fprintln(os.Stderr, "keep offline again:", p, err)
	}
}

func (c *blockCache) walk(ctx context.Context, root mountRoot, p string, visit func(string, entry) error) error {
	e, err := c.stat(ctx, root, p)
	if err != nil {
		return err
	}
	if !e.Dir {
		return visit(p, e)
	}
	items, err := c.List(ctx, root, p)
	if err != nil {
		return err
	}
	for _, it := range items {
		if err := c.walk(ctx, root, path.Join(p, it.Name), visit); err != nil {
			return err
		}
	}
	return nil
}

func (c *blockCache) Pin(ctx context.Context, root mountRoot, p string) error {
	if c.startErr != nil {
		return c.startErr
	}
	return c.walk(ctx, root, p, func(file string, e entry) error {
		return c.pinFile(ctx, c.fileFor(root, file, e))
	})
}

func (c *blockCache) Unpin(ctx context.Context, root mountRoot, p string) error {
	if c.startErr != nil {
		return c.startErr
	}
	return c.walk(ctx, root, p, func(file string, e entry) error {
		return c.setPinned(c.fileFor(root, file, e), false)
	})
}

func (c *blockCache) pinFile(ctx context.Context, f *cachedFile) error {
	if err := c.setPinned(f, true); err != nil {
		return err
	}
	for i := range blockTotal(f.st.Size, f.st.Block) {
		c.mu.Lock()
		present := f.has(i)
		c.mu.Unlock()
		if present {
			continue
		}
		if _, err := c.fetch(ctx, f, i); err != nil {
			return errors.Join(err, c.setPinned(f, false))
		}
	}
	return nil
}

func (c *blockCache) setPinned(f *cachedFile, on bool) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if f.st.Pinned == on {
		return nil
	}
	f.st.Pinned = on
	for i := range blockTotal(f.st.Size, f.st.Block) {
		if !f.has(i) {
			continue
		}
		if on {
			c.lru.remove(blockID{f.key, i})
		} else {
			c.admit(f, i)
		}
	}
	if err := c.save(f); err != nil {
		return err
	}
	return c.evict()
}
