package main

import (
	"archive/tar"
	"compress/gzip"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func smallSizes() Sizes {
	return Sizes{SeqMiB: 2, RandMiB: 2, RandOps: 64, Files: 40, OfficeMiB: 1, Saves: 3}
}

func makeTarball(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "tree.tar.gz")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	zipped := gzip.NewWriter(file)
	archive := tar.NewWriter(zipped)
	entries := []tar.Header{
		{Name: "git-1/", Typeflag: tar.TypeDir, Mode: 0o755},
		{Name: "git-1/a.c", Typeflag: tar.TypeReg, Mode: 0o644, Size: 5},
		{Name: "git-1/link", Typeflag: tar.TypeSymlink, Linkname: "a.c", Mode: 0o777},
	}
	for index := range entries {
		if err := archive.WriteHeader(&entries[index]); err != nil {
			t.Fatal(err)
		}
		if entries[index].Size > 0 {
			if _, err := archive.Write([]byte("hello")); err != nil {
				t.Fatal(err)
			}
		}
	}
	if archive.Close() != nil || zipped.Close() != nil || file.Close() != nil {
		t.Fatal("closing the tarball failed")
	}
	return path
}

func makeMirror(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	source := t.TempDir()
	steps := [][]string{
		{"init", "--quiet", "-b", "main", source},
		{"-C", source, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "--allow-empty", "-m", "one"},
	}
	for _, step := range steps {
		if output, err := exec.Command("git", step...).CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v %s", step, err, output)
		}
	}
	return source
}

func TestEveryWorkloadRunsOnAPreparedFolder(t *testing.T) {
	dir := t.TempDir()
	sizes := smallSizes()
	if err := prepare(dir, sizes, nil, Drain{}); err != nil {
		t.Fatal(err)
	}
	sources := Sources{Tarball: makeTarball(t), Mirror: makeMirror(t)}
	for _, target := range workloadList() {
		result, err := measure(target.name, dir, sizes, sources, Drain{})
		if err != nil {
			t.Fatalf("%s: %v", target.name, err)
		}
		if result.Seconds <= 0 || result.Ops <= 0 || result.Threads <= 0 {
			t.Fatalf("%s: %+v", target.name, result)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, treeFolder)); !os.IsNotExist(err) {
		t.Fatalf("rm-tree left the tree behind: %v", err)
	}
}

func TestSequentialAndRandomWorkloadsMoveTheStatedBytes(t *testing.T) {
	dir := t.TempDir()
	sizes := smallSizes()
	if err := prepare(dir, sizes, nil, Drain{}); err != nil {
		t.Fatal(err)
	}
	write, err := measure("seq-write", dir, sizes, Sources{}, Drain{})
	if err != nil || write.Bytes != int64(sizes.SeqMiB)*mib {
		t.Fatalf("seq-write %+v %v", write, err)
	}
	read, err := measure("seq-read-cold", dir, sizes, Sources{}, Drain{})
	if err != nil || read.Bytes != int64(sizes.SeqMiB)*mib {
		t.Fatalf("seq-read %+v %v", read, err)
	}
	random, err := measure("rand-write-16", dir, sizes, Sources{}, Drain{})
	if err != nil || random.Ops != int64(sizes.RandOps/16*16) || random.Threads != 16 {
		t.Fatalf("rand-write-16 %+v %v", random, err)
	}
}

func TestCreateWorkloadWritesEveryFileOnce(t *testing.T) {
	dir := t.TempDir()
	sizes := smallSizes()
	if _, err := measure("create-16", dir, sizes, Sources{}, Drain{}); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(filepath.Join(dir, "create-16"))
	if err != nil || len(entries) != sizes.Files {
		t.Fatalf("entries %d err %v", len(entries), err)
	}
	info, err := entries[0].Info()
	if err != nil || info.Size() != smallBytes {
		t.Fatalf("size %v err %v", info, err)
	}
}

func TestOfficeSaveLeavesOneFileAndNoLock(t *testing.T) {
	dir := t.TempDir()
	sizes := smallSizes()
	if err := prepare(dir, sizes, nil, Drain{}); err != nil {
		t.Fatal(err)
	}
	if _, err := measure("office-save", dir, sizes, Sources{}, Drain{}); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{".~lock." + officeFile + "#", officeFile + ".tmp"} {
		if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
			t.Fatalf("%s left behind: %v", name, err)
		}
	}
	info, err := os.Stat(filepath.Join(dir, officeFile))
	if err != nil || info.Size() != int64(sizes.OfficeMiB)*mib {
		t.Fatalf("office file %v %v", info, err)
	}
}

func TestUnknownWorkloadAndMissingSources(t *testing.T) {
	dir := t.TempDir()
	if _, err := measure("nope", dir, smallSizes(), Sources{}, Drain{}); err == nil {
		t.Fatal("an unknown workload must fail")
	}
	if _, err := measure("untar", dir, smallSizes(), Sources{}, Drain{}); err == nil {
		t.Fatal("untar without a tarball must fail")
	}
	if _, err := measure("clone", dir, smallSizes(), Sources{}, Drain{}); err == nil {
		t.Fatal("clone without a mirror must fail")
	}
}

func TestPrepareCreatesNestedFolderAndCleanupRemovesIt(t *testing.T) {
	root := filepath.Join(t.TempDir(), "SE-bench", "run-1")
	if err := prepare(root, smallSizes(), nil, Drain{}); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(filepath.Join(root, listFolder))
	if err != nil || len(entries) != smallSizes().Files {
		t.Fatalf("list folder %d entries, err %v", len(entries), err)
	}
	if err := cleanup(filepath.Dir(root), Drain{}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Dir(root)); !os.IsNotExist(err) {
		t.Fatalf("cleanup left the folder: %v", err)
	}
}

func TestPrepareOnlyBuildsTheRequestedDatasets(t *testing.T) {
	dir := t.TempDir()
	if err := prepare(dir, smallSizes(), []string{"rand", "list"}, Drain{}); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{randFile, listFolder} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Fatalf("%s missing: %v", name, err)
		}
	}
	for _, name := range []string{seqFile, officeFile} {
		if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
			t.Fatalf("%s must not exist: %v", name, err)
		}
	}
}

func TestCreateWorkloadHonoursTheCreateFileCount(t *testing.T) {
	dir := t.TempDir()
	sizes := smallSizes()
	sizes.CreateFiles = 7
	result, err := measure("create-32", dir, sizes, Sources{}, Drain{})
	if err != nil || result.Ops != 7 || result.Threads != 32 {
		t.Fatalf("result %+v err %v", result, err)
	}
	entries, err := os.ReadDir(filepath.Join(dir, "create-32"))
	if err != nil || len(entries) != 7 {
		t.Fatalf("entries %d err %v", len(entries), err)
	}
}
