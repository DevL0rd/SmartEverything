package main

import (
	"os"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func processState(t *testing.T, pid int) string {
	t.Helper()
	raw, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/stat")
	if os.IsNotExist(err) {
		return ""
	}
	if err != nil {
		t.Fatal(err)
	}
	fields := strings.Fields(string(raw[strings.LastIndexByte(string(raw), ')')+1:]))
	return fields[0]
}

func TestReapExitedCollectsDefunctChildren(t *testing.T) {
	pid, err := syscall.ForkExec("/bin/true", []string{"true"}, &syscall.ProcAttr{Env: os.Environ()})
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for processState(t, pid) != "Z" {
		if time.Now().After(deadline) {
			t.Fatalf("child %d never exited", pid)
		}
		time.Sleep(10 * time.Millisecond)
	}
	if got := reapExited(); got != 1 {
		t.Fatalf("reaped %d children, want 1", got)
	}
	if state := processState(t, pid); state != "" {
		t.Fatalf("child %d is still listed in state %q", pid, state)
	}
	if got := reapExited(); got != 0 {
		t.Fatalf("reaped %d children with none left, want 0", got)
	}
}
