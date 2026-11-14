package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type mkdirBody struct {
	OpID     string  `json:"opId"`
	Base     string  `json:"base,omitempty"`
	ParentID *string `json:"parentId"`
	Name     string  `json:"name"`
}

type renameBody struct {
	OpID     string  `json:"opId"`
	Base     string  `json:"base,omitempty"`
	ItemID   string  `json:"itemId"`
	ParentID *string `json:"parentId"`
	Name     string  `json:"name"`
}

type removeBody struct {
	OpID   string `json:"opId"`
	Base   string `json:"base,omitempty"`
	ItemID string `json:"itemId"`
}

type utimensBody struct {
	OpID       string `json:"opId"`
	Base       string `json:"base,omitempty"`
	ItemID     string `json:"itemId"`
	ModifiedAt string `json:"modifiedAt"`
}

func (c *hubClient) post(ctx context.Context, root mountRoot, action string, body any) (entry, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return entry{}, err
	}
	res, err := c.send(ctx, false, func(ctx context.Context, base string) (*http.Request, error) {
		target := base + "/drive/fs/" + url.PathEscape(root.RootID) + "/" + action
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(raw))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		return req, nil
	})
	if err != nil {
		return entry{}, err
	}
	if res.StatusCode >= 300 {
		res.Body.Close()
		return entry{}, hubStatusError{status: res.StatusCode, op: "POST " + action}
	}
	out, err := decode[wireEntry](res)
	if err != nil {
		return entry{}, err
	}
	return out.entry(), nil
}

func (c *hubClient) mkdir(ctx context.Context, root mountRoot, parent parentRef, name string) (entry, error) {
	id, err := newSessionID()
	if err != nil {
		return entry{}, err
	}
	return c.post(ctx, root, "mkdir", mkdirBody{OpID: id, Base: root.FolderID, ParentID: parent.wire(), Name: name})
}

func (c *hubClient) rename(ctx context.Context, root mountRoot, item entry, parent parentRef, name string) (entry, error) {
	id, err := newSessionID()
	if err != nil {
		return entry{}, err
	}
	return c.post(ctx, root, "rename", renameBody{OpID: id, Base: root.FolderID, ItemID: item.ID, ParentID: parent.wire(), Name: name})
}

func (c *hubClient) remove(ctx context.Context, root mountRoot, item entry) error {
	id, err := newSessionID()
	if err != nil {
		return err
	}
	action := "unlink"
	if item.Dir {
		action = "rmdir"
	}
	_, err = c.post(ctx, root, action, removeBody{OpID: id, Base: root.FolderID, ItemID: item.ID})
	return err
}

func (c *hubClient) stamp(ctx context.Context, root mountRoot, item entry, at time.Time) error {
	id, err := newSessionID()
	if err != nil {
		return err
	}
	_, err = c.post(ctx, root, "utimens", utimensBody{OpID: id, Base: root.FolderID, ItemID: item.ID, ModifiedAt: at.UTC().Format(time.RFC3339Nano)})
	return err
}

func (c *hubClient) forget(root mountRoot, paths ...string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for loc := range c.known {
		if loc.root != root {
			continue
		}
		for _, p := range paths {
			if loc.path == p || strings.HasPrefix(loc.path, strings.TrimSuffix(p, "/")+"/") {
				delete(c.known, loc)
				break
			}
		}
	}
}
