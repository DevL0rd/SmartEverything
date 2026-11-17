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
	r.status("a", stateMounted, "", false)
	r.status("a", stateMounted, "", false)
	r.status("b", stateMounted, "", false)
	r.status("a", stateFailed, "gone", false)
	r.status("a", stateFailed, "gone", false)
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 3 {
		t.Fatalf("lines %v", lines)
	}
	r.forget("a")
	r.status("a", stateFailed, "gone", false)
	if got := strings.Count(out.String(), "\n"); got != 4 {
		t.Fatalf("after forget %d lines", got)
	}
}

func TestStatusLineIsTheLineTheDesktopReads(t *testing.T) {
	out := &bytes.Buffer{}
	r := newReporter(out)
	r.status("a", stateMounted, "", false)
	r.status("b", stateMounted, "", true)
	r.status("a", stateFailed, "no route\n", false)
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	want := []string{
		`{"type":"status","mount":"a","state":"mounted","readOnly":false}`,
		`{"type":"status","mount":"b","state":"mounted","readOnly":true}`,
		`{"type":"status","mount":"a","state":"failed","reason":"no route","readOnly":false}`,
	}
	if strings.Join(lines, "\n") != strings.Join(want, "\n") {
		t.Fatalf("lines %v, want %v", lines, want)
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
	newReporter(out).failure("a", errors.New("no route\n"))
	if got := strings.TrimSpace(out.String()); got != `{"type":"error","mount":"a","reason":"no route"}` {
		t.Fatalf("line %s", got)
	}
}

func TestLimitsLineIsReportedOnChangeOnly(t *testing.T) {
	out := &bytes.Buffer{}
	r := newReporter(out)
	kernel := &kernelLimits{MaxUserBgreq: 20793, MaxUserCongThresh: 15594, MaxPagesLimit: 256, PageSize: 4096}
	r.limits(kernel)
	r.limits(kernel)
	kernel.ReadaheadOffer = 131072
	r.limits(kernel)
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 2 {
		t.Fatalf("lines %v", lines)
	}
	want := `{"type":"limits","platform":"` + platformName + `","kernel":true,"maxUserBgreq":20793,"maxUserCongThresh":15594,"maxPagesLimit":256,"pageSize":4096,"maxRequestBytes":1048576}`
	if lines[0] != want {
		t.Fatalf("line %s, want %s", lines[0], want)
	}
	if !strings.Contains(lines[1], `"readaheadOffer":131072`) {
		t.Fatalf("line %s", lines[1])
	}
}

func TestLimitsLineWithoutKernelSaysNotApplicable(t *testing.T) {
	out := &bytes.Buffer{}
	newReporter(out).limits(nil)
	want := `{"type":"limits","platform":"` + platformName + `","kernel":false}`
	if got := strings.TrimSpace(out.String()); got != want {
		t.Fatalf("line %s, want %s", got, want)
	}
}

func TestAppliedLineCarriesLiveValuesAndTheMountsFixedOnes(t *testing.T) {
	out := &bytes.Buffer{}
	r := newReporter(out)
	fixed := &remountApplied{MaxBackground: 64, CongestionThreshold: 48, MaxRequestBytes: 1 << 20, KernelReadaheadBytes: 131072, AsyncRead: true, WritebackCache: true, ReaddirPlus: "auto", ParallelDirops: true}
	live := defaultTuning().live
	r.applied("a", fixed, live)
	r.applied("a", fixed, live)
	live.uploadFiles = 8
	r.applied("a", fixed, live)
	r.applied("b", nil, live)
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 3 {
		t.Fatalf("lines %v", lines)
	}
	for _, want := range []string{`"type":"applied"`, `"mount":"a"`, `"remount":{"maxBackground":64,"congestionThreshold":48`, `"entrySeconds":"untilChanged"`, `"uploadFiles":4`, `"pingSeconds":10`, `"deadAfterSeconds":30`} {
		if !strings.Contains(lines[0], want) {
			t.Fatalf("line %s lacks %s", lines[0], want)
		}
	}
	if !strings.Contains(lines[2], `"remount":null`) {
		t.Fatalf("line %s", lines[2])
	}
}
