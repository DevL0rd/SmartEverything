//go:build linux

package main

import (
	"os"
	"testing"
)

func TestKernelKeepsNamesAndAttributesUntilChanged(t *testing.T) {
	m, _ := mountFresh(t)
	writeText(t, m.path("f.txt"), "x")
	m.settle(t)
	missing := func() { _, _ = os.Stat(m.path("absent")) }
	missing()
	before := m.fs.lookups.Load()
	missing()
	missing()
	if got := m.fs.lookups.Load(); got != before {
		t.Fatalf("a missing name was looked up %d more times while negative entries last until changed", got-before)
	}
}

func tuneLive(t *testing.T, m *mounted, change func(*liveFields)) {
	t.Helper()
	next := defaultTuning()
	change(&next.live)
	if err := m.set.tune(next); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = m.set.tune(defaultTuning()) })
}

func TestLiveTimeoutsApplyToTheNextReply(t *testing.T) {
	m, _ := mountFresh(t)
	writeText(t, m.path("f.txt"), "x")
	m.settle(t)
	tuneLive(t, m, func(f *liveFields) { f.negative = lifetime{} })
	missing := func() { _, _ = os.Stat(m.path("absent")) }
	missing()
	before := m.fs.lookups.Load()
	missing()
	missing()
	if got := m.fs.lookups.Load() - before; got < 2 {
		t.Fatalf("with a zero negative timeout every stat must reach the source, got %d lookups", got)
	}
	tuneLive(t, m, func(f *liveFields) { f.negative = lifetime{untilChanged: true} })
	missing()
	before = m.fs.lookups.Load()
	missing()
	if got := m.fs.lookups.Load() - before; got != 0 {
		t.Fatalf("after the live change to until changed, %d lookups still reached the source", got)
	}
}
