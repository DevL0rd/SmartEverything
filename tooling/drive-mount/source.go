package main

import (
	"context"
	"errors"
)

type mountRoot struct {
	RootID   string
	FolderID string
}

type ContentSource interface {
	List(ctx context.Context, root mountRoot, dir string) ([]entry, error)
	ReadAt(ctx context.Context, root mountRoot, path string, off int64, dst []byte) (int, error)
	Pin(ctx context.Context, root mountRoot, path string) error
	Unpin(ctx context.Context, root mountRoot, path string) error
	Usage(root mountRoot) int64
	SetLimit(root mountRoot, bytes int64) error
}

var errLimitUnsupported = errors.New("a cache size needs the block cache")

var errPinUnsupported = errors.New("keeping files offline needs the block cache")

type directSource struct {
	hub *hubClient
}

func (s directSource) List(ctx context.Context, root mountRoot, dir string) ([]entry, error) {
	return s.hub.list(ctx, root, dir)
}

func (s directSource) ReadAt(ctx context.Context, root mountRoot, path string, off int64, dst []byte) (int, error) {
	return s.hub.readAt(ctx, root, path, off, dst)
}

func (s directSource) Pin(context.Context, mountRoot, string) error {
	return errPinUnsupported
}

func (s directSource) Unpin(context.Context, mountRoot, string) error {
	return errPinUnsupported
}

func (s directSource) Usage(mountRoot) int64 { return 0 }

func (s directSource) SetLimit(mountRoot, int64) error { return errLimitUnsupported }
