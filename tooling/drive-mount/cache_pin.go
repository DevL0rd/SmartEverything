package main

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/smarteverything/drive-mount/wire"
)

func (c *blockCache) PinnedFiles(root string) int {
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

func (c *blockCache) repin(ino uint64) {
	if err := c.Pin(c.ctx, ino); err != nil && !remoteCode(err, wire.ErrENOENT) && !errors.Is(err, context.Canceled) && !unreachable(err) {
		fmt.Fprintln(os.Stderr, "keep offline again:", ino, err)
	}
}

func (c *blockCache) repinIncomplete() {
	c.mu.Lock()
	var again []uint64
	for _, f := range c.files {
		if !f.st.Pinned {
			continue
		}
		for i := range blockTotal(f.st.Size, f.st.Block) {
			if !f.has(i) {
				again = append(again, f.st.Ino)
				break
			}
		}
	}
	c.mu.Unlock()
	for _, ino := range again {
		c.spawn(func() { c.repin(ino) })
	}
}

func (c *blockCache) walk(ctx context.Context, attr wire.Attr, visit func(wire.Attr) error) error {
	if attr.Type != wire.InodeTypeDirectory {
		return visit(attr)
	}
	entries, err := c.listing(ctx, attr.Ino)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if err := c.walk(ctx, e.Attr, visit); err != nil {
			return err
		}
	}
	return nil
}

func (c *blockCache) Pin(ctx context.Context, ino uint64) error {
	if c.startErr != nil {
		return c.startErr
	}
	attr, err := c.Getattr(ctx, ino)
	if err != nil {
		return err
	}
	return c.walk(ctx, attr, func(a wire.Attr) error {
		if a.Type != wire.InodeTypeFile {
			return nil
		}
		return c.pinFile(ctx, c.fileFor(a))
	})
}

func (c *blockCache) Unpin(ctx context.Context, ino uint64) error {
	if c.startErr != nil {
		return c.startErr
	}
	attr, err := c.Getattr(ctx, ino)
	if err != nil {
		return err
	}
	return c.walk(ctx, attr, func(a wire.Attr) error {
		c.mu.Lock()
		f := c.byIno[a.Ino]
		c.mu.Unlock()
		if f == nil {
			return nil
		}
		return c.setPinned(f, false)
	})
}

func (c *blockCache) pinFile(ctx context.Context, f *cachedFile) error {
	if err := c.setPinned(f, true); err != nil {
		return err
	}
	var wh *wireHandle
	defer func() {
		if wh != nil {
			wh.drop()
		}
	}()
	for i := range blockTotal(f.st.Size, f.st.Block) {
		c.mu.Lock()
		present := f.has(i)
		c.mu.Unlock()
		if present {
			continue
		}
		if wh == nil {
			opened, err := c.openWire(ctx, f.st.Ino)
			if err != nil {
				return errors.Join(err, c.setPinned(f, false))
			}
			wh = opened
		}
		if _, err := c.fetch(ctx, wh, f, i); err != nil {
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
