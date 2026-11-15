//go:build linux

package integration

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/integration/fakehub"
)

func TestSignalsDuringCloseNeverReachTheProgram(t *testing.T) {
	hub := fakehub.New(t)
	h := startHelper(t, hub)
	var stop atomic.Bool
	var threads sync.Map
	signaller := make(chan struct{})
	go func() {
		defer close(signaller)
		for !stop.Load() {
			threads.Range(func(thread, _ any) bool {
				_ = syscall.Tgkill(syscall.Getpid(), thread.(int), syscall.SIGURG)
				return true
			})
			time.Sleep(20 * time.Microsecond)
		}
	}()
	t.Cleanup(func() {
		stop.Store(true)
		<-signaller
	})
	data := bytes.Repeat([]byte("x"), 8<<20)
	var failures atomic.Int32
	fail := func(step, name string, err error) {
		failures.Add(1)
		t.Errorf("%s %s: %v", step, name, err)
	}
	var wg sync.WaitGroup
	for worker := 0; worker < 8; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			runtime.LockOSThread()
			thread := syscall.Gettid()
			threads.Store(thread, true)
			defer threads.Delete(thread)
			for i := 0; i < 40; i++ {
				name := filepath.Join(h.point, fmt.Sprintf("w%d-%d", thread, i))
				f, err := os.Create(name)
				if err != nil {
					fail("create", name, err)
					continue
				}
				if _, err := f.Write(data); err != nil {
					fail("write", name, err)
				}
				if err := f.Close(); err != nil {
					fail("close", name, err)
				}
			}
		}()
	}
	wg.Wait()
	if failures.Load() > 0 {
		t.Fatalf("%d calls failed while signals arrived", failures.Load())
	}
}
