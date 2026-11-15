package main

import (
	"strings"
	"testing"
	"time"
)

func TestConflictNameKeepsTheExtension(t *testing.T) {
	at := time.Date(2026, 11, 7, 3, 4, 5, 0, time.UTC)
	cases := []struct {
		name    string
		attempt int
		want    string
	}{
		{"report.docx", 0, "report.sync-conflict-20261107-030405-mount.docx"},
		{"notes", 0, "notes.sync-conflict-20261107-030405-mount"},
		{".bashrc", 0, ".bashrc.sync-conflict-20261107-030405-mount"},
		{"a.tar.gz", 1, "a.tar.sync-conflict-20261107-030405-mount-2.gz"},
	}
	for _, c := range cases {
		if got := conflictName(c.name, at, c.attempt); got != c.want {
			t.Errorf("%s: %q want %q", c.name, got, c.want)
		}
	}
}

func TestEditOnAStaleBaseIsKeptBesideTheNewerHubVersion(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "a.txt", "abcdef")
	r.w.nameOf = func(i uint64) (uint64, string, bool) { return 1, "a.txt", i == ino }
	var created []string
	r.w.SetCreated(func(parent uint64, name string) { created = append(created, name) })
	h := r.openExisting(ino, false)
	buf := make([]byte, 6)
	if _, err := h.ReadAt(buf, 0); err != nil || string(buf) != "abcdef" {
		t.Fatalf("%q %v", buf, err)
	}
	wbPut(t, h, 1, "XY")
	r.hub.change(ino, "other computer")
	h.Close()
	r.drain()
	if got := r.hub.content(ino); got != "other computer" {
		t.Fatalf("the newer hub version was overwritten: %q", got)
	}
	if len(created) != 1 || !strings.HasPrefix(created[0], "a.sync-conflict-") || !strings.HasSuffix(created[0], ".txt") {
		t.Fatalf("created %v", created)
	}
	copyIno, ok := r.hub.lookupName(1, created[0])
	if !ok {
		t.Fatal("no conflict copy on the hub")
	}
	if got := r.hub.content(copyIno); got != "aXYdef" {
		t.Fatalf("copy %q", got)
	}
	wbEventually(t, "journal clean", func() bool { return len(wbJournalFiles(t, r.dir)) == 0 })
}

func TestStaleBaseWithoutAKnownNameStaysInTheJournal(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "a.txt", "abcdef")
	h := r.openExisting(ino, false)
	wbPut(t, h, 1, "XY")
	r.hub.change(ino, "other")
	h.Close()
	wbEventually(t, "stuck", func() bool { return r.w.Pending("") == 1 && r.hub.count("END") >= 1 })
	if len(wbJournalFiles(t, r.dir)) == 0 {
		t.Fatal("the edit was dropped")
	}
	if r.hub.content(ino) != "other" {
		t.Fatal("the hub version was overwritten")
	}
}

func TestSmallStaleEditBecomesAConflictCopyThroughPut(t *testing.T) {
	r := newWbRig(t)
	r.online()
	ino := r.hub.addFile(1, "n.txt", "")
	r.w.nameOf = func(i uint64) (uint64, string, bool) { return 1, "n.txt", i == ino }
	h := r.openExisting(ino, true)
	wbPut(t, h, 0, "mine")
	r.hub.change(ino, "theirs")
	h.Close()
	r.drain()
	if got := r.hub.content(ino); got != "theirs" {
		t.Fatalf("hub %q", got)
	}
	found := false
	r.hub.mu.Lock()
	for name, i := range r.hub.nodes[1].names {
		if strings.HasPrefix(name, "n.sync-conflict-") && string(r.hub.nodes[i].data) == "mine" {
			found = true
		}
	}
	r.hub.mu.Unlock()
	if !found {
		t.Fatal("no conflict copy with the edit")
	}
}
