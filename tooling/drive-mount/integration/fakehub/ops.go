package fakehub

import (
	"encoding/json"
	"net/http"
	"path"
	"strings"
)

var bodyKeys = map[string][]string{
	"mkdir":   {"opId", "parentId", "name"},
	"rename":  {"opId", "itemId", "parentId", "name"},
	"remove":  {"opId", "itemId"},
	"utimens": {"opId", "itemId", "modifiedAt"},
}

func decodeBody(r *http.Request, kind string) (map[string]any, bool) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		return nil, false
	}
	allowed := map[string]bool{"base": true}
	for _, key := range bodyKeys[kind] {
		allowed[key] = true
		if _, present := body[key]; !present {
			return nil, false
		}
	}
	for key := range body {
		if !allowed[key] {
			return nil, false
		}
	}
	return body, true
}

func (h *Hub) folderOf(body map[string]any) (string, bool) {
	parent, _ := body["parentId"].(string)
	if parent == "" {
		return "/", true
	}
	p, ok := h.ids[parent]
	return p, ok && h.paths[p].dir
}

func (h *Hub) mkdir(w http.ResponseWriter, r *http.Request) {
	body, ok := decodeBody(r, "mkdir")
	dir, found := h.folderOf(body)
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if !found {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	p := path.Join(dir, body["name"].(string))
	if _, taken := h.paths[p]; taken {
		w.WriteHeader(http.StatusConflict)
		return
	}
	h.ops = append(h.ops, "mkdir "+p)
	reply(w, http.StatusOK, h.wire(p, h.newItem(p, true, nil)))
}

func (h *Hub) rename(w http.ResponseWriter, r *http.Request) {
	body, ok := decodeBody(r, "rename")
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	from, known := h.ids[body["itemId"].(string)]
	dir, found := h.folderOf(body)
	if !known || !found {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	to := path.Join(dir, body["name"].(string))
	if _, taken := h.paths[to]; taken {
		w.WriteHeader(http.StatusConflict)
		return
	}
	h.ops = append(h.ops, "rename "+from+" "+to)
	for p, it := range h.paths {
		if p == from || strings.HasPrefix(p, from+"/") {
			moved := to + strings.TrimPrefix(p, from)
			delete(h.paths, p)
			h.paths[moved] = it
			h.ids[it.id] = moved
		}
	}
	h.paths[to].rev++
	reply(w, http.StatusOK, h.wire(to, h.paths[to]))
}

func (h *Hub) remove(dir bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, ok := decodeBody(r, "remove")
		if !ok {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		p, known := h.ids[body["itemId"].(string)]
		switch {
		case !known:
			w.WriteHeader(http.StatusNotFound)
		case h.paths[p].dir != dir:
			w.WriteHeader(http.StatusBadRequest)
		case dir && len(h.children(p)) > 0:
			w.WriteHeader(http.StatusConflict)
		default:
			h.ops = append(h.ops, map[bool]string{false: "unlink ", true: "rmdir "}[dir]+p)
			delete(h.ids, h.paths[p].id)
			delete(h.paths, p)
			reply(w, http.StatusOK, map[string]any{})
		}
	}
}

func (h *Hub) utimens(w http.ResponseWriter, r *http.Request) {
	body, ok := decodeBody(r, "utimens")
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	p, known := h.ids[body["itemId"].(string)]
	if !known {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	h.ops = append(h.ops, "utimens "+p)
	h.paths[p].rev++
	reply(w, http.StatusOK, h.wire(p, h.paths[p]))
}
