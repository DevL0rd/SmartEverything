package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/smarteverything/drive-mount/wire"
)

const legacyPinsFile = "legacy-pins.json"

type legacyPin struct {
	RootID   string `json:"rootId"`
	FolderID string `json:"folderId"`
	Path     string `json:"path"`
}

type legacyState struct {
	Root struct {
		RootID   string
		FolderID string
	} `json:"root"`
	Path   string `json:"path"`
	Pinned bool   `json:"pinned"`
}

func (c *blockCache) legacyPinsPath() string { return filepath.Join(c.dir, legacyPinsFile) }

func readLegacyPins(file string) ([]legacyPin, error) {
	raw, err := os.ReadFile(file)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var pins []legacyPin
	if err := json.Unmarshal(raw, &pins); err != nil {
		return nil, fmt.Errorf("legacy pins: %w", err)
	}
	return pins, nil
}

func collectLegacyPins(blocksDir string) ([]legacyPin, error) {
	names, err := filepath.Glob(filepath.Join(blocksDir, "*.json"))
	if err != nil {
		return nil, err
	}
	var pins []legacyPin
	for _, name := range names {
		raw, err := os.ReadFile(name)
		if err != nil {
			return nil, err
		}
		var st legacyState
		if json.Unmarshal(raw, &st) != nil || !st.Pinned || st.Path == "" || st.Root.RootID == "" {
			continue
		}
		pins = append(pins, legacyPin{RootID: st.Root.RootID, FolderID: st.Root.FolderID, Path: st.Path})
	}
	return pins, nil
}

func (c *blockCache) keepLegacyPins() error {
	found, err := collectLegacyPins(c.blocksDir())
	if err != nil {
		return err
	}
	kept, err := readLegacyPins(c.legacyPinsPath())
	if err != nil {
		return err
	}
	all := append(kept, found...)
	if len(all) == 0 {
		return nil
	}
	return writeJSON(c.legacyPinsPath(), all)
}

func (c *blockCache) RestoreLegacyPins(root mountRoot, rootIno uint64) {
	c.mu.Lock()
	var mine, rest []legacyPin
	for _, p := range c.legacy {
		if p.RootID == root.RootID && p.FolderID == root.FolderID {
			mine = append(mine, p)
		} else {
			rest = append(rest, p)
		}
	}
	if len(mine) == 0 {
		c.mu.Unlock()
		return
	}
	c.legacy = rest
	c.mu.Unlock()
	c.spawn(func() {
		var failed []legacyPin
		for _, p := range mine {
			if err := c.pinPath(c.ctx, rootIno, p.Path); err != nil && !remoteCode(err, wire.ErrENOENT) {
				if c.ctx.Err() != nil || unreachable(err) {
					failed = append(failed, p)
					continue
				}
				fmt.Fprintln(os.Stderr, "keep offline again:", p.Path, err)
			}
		}
		c.mu.Lock()
		c.legacy = append(c.legacy, failed...)
		left := append([]legacyPin(nil), c.legacy...)
		c.mu.Unlock()
		c.saveLegacyPins(left)
	})
}

func (c *blockCache) saveLegacyPins(pins []legacyPin) {
	if len(pins) == 0 {
		os.Remove(c.legacyPinsPath())
		return
	}
	if err := writeJSON(c.legacyPinsPath(), pins); err != nil {
		fmt.Fprintln(os.Stderr, "legacy pins:", err)
	}
}

func (c *blockCache) pinPath(ctx context.Context, rootIno uint64, p string) error {
	ino := rootIno
	for _, segment := range strings.Split(strings.Trim(p, "/"), "/") {
		if segment == "" {
			continue
		}
		e, err := c.Lookup(ctx, ino, segment)
		if err != nil {
			return err
		}
		ino = e.Ino
	}
	return c.Pin(ctx, ino)
}

type legacyPinRestorer interface {
	RestoreLegacyPins(root mountRoot, rootIno uint64)
}

func (w *writeBack) RestoreLegacyPins(root mountRoot, rootIno uint64) {
	if r, ok := w.base.(legacyPinRestorer); ok {
		r.RestoreLegacyPins(root, rootIno)
	}
}
