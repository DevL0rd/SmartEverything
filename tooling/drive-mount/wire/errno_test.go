//go:build linux

package wire

import (
	"context"
	"errors"
	"syscall"
	"testing"
)

func TestEveryErrorCodeMapsToItsErrno(t *testing.T) {
	for code := range errorCodeByName {
		if got := code.Errno(); got == 0 || (got == syscall.EIO && code != ErrEIO) {
			t.Fatalf("%s maps to %v", code, got)
		}
	}
	if ErrorCode(200).Errno() != syscall.EIO {
		t.Fatal("an unknown code is EIO")
	}
}

func TestErrnoOfClassifiesGoErrors(t *testing.T) {
	cases := map[string]struct {
		err  error
		want syscall.Errno
	}{
		"nil":      {nil, 0},
		"remote":   {&RemoteError{Code: ErrENOTEMPTY}, syscall.ENOTEMPTY},
		"wrapped":  {errors.Join(errors.New("x"), &RemoteError{Code: ErrEXDEV}), syscall.EXDEV},
		"no route": {ErrNoRoute, syscall.ENETUNREACH},
		"canceled": {context.Canceled, syscall.EINTR},
		"deadline": {context.DeadlineExceeded, syscall.EINTR},
		"other":    {ErrSessionLost, syscall.EIO},
	}
	for name, c := range cases {
		if got := ErrnoOf(c.err); got != c.want {
			t.Fatalf("%s: %v, want %v", name, got, c.want)
		}
	}
}
