//go:build linux

package integration

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/integration/fakehub"
)

func (h *helper) pendingUploads() (int64, int64) {
	h.t.Helper()
	f, err := os.Open(h.status)
	if err != nil {
		h.t.Fatal(err)
	}
	defer f.Close()
	var line struct {
		Type    string `json:"type"`
		Open    int64  `json:"openFiles"`
		Pending int64  `json:"pendingUploads"`
	}
	var open, pending int64
	scan := bufio.NewScanner(f)
	scan.Buffer(make([]byte, 0, 1<<16), 1<<24)
	for scan.Scan() {
		if json.Unmarshal(scan.Bytes(), &line) == nil && line.Type == "counters" {
			open, pending = line.Open, line.Pending
		}
	}
	return open, pending
}

func TestManySmallFilesWrittenAtOnceLeaveNoUploadPending(t *testing.T) {
	hub := fakehub.New(t)
	h := startHelper(t, hub)
	folder := filepath.Join(h.point, "many")
	if err := os.Mkdir(folder, 0o755); err != nil {
		t.Fatal(err)
	}
	body := make([]byte, 4096)
	var group sync.WaitGroup
	failures := make(chan error, 16)
	for worker := 0; worker < 16; worker++ {
		group.Add(1)
		go func() {
			defer group.Done()
			for number := worker; number < 600; number += 16 {
				if err := os.WriteFile(filepath.Join(folder, fmt.Sprintf("f%05d", number)), body, 0o644); err != nil {
					failures <- err
					return
				}
			}
		}()
	}
	group.Wait()
	close(failures)
	if err := <-failures; err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(20 * time.Second)
	for {
		open, pending := h.pendingUploads()
		if open == 0 && pending == 0 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("%d files open and %d uploads pending", open, pending)
		}
		time.Sleep(100 * time.Millisecond)
	}
}
