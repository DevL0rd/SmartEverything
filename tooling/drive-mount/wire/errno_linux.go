//go:build linux

package wire

import (
	"context"
	"errors"
	"syscall"
)

var errnoByCode = map[ErrorCode]syscall.Errno{
	ErrENOENT: syscall.ENOENT, ErrEEXIST: syscall.EEXIST, ErrENOTEMPTY: syscall.ENOTEMPTY,
	ErrENOTDIR: syscall.ENOTDIR, ErrEISDIR: syscall.EISDIR, ErrEACCES: syscall.EACCES,
	ErrEPERM: syscall.EPERM, ErrEINVAL: syscall.EINVAL, ErrENOSPC: syscall.ENOSPC,
	ErrEDQUOT: syscall.EDQUOT, ErrEXDEV: syscall.EXDEV, ErrENAMETOOLONG: syscall.ENAMETOOLONG,
	ErrEILSEQ: syscall.EILSEQ, ErrESTALE: syscall.ESTALE, ErrEAGAIN: syscall.EAGAIN,
	ErrEDEADLK: syscall.EDEADLK, ErrEINTR: syscall.EINTR, ErrEOPNOTSUPP: syscall.EOPNOTSUPP,
	ErrENODATA: syscall.ENODATA, ErrERANGE: syscall.ERANGE, ErrE2BIG: syscall.E2BIG,
	ErrELOOP: syscall.ELOOP, ErrENOLCK: syscall.ENOLCK, ErrEIO: syscall.EIO,
	ErrENETUNREACH: syscall.ENETUNREACH, ErrEFBIG: syscall.EFBIG,
}

func (c ErrorCode) Errno() syscall.Errno {
	if errno, ok := errnoByCode[c]; ok {
		return errno
	}
	return syscall.EIO
}

func ErrnoOf(err error) syscall.Errno {
	if err == nil {
		return 0
	}
	var remote *RemoteError
	switch {
	case errors.As(err, &remote):
		return remote.Code.Errno()
	case errors.Is(err, ErrNoRoute):
		return syscall.ENETUNREACH
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return syscall.EINTR
	default:
		return syscall.EIO
	}
}
