package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type metaSession struct {
	t       *testing.T
	backend metaBackend
	next    int64
}

func (s *metaSession) call(request metaRequest) metaReply {
	s.t.Helper()
	s.next++
	request.ID = s.next
	raw, err := json.Marshal(request)
	if err != nil {
		s.t.Fatal(err)
	}
	var out bytes.Buffer
	if err := runMeta(bytes.NewReader(append(raw, '\n')), &out, s.backend); err != nil {
		s.t.Fatal(err)
	}
	var reply metaReply
	if err := json.Unmarshal(out.Bytes(), &reply); err != nil {
		s.t.Fatalf("reply %q: %v", out.String(), err)
	}
	if reply.ID != request.ID {
		s.t.Fatalf("reply id %d for request %d", reply.ID, request.ID)
	}
	return reply
}

func newMetaSession(t *testing.T) (*metaSession, string) {
	t.Helper()
	dir := t.TempDir()
	return &metaSession{t: t, backend: platformMeta()}, dir
}

func writeMetaFile(t *testing.T, dir, name string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestMetaXattrsRoundTrip(t *testing.T) {
	session, dir := newMetaSession(t)
	path := writeMetaFile(t, dir, "a")
	want := []metaXattr{{Name: "user.one", Value: []byte("1")}, {Name: "user.two", Value: []byte{0, 255, 7}}}
	if reply := session.call(metaRequest{Op: "xattrs", Path: path, Xattrs: want}); !reply.OK {
		t.Skipf("filesystem refuses user xattrs: %s", reply.Message)
	}
	reply := session.call(metaRequest{Op: "read", Paths: []string{path}})
	if !reply.OK || len(reply.Entries) != 1 || reply.Entries[0].Code != "" {
		t.Fatalf("read failed: %+v", reply)
	}
	if got := reply.Entries[0].Xattrs; len(got) != 2 || got[0].Name != "user.one" || string(got[0].Value) != "1" ||
		got[1].Name != "user.two" || !bytes.Equal(got[1].Value, []byte{0, 255, 7}) {
		t.Fatalf("round trip lost data: %+v", got)
	}
}

func TestMetaXattrsReplaceRemovesAndOverwrites(t *testing.T) {
	session, dir := newMetaSession(t)
	path := writeMetaFile(t, dir, "a")
	first := []metaXattr{{Name: "user.keep", Value: []byte("old")}, {Name: "user.drop", Value: []byte("d")}}
	if reply := session.call(metaRequest{Op: "xattrs", Path: path, Xattrs: first}); !reply.OK {
		t.Skipf("filesystem refuses user xattrs: %s", reply.Message)
	}
	second := []metaXattr{{Name: "user.keep", Value: []byte("new")}}
	if reply := session.call(metaRequest{Op: "xattrs", Path: path, Xattrs: second}); !reply.OK {
		t.Fatalf("replace failed: %+v", reply)
	}
	got := session.call(metaRequest{Op: "read", Paths: []string{path}}).Entries[0].Xattrs
	if len(got) != 1 || got[0].Name != "user.keep" || string(got[0].Value) != "new" {
		t.Fatalf("replace left %+v", got)
	}
	if reply := session.call(metaRequest{Op: "xattrs", Path: path}); !reply.OK {
		t.Fatalf("clear failed: %+v", reply)
	}
	if got := session.call(metaRequest{Op: "read", Paths: []string{path}}).Entries[0].Xattrs; len(got) != 0 {
		t.Fatalf("clear left %+v", got)
	}
}

func TestMetaReadReportsMissingPathPerEntry(t *testing.T) {
	session, dir := newMetaSession(t)
	present := writeMetaFile(t, dir, "a")
	reply := session.call(metaRequest{Op: "read", Paths: []string{filepath.Join(dir, "gone"), present}})
	if !reply.OK || len(reply.Entries) != 2 {
		t.Fatalf("read failed: %+v", reply)
	}
	if reply.Entries[0].Code != "ENOENT" || reply.Entries[1].Code != "" {
		t.Fatalf("codes %q %q", reply.Entries[0].Code, reply.Entries[1].Code)
	}
}

func TestMetaRefusesForeignNamespaces(t *testing.T) {
	session, dir := newMetaSession(t)
	path := writeMetaFile(t, dir, "a")
	reply := session.call(metaRequest{Op: "xattrs", Path: path, Xattrs: []metaXattr{{Name: "security.x", Value: []byte("1")}}})
	if reply.OK || reply.Code != "EINVAL" {
		t.Fatalf("foreign namespace accepted: %+v", reply)
	}
}

func TestMetaSetsNanosecondMtimeWithoutFollowingLinks(t *testing.T) {
	session, dir := newMetaSession(t)
	path := writeMetaFile(t, dir, "a")
	link := filepath.Join(dir, "l")
	if err := os.Symlink("a", link); err != nil {
		t.Fatal(err)
	}
	const ns = int64(1_700_000_000_123_456_789)
	if reply := session.call(metaRequest{Op: "mtime", Path: link, MtimeNs: fmt.Sprint(ns)}); !reply.OK {
		t.Fatalf("link mtime failed: %+v", reply)
	}
	linkInfo, err := os.Lstat(link)
	if err != nil {
		t.Fatal(err)
	}
	if linkInfo.ModTime().UnixNano() != ns {
		t.Fatalf("link mtime %d", linkInfo.ModTime().UnixNano())
	}
	targetInfo, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if targetInfo.ModTime().UnixNano() == ns {
		t.Fatal("the link target was followed")
	}
	if reply := session.call(metaRequest{Op: "mtime", Path: path, MtimeNs: fmt.Sprint(ns)}); !reply.OK {
		t.Fatalf("file mtime failed: %+v", reply)
	}
	if info, _ := os.Stat(path); info.ModTime().UnixNano() != ns {
		t.Fatalf("file mtime %d", info.ModTime().UnixNano())
	}
}

func TestMetaAnswersBadInputPerLine(t *testing.T) {
	var out bytes.Buffer
	input := strings.NewReader("{\"id\":1,\"op\":\"nope\"}\nnot json\n{\"id\":3,\"op\":\"read\",\"paths\":[]}\n")
	if err := runMeta(input, &out, platformMeta()); err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 3 {
		t.Fatalf("expected 3 replies, got %q", out.String())
	}
	var first, second, third metaReply
	for i, target := range []*metaReply{&first, &second, &third} {
		if err := json.Unmarshal([]byte(lines[i]), target); err != nil {
			t.Fatal(err)
		}
	}
	if first.OK || first.ID != 1 || second.OK || !third.OK || third.ID != 3 {
		t.Fatalf("replies %+v %+v %+v", first, second, third)
	}
}
