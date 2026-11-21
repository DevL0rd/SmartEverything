package main

import (
	"bytes"
	"strings"
	"testing"

	"github.com/smarteverything/drive-mount/wire"
)

func TestUploadsCountWhatIsOnItsWayAndWhatReachedTheHub(t *testing.T) {
	r := newWbRig(t)
	r.online()
	hold := make(chan struct{})
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpPut {
			<-hold
		}
		return nil
	}
	for _, text := range []string{"abc", "hello"} {
		_, h := r.create(text + ".txt")
		wbPut(t, h, 0, text)
		if err := h.Flush(); err != nil {
			t.Fatal(err)
		}
		h.Close()
	}
	if got := r.w.Uploads(); got != (uploads{Files: 2, Bytes: 8}) {
		t.Fatalf("before the Hub answered: %+v", got)
	}
	close(hold)
	r.drain()
	if got := r.w.Uploads(); got != (uploads{SentFiles: 2, SentBytes: 8}) {
		t.Fatalf("after the Hub answered: %+v", got)
	}
}

func TestUploadsCountTheFramesOfALargeFileAsTheyGo(t *testing.T) {
	setLive(t, func(f *liveFields) { f.bulkFrameBytes = 4 })
	r := newWbRig(t)
	r.online()
	hold := make(chan struct{})
	r.hub.before = func(op wire.Op, _ wire.Meta) error {
		if op == wire.OpEnd {
			<-hold
		}
		return nil
	}
	progressed := make(chan struct{}, 64)
	r.w.OnProgress(func() { progressed <- struct{}{} })
	_, h := r.create("large.bin")
	wbPut(t, h, 0, "0123456789ab")
	if err := h.Flush(); err != nil {
		t.Fatal(err)
	}
	h.Close()
	wbEventually(t, "every frame sent", func() bool { return r.w.Uploads().SentBytes == 12 })
	if got := r.w.Uploads(); got.Files != 1 || got.Bytes != 0 || got.SentFiles != 0 {
		t.Fatalf("while the end waits: %+v", got)
	}
	if len(progressed) == 0 {
		t.Fatal("no progress was announced while the frames went out")
	}
	close(hold)
	r.drain()
	if got := r.w.Uploads(); got != (uploads{SentFiles: 1, SentBytes: 12}) {
		t.Fatalf("after the end: %+v", got)
	}
}

func TestUploadsLineIsWrittenOnlyWhenItChanges(t *testing.T) {
	out := &bytes.Buffer{}
	r := newReporter(out)
	r.uploads(uploads{Files: 2, Bytes: 8})
	r.uploads(uploads{Files: 2, Bytes: 8})
	r.uploads(uploads{SentFiles: 2, SentBytes: 8})
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	want := []string{
		`{"type":"uploads","files":2,"bytes":8,"sentFiles":0,"sentBytes":0}`,
		`{"type":"uploads","files":0,"bytes":0,"sentFiles":2,"sentBytes":8}`,
	}
	if strings.Join(lines, "\n") != strings.Join(want, "\n") {
		t.Fatalf("lines %v, want %v", lines, want)
	}
}
