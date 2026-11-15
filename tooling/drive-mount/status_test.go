package main

import (
	"bytes"
	"errors"
	"strings"
	"testing"
)

func TestStatusOnChangeOnly(t *testing.T) {
	out := &bytes.Buffer{}
	r := newReporter(out)
	r.status("a", stateMounted, "")
	r.status("a", stateMounted, "")
	r.status("b", stateMounted, "")
	r.status("a", stateFailed, "gone")
	r.status("a", stateFailed, "gone")
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 3 {
		t.Fatalf("lines %v", lines)
	}
	r.forget("a")
	r.status("a", stateFailed, "gone")
	if got := strings.Count(out.String(), "\n"); got != 4 {
		t.Fatalf("after forget %d lines", got)
	}
}

func TestUsageLineIsTheCountersLineTheDesktopReads(t *testing.T) {
	out := &bytes.Buffer{}
	r := newReporter(out)
	r.usage("a", 100, 40, 2, 3)
	r.usage("a", 100, 40, 2, 3)
	r.usage("a", 100, 40, 2, 4)
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 2 {
		t.Fatalf("lines %v", lines)
	}
	want := `{"type":"counters","mount":"a","cacheBytes":100,"pinnedBytes":40,"openFiles":2,"pendingUploads":3}`
	if lines[0] != want {
		t.Fatalf("line %s, want %s", lines[0], want)
	}
}

func TestFailureLineNamesTheMountAndTheReason(t *testing.T) {
	out := &bytes.Buffer{}
	newReporter(out).failure("a", errors.New("no route"))
	if got := strings.TrimSpace(out.String()); got != `{"type":"error","mount":"a","reason":"no route"}` {
		t.Fatalf("line %s", got)
	}
}
