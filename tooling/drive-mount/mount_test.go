//go:build linux

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
)

const stubToken = "device-token"

type stubHub struct {
	mu       sync.Mutex
	files    map[string]map[string]string
	pageSize int
	lists    int
	revs     map[string]int
	uploads  map[string]*stubUpload
	patches  []int64
	upKey    string
	server   *httptest.Server
}

func key(root, folder string) string { return root + "|" + folder }

func (h *stubHub) set(root, folder, filePath, content string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	k := key(root, folder)
	if h.files[k] == nil {
		h.files[k] = map[string]string{}
	}
	h.files[k][filePath] = content
}

func wireOf(filePath string, dir bool, size, rev int) map[string]any {
	return map[string]any{
		"id": "id:" + filePath, "parentId": nil, "name": path.Base(filePath), "directory": dir,
		"size": size, "modifiedAt": "2026-01-01T00:00:00Z", "rev": rev, "etag": fmt.Sprintf("%s:%d", filePath, size),
	}
}

func (h *stubHub) children(k, dir string) []map[string]any {
	seen := map[string]map[string]any{}
	for filePath, content := range h.files[k] {
		rel := strings.TrimPrefix(filePath, strings.TrimSuffix(dir, "/")+"/")
		if rel == filePath {
			continue
		}
		name, _, nested := strings.Cut(rel, "/")
		child := path.Join(dir, name)
		if nested {
			seen[name] = wireOf(child, true, 0, 1)
			continue
		}
		seen[name] = wireOf(child, false, len(content), h.revOf(child))
	}
	out := make([]map[string]any, 0, len(seen))
	for _, e := range seen {
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i]["name"].(string) < out[j]["name"].(string) })
	return out
}

func (h *stubHub) page(w http.ResponseWriter, r *http.Request) {
	h.lists++
	q := r.URL.Query()
	k := key(r.PathValue("root"), q.Get("base"))
	dir := strings.TrimPrefix(q.Get("folder"), "id:")
	if dir == "" {
		dir = "/"
	}
	all := h.children(k, dir)
	start, _ := strconv.Atoi(q.Get("cursor"))
	end := len(all)
	var next any
	if h.pageSize > 0 && start+h.pageSize < end {
		end = start + h.pageSize
		next = strconv.Itoa(end)
	}
	json.NewEncoder(w).Encode(map[string]any{"folder": nil, "entries": all[start:end], "next": next})
}

func (h *stubHub) stat(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	p := "/" + q.Get("path")
	content, ok := h.files[key(r.PathValue("root"), q.Get("base"))][p]
	if ok {
		json.NewEncoder(w).Encode(map[string]any{"entry": wireOf(p, false, len(content), h.revOf(p))})
		return
	}
	if len(h.children(key(r.PathValue("root"), q.Get("base")), p)) > 0 {
		json.NewEncoder(w).Encode(map[string]any{"entry": wireOf(p, true, 0, 1)})
		return
	}
	w.WriteHeader(http.StatusNotFound)
}

func (h *stubHub) read(w http.ResponseWriter, r *http.Request) {
	p := strings.TrimPrefix(r.PathValue("item"), "id:")
	content, ok := h.files[key(r.PathValue("root"), r.URL.Query().Get("base"))][p]
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	http.ServeContent(w, r, path.Base(p), testEpoch, strings.NewReader(content))
}

var stubSpace = driveSpace{Total: 500 << 30, Used: 120 << 30, Free: 380 << 30}

func newStubHub(t *testing.T) *stubHub {
	t.Helper()
	h := &stubHub{files: map[string]map[string]string{}, revs: map[string]int{}, uploads: map[string]*stubUpload{}}
	mux := http.NewServeMux()
	guard := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Authorization") != "Bearer "+stubToken {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			h.mu.Lock()
			defer h.mu.Unlock()
			next(w, r)
		}
	}
	mux.HandleFunc("GET /drive/fs/{root}/list", guard(h.page))
	mux.HandleFunc("GET /drive/fs/{root}/stat", guard(h.stat))
	mux.HandleFunc("GET /drive/fs/{root}/read/{item}", guard(h.read))
	mux.HandleFunc("GET /drive/fs/{root}/space", guard(func(w http.ResponseWriter, _ *http.Request) {
		json.NewEncoder(w).Encode(stubSpace)
	}))
	h.routeUploads(mux, guard)
	h.server = httptest.NewServer(mux)
	t.Cleanup(h.server.Close)
	return h
}

func requireFuse(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("fusermount3"); err != nil {
		t.Skip("fusermount3 missing")
	}
	if _, err := os.Stat("/dev/fuse"); err != nil {
		t.Skip("/dev/fuse missing")
	}
}

func newFS(t *testing.T, h *stubHub) *writeBack {
	t.Helper()
	dir := cacheDirFor(t)
	files, err := newFilesystem(routeSpec{URL: h.server.URL}, stubToken, dir, filepath.Join(dir, "journal"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(files.Close)
	return files
}

func newSet(t *testing.T, h *stubHub) (*mountSet, *bytes.Buffer) {
	t.Helper()
	requireFuse(t)
	out := &bytes.Buffer{}
	set := newMountSet(newFS(t, h), newReporter(out))
	t.Cleanup(func() { set.closeAll() })
	return set, out
}

func mountAt(t *testing.T, set *mountSet, id string, root mountRoot) string {
	t.Helper()
	point := t.TempDir()
	if err := set.mount(id, root, point); err != nil {
		t.Skipf("mount unavailable: %v", err)
	}
	t.Cleanup(func() { set.unmount(id) })
	return point
}

func TestSeveralMountsInOneProcess(t *testing.T) {
	h := newStubHub(t)
	h.set("roms", "", "/zelda.bin", "zelda")
	h.set("roms", "", "/docs/note.txt", "hello")
	h.set("photos", "folder-7", "/cat.jpg", "meow")
	set, _ := newSet(t, h)
	roms := mountAt(t, set, "a", mountRoot{RootID: "roms"})
	photos := mountAt(t, set, "b", mountRoot{RootID: "photos", FolderID: "folder-7"})

	entries, err := os.ReadDir(roms)
	if err != nil || len(entries) != 2 {
		t.Fatalf("roms entries %v %v", entries, err)
	}
	note, err := os.ReadFile(filepath.Join(roms, "docs", "note.txt"))
	if err != nil || string(note) != "hello" {
		t.Fatalf("note %q %v", note, err)
	}
	cat, err := os.ReadFile(filepath.Join(photos, "cat.jpg"))
	if err != nil || string(cat) != "meow" {
		t.Fatalf("cat %q %v", cat, err)
	}
	if err := set.unmount("b"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.ReadFile(filepath.Join(roms, "zelda.bin")); err != nil {
		t.Fatalf("remaining mount broke: %v", err)
	}
}

func TestRangedReadAcrossBlocks(t *testing.T) {
	content := make([]byte, 3<<20)
	for i := range content {
		content[i] = byte(i % 251)
	}
	h := newStubHub(t)
	h.set("r", "", "/data.bin", string(content))
	set, _ := newSet(t, h)
	point := mountAt(t, set, "a", mountRoot{RootID: "r"})
	f, err := os.Open(filepath.Join(point, "data.bin"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	buf := make([]byte, 1000)
	if _, err := f.ReadAt(buf, 2<<20+17); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(buf, content[2<<20+17:2<<20+17+1000]) {
		t.Fatal("content mismatch")
	}
}

func TestInvalidateDropsKernelCaches(t *testing.T) {
	h := newStubHub(t)
	h.set("r", "", "/a.txt", "old")
	h.set("r", "", "/dir/b.txt", "old-b")
	set, _ := newSet(t, h)
	point := mountAt(t, set, "a", mountRoot{RootID: "r"})
	read := func(name string) string {
		data, err := os.ReadFile(filepath.Join(point, name))
		if err != nil {
			return err.Error()
		}
		return string(data)
	}
	if read("a.txt") != "old" || read("dir/b.txt") != "old-b" {
		t.Fatal("initial read")
	}
	h.set("r", "", "/a.txt", "new!")
	h.set("r", "", "/dir/b.txt", "new-b!")
	if read("a.txt") != "old" {
		t.Fatal("kernel caches should hold until invalidated")
	}
	if err := set.invalidate("a", []string{"/a.txt"}); err != nil {
		t.Fatal(err)
	}
	if got := read("a.txt"); got != "new!" {
		t.Fatalf("after path invalidate %q", got)
	}
	if read("dir/b.txt") != "old-b" {
		t.Fatal("unrelated path was dropped")
	}
	if err := set.invalidate("a", nil); err != nil {
		t.Fatal(err)
	}
	if got := read("dir/b.txt"); got != "new-b!" {
		t.Fatalf("after whole-mount invalidate %q", got)
	}
}

func TestMountErrors(t *testing.T) {
	h := newStubHub(t)
	set, out := newSet(t, h)
	if err := set.mount("a", mountRoot{RootID: "r"}, "relative"); err == nil {
		t.Fatal("relative point accepted")
	}
	if !strings.Contains(out.String(), `"state":"failed"`) {
		t.Fatalf("no failed status: %s", out.String())
	}
	if err := set.unmount("missing"); err == nil {
		t.Fatal("unknown unmount accepted")
	}
	if err := set.invalidate("missing", nil); err == nil {
		t.Fatal("unknown invalidate accepted")
	}
	if err := set.pin("missing", "/x"); err == nil {
		t.Fatal("unknown pin accepted")
	}
}
