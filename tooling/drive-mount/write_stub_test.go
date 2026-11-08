//go:build linux

package main

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"path"
	"strconv"
	"strings"
)

type stubUpload struct {
	target string
	length int
	data   []byte
}

func (h *stubHub) revOf(p string) int {
	if rev, ok := h.revs[p]; ok {
		return rev
	}
	return 1
}

func (h *stubHub) routeUploads(mux *http.ServeMux, guard func(http.HandlerFunc) http.HandlerFunc) {
	mux.HandleFunc("POST /drive/uploads", guard(h.createUpload))
	mux.HandleFunc("HEAD /drive/uploads/{id}", guard(h.headUpload))
	mux.HandleFunc("PATCH /drive/uploads/{id}", guard(h.patchUpload))
}

func tusMetadata(header string) map[string]string {
	out := map[string]string{}
	for _, pair := range strings.Split(header, ",") {
		key, value, _ := strings.Cut(strings.TrimSpace(pair), " ")
		raw, _ := base64.StdEncoding.DecodeString(value)
		out[key] = string(raw)
	}
	return out
}

func (h *stubHub) uploadTargetPath(meta map[string]string) (string, int) {
	if itemID, ok := meta["itemId"]; ok {
		rev, _ := strconv.Atoi(meta["baseRev"])
		return strings.TrimPrefix(itemID, "id:"), rev
	}
	dir := "/"
	if strings.HasPrefix(meta["folderId"], "id:") {
		dir = strings.TrimPrefix(meta["folderId"], "id:")
	}
	return path.Join(dir, meta["name"]), 0
}

func (h *stubHub) createUpload(w http.ResponseWriter, r *http.Request) {
	meta := tusMetadata(r.Header.Get("Upload-Metadata"))
	target, baseRev := h.uploadTargetPath(meta)
	if _, existing := meta["itemId"]; existing && baseRev != h.revOf(target) {
		w.WriteHeader(http.StatusConflict)
		return
	}
	length, _ := strconv.Atoi(r.Header.Get("Upload-Length"))
	id := fmt.Sprint(len(h.uploads) + 1)
	up := &stubUpload{target: target, length: length}
	h.uploads[id] = up
	if length == 0 {
		h.commit(up)
	}
	w.Header().Set("Location", "/drive/uploads/"+id)
	w.Header().Set("Upload-Offset", "0")
	w.WriteHeader(http.StatusCreated)
}

func (h *stubHub) commit(up *stubUpload) {
	h.files[h.tusKey()][up.target] = string(up.data)
	h.revs[up.target] = h.revOf(up.target) + 1
}

func (h *stubHub) tusKey() string {
	if h.upKey == "" {
		h.upKey = key("r", "")
	}
	if h.files[h.upKey] == nil {
		h.files[h.upKey] = map[string]string{}
	}
	return h.upKey
}

func (h *stubHub) content(filePath string) (string, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	value, ok := h.files[h.tusKey()][filePath]
	return value, ok
}

func (h *stubHub) headUpload(w http.ResponseWriter, r *http.Request) {
	up, ok := h.uploads[r.PathValue("id")]
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	w.Header().Set("Upload-Offset", strconv.Itoa(len(up.data)))
	w.WriteHeader(http.StatusOK)
}

func (h *stubHub) patchUpload(w http.ResponseWriter, r *http.Request) {
	up, ok := h.uploads[r.PathValue("id")]
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	offset, _ := strconv.Atoi(r.Header.Get("Upload-Offset"))
	if offset != len(up.data) || r.Header.Get("Content-Type") != offsetType {
		w.WriteHeader(http.StatusConflict)
		return
	}
	body, _ := io.ReadAll(r.Body)
	h.patches = append(h.patches, int64(offset))
	up.data = append(up.data, body...)
	if len(up.data) == up.length {
		h.commit(up)
	}
	w.Header().Set("Upload-Offset", strconv.Itoa(len(up.data)))
	w.WriteHeader(http.StatusNoContent)
}
