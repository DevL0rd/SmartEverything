package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
)

const userXattrPrefix = "user."

type metaXattr struct {
	Name  string `json:"name"`
	Value []byte `json:"value"`
}

type metaRequest struct {
	ID      int64       `json:"id"`
	Op      string      `json:"op"`
	Paths   []string    `json:"paths,omitempty"`
	Path    string      `json:"path,omitempty"`
	Xattrs  []metaXattr `json:"xattrs,omitempty"`
	MtimeNs string      `json:"mtimeNs,omitempty"`
}

type metaEntry struct {
	Path   string      `json:"path"`
	Xattrs []metaXattr `json:"xattrs"`
	Code   string      `json:"code,omitempty"`
}

type metaReply struct {
	ID      int64       `json:"id"`
	OK      bool        `json:"ok"`
	Entries []metaEntry `json:"entries,omitempty"`
	Code    string      `json:"code,omitempty"`
	Message string      `json:"message,omitempty"`
}

type metaBackend interface {
	list(path string) ([]metaXattr, error)
	replace(path string, want []metaXattr) error
	setMtime(path string, mtimeNs int64) error
}

func runMeta(in io.Reader, out io.Writer, backend metaBackend) error {
	reader := bufio.NewReader(in)
	writer := bufio.NewWriter(out)
	for {
		line, readErr := reader.ReadBytes('\n')
		if len(bytes.TrimSpace(line)) > 0 {
			if err := answerMeta(writer, backend, line); err != nil {
				return err
			}
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				return nil
			}
			return readErr
		}
	}
}

func answerMeta(writer *bufio.Writer, backend metaBackend, line []byte) error {
	var request metaRequest
	decoder := json.NewDecoder(bytes.NewReader(line))
	decoder.DisallowUnknownFields()
	var reply metaReply
	if err := decoder.Decode(&request); err != nil {
		reply = metaReply{ID: request.ID, Code: "EINVAL", Message: err.Error()}
	} else {
		reply = executeMeta(backend, request)
	}
	raw, err := json.Marshal(reply)
	if err != nil {
		return err
	}
	if _, err := writer.Write(append(raw, '\n')); err != nil {
		return err
	}
	return writer.Flush()
}

func executeMeta(backend metaBackend, request metaRequest) metaReply {
	reply := metaReply{ID: request.ID, OK: true}
	switch request.Op {
	case "read":
		reply.Entries = make([]metaEntry, 0, len(request.Paths))
		for _, path := range request.Paths {
			entry := metaEntry{Path: path, Xattrs: []metaXattr{}}
			if found, err := backend.list(path); err != nil {
				entry.Code = errnoName(err)
			} else {
				entry.Xattrs = found
			}
			reply.Entries = append(reply.Entries, entry)
		}
	case "xattrs":
		return failedMeta(reply, validateWanted(request.Xattrs), func() error {
			return backend.replace(request.Path, request.Xattrs)
		})
	case "mtime":
		var ns int64
		if _, err := fmt.Sscanf(request.MtimeNs, "%d", &ns); err != nil {
			return failedMeta(reply, err, nil)
		}
		return failedMeta(reply, nil, func() error { return backend.setMtime(request.Path, ns) })
	default:
		return failedMeta(reply, fmt.Errorf("unknown op %q", request.Op), nil)
	}
	return reply
}

func validateWanted(want []metaXattr) error {
	for _, xattr := range want {
		if !strings.HasPrefix(xattr.Name, userXattrPrefix) || len(xattr.Name) == len(userXattrPrefix) {
			return fmt.Errorf("xattr %q is outside the user namespace", xattr.Name)
		}
	}
	return nil
}

func failedMeta(reply metaReply, invalid error, work func() error) metaReply {
	if invalid != nil {
		reply.OK = false
		reply.Code = "EINVAL"
		reply.Message = invalid.Error()
		return reply
	}
	if work == nil {
		return reply
	}
	if err := work(); err != nil {
		reply.OK = false
		reply.Code = errnoName(err)
		reply.Message = err.Error()
	}
	return reply
}
