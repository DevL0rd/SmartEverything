//go:build linux

package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestClient(h *stubHub) *hubClient {
	return newHubClient(routeSpec{URL: h.server.URL}, stubToken)
}

func TestListFollowsCursorAcrossPages(t *testing.T) {
	h := newStubHub(t)
	h.pageSize = 2
	for _, name := range []string{"a", "b", "c", "d", "e"} {
		h.set("r", "f1", "/"+name, name)
	}
	items, err := newTestClient(h).list(context.Background(), mountRoot{RootID: "r", FolderID: "f1"}, "/")
	if err != nil || len(items) != 5 {
		t.Fatalf("items %v err %v", items, err)
	}
}

func TestNestedListAndReadResolveItemIDs(t *testing.T) {
	h := newStubHub(t)
	h.set("r", "", "/dir/sub/file.bin", "0123456789")
	client := newTestClient(h)
	root := mountRoot{RootID: "r"}
	items, err := client.list(context.Background(), root, "/dir/sub")
	if err != nil || len(items) != 1 || items[0].ID != "id:/dir/sub/file.bin" || items[0].Etag == "" {
		t.Fatalf("items %v err %v", items, err)
	}
	buf := make([]byte, 4)
	n, err := client.readAt(context.Background(), root, "/dir/sub/file.bin", 3, buf)
	if err != nil || string(buf[:n]) != "3456" {
		t.Fatalf("read %q err %v", buf[:n], err)
	}
}

func TestReadWithoutListingUsesStat(t *testing.T) {
	h := newStubHub(t)
	h.set("r", "f1", "/x/y.bin", "abcdef")
	buf := make([]byte, 3)
	n, err := newTestClient(h).readAt(context.Background(), mountRoot{RootID: "r", FolderID: "f1"}, "/x/y.bin", 1, buf)
	if err != nil || string(buf[:n]) != "bcd" {
		t.Fatalf("read %q err %v", buf[:n], err)
	}
}

func TestChangedEtagDropsCachedContent(t *testing.T) {
	h := newStubHub(t)
	h.set("r", "", "/a.bin", strings.Repeat("o", 1000))
	c := newBlockCache(directSource{hub: newTestClient(h)}, cacheDirFor(t))
	t.Cleanup(c.Close)
	root := mountRoot{RootID: "r"}
	buf := make([]byte, 10)
	if _, err := c.ReadAt(context.Background(), root, "/a.bin", 0, buf); err != nil {
		t.Fatal(err)
	}
	h.set("r", "", "/a.bin", strings.Repeat("n", 1000))
	c.Invalidate(root, []string{"/a.bin"})
	n, err := c.ReadAt(context.Background(), root, "/a.bin", 0, buf)
	if err != nil || !bytes.Equal(buf[:n], []byte(strings.Repeat("n", 10))) {
		t.Fatalf("read %q err %v", buf[:n], err)
	}
}

func TestUsageLinesCountCacheAndOpenFiles(t *testing.T) {
	h := newStubHub(t)
	h.set("r", "", "/data.bin", strings.Repeat("z", 4096))
	requireFuse(t)
	out := &bytes.Buffer{}
	set := newMountSet(newFS(t, h), newReporter(out))
	t.Cleanup(func() { set.closeAll() })
	point := mountAt(t, set, "a", mountRoot{RootID: "r"})
	f, err := os.Open(filepath.Join(point, "data.bin"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.Read(make([]byte, 16)); err != nil {
		t.Fatal(err)
	}
	f.Close()
	if err := set.unmount("a"); err != nil {
		t.Fatal(err)
	}
	log := out.String()
	for _, want := range []string{`"openFiles":1`, `"openFiles":0`, `"cacheBytes":4096`} {
		if !strings.Contains(log, want) {
			t.Fatalf("missing %s in %s", want, log)
		}
	}
}

func TestLimitNeedsBytes(t *testing.T) {
	rec := &recorder{}
	out := control(t, rec, `{"op":"limit","mount":"m1"}`)
	if !strings.Contains(out, `"type":"error"`) || len(rec.calls) != 0 {
		t.Fatalf("out %s calls %v", out, rec.calls)
	}
}
