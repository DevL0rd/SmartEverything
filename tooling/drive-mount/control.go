package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

type controller interface {
	mount(id string, root mountRoot, point string) error
	unmount(id string) error
	invalidate(id string, paths []string) error
	limit(id string, bytes int64) error
	pin(id, path string) error
	unpin(id, path string) error
	reachable(reachable bool) error
}

type controlLine struct {
	Op     string   `json:"op"`
	Mount  string   `json:"mount"`
	Root   string   `json:"root"`
	Folder string   `json:"folder"`
	Point  string   `json:"point"`
	Path   string   `json:"path"`
	Paths  []string `json:"paths"`
	Bytes  *int64   `json:"bytes"`
	Online *bool    `json:"online"`
}

type operation struct {
	needs []string
	run   func(controller, controlLine) error
}

var operations = map[string]operation{
	"mount": {[]string{"mount", "root", "point"}, func(c controller, l controlLine) error {
		return c.mount(l.Mount, mountRoot{RootID: l.Root, FolderID: l.Folder}, l.Point)
	}},
	"unmount":    {[]string{"mount"}, func(c controller, l controlLine) error { return c.unmount(l.Mount) }},
	"invalidate": {[]string{"mount"}, func(c controller, l controlLine) error { return c.invalidate(l.Mount, l.Paths) }},
	"limit":      {[]string{"mount", "bytes"}, func(c controller, l controlLine) error { return c.limit(l.Mount, *l.Bytes) }},
	"pin":        {[]string{"mount", "path"}, func(c controller, l controlLine) error { return c.pin(l.Mount, l.Path) }},
	"unpin":      {[]string{"mount", "path"}, func(c controller, l controlLine) error { return c.unpin(l.Mount, l.Path) }},
	"reachable":  {[]string{"online"}, func(c controller, l controlLine) error { return c.reachable(*l.Online) }},
}

func (l controlLine) field(name string) string {
	switch name {
	case "mount":
		return l.Mount
	case "root":
		return l.Root
	case "point":
		return l.Point
	case "bytes":
		if l.Bytes == nil {
			return ""
		}
		return "set"
	case "online":
		if l.Online == nil {
			return ""
		}
		return "set"
	default:
		return l.Path
	}
}

func parseControl(raw []byte) (operation, controlLine, error) {
	var line controlLine
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&line); err != nil {
		return operation{}, line, fmt.Errorf("control line: %w", err)
	}
	op, ok := operations[line.Op]
	if !ok {
		return operation{}, line, fmt.Errorf("control line: unknown op %q", line.Op)
	}
	for _, name := range op.needs {
		if line.field(name) == "" {
			return operation{}, line, fmt.Errorf("control line: %s needs %s", line.Op, name)
		}
	}
	return op, line, nil
}

func runControl(in io.Reader, c controller, report *reporter) error {
	reader := bufio.NewReader(in)
	for {
		raw, err := reader.ReadBytes('\n')
		if len(bytes.TrimSpace(raw)) > 0 {
			execute(raw, c, report)
		}
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
	}
}

func execute(raw []byte, c controller, report *reporter) {
	op, line, err := parseControl(raw)
	if err == nil {
		err = op.run(c, line)
	}
	if err != nil {
		report.failure(line.Mount, err)
	}
}
