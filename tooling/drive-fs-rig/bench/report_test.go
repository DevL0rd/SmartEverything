package main

import (
	"strings"
	"testing"
)

func runs(kind, workload string, seconds ...float64) []Result {
	results := make([]Result, len(seconds))
	for index, value := range seconds {
		results[index] = Result{Workload: workload, Kind: kind, Run: index + 1, Seconds: value, CloseSeconds: value / 2, DrainSeconds: value / 2, Bytes: 1 << 30, Ops: 1024, Threads: 1}
	}
	return results
}

func TestLimitWidensToBaselineSpread(t *testing.T) {
	tight := summarize([]float64{10, 10.1, 10, 10, 10})
	if limit(tight) != 1.10 {
		t.Fatalf("tight limit %v", limit(tight))
	}
	noisy := summarize([]float64{10, 14, 10, 10, 10})
	if limit(noisy) <= 1.30 {
		t.Fatalf("noisy limit %v", limit(noisy))
	}
}

func TestRenderFlagsOnlyWorkloadsOverTheLimit(t *testing.T) {
	var results []Result
	results = append(results, runs("nfs", "seq-write", 10, 10, 10, 10, 10)...)
	results = append(results, runs("se", "seq-write", 10.5, 10.5, 10.5, 10.5, 10.5)...)
	results = append(results, runs("nfs", "untar", 5, 5, 5, 5, 5)...)
	results = append(results, runs("se", "untar", 9, 9, 9, 9, 9)...)
	text, findings := render(results, "t", []string{"seq-write", "untar"})
	if len(findings) != 1 || findings[0].Workload != "untar" || findings[0].Kind != "se" {
		t.Fatalf("findings %+v", findings)
	}
	if !strings.Contains(text, "1.80 over") || !strings.Contains(text, "1.05 |") {
		t.Fatalf("report:\n%s", text)
	}
	if !strings.Contains(text, "untar on se") {
		t.Fatalf("findings section missing:\n%s", text)
	}
}

func TestRenderWithoutBaselineHasNoFindings(t *testing.T) {
	text, findings := render(runs("se", "seq-write", 10, 11, 12), "t", []string{"seq-write"})
	if len(findings) != 0 || strings.Contains(text, " over |") || strings.Contains(text, "Findings") {
		t.Fatalf("report:\n%s", text)
	}
}

func TestReadResultsRoundTrip(t *testing.T) {
	input := `{"workload":"untar","kind":"nfs","run":1,"seconds":2.5,"closeSeconds":2,"drainSeconds":0.5,"bytes":10,"ops":3,"threads":1}` + "\n\n"
	results, err := readResults(strings.NewReader(input))
	if err != nil || len(results) != 1 || results[0].Seconds != 2.5 {
		t.Fatalf("results %+v err %v", results, err)
	}
	if _, err := readResults(strings.NewReader("not json\n")); err == nil {
		t.Fatal("a malformed line must fail")
	}
}
