package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-git/go-billy/v5/osfs"
)

func TestSyncPathFlushesAnExistingFile(t *testing.T) {
	root := t.TempDir()
	fs := syncedFS{osfs.New(root)}
	file, err := fs.OpenFile("a.bin", os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write([]byte("data")); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if err := fs.SyncPath("a.bin"); err != nil {
		t.Fatal(err)
	}
}

func TestSyncPathOfMissingFileFails(t *testing.T) {
	if err := (syncedFS{osfs.New(t.TempDir())}).SyncPath("missing"); err == nil {
		t.Fatal("a missing path must fail")
	}
}

func TestChangeOperationsReachTheDisk(t *testing.T) {
	root := t.TempDir()
	fs := syncedFS{osfs.New(root)}
	if err := os.WriteFile(filepath.Join(root, "f"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := fs.Chmod("f", 0o640); err != nil {
		t.Fatal(err)
	}
	moment := time.Unix(1_700_000_000, 0)
	if err := fs.Chtimes("f", moment, moment); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(root, "f"))
	if err != nil || info.Mode().Perm() != 0o640 || !info.ModTime().Equal(moment) {
		t.Fatalf("info %v err %v", info, err)
	}
}

func TestRemoveActsOnASymlinkAndNotItsTarget(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "target", "inner"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "holder"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("../target", filepath.Join(root, "holder", "link")); err != nil {
		t.Fatal(err)
	}
	fs := syncedFS{osfs.New(root)}
	if err := fs.Remove("holder/link"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "target", "inner")); err != nil {
		t.Fatalf("the target was removed: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(root, "holder", "link")); !os.IsNotExist(err) {
		t.Fatalf("the link remains: %v", err)
	}
}
