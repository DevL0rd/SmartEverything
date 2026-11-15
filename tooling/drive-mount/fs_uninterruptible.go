//go:build linux

package main

import "context"

func uninterruptible(ctx context.Context) context.Context {
	return context.WithoutCancel(ctx)
}
