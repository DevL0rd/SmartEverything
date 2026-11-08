package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

const conflictDevice = "mount"

func conflictName(name string, at time.Time, attempt int) string {
	extension := filepath.Ext(name)
	stem := strings.TrimSuffix(name, extension)
	if stem == "" {
		stem, extension = name, ""
	}
	suffix := ""
	if attempt > 0 {
		suffix = fmt.Sprintf("-%d", attempt+1)
	}
	return fmt.Sprintf("%s.sync-conflict-%s-%s%s%s", stem, at.UTC().Format("20060102-150405"), conflictDevice, suffix, extension)
}

func (w *writeBack) keepBoth(ctx context.Context, s *session) error {
	original := s.rec.Path
	parent, err := w.placement(ctx, s.rec.Root, original)
	if err != nil {
		return err
	}
	now := time.Now()
	for attempt := 0; ; attempt++ {
		copyPath := path.Join(path.Dir(original), conflictName(path.Base(original), now, attempt))
		if _, err := w.stat(ctx, s.rec.Root, copyPath); err == nil {
			continue
		} else if !errors.Is(err, errNotFound) {
			return err
		}
		target := uploadTarget{FolderID: parent.folder(s.rec.Root), Name: path.Base(copyPath)}
		if err := w.rekey(s, copyPath, target); err != nil {
			return err
		}
		fmt.Fprintln(os.Stderr, "conflict: the hub changed", original, "so this edit is kept beside it as", copyPath)
		w.refresh(s.rec.Root, original)
		w.notify(s.rec.Root, []string{original})
		return nil
	}
}
