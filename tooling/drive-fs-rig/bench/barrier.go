package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
)

const (
	execLimit   = 10 * time.Minute
	drainPoll   = 100 * time.Millisecond
	drainSteady = 3
)

type counters struct {
	Type    string `json:"type"`
	Mount   string `json:"mount"`
	Open    int64  `json:"openFiles"`
	Pending int64  `json:"pendingUploads"`
}

func unsupported(err error) bool {
	return errors.Is(err, syscall.ENOSYS) || errors.Is(err, syscall.EINVAL) || errors.Is(err, syscall.EOPNOTSUPP) || errors.Is(err, syscall.ENOTSUP)
}

func syncTree(dir string) error {
	handle, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer handle.Close()
	if err := handle.Sync(); err != nil && !unsupported(err) {
		return err
	}
	return nil
}

func lastCounters(path, mount string) (counters, bool, error) {
	file, err := os.Open(path)
	if err != nil {
		return counters{}, false, err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 1<<16), 1<<24)
	var last counters
	found := false
	for scanner.Scan() {
		var line counters
		if json.Unmarshal(scanner.Bytes(), &line) != nil {
			continue
		}
		if line.Type == "counters" && line.Mount == mount {
			last = line
			found = true
		}
	}
	return last, found, scanner.Err()
}

var mutating = map[string]bool{
	"seq-write": true, "rand-write-1": true, "rand-write-16": true,
	"create-1": true, "create-16": true, "create-32": true,
	"untar": true, "clone": true, "office-save": true, "rm-tree": true,
}

type stalledError struct {
	pending int64
	since   time.Time
}

func (e *stalledError) Error() string {
	return fmt.Sprintf("the helper stopped making upload progress with %d uploads pending", e.pending)
}

func drainExec(d Drain, name string) error {
	if d.Exec == "" || (name != "" && !mutating[name]) {
		return nil
	}
	deadline := time.Now().Add(execLimit)
	for {
		err := exec.Command("sh", "-c", d.Exec).Run()
		if err == nil {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("the drain command %q kept failing for %s: %w", d.Exec, execLimit, err)
		}
		time.Sleep(drainPoll)
	}
}

func drain(d Drain, name string) error {
	if err := drainExec(d, name); err != nil {
		return err
	}
	if d.StatusLog == "" {
		return nil
	}
	steady := 0
	progressAt := time.Now()
	var previous counters
	for {
		now, found, err := lastCounters(d.StatusLog, d.Mount)
		if err != nil {
			return err
		}
		if now != previous {
			previous = now
			progressAt = time.Now()
			steady = 0
		}
		if !found || (now.Pending == 0 && now.Open == 0) {
			steady++
			if steady >= drainSteady {
				return nil
			}
		} else {
			steady = 0
		}
		if time.Since(progressAt) > d.IdleLimit {
			if d.Tolerate {
				return &stalledError{pending: now.Pending, since: progressAt}
			}
			return fmt.Errorf("the helper made no upload progress for %s with %d uploads pending", d.IdleLimit, now.Pending)
		}
		time.Sleep(drainPoll)
	}
}
