//go:build linux

package main

import (
	"syscall"
	"testing"

	"github.com/smarteverything/drive-mount/wire"
)

func TestOfflineAndMissingAnswerTheErrnosTheKernelExpects(t *testing.T) {
	if got := wire.ErrnoOf(errOffline); got != syscall.ENETUNREACH {
		t.Fatalf("offline errno %v", got)
	}
	if got := wire.ErrnoOf(notFound()); got != syscall.ENOENT {
		t.Fatalf("missing errno %v", got)
	}
}
