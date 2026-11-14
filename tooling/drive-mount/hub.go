package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
)

type entry struct {
	Name string
	Dir  bool
	Size int64
	ID   string
	Etag string
	Rev  int64
}

type wireEntry struct {
	ID         string  `json:"id"`
	ParentID   *string `json:"parentId"`
	Name       string  `json:"name"`
	Directory  bool    `json:"directory"`
	Size       int64   `json:"size"`
	ModifiedAt string  `json:"modifiedAt"`
	Rev        int64   `json:"rev"`
	Etag       string  `json:"etag"`
}

type wirePage struct {
	Folder  *wireEntry  `json:"folder"`
	Entries []wireEntry `json:"entries"`
	Next    *string     `json:"next"`
}

type wireStat struct {
	Entry *wireEntry `json:"entry"`
}

func (w wireEntry) entry() entry {
	return entry{Name: w.Name, Dir: w.Directory, Size: w.Size, ID: w.ID, Etag: w.Etag, Rev: w.Rev}
}

type location struct {
	root mountRoot
	path string
}

type hubClient struct {
	token string
	mu    sync.Mutex
	route *hubRoute
	known map[location]entry
}

func newHubClient(spec routeSpec, token string) *hubClient {
	return &hubClient{token: token, route: newRoute(0, spec, transportFor(spec)), known: map[location]entry{}}
}

func (c *hubClient) request(ctx context.Context, route string, query url.Values, rng string) (*http.Response, error) {
	res, err := c.send(ctx, false, func(ctx context.Context, base string) (*http.Request, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+route+"?"+query.Encode(), nil)
		if err != nil {
			return nil, err
		}
		if rng != "" {
			req.Header.Set("Range", rng)
		}
		return req, nil
	})
	if err != nil {
		return nil, err
	}
	if res.StatusCode >= 300 {
		res.Body.Close()
		return nil, hubStatusError{status: res.StatusCode, op: "GET " + route}
	}
	return res, nil
}

func (c *hubClient) query(root mountRoot) url.Values {
	query := url.Values{}
	if root.FolderID != "" {
		query.Set("base", root.FolderID)
	}
	return query
}

func decode[T any](res *http.Response) (T, error) {
	defer res.Body.Close()
	var out T
	return out, json.NewDecoder(res.Body).Decode(&out)
}

func (c *hubClient) remember(root mountRoot, dir string, items []entry) {
	c.mu.Lock()
	defer c.mu.Unlock()
	prefix := strings.TrimSuffix(dir, "/")
	for loc := range c.known {
		if loc.root == root && strings.HasPrefix(loc.path, prefix+"/") && !strings.Contains(strings.TrimPrefix(loc.path, prefix+"/"), "/") {
			delete(c.known, loc)
		}
	}
	for _, it := range items {
		c.known[location{root, prefix + "/" + it.Name}] = it
	}
}

func (c *hubClient) lookup(ctx context.Context, root mountRoot, p string) (entry, error) {
	c.mu.Lock()
	it, ok := c.known[location{root, p}]
	c.mu.Unlock()
	if ok {
		return it, nil
	}
	query := c.query(root)
	query.Set("path", strings.TrimPrefix(p, "/"))
	res, err := c.request(ctx, "/drive/fs/"+url.PathEscape(root.RootID)+"/stat", query, "")
	if err != nil {
		return entry{}, err
	}
	stat, err := decode[wireStat](res)
	if err != nil {
		return entry{}, err
	}
	if stat.Entry == nil {
		return entry{}, errors.New("hub answered no entry")
	}
	return stat.Entry.entry(), nil
}

func (c *hubClient) list(ctx context.Context, root mountRoot, dir string) ([]entry, error) {
	query := c.query(root)
	if dir != "/" && dir != "" {
		folder, err := c.lookup(ctx, root, dir)
		if err != nil {
			return nil, err
		}
		query.Set("folder", folder.ID)
	}
	var out []entry
	for {
		res, err := c.request(ctx, "/drive/fs/"+url.PathEscape(root.RootID)+"/list", query, "")
		if err != nil {
			return nil, err
		}
		page, err := decode[wirePage](res)
		if err != nil {
			return nil, err
		}
		for _, w := range page.Entries {
			out = append(out, w.entry())
		}
		if page.Next == nil {
			break
		}
		query.Set("cursor", *page.Next)
	}
	c.remember(root, dir, out)
	return out, nil
}

func (c *hubClient) readAt(ctx context.Context, root mountRoot, p string, off int64, dst []byte) (int, error) {
	item, err := c.lookup(ctx, root, p)
	if err != nil {
		return 0, err
	}
	rng := fmt.Sprintf("bytes=%d-%d", off, off+int64(len(dst))-1)
	res, err := c.request(ctx, "/drive/fs/"+url.PathEscape(root.RootID)+"/read/"+url.PathEscape(item.ID), c.query(root), rng)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	n, err := io.ReadFull(res.Body, dst)
	if err == io.ErrUnexpectedEOF || err == io.EOF {
		err = nil
	}
	return n, err
}
