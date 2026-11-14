package main

import (
	"context"
	"net/url"
	"sync"
)

type driveSpace struct {
	Total int64 `json:"totalBytes"`
	Used  int64 `json:"usedBytes"`
	Free  int64 `json:"freeBytes"`
}

func (c *hubClient) space(ctx context.Context, root mountRoot) (driveSpace, error) {
	res, err := c.request(ctx, "/drive/fs/"+url.PathEscape(root.RootID)+"/space", c.query(root), "")
	if err != nil {
		return driveSpace{}, err
	}
	return decode[driveSpace](res)
}

type spaceMemory struct {
	mu    sync.Mutex
	known map[mountRoot]driveSpace
}

func (m *spaceMemory) remember(root mountRoot, space driveSpace) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.known == nil {
		m.known = map[mountRoot]driveSpace{}
	}
	m.known[root] = space
}

func (m *spaceMemory) last(root mountRoot) (driveSpace, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	space, ok := m.known[root]
	return space, ok
}

func (w *writeBack) Space(ctx context.Context, root mountRoot) (driveSpace, error) {
	if w.offline.Load() {
		if space, ok := w.spaces.last(root); ok {
			return space, nil
		}
		return driveSpace{}, errOffline
	}
	space, err := w.hub.space(ctx, root)
	if err != nil {
		return driveSpace{}, err
	}
	w.spaces.remember(root, space)
	return space, nil
}
