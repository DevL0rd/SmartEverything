package main

import (
	"errors"
	"io"
	"os"
	"slices"
	"syscall"
	"testing"

	"github.com/smarteverything/drive-mount/integration/fakehub"
)

func readTwice(t *testing.T, name string) {
	t.Helper()
	for range 2 {
		f, err := os.Open(name)
		if err != nil {
			t.Fatal(err)
		}
		buf := make([]byte, 8)
		if _, err := f.Read(buf); err != nil {
			t.Fatal(err)
		}
		if _, err := f.Read(buf); err != nil && !errors.Is(err, io.EOF) {
			t.Fatal(err)
		}
		f.Close()
	}
}

func TestMountNotesEachReadableOpenByItsAtimeOption(t *testing.T) {
	cases := []struct {
		names []string
		want  []bool
	}{
		{nil, []bool{false, false}},
		{[]string{"strictatime"}, []bool{true, true}},
		{[]string{"noatime"}, nil},
	}
	for _, c := range cases {
		options, err := parseMountOptions(c.names)
		if err != nil {
			t.Fatal(err)
		}
		model := fakehub.NewModel()
		m := mountModelWith(t, model, "mem", options)
		name := m.path("note.txt")
		writeText(t, name, "aaa")
		m.settle(t)
		readTwice(t, name)
		if got := m.fs.accessed(); !slices.Equal(got, c.want) {
			t.Fatalf("%v: accesses %v, want %v", c.names, got, c.want)
		}
	}
}

func TestReadOnlyMountRefusesWritesAndNotesNoAccess(t *testing.T) {
	model := fakehub.NewModel()
	m := mountModelWith(t, model, "mem", mountOptions{readOnly: true})
	if err := os.WriteFile(m.path("new.txt"), []byte("x"), 0o644); !errors.Is(err, syscall.EROFS) {
		t.Fatalf("write on a read-only mount: %v, want EROFS", err)
	}
	if err := os.Mkdir(m.path("dir"), 0o755); !errors.Is(err, syscall.EROFS) {
		t.Fatalf("mkdir on a read-only mount: %v, want EROFS", err)
	}
	if got := m.fs.accessed(); len(got) != 0 {
		t.Fatalf("accesses %v on a read-only mount", got)
	}
}
