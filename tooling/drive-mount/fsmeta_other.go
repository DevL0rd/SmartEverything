//go:build !linux

package main

import "errors"

var errMetaUnsupported = errors.New("extended attributes need the Linux helper")

type unsupportedMeta struct{}

func errnoName(error) string { return "ENOTSUP" }

func (unsupportedMeta) list(string) ([]metaXattr, error)  { return nil, errMetaUnsupported }
func (unsupportedMeta) replace(string, []metaXattr) error { return errMetaUnsupported }
func (unsupportedMeta) setMtime(string, int64) error      { return errMetaUnsupported }

func platformMeta() metaBackend { return unsupportedMeta{} }
