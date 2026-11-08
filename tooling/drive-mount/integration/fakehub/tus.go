package fakehub

import (
	"encoding/base64"
	"io"
	"net/http"
	"path"
	"strconv"
	"strings"
)

func metadata(header string) map[string]string {
	out := map[string]string{}
	for _, pair := range strings.Split(header, ",") {
		key, value, _ := strings.Cut(strings.TrimSpace(pair), " ")
		raw, _ := base64.StdEncoding.DecodeString(value)
		out[key] = string(raw)
	}
	return out
}

func (h *Hub) uploadTarget(meta map[string]string) (string, string, bool) {
	if id, ok := meta["itemId"]; ok {
		p, known := h.ids[id]
		rev, _ := strconv.ParseInt(meta["baseRev"], 10, 64)
		return p, id, known && h.paths[p].rev == rev
	}
	dir := "/"
	if p, ok := h.ids[meta["folderId"]]; ok {
		dir = p
	}
	p := path.Join(dir, meta["name"])
	_, taken := h.paths[p]
	return p, "", !taken
}

func (h *Hub) create(w http.ResponseWriter, r *http.Request) {
	target, itemID, ok := h.uploadTarget(metadata(r.Header.Get("Upload-Metadata")))
	if !ok {
		w.WriteHeader(http.StatusConflict)
		return
	}
	length, _ := strconv.Atoi(r.Header.Get("Upload-Length"))
	id := strconv.Itoa(len(h.uploads) + 1)
	up := &upload{target: target, itemID: itemID, length: length}
	h.uploads[id] = up
	if length == 0 {
		h.commit(up)
	}
	w.Header().Set("Location", "/drive/uploads/"+id)
	w.Header().Set("Upload-Offset", "0")
	w.WriteHeader(http.StatusCreated)
}

func (h *Hub) commit(up *upload) {
	p := up.target
	if up.itemID != "" {
		p = h.ids[up.itemID]
	}
	h.ensureDirs(path.Dir(p))
	h.store(p, up.data)
	h.ops = append(h.ops, "upload "+p)
}

func (h *Hub) head(w http.ResponseWriter, r *http.Request) {
	up, ok := h.uploads[r.PathValue("id")]
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	w.Header().Set("Upload-Offset", strconv.Itoa(len(up.data)))
	w.WriteHeader(http.StatusOK)
}

func (h *Hub) patch(w http.ResponseWriter, r *http.Request) {
	up, ok := h.uploads[r.PathValue("id")]
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	offset, _ := strconv.Atoi(r.Header.Get("Upload-Offset"))
	if offset != len(up.data) || r.Header.Get("Content-Type") != "application/offset+octet-stream" {
		w.WriteHeader(http.StatusConflict)
		return
	}
	body, _ := io.ReadAll(r.Body)
	up.data = append(up.data, body...)
	if len(up.data) == up.length {
		h.commit(up)
	}
	w.Header().Set("Upload-Offset", strconv.Itoa(len(up.data)))
	w.WriteHeader(http.StatusNoContent)
}
