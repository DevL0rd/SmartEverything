package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
)

func (c *blockCache) ReadAt(ctx context.Context, root mountRoot, p string, off int64, dst []byte) (int, error) {
	if c.startErr != nil {
		return 0, c.startErr
	}
	e, err := c.stat(ctx, root, p)
	if err != nil {
		return 0, err
	}
	if e.Dir || off >= e.Size || len(dst) == 0 {
		return 0, nil
	}
	f := c.fileFor(root, p, e)
	want := min(int64(len(dst)), e.Size-off)
	var done int64
	for done < want {
		pos := off + done
		idx := pos / f.st.Block
		n, err := c.readBlock(ctx, f, idx, pos-idx*f.st.Block, dst[done:want])
		if err != nil {
			return 0, err
		}
		done += int64(n)
	}
	c.noteRead(f, off, done)
	return int(done), nil
}

func (c *blockCache) readBlock(ctx context.Context, f *cachedFile, idx, within int64, dst []byte) (int, error) {
	if n, ok, err := c.readCached(f, idx, within, dst); ok || err != nil {
		return n, err
	}
	data, err := c.fetch(ctx, f, idx)
	if err != nil {
		return 0, err
	}
	return copy(dst, data[within:]), nil
}

func (c *blockCache) readCached(f *cachedFile, idx, within int64, dst []byte) (int, bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !f.has(idx) {
		return 0, false, nil
	}
	start, end := f.span(idx)
	dst = dst[:min(int64(len(dst)), end-start-within)]
	var n int
	err := c.withData(f, func(d *os.File) error {
		var readErr error
		n, readErr = d.ReadAt(dst, start+within)
		return readErr
	})
	if err != nil {
		return 0, false, err
	}
	if !f.st.Pinned {
		c.lru.touch(blockID{f.key, idx}, c.now())
	}
	return n, true, nil
}

func (c *blockCache) fetch(ctx context.Context, f *cachedFile, idx int64) ([]byte, error) {
	id := blockID{f.key, idx}
	for {
		c.mu.Lock()
		if running, ok := c.flights[id]; ok {
			c.mu.Unlock()
			data, retry, err := c.await(ctx, running)
			if !retry {
				return data, err
			}
			continue
		}
		if c.offline.Load() {
			c.mu.Unlock()
			return nil, errOffline
		}
		mine := &flight{done: make(chan struct{})}
		c.flights[id] = mine
		c.mu.Unlock()
		mine.data, mine.err = c.load(ctx, f, idx)
		c.mu.Lock()
		delete(c.flights, id)
		c.mu.Unlock()
		close(mine.done)
		return mine.data, mine.err
	}
}

func (c *blockCache) await(ctx context.Context, running *flight) ([]byte, bool, error) {
	select {
	case <-running.done:
		cancelled := errors.Is(running.err, context.Canceled) && ctx.Err() == nil
		return running.data, cancelled, running.err
	case <-ctx.Done():
		return nil, false, ctx.Err()
	}
}

func (c *blockCache) load(ctx context.Context, f *cachedFile, idx int64) ([]byte, error) {
	start, end := f.span(idx)
	buf := make([]byte, end-start)
	n, err := c.up.ReadAt(ctx, f.st.Root, f.st.Path, start, buf)
	if err != nil {
		return nil, err
	}
	if n != len(buf) {
		return nil, io.ErrUnexpectedEOF
	}
	return buf, c.store(f, idx, buf)
}

func (c *blockCache) store(f *cachedFile, idx int64, buf []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.files[f.key] != f || f.has(idx) {
		return nil
	}
	start, _ := f.span(idx)
	err := c.withData(f, func(d *os.File) error {
		if _, writeErr := d.WriteAt(buf, start); writeErr != nil {
			return writeErr
		}
		return d.Sync()
	})
	if err != nil {
		return err
	}
	f.mark(idx, true)
	if !f.st.Pinned {
		c.admit(f, idx)
	}
	if err := c.save(f); err != nil {
		return err
	}
	return c.evict()
}

func (c *blockCache) noteRead(f *cachedFile, off, n int64) {
	bs := f.st.Block
	c.mu.Lock()
	if off == f.next {
		f.run++
	} else {
		f.run = 0
	}
	f.next = off + n
	following := (off+n-1)/bs + 1
	ahead := f.run >= 1 && following < blockTotal(f.st.Size, bs) && !f.has(following) && !c.offline.Load()
	c.mu.Unlock()
	if ahead {
		c.background.Add(1)
		go c.prefetch(f, following)
	}
}

func (c *blockCache) prefetch(f *cachedFile, idx int64) {
	defer c.background.Done()
	if _, err := c.fetch(context.Background(), f, idx); err != nil && !errors.Is(err, errOffline) {
		fmt.Fprintln(os.Stderr, "prefetch:", f.st.Path, err)
	}
}
