package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

func writeFile(path string, megabytes int, data *pool) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	for index := 0; index < megabytes; index++ {
		if _, err := file.Write(data.slice(index, mib)); err != nil {
			file.Close()
			return err
		}
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return err
	}
	return file.Close()
}

func wanted(datasets []string, name string) bool {
	if len(datasets) == 0 {
		return true
	}
	for _, dataset := range datasets {
		if dataset == name {
			return true
		}
	}
	return false
}

func prepare(dir string, sizes Sizes, datasets []string, d Drain) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	data := newPool(5)
	files := []struct {
		dataset string
		name    string
		mib     int
	}{
		{"seq", seqFile, sizes.SeqMiB},
		{"rand", randFile, sizes.RandMiB},
		{"office", officeFile, sizes.OfficeMiB},
	}
	for _, file := range files {
		if wanted(datasets, file.dataset) {
			if err := writeFile(filepath.Join(dir, file.name), file.mib, data); err != nil {
				return err
			}
		}
	}
	if wanted(datasets, "list") {
		if err := populate(filepath.Join(dir, listFolder), sizes.Files, data.slice(0, smallBytes)); err != nil {
			return err
		}
	}
	if err := syncTree(dir); err != nil {
		return err
	}
	return ignoreStall(drain(d, ""))
}

func populate(folder string, count int, content []byte) error {
	if err := os.Mkdir(folder, 0o755); err != nil {
		return err
	}
	const threads = 16
	return parallel(threads, func(index int) error {
		for number := index; number < count; number += threads {
			if err := os.WriteFile(filepath.Join(folder, fmt.Sprintf("f%05d", number)), content, 0o644); err != nil {
				return err
			}
		}
		return nil
	})
}

func cleanup(dir string, d Drain) error {
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	return ignoreStall(drain(d, ""))
}

func ignoreStall(err error) error {
	var held *stalledError
	if errors.As(err, &held) {
		return nil
	}
	return err
}
