package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

const (
	phaseOpen   = "open"
	phaseSealed = "sealed"
	phaseFailed = "failed"
)

type journalRecord struct {
	ID       string       `json:"id"`
	Root     mountRoot    `json:"root"`
	Path     string       `json:"path"`
	Phase    string       `json:"phase"`
	Target   uploadTarget `json:"target"`
	Location string       `json:"location"`
	Size     int64        `json:"size"`
}

type journal struct {
	dir string
}

func openJournal(dir string) (*journal, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	return &journal{dir: dir}, nil
}

func newSessionID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw), nil
}

func (j *journal) recordPath(id string) string { return filepath.Join(j.dir, id+".json") }

func (j *journal) dataPath(id string) string { return filepath.Join(j.dir, id+".data") }

func (j *journal) openData(id string) (*os.File, error) {
	return os.OpenFile(j.dataPath(id), os.O_RDWR|os.O_CREATE, 0o600)
}

func (j *journal) save(rec journalRecord) error {
	return writeDurable(j.recordPath(rec.ID), rec)
}

func (j *journal) remove(id string) error {
	if err := os.Remove(j.recordPath(id)); err != nil && !os.IsNotExist(err) {
		return err
	}
	if err := os.Remove(j.dataPath(id)); err != nil && !os.IsNotExist(err) {
		return err
	}
	return syncDir(j.dir)
}

func (j *journal) load() ([]journalRecord, error) {
	names, err := filepath.Glob(filepath.Join(j.dir, "*.json"))
	if err != nil {
		return nil, err
	}
	slices.SortFunc(names, func(a, b string) int { return modTime(a).Compare(modTime(b)) })
	out := make([]journalRecord, 0, len(names))
	for _, name := range names {
		rec, err := readJSON[journalRecord](name)
		if err != nil {
			return nil, fmt.Errorf("journal %s: %w", filepath.Base(name), err)
		}
		if rec.ID != strings.TrimSuffix(filepath.Base(name), ".json") {
			return nil, fmt.Errorf("journal %s: record names another session", filepath.Base(name))
		}
		out = append(out, rec)
	}
	return out, nil
}

func writeDurable(target string, rec journalRecord) error {
	raw, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	temp := target + ".tmp"
	f, err := os.OpenFile(temp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(raw); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := os.Rename(temp, target); err != nil {
		return err
	}
	return syncDir(filepath.Dir(target))
}
