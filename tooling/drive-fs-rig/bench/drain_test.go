package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeLog(t *testing.T, lines string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "status.log")
	if err := os.WriteFile(path, []byte(lines), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestDrainReturnsWhenNothingIsPending(t *testing.T) {
	path := writeLog(t, `{"type":"counters","mount":"m","openFiles":0,"pendingUploads":3}`+"\n"+`{"type":"counters","mount":"m","openFiles":0,"pendingUploads":0}`+"\n")
	if err := drain(Drain{StatusLog: path, Mount: "m", IdleLimit: time.Second}, ""); err != nil {
		t.Fatal(err)
	}
}

func TestDrainWaitsForTheQueue(t *testing.T) {
	path := writeLog(t, `{"type":"counters","mount":"m","openFiles":0,"pendingUploads":2}`+"\n")
	go func() {
		time.Sleep(400 * time.Millisecond)
		file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
		if err == nil {
			file.WriteString(`{"type":"counters","mount":"m","openFiles":0,"pendingUploads":0}` + "\n")
			file.Close()
		}
	}()
	started := time.Now()
	if err := drain(Drain{StatusLog: path, Mount: "m", IdleLimit: 5 * time.Second}, ""); err != nil {
		t.Fatal(err)
	}
	if time.Since(started) < 400*time.Millisecond {
		t.Fatal("drain returned before the queue emptied")
	}
}

func TestDrainGivesUpWithoutProgress(t *testing.T) {
	path := writeLog(t, `{"type":"counters","mount":"m","openFiles":0,"pendingUploads":2}`+"\n")
	if err := drain(Drain{StatusLog: path, Mount: "m", IdleLimit: 300 * time.Millisecond}, ""); err == nil {
		t.Fatal("a stuck queue must fail")
	}
}

func TestDrainIgnoresOtherMounts(t *testing.T) {
	path := writeLog(t, `{"type":"counters","mount":"other","openFiles":0,"pendingUploads":9}`+"\n"+`{"type":"counters","mount":"m","openFiles":0,"pendingUploads":0}`+"\n")
	if err := drain(Drain{StatusLog: path, Mount: "m", IdleLimit: time.Second}, ""); err != nil {
		t.Fatal(err)
	}
}

func TestDrainWithoutLogIsImmediate(t *testing.T) {
	if err := drain(Drain{}, ""); err != nil {
		t.Fatal(err)
	}
}

func TestDrainExecRunsUntilItSucceedsForChangingWorkloadsOnly(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "ready")
	go func() {
		time.Sleep(300 * time.Millisecond)
		os.WriteFile(marker, nil, 0o600)
	}()
	started := time.Now()
	d := Drain{Exec: "test -e " + marker, IdleLimit: 100 * time.Millisecond}
	if err := drain(d, "seq-read-cold"); err != nil || time.Since(started) > 200*time.Millisecond {
		t.Fatalf("a read must not wait: %v after %s", err, time.Since(started))
	}
	if err := drain(d, "create-32"); err != nil || time.Since(started) < 300*time.Millisecond {
		t.Fatalf("a write must wait for the command: %v after %s", err, time.Since(started))
	}
}

func TestDrainToleratesAStallAndReportsWhatIsLeft(t *testing.T) {
	path := writeLog(t, `{"type":"counters","mount":"m","openFiles":0,"pendingUploads":1}`+"\n")
	err := drain(Drain{StatusLog: path, Mount: "m", IdleLimit: 300 * time.Millisecond, Tolerate: true}, "")
	var held *stalledError
	if !errors.As(err, &held) || held.pending != 1 {
		t.Fatalf("expected a stall with one upload left, got %v", err)
	}
	if ignoreStall(err) != nil {
		t.Fatal("prepare must ignore a stall")
	}
}
