//go:build linux

package integration

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"

	"github.com/smarteverything/drive-mount/integration/fakehub"
)

func TestLinksModesAndAttributesTravelThroughTheHelperProcess(t *testing.T) {
	hub := fakehub.New(t)
	h := startHelper(t, hub)
	file := filepath.Join(h.point, "file.sh")
	if err := os.WriteFile(file, []byte("#!/bin/sh\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(file, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("file.sh", filepath.Join(h.point, "alias")); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(file, filepath.Join(h.point, "second")); err != nil {
		t.Fatal(err)
	}
	if err := syscall.Setxattr(file, "user.label", []byte("blue"), 0); err != nil {
		t.Fatal(err)
	}
	within(t, "the hub to hold the links, the mode and the attribute", func() bool {
		attr, err := hub.Getattr(hub.InodeOf("/file.sh"))
		value, _ := hub.Getxattr(hub.InodeOf("/file.sh"), "user.label")
		target, _ := hub.Readlink(hub.InodeOf("/alias"))
		return err == nil && attr.Mode == 0o755 && attr.Nlink == 2 && string(value) == "blue" && target == "file.sh" &&
			hub.InodeOf("/second") == hub.InodeOf("/file.sh")
	})
}

func TestRenameOverAndFlockThroughTheHelperProcess(t *testing.T) {
	hub := fakehub.New(t)
	hub.Put("/doc.txt", "version one")
	h := startHelper(t, hub)
	for _, next := range []string{"version two", "version three"} {
		temp := filepath.Join(h.point, ".doc.swp")
		f, err := os.Create(temp)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.WriteString(next); err != nil {
			t.Fatal(err)
		}
		if err := f.Sync(); err != nil {
			t.Fatal(err)
		}
		f.Close()
		if err := os.Rename(temp, filepath.Join(h.point, "doc.txt")); err != nil {
			t.Fatal(err)
		}
	}
	within(t, "the last save on the hub and nothing else", func() bool {
		got, _ := hub.Content("/doc.txt")
		return got == "version three" && len(hub.Names("/")) == 1
	})
	a, err := os.Open(filepath.Join(h.point, "doc.txt"))
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	b, err := os.Open(filepath.Join(h.point, "doc.txt"))
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	if err := syscall.Flock(int(a.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatal(err)
	}
	if err := syscall.Flock(int(b.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != syscall.EWOULDBLOCK {
		t.Fatalf("a second exclusive lock: %v", err)
	}
}
