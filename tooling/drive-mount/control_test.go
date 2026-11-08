package main

import (
	"bytes"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

var testEpoch = time.Unix(0, 0)

type recorder struct {
	calls []string
	fail  error
}

func (r *recorder) record(format string, args ...any) error {
	r.calls = append(r.calls, fmt.Sprintf(format, args...))
	return r.fail
}

func (r *recorder) mount(id string, root mountRoot, point string) error {
	return r.record("mount %s %s %s %s", id, root.RootID, root.FolderID, point)
}
func (r *recorder) unmount(id string) error { return r.record("unmount %s", id) }
func (r *recorder) invalidate(id string, paths []string) error {
	return r.record("invalidate %s %s", id, strings.Join(paths, ","))
}
func (r *recorder) limit(id string, bytes int64) error {
	return r.record("limit %s %d", id, bytes)
}
func (r *recorder) pin(id, path string) error   { return r.record("pin %s %s", id, path) }
func (r *recorder) unpin(id, path string) error { return r.record("unpin %s %s", id, path) }
func (r *recorder) reachable(online bool) error { return r.record("reachable %t", online) }

func control(t *testing.T, rec *recorder, input string) string {
	t.Helper()
	out := &bytes.Buffer{}
	if err := runControl(strings.NewReader(input), rec, newReporter(out)); err != nil {
		t.Fatal(err)
	}
	return out.String()
}

func TestControlDispatch(t *testing.T) {
	rec := &recorder{}
	input := strings.Join([]string{
		`{"op":"mount","mount":"m1","root":"r1","folder":"f1","point":"/mnt/a"}`,
		`{"op":"mount","mount":"m2","root":"r2","point":"/mnt/b"}`,
		`{"op":"invalidate","mount":"m1","paths":["/a","/b/c"]}`,
		`{"op":"pin","mount":"m1","path":"/x"}`,
		`{"op":"unpin","mount":"m1","path":"/x"}`,
		`{"op":"limit","mount":"m1","bytes":0}`,
		`{"op":"reachable","online":false}`,
		`{"op":"reachable","online":true}`,
		`{"op":"unmount","mount":"m1"}`,
	}, "\n")
	if out := control(t, rec, input); out != "" {
		t.Fatalf("unexpected output %s", out)
	}
	want := []string{
		"mount m1 r1 f1 /mnt/a", "mount m2 r2  /mnt/b", "invalidate m1 /a,/b/c",
		"pin m1 /x", "unpin m1 /x", "limit m1 0", "reachable false", "reachable true", "unmount m1",
	}
	if strings.Join(rec.calls, "|") != strings.Join(want, "|") {
		t.Fatalf("calls %v", rec.calls)
	}
}

func TestControlRejectsBadLinesAndContinues(t *testing.T) {
	rec := &recorder{}
	input := strings.Join([]string{
		`not json`,
		`{"op":"mount","mount":"m1"}`,
		`{"op":"explode","mount":"m1"}`,
		`{"op":"unmount","mount":"m1","extra":1}`,
		`{"op":"unmount","mount":"m1"}`,
	}, "\n")
	out := control(t, rec, input)
	if got := strings.Count(out, `"type":"error"`); got != 4 {
		t.Fatalf("errors %d in %s", got, out)
	}
	if len(rec.calls) != 1 || rec.calls[0] != "unmount m1" {
		t.Fatalf("calls %v", rec.calls)
	}
}

func TestControlReportsFailureAndHandlesLastLineWithoutNewline(t *testing.T) {
	rec := &recorder{fail: errors.New("boom")}
	out := control(t, rec, `{"op":"unmount","mount":"m1"}`)
	if !strings.Contains(out, `"mount":"m1"`) || !strings.Contains(out, "boom") {
		t.Fatalf("output %s", out)
	}
}

func TestControlHandlesVeryLongLine(t *testing.T) {
	rec := &recorder{}
	paths := make([]string, 20000)
	for i := range paths {
		paths[i] = fmt.Sprintf("/folder-%d/file", i)
	}
	line := `{"op":"invalidate","mount":"m1","paths":["` + strings.Join(paths, `","`) + `"]}` + "\n"
	if out := control(t, rec, line); out != "" || len(rec.calls) != 1 {
		t.Fatalf("out %q calls %d", out, len(rec.calls))
	}
}

func TestReachableNeedsOnline(t *testing.T) {
	rec := &recorder{}
	out := control(t, rec, `{"op":"reachable"}`)
	if !strings.Contains(out, `"type":"error"`) || len(rec.calls) != 0 {
		t.Fatalf("out %s calls %v", out, rec.calls)
	}
}
