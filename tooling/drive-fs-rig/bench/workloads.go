package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

type workload struct {
	name string
	run  func(dir string, sizes Sizes, sources Sources) (Outcome, error)
}

func workloadList() []workload {
	return []workload{
		{"seq-write", seqWrite},
		{"seq-read-cold", seqRead},
		{"seq-read-warm", seqRead},
		{"rand-read-1", randomRun(1, false)},
		{"rand-read-16", randomRun(16, false)},
		{"rand-write-1", randomRun(1, true)},
		{"rand-write-16", randomRun(16, true)},
		{"create-1", createRun(1)},
		{"create-16", createRun(16)},
		{"create-32", createRun(32)},
		{"list-cold", listRun},
		{"list-warm", listRun},
		{"untar", untar},
		{"clone", gitClone},
		{"office-save", officeSave},
		{"rm-tree", removeTree},
	}
}

func findWorkload(name string) (workload, bool) {
	for _, candidate := range workloadList() {
		if candidate.name == name {
			return candidate, true
		}
	}
	return workload{}, false
}

func workloadNames() []string {
	names := make([]string, 0, len(workloadList()))
	for _, candidate := range workloadList() {
		names = append(names, candidate.name)
	}
	return names
}

func measure(name, dir string, sizes Sizes, sources Sources, d Drain) (Result, error) {
	target, ok := findWorkload(name)
	if !ok {
		return Result{}, fmt.Errorf("unknown workload %q", name)
	}
	started := time.Now()
	outcome, err := target.run(dir, sizes, sources)
	if err != nil {
		return Result{}, err
	}
	if err := syncTree(dir); err != nil {
		return Result{}, err
	}
	closed := time.Now()
	var stalled int64
	finished := time.Time{}
	if err := drain(d, name); err != nil {
		var held *stalledError
		if !errors.As(err, &held) {
			return Result{}, err
		}
		stalled = held.pending
		finished = held.since
	} else {
		finished = time.Now()
	}
	return Result{
		Workload:       name,
		Seconds:        finished.Sub(started).Seconds(),
		CloseSeconds:   closed.Sub(started).Seconds(),
		DrainSeconds:   finished.Sub(closed).Seconds(),
		StalledPending: stalled,
		Errors:         outcome.Errors,
		Bytes:          outcome.Bytes,
		Ops:            outcome.Ops,
		Threads:        outcome.Threads,
	}, nil
}

func seqWrite(dir string, sizes Sizes, _ Sources) (Outcome, error) {
	data := newPool(1)
	file, err := os.OpenFile(filepath.Join(dir, "seq-write.bin"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return Outcome{}, err
	}
	var written int64
	for index := 0; index < sizes.SeqMiB; index++ {
		count, err := file.Write(data.slice(index, mib))
		written += int64(count)
		if err != nil {
			file.Close()
			return Outcome{}, err
		}
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return Outcome{}, err
	}
	return Outcome{Bytes: written, Ops: int64(sizes.SeqMiB), Threads: 1}, file.Close()
}

func seqRead(dir string, _ Sizes, _ Sources) (Outcome, error) {
	file, err := os.Open(filepath.Join(dir, seqFile))
	if err != nil {
		return Outcome{}, err
	}
	defer file.Close()
	buffer := make([]byte, mib)
	var total, ops int64
	for {
		count, err := file.Read(buffer)
		total += int64(count)
		if count > 0 {
			ops++
		}
		if err == io.EOF {
			return Outcome{Bytes: total, Ops: ops, Threads: 1}, nil
		}
		if err != nil {
			return Outcome{}, err
		}
	}
}

func parallel(threads int, body func(index int) error) error {
	var group sync.WaitGroup
	failures := make(chan error, threads)
	for index := 0; index < threads; index++ {
		group.Add(1)
		go func() {
			defer group.Done()
			if err := body(index); err != nil {
				failures <- err
			}
		}()
	}
	group.Wait()
	close(failures)
	return <-failures
}

func randomRun(threads int, write bool) func(string, Sizes, Sources) (Outcome, error) {
	return func(dir string, sizes Sizes, _ Sources) (Outcome, error) {
		blocks := int64(sizes.RandMiB) * mib / randBlock
		flag := os.O_RDONLY
		if write {
			flag = os.O_RDWR
		}
		share := sizes.RandOps / threads
		data := newPool(2)
		err := parallel(threads, func(index int) error {
			file, err := os.OpenFile(filepath.Join(dir, randFile), flag, 0)
			if err != nil {
				return err
			}
			defer file.Close()
			source := generator(fmt.Sprintf("rand-%d-%t", index, write))
			buffer := make([]byte, randBlock)
			for operation := 0; operation < share; operation++ {
				offset := source.Int64N(blocks) * randBlock
				if write {
					_, err = file.WriteAt(data.slice(operation+index, randBlock), offset)
				} else {
					_, err = file.ReadAt(buffer, offset)
				}
				if err != nil {
					return err
				}
			}
			if write {
				return file.Sync()
			}
			return nil
		})
		if err != nil {
			return Outcome{}, err
		}
		done := int64(share * threads)
		return Outcome{Bytes: done * randBlock, Ops: done, Threads: threads}, nil
	}
}

func createRun(threads int) func(string, Sizes, Sources) (Outcome, error) {
	return func(dir string, sizes Sizes, _ Sources) (Outcome, error) {
		folder := filepath.Join(dir, fmt.Sprintf("create-%d", threads))
		if err := os.Mkdir(folder, 0o755); err != nil {
			return Outcome{}, err
		}
		data := newPool(3).slice(0, smallBytes)
		count := sizes.Files
		if sizes.CreateFiles > 0 {
			count = sizes.CreateFiles
		}
		var errorCount atomic.Int64
		err := parallel(threads, func(index int) error {
			for number := index; number < count; number += threads {
				path := filepath.Join(folder, fmt.Sprintf("f%05d", number))
				file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
				if err != nil && sizes.TolerateEIO && errors.Is(err, syscall.EIO) {
					errorCount.Add(1)
					file, err = os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
				}
				if err != nil {
					return err
				}
				if _, err := file.Write(data); err != nil {
					file.Close()
					return err
				}
				if err := file.Close(); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			return Outcome{}, err
		}
		return Outcome{Bytes: int64(count) * smallBytes, Ops: int64(count), Threads: threads, Errors: errorCount.Load()}, nil
	}
}

func listRun(dir string, _ Sizes, _ Sources) (Outcome, error) {
	entries, err := os.ReadDir(filepath.Join(dir, listFolder))
	if err != nil {
		return Outcome{}, err
	}
	var total int64
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			return Outcome{}, err
		}
		total += info.Size()
	}
	return Outcome{Bytes: total, Ops: int64(len(entries)), Threads: 1}, nil
}

func officeSave(dir string, sizes Sizes, _ Sources) (Outcome, error) {
	target := filepath.Join(dir, officeFile)
	lock := filepath.Join(dir, ".~lock."+officeFile+"#")
	temporary := filepath.Join(dir, officeFile+".tmp")
	size := sizes.OfficeMiB
	data := newPool(4)
	var written int64
	for save := 0; save < sizes.Saves; save++ {
		if err := os.WriteFile(lock, []byte("rig,devl0rd,save,1,0"), 0o644); err != nil {
			return Outcome{}, err
		}
		file, err := os.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
		if err != nil {
			return Outcome{}, err
		}
		for index := 0; index < size; index++ {
			count, err := file.Write(data.slice(save*size+index, mib))
			written += int64(count)
			if err != nil {
				file.Close()
				return Outcome{}, err
			}
		}
		if err := file.Sync(); err != nil {
			file.Close()
			return Outcome{}, err
		}
		if err := file.Close(); err != nil {
			return Outcome{}, err
		}
		if err := os.Rename(temporary, target); err != nil {
			return Outcome{}, err
		}
		if err := os.Remove(lock); err != nil {
			return Outcome{}, err
		}
	}
	return Outcome{Bytes: written, Ops: int64(sizes.Saves), Threads: 1}, nil
}

func removeTree(dir string, _ Sizes, _ Sources) (Outcome, error) {
	counted, err := os.ReadFile(filepath.Join(dir, treeCount))
	if err != nil {
		return Outcome{}, err
	}
	var entries int64
	if _, err := fmt.Sscan(string(counted), &entries); err != nil {
		return Outcome{}, err
	}
	if err := os.RemoveAll(filepath.Join(dir, treeFolder)); err != nil {
		return Outcome{}, err
	}
	return Outcome{Ops: entries, Threads: 1}, nil
}
