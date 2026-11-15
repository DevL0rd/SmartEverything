package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"sync"

	"github.com/smarteverything/drive-mount/wire"
)

func (c *blockCache) readInode(ctx context.Context, wh *wireHandle, ino uint64, off int64, dst []byte) (int, error) {
	if c.startErr != nil {
		return 0, c.startErr
	}
	for {
		attr, err := c.Getattr(ctx, ino)
		if err != nil {
			return 0, err
		}
		if attr.Type == wire.InodeTypeDirectory {
			return 0, &wire.RemoteError{Code: wire.ErrEISDIR}
		}
		size := int64(attr.Size)
		if off >= size || len(dst) == 0 {
			return 0, nil
		}
		n, err := c.readFile(ctx, wh, c.fileFor(attr), off, dst)
		if errors.Is(err, io.ErrUnexpectedEOF) && c.attrMoved(ctx, ino, attr) {
			continue
		}
		return n, err
	}
}

func (c *blockCache) attrMoved(ctx context.Context, ino uint64, was wire.Attr) bool {
	c.mu.Lock()
	if in := c.inodes[ino]; in != nil {
		in.attrEpoch = 0
		in.gen++
	}
	c.mu.Unlock()
	now, err := c.Getattr(ctx, ino)
	return err == nil && (now.Etag != was.Etag || now.Size != was.Size)
}

func (c *blockCache) readFile(ctx context.Context, wh *wireHandle, f *cachedFile, off int64, dst []byte) (int, error) {
	want := min(int64(len(dst)), f.st.Size-off)
	var done int64
	for done < want {
		pos := off + done
		idx := pos / f.st.Block
		n, err := c.readBlock(ctx, wh, f, idx, pos-idx*f.st.Block, dst[done:want])
		if err != nil {
			return 0, err
		}
		done += int64(n)
	}
	c.noteRead(wh, f, off, done)
	return int(done), nil
}

func (c *blockCache) readBlock(ctx context.Context, wh *wireHandle, f *cachedFile, idx, within int64, dst []byte) (int, error) {
	if n, ok, err := c.readCached(f, idx, within, dst); ok || err != nil {
		return n, err
	}
	data, err := c.fetch(ctx, wh, f, idx)
	if err != nil {
		return 0, err
	}
	return copy(dst, data[within:]), nil
}

func (c *blockCache) readCached(f *cachedFile, idx, within int64, dst []byte) (int, bool, error) {
	c.mu.Lock()
	if !f.has(idx) {
		c.mu.Unlock()
		return 0, false, nil
	}
	f.io.RLock()
	if !f.st.Pinned {
		c.lru.touch(blockID{f.key, idx}, c.now())
	}
	c.mu.Unlock()
	defer f.io.RUnlock()
	start, end := f.span(idx)
	dst = dst[:min(int64(len(dst)), end-start-within)]
	var n int
	err := c.withData(f, func(d *os.File) error {
		var readErr error
		n, readErr = d.ReadAt(dst, start+within)
		return readErr
	})
	if errors.Is(err, io.EOF) {
		return 0, false, io.ErrUnexpectedEOF
	}
	if err != nil {
		return 0, false, err
	}
	return n, true, nil
}

func (c *blockCache) fetch(ctx context.Context, wh *wireHandle, f *cachedFile, idx int64) ([]byte, error) {
	id := blockID{f.key, idx}
	for {
		c.mu.Lock()
		if running, ok := c.blocks[id]; ok {
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
		c.blocks[id] = mine
		c.mu.Unlock()
		mine.data, mine.err = c.load(ctx, wh, f, idx)
		c.mu.Lock()
		delete(c.blocks, id)
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

func (c *blockCache) load(ctx context.Context, wh *wireHandle, f *cachedFile, idx int64) ([]byte, error) {
	start, end := f.span(idx)
	buf := make([]byte, end-start)
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	var wg sync.WaitGroup
	var once sync.Once
	var failure error
	for from := int64(0); from < int64(len(buf)); from += wire.MaxPayloadBytes {
		piece := buf[from:min(int64(len(buf)), from+wire.MaxPayloadBytes)]
		at := start + from
		wg.Add(1)
		go func() {
			defer wg.Done()
			payload, err := wh.read(ctx, at, len(piece))
			if err == nil && len(payload) != len(piece) {
				err = io.ErrUnexpectedEOF
			}
			if err != nil {
				once.Do(func() {
					failure = err
					cancel()
				})
				return
			}
			copy(piece, payload)
		}()
	}
	wg.Wait()
	if failure != nil {
		return nil, failure
	}
	return buf, c.store(f, idx, buf)
}

func (c *blockCache) store(f *cachedFile, idx int64, buf []byte) error {
	c.mu.Lock()
	current := c.files[f.key] == f && !f.has(idx)
	c.mu.Unlock()
	if !current {
		return nil
	}
	start, _ := f.span(idx)
	f.io.RLock()
	err := c.withData(f, func(d *os.File) error {
		if _, writeErr := d.WriteAt(buf, start); writeErr != nil {
			return writeErr
		}
		return d.Sync()
	})
	f.io.RUnlock()
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.files[f.key] != f {
		if c.files[f.key] == nil {
			os.Remove(c.dataPath(f))
		}
		return nil
	}
	if err != nil {
		return err
	}
	if f.has(idx) {
		return nil
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

func (c *blockCache) noteRead(wh *wireHandle, f *cachedFile, off, n int64) {
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
	if !ahead {
		return
	}
	wh.acquire()
	if !c.spawn(func() { c.prefetch(wh, f, following) }) {
		wh.drop()
	}
}

func (c *blockCache) prefetch(wh *wireHandle, f *cachedFile, idx int64) {
	defer wh.drop()
	if _, err := c.fetch(c.ctx, wh, f, idx); err != nil && !errors.Is(err, errOffline) && !errors.Is(err, context.Canceled) {
		fmt.Fprintln(os.Stderr, "prefetch:", f.st.Ino, err)
	}
}
