package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/hanwen/go-fuse/v2/fuse"
	"github.com/smarteverything/drive-mount/integration/fakehub"
)

func writeLimit(t *testing.T, dir, name, value string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(value), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestKernelLimitsAreReadFromTheThreeFiles(t *testing.T) {
	dir := t.TempDir()
	got, err := readKernelLimitsFrom(writeLimit(t, dir, "bg", "20793\n"), writeLimit(t, dir, "cong", "15594\n"), writeLimit(t, dir, "pages", "256\n"))
	if err != nil {
		t.Fatal(err)
	}
	want := kernelLimits{MaxUserBgreq: 20793, MaxUserCongThresh: 15594, MaxPagesLimit: 256, PageSize: int64(os.Getpagesize())}
	if *got != want {
		t.Fatalf("%+v", got)
	}
}

func TestMissingOrBrokenKernelFileNamesTheFile(t *testing.T) {
	dir := t.TempDir()
	bg := writeLimit(t, dir, "bg", "1")
	cong := writeLimit(t, dir, "cong", "1")
	missing := filepath.Join(dir, "absent")
	if _, err := readKernelLimitsFrom(bg, cong, missing); err == nil || !strings.Contains(err.Error(), missing) {
		t.Fatalf("%v", err)
	}
	broken := writeLimit(t, dir, "broken", "many")
	if _, err := readKernelLimitsFrom(broken, cong, bg); err == nil || !strings.Contains(err.Error(), broken) {
		t.Fatalf("%v", err)
	}
}

func TestThisKernelExposesTheLimits(t *testing.T) {
	if _, err := readKernelLimits(); err != nil {
		t.Fatal(err)
	}
}

func TestServerOptionsFollowTheTuning(t *testing.T) {
	x := defaultTuning()
	opts := serverOptions("/mnt/d", 7, mountOptions{}, x)
	m := opts.MountOptions
	if m.MaxBackground != 64 || m.CongestionThreshold != 0 || m.MaxWrite != 1<<20 || m.MaxReadAhead != 128<<10 || m.SyncRead {
		t.Fatalf("%+v", m)
	}
	if m.ExtraCapabilities != fuse.CAP_ATOMIC_O_TRUNC|fuse.CAP_WRITEBACK_CACHE|fuse.CAP_READDIRPLUS_AUTO || m.DisabledCapabilities != 0 {
		t.Fatalf("extra %x disabled %x", m.ExtraCapabilities, m.DisabledCapabilities)
	}
	if opts.EntryTimeout != nil || opts.AttrTimeout != nil || *opts.NegativeTimeout != untilInvalidated {
		t.Fatal("entry and attribute timeouts are set per reply and the negative one starts as until changed")
	}

	x.maxBackground = 512
	x.congestionFollows = false
	x.congestionThreshold = 100
	x.asyncRead = false
	x.writebackCache = false
	x.readdirPlus = readdirPlusOff
	x.parallelDirops = false
	x.live.attr = lifetime{seconds: 60}
	opts = serverOptions("/mnt/d", 7, mountOptions{readOnly: true}, x)
	m = opts.MountOptions
	if m.MaxBackground != 512 || m.CongestionThreshold != 100 || !m.SyncRead {
		t.Fatalf("%+v", m)
	}
	if m.ExtraCapabilities != fuse.CAP_ATOMIC_O_TRUNC || m.DisabledCapabilities != fuse.CAP_READDIRPLUS|fuse.CAP_READDIRPLUS_AUTO|fuse.CAP_PARALLEL_DIROPS {
		t.Fatalf("extra %x disabled %x", m.ExtraCapabilities, m.DisabledCapabilities)
	}
	x.live.negative = lifetime{seconds: 60}
	if *serverOptions("/mnt/d", 7, mountOptions{}, x).NegativeTimeout != time.Minute {
		t.Fatal("negative must be 60 seconds")
	}

	x.readdirPlus = readdirPlusAlways
	m = serverOptions("/mnt/d", 7, mountOptions{}, x).MountOptions
	if m.ExtraCapabilities&fuse.CAP_READDIRPLUS_AUTO != 0 || m.DisabledCapabilities&fuse.CAP_READDIRPLUS != 0 {
		t.Fatalf("always must leave plain readdirplus: extra %x disabled %x", m.ExtraCapabilities, m.DisabledCapabilities)
	}
}

func TestAppliedKernelReportsWhatTheKernelGranted(t *testing.T) {
	x := defaultTuning()
	all := uint64(fuse.CAP_READDIRPLUS | fuse.CAP_READDIRPLUS_AUTO | fuse.CAP_ASYNC_READ | fuse.CAP_WRITEBACK_CACHE | fuse.CAP_PARALLEL_DIROPS)
	got := appliedKernel(x, all, 131072)
	want := remountApplied{MaxBackground: 64, CongestionThreshold: 48, MaxRequestBytes: 1 << 20, KernelReadaheadBytes: 131072, AsyncRead: true, WritebackCache: true, ReaddirPlus: "auto", ParallelDirops: true}
	if got != want {
		t.Fatalf("%+v", got)
	}
	x.kernelReadaheadBytes = 1 << 20
	got = appliedKernel(x, uint64(fuse.CAP_READDIRPLUS), 131072)
	if got.KernelReadaheadBytes != 131072 || got.ReaddirPlus != "always" || got.AsyncRead || got.WritebackCache || got.ParallelDirops {
		t.Fatalf("%+v", got)
	}
	got = appliedKernel(x, 0, 131072)
	if got.ReaddirPlus != "off" {
		t.Fatalf("%+v", got)
	}
}

func TestAMountAppliesTheTuningAndReportsWhatTheKernelGranted(t *testing.T) {
	saved := live.load()
	defer live.store(saved)
	requireFuse(t)
	point := t.TempDir()
	files := newMemFS(fakehub.NewModel(), "mem")
	out := &lockedBuffer{}
	set := newMountSet(files, newReporter(out))
	t.Cleanup(func() {
		set.closeAll()
		files.Close()
	})
	tuned := defaultTuning()
	tuned.maxBackground = 128
	tuned.writebackCache = false
	tuned.readdirPlus = readdirPlusAlways
	tuned.live.uploadFiles = 6
	if err := set.tune(tuned); err != nil {
		t.Fatal(err)
	}
	if err := set.mount("a", mountRoot{}, point, mountOptions{}); err != nil {
		t.Fatal(err)
	}
	applied := lastLine(t, out.String(), `"type":"applied"`)
	for _, want := range []string{`"maxBackground":128`, `"congestionThreshold":96`, `"writebackCache":false`, `"readdirPlus":"always"`, `"uploadFiles":6`, `"kernelReadaheadBytes":`} {
		if !strings.Contains(applied, want) {
			t.Fatalf("applied line %s lacks %s", applied, want)
		}
	}
	if !strings.Contains(lastLine(t, out.String(), `"type":"limits"`), `"readaheadOffer":`) {
		t.Fatal("the kernel's readahead offer is not reported after the first mount")
	}
	tuned.live.uploadFiles = 9
	if err := set.tune(tuned); err != nil {
		t.Fatal(err)
	}
	if applied = lastLine(t, out.String(), `"type":"applied"`); !strings.Contains(applied, `"uploadFiles":9`) || !strings.Contains(applied, `"maxBackground":128`) {
		t.Fatalf("applied line %s", applied)
	}
}

func lastLine(t *testing.T, output, marker string) string {
	t.Helper()
	var found string
	for _, line := range strings.Split(output, "\n") {
		if strings.Contains(line, marker) {
			found = line
		}
	}
	if found == "" {
		t.Fatalf("no %s line in %s", marker, output)
	}
	return found
}
