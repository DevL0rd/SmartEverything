package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

var errMissing = errors.New("kernel limit: missing")

func sampleKernel() *kernelLimits {
	return &kernelLimits{MaxUserBgreq: 20793, MaxUserCongThresh: 15594, MaxPagesLimit: 256, PageSize: 4096}
}

func TestDefaultTuningFitsTheLimitsOfThisKernel(t *testing.T) {
	if err := defaultTuning().validate(sampleKernel()); err != nil {
		t.Fatal(err)
	}
	if err := defaultTuning().validate(nil); err != nil {
		t.Fatal(err)
	}
}

func TestValidateNamesTheRealBound(t *testing.T) {
	cases := map[string]struct {
		edit func(*tuning)
		want string
	}{
		"background above the kernel": {func(x *tuning) { x.maxBackground = 30000 }, "from 1 to 20793"},
		"background zero":             {func(x *tuning) { x.maxBackground = 0 }, "from 1 to 20793"},
		"congestion above background": {func(x *tuning) { x.congestionFollows = false; x.congestionThreshold = 65 }, "from 1 to 64"},
		"request above the pages":     {func(x *tuning) { x.maxRequestBytes = 2 << 20 }, "from 4096 to 1048576"},
		"request below a page":        {func(x *tuning) { x.maxRequestBytes = 100 }, "from 4096 to 1048576"},
		"readahead below a page":      {func(x *tuning) { x.kernelReadaheadBytes = 1 }, "below the page size"},
		"negative readahead":          {func(x *tuning) { x.live.readAheadBytes = -1 }, "readAheadBytes"},
		"negative seconds":            {func(x *tuning) { x.live.attr = lifetime{seconds: -1} }, "attrSeconds"},
		"no upload files":             {func(x *tuning) { x.live.uploadFiles = 0 }, "uploadFiles"},
		"no frames":                   {func(x *tuning) { x.live.uploadFramesInFlight = 0 }, "uploadFramesInFlight"},
		"ping under a second":         {func(x *tuning) { x.live.ping = 0 }, "pingSeconds"},
		"dead not after ping":         {func(x *tuning) { x.live.deadAfter = x.live.ping }, "greater than pingSeconds"},
		"bulk above a frame":          {func(x *tuning) { x.live.bulkFrameBytes = 2 << 20 }, "bulkFrameBytes"},
		"unknown readdirplus":         {func(x *tuning) { x.readdirPlus = "maybe" }, "readdirPlus"},
	}
	for name, c := range cases {
		x := defaultTuning()
		c.edit(&x)
		err := x.validate(sampleKernel())
		if err == nil || !strings.Contains(err.Error(), c.want) {
			t.Fatalf("%s: %v, want %q", name, err, c.want)
		}
	}
}

func TestReadaheadAboveTheKernelOfferIsRefusedOnceTheOfferIsKnown(t *testing.T) {
	k := sampleKernel()
	x := defaultTuning()
	x.kernelReadaheadBytes = 1 << 20
	if err := x.validate(k); err != nil {
		t.Fatal(err)
	}
	k.ReadaheadOffer = 128 << 10
	if err := x.validate(k); err == nil || !strings.Contains(err.Error(), "131072 the kernel offers") {
		t.Fatalf("%v", err)
	}
}

func TestWindowsKernelFieldsAreNotChecked(t *testing.T) {
	x := defaultTuning()
	x.maxBackground = 1 << 30
	if err := x.validate(nil); err != nil {
		t.Fatal(err)
	}
}

func fullLine() string {
	return `{"op":"tuning","tuning":{"maxBackground":128,"congestionThreshold":"follow","maxRequestBytes":1048576,"kernelReadaheadBytes":131072,"readAheadBytes":16777216,"asyncRead":true,"writebackCache":false,"readdirPlus":"always","parallelDirops":true,"entrySeconds":"untilChanged","attrSeconds":60,"negativeSeconds":0,"closeWaitsForUpload":true,"uploadDelaySeconds":5,"fsyncWaitsForHub":false,"uploadFiles":8,"uploadFramesInFlight":32,"pingSeconds":10,"deadAfterSeconds":30,"bulkFrameBytes":262144,"prefetchSmallFiles":true}}`
}

func TestTuningLineDecodesEveryField(t *testing.T) {
	_, line, err := parseControl([]byte(fullLine()))
	if err != nil {
		t.Fatal(err)
	}
	got, err := line.Tuning.resolve()
	if err != nil {
		t.Fatal(err)
	}
	want := defaultTuning()
	want.maxBackground = 128
	want.writebackCache = false
	want.readdirPlus = readdirPlusAlways
	want.live.attr = lifetime{seconds: 60}
	want.live.negative = lifetime{}
	want.live.closeWaitsForUpload = true
	want.live.uploadDelay = 5 * time.Second
	want.live.fsyncWaitsForHub = false
	want.live.uploadFiles = 8
	want.live.uploadFramesInFlight = 32
	want.live.bulkFrameBytes = 262144
	want.live.prefetchSmallFiles = true
	if got != want {
		t.Fatalf("got %+v\nwant %+v", got, want)
	}
}

func TestTuningLineIsStrict(t *testing.T) {
	cases := map[string]string{
		"unknown field":     strings.Replace(fullLine(), `"asyncRead":true,`, `"asyncRead":true,"extra":1,`, 1),
		"missing field":     strings.Replace(fullLine(), `"asyncRead":true,`, ``, 1),
		"null field":        strings.Replace(fullLine(), `"asyncRead":true`, `"asyncRead":null`, 1),
		"fraction":          strings.Replace(fullLine(), `"maxBackground":128`, `"maxBackground":1.5`, 1),
		"string for number": strings.Replace(fullLine(), `"maxBackground":128`, `"maxBackground":"128"`, 1),
		"bad follow word":   strings.Replace(fullLine(), `"congestionThreshold":"follow"`, `"congestionThreshold":"same"`, 1),
		"bad lifetime word": strings.Replace(fullLine(), `"attrSeconds":60`, `"attrSeconds":"forever"`, 1),
		"until on a number": strings.Replace(fullLine(), `"uploadFiles":8`, `"uploadFiles":"untilChanged"`, 1),
		"no tuning object":  `{"op":"tuning"}`,
	}
	for name, raw := range cases {
		_, line, err := parseControl([]byte(raw))
		if err == nil {
			_, err = line.Tuning.resolve()
		}
		if err == nil {
			t.Fatalf("%s accepted", name)
		}
	}
}

func TestMissingFieldIsNamed(t *testing.T) {
	_, line, err := parseControl([]byte(strings.Replace(fullLine(), `"asyncRead":true,`, ``, 1)))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := line.Tuning.resolve(); err == nil || !strings.Contains(err.Error(), "asyncRead missing") {
		t.Fatalf("%v", err)
	}
}

func TestLiveTuningNotifiesSubscribersOnEveryStore(t *testing.T) {
	l := newLiveTuning(defaultTuning().live)
	var seen []int64
	l.subscribe(func(f liveFields) { seen = append(seen, f.uploadFiles) })
	next := l.load()
	next.uploadFiles = 12
	l.store(next)
	if l.load().uploadFiles != 12 || len(seen) != 1 || seen[0] != 12 {
		t.Fatalf("%d %v", l.load().uploadFiles, seen)
	}
}

func newTestState(t *testing.T, limits *kernelLimits, failure error) (*tuningState, *bytes.Buffer) {
	t.Helper()
	out := &bytes.Buffer{}
	s := &tuningState{current: defaultTuning(), report: newReporter(out), read: func() (*kernelLimits, error) {
		if failure != nil {
			return nil, failure
		}
		copy := *limits
		return &copy, nil
	}}
	return s, out
}

func TestApplyKeepsTheOldTuningWhenTheNewOneIsRefused(t *testing.T) {
	saved := live.load()
	defer live.store(saved)
	s, _ := newTestState(t, sampleKernel(), nil)
	bad := defaultTuning()
	bad.maxBackground = 99999
	if err := s.apply(bad); err == nil {
		t.Fatal("refused tuning applied")
	}
	if live.load() != defaultTuning().live {
		t.Fatal("live fields changed by a refused tuning")
	}
	good := defaultTuning()
	good.maxBackground = 128
	good.live.uploadFiles = 9
	if err := s.apply(good); err != nil {
		t.Fatal(err)
	}
	if live.load().uploadFiles != 9 {
		t.Fatal("live fields not stored")
	}
	mounted, err := s.forMount()
	if err != nil || mounted.maxBackground != 128 {
		t.Fatalf("%+v %v", mounted, err)
	}
}

func TestMissingKernelFileFailsLoudly(t *testing.T) {
	s, _ := newTestState(t, nil, errMissing)
	if err := s.apply(defaultTuning()); err != errMissing {
		t.Fatalf("%v", err)
	}
	if _, err := s.forMount(); err != errMissing {
		t.Fatalf("%v", err)
	}
}

func TestOfferedReadaheadJoinsTheReportedLimits(t *testing.T) {
	s, out := newTestState(t, sampleKernel(), nil)
	s.offered(131072)
	var line limitsLine
	if err := json.Unmarshal(bytes.TrimSpace(out.Bytes()), &line); err != nil {
		t.Fatal(err)
	}
	want := limitsLine{Type: "limits", Platform: platformName, Kernel: true, MaxUserBgreq: 20793, MaxUserCongThresh: 15594, MaxPagesLimit: 256, PageSize: 4096, ReadaheadOffer: 131072, MaxRequestBytes: 1 << 20}
	if line != want {
		t.Fatalf("%+v", line)
	}
	x := defaultTuning()
	x.kernelReadaheadBytes = 1 << 20
	if err := s.apply(x); err == nil {
		t.Fatal("readahead above the offer applied")
	}
}
