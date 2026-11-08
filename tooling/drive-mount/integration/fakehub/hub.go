package fakehub

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

const Token = "device-token"

var epoch = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

type item struct {
	id   string
	dir  bool
	data []byte
	rev  int64
}

type upload struct {
	target string
	itemID string
	length int
	data   []byte
}

type Hub struct {
	mu      sync.Mutex
	URL     string
	server  *httptest.Server
	paths   map[string]*item
	ids     map[string]string
	uploads map[string]*upload
	next    int
	ops     []string
}

func New(t testing.TB) *Hub {
	t.Helper()
	h := &Hub{paths: map[string]*item{"/": {id: "root", dir: true, rev: 1}}, ids: map[string]string{"root": "/"}, uploads: map[string]*upload{}}
	mux := http.NewServeMux()
	routes := map[string]http.HandlerFunc{
		"GET /drive/fs/{root}/list":      h.list,
		"GET /drive/fs/{root}/stat":      h.stat,
		"GET /drive/fs/{root}/read/{id}": h.read,
		"POST /drive/fs/{root}/mkdir":    h.mkdir,
		"POST /drive/fs/{root}/rename":   h.rename,
		"POST /drive/fs/{root}/unlink":   h.remove(false),
		"POST /drive/fs/{root}/rmdir":    h.remove(true),
		"POST /drive/fs/{root}/utimens":  h.utimens,
		"POST /drive/uploads":            h.create,
		"HEAD /drive/uploads/{id}":       h.head,
		"PATCH /drive/uploads/{id}":      h.patch,
	}
	for pattern, handler := range routes {
		mux.HandleFunc(pattern, h.guarded(handler))
	}
	h.server = httptest.NewServer(mux)
	h.URL = h.server.URL
	t.Cleanup(h.server.Close)
	return h
}

func (h *Hub) guarded(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+Token {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		h.mu.Lock()
		defer h.mu.Unlock()
		next(w, r)
	}
}

func (h *Hub) newItem(p string, dir bool, data []byte) *item {
	h.next++
	it := &item{id: fmt.Sprintf("00000000-0000-4000-8000-%012d", h.next), dir: dir, data: data, rev: 1}
	h.paths[p] = it
	h.ids[it.id] = p
	return it
}

func (h *Hub) Put(p, content string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.ensureDirs(path.Dir(p))
	h.store(p, []byte(content))
}

func (h *Hub) Mkdir(p string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.ensureDirs(p)
}

func (h *Hub) ensureDirs(dir string) {
	for dir != "/" {
		if _, ok := h.paths[dir]; !ok {
			h.ensureDirs(path.Dir(dir))
			h.newItem(dir, true, nil)
		}
		dir = path.Dir(dir)
	}
}

func (h *Hub) store(p string, data []byte) *item {
	if it, ok := h.paths[p]; ok {
		it.data = data
		it.rev++
		return it
	}
	return h.newItem(p, false, data)
}

func (h *Hub) Content(p string) (string, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	it, ok := h.paths[p]
	if !ok || it.dir {
		return "", false
	}
	return string(it.data), true
}

func (h *Hub) Exists(p string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	_, ok := h.paths[p]
	return ok
}

func (h *Hub) ID(p string) string {
	h.mu.Lock()
	defer h.mu.Unlock()
	if it, ok := h.paths[p]; ok {
		return it.id
	}
	return ""
}

func (h *Hub) Rev(p string) int64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	if it, ok := h.paths[p]; ok {
		return it.rev
	}
	return 0
}

func (h *Hub) Edit(p, content string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.store(p, []byte(content))
}

func (h *Hub) Names(dir string) []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	var out []string
	for _, e := range h.children(dir) {
		out = append(out, path.Base(e.p))
	}
	sort.Strings(out)
	return out
}

func (h *Hub) Ops() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]string(nil), h.ops...)
}

type child struct {
	p  string
	it *item
}

func (h *Hub) children(dir string) []child {
	var out []child
	for p, it := range h.paths {
		if p != "/" && path.Dir(p) == dir {
			out = append(out, child{p, it})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].p < out[j].p })
	return out
}

func (h *Hub) wire(p string, it *item) map[string]any {
	var parent any
	if dir := path.Dir(p); dir != "/" {
		parent = h.paths[dir].id
	}
	size := len(it.data)
	return map[string]any{
		"id": it.id, "parentId": parent, "name": path.Base(p), "directory": it.dir, "size": size,
		"modifiedAt": epoch.Format(time.RFC3339), "rev": it.rev, "etag": fmt.Sprintf("%s:%d", it.id, it.rev),
	}
}

func reply(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}

func (h *Hub) list(w http.ResponseWriter, r *http.Request) {
	dir := "/"
	if id := r.URL.Query().Get("folder"); id != "" {
		p, ok := h.ids[id]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		dir = p
	}
	entries := []map[string]any{}
	for _, c := range h.children(dir) {
		entries = append(entries, h.wire(c.p, c.it))
	}
	reply(w, http.StatusOK, map[string]any{"folder": nil, "entries": entries, "next": nil})
}

func (h *Hub) stat(w http.ResponseWriter, r *http.Request) {
	p := "/" + strings.Trim(r.URL.Query().Get("path"), "/")
	it, ok := h.paths[p]
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	reply(w, http.StatusOK, map[string]any{"entry": h.wire(p, it)})
}

func (h *Hub) read(w http.ResponseWriter, r *http.Request) {
	p, ok := h.ids[r.PathValue("id")]
	if !ok || h.paths[p].dir {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	http.ServeContent(w, r, path.Base(p), epoch, bytes.NewReader(h.paths[p].data))
}
