package main

import (
	"archive/tar"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
	"syscall"
)

func untar(dir string, sizes Sizes, sources Sources) (Outcome, error) {
	if sources.Tarball == "" {
		return Outcome{}, errors.New("the untar workload needs -tarball")
	}
	source, err := os.Open(sources.Tarball)
	if err != nil {
		return Outcome{}, err
	}
	defer source.Close()
	unzipped, err := gzip.NewReader(source)
	if err != nil {
		return Outcome{}, err
	}
	defer unzipped.Close()
	root := filepath.Join(dir, treeFolder)
	if err := os.Mkdir(root, 0o755); err != nil {
		return Outcome{}, err
	}
	reader := tar.NewReader(unzipped)
	var entries, total, retried int64
	for {
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return Outcome{}, err
		}
		target := filepath.Join(root, filepath.FromSlash(path.Clean("/"+header.Name)))
		switch header.Typeflag {
		case tar.TypeDir:
			err = os.MkdirAll(target, header.FileInfo().Mode().Perm()|0o700)
		case tar.TypeReg:
			var again bool
			again, err = extractFile(target, reader, header, sizes.TolerateEIO)
			if again {
				retried++
			}
			total += header.Size
		case tar.TypeSymlink:
			err = os.Symlink(header.Linkname, target)
			if err != nil && sizes.TolerateEIO && (errors.Is(err, syscall.EIO) || unsupported(err)) {
				retried++
				continue
			}
		default:
			continue
		}
		if err != nil {
			return Outcome{}, fmt.Errorf("%s: %w", header.Name, err)
		}
		entries++
	}
	count := fmt.Sprintf("%d\n", entries)
	if err := os.WriteFile(filepath.Join(dir, treeCount), []byte(count), 0o644); err != nil {
		return Outcome{}, err
	}
	return Outcome{Bytes: total, Ops: entries, Threads: 1, Errors: retried}, nil
}

func extractFile(target string, reader io.Reader, header *tar.Header, tolerateEIO bool) (bool, error) {
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return false, err
	}
	flags := os.O_WRONLY | os.O_CREATE | os.O_TRUNC
	retried := false
	file, err := os.OpenFile(target, flags, header.FileInfo().Mode().Perm())
	if err != nil && tolerateEIO && errors.Is(err, syscall.EIO) {
		retried = true
		file, err = os.OpenFile(target, flags, header.FileInfo().Mode().Perm())
	}
	if err != nil {
		return retried, err
	}
	if _, err := io.Copy(file, reader); err != nil {
		file.Close()
		return retried, err
	}
	return retried, file.Close()
}

func gitClone(dir string, _ Sizes, sources Sources) (Outcome, error) {
	if sources.Mirror == "" {
		return Outcome{}, errors.New("the clone workload needs -mirror")
	}
	target := filepath.Join(dir, cloneName)
	command := exec.Command("git", "clone", "--quiet", "--no-hardlinks", sources.Mirror, target)
	command.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	if output, err := command.CombinedOutput(); err != nil {
		return Outcome{}, fmt.Errorf("git clone: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return Outcome{Ops: 1, Threads: 1}, nil
}
