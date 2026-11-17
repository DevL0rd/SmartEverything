package wire

import (
	"errors"
	"fmt"
)

var (
	ErrNoRoute      = errors.New("drive mount: no route to the hub")
	ErrClosed       = errors.New("drive mount: wire client closed")
	ErrSessionLost  = errors.New("drive mount: the hub session ended, the handle or commit is gone")
	ErrConnLost     = errors.New("drive mount: connection lost during recovery")
	ErrUnexpected   = errors.New("drive mount: unexpected number of replies")
	ErrHandshake    = errors.New("drive mount: handshake failed")
	ErrProtocol     = errors.New("drive mount: protocol violation")
	errorCodeByName = map[ErrorCode]string{
		ErrENOENT: "ENOENT", ErrEEXIST: "EEXIST", ErrENOTEMPTY: "ENOTEMPTY", ErrENOTDIR: "ENOTDIR",
		ErrEISDIR: "EISDIR", ErrEACCES: "EACCES", ErrEPERM: "EPERM", ErrEINVAL: "EINVAL",
		ErrENOSPC: "ENOSPC", ErrEDQUOT: "EDQUOT", ErrEXDEV: "EXDEV", ErrENAMETOOLONG: "ENAMETOOLONG",
		ErrEILSEQ: "EILSEQ", ErrESTALE: "ESTALE", ErrEAGAIN: "EAGAIN", ErrEDEADLK: "EDEADLK",
		ErrEINTR: "EINTR", ErrEOPNOTSUPP: "EOPNOTSUPP", ErrENODATA: "ENODATA", ErrERANGE: "ERANGE",
		ErrE2BIG: "E2BIG", ErrELOOP: "ELOOP", ErrENOLCK: "ENOLCK", ErrEIO: "EIO",
		ErrENETUNREACH: "ENETUNREACH", ErrEFBIG: "EFBIG",
	}
)

func (c ErrorCode) String() string {
	if name, ok := errorCodeByName[c]; ok {
		return name
	}
	return fmt.Sprintf("code %d", uint8(c))
}

type RemoteError struct {
	Code    ErrorCode
	Message string
	Rev     uint64
	HasRev  bool
}

func (e *RemoteError) Error() string {
	if e.Message == "" {
		return "hub: " + e.Code.String()
	}
	return fmt.Sprintf("hub: %s: %s", e.Code, e.Message)
}

func (e *RemoteError) Is(target error) bool {
	other, ok := target.(*RemoteError)
	return ok && other.Code == e.Code
}

func CodeOf(err error) (ErrorCode, bool) {
	var remote *RemoteError
	if errors.As(err, &remote) {
		return remote.Code, true
	}
	return 0, false
}

func parseRemoteError(m Meta) (*RemoteError, error) {
	code, err := m.Uint(KeyCode)
	if err != nil {
		return nil, err
	}
	if _, known := errorCodeByName[ErrorCode(code)]; !known || code > 0xff {
		return nil, &FieldError{KeyCode, "known error code", code}
	}
	message, err := m.String(KeyMessage)
	if err != nil {
		return nil, err
	}
	remote := &RemoteError{Code: ErrorCode(code), Message: message}
	if m.Has(KeyRev) {
		if remote.Rev, err = m.Uint(KeyRev); err != nil {
			return nil, err
		}
		remote.HasRev = true
	}
	return remote, nil
}

var opNames = map[Op]string{
	OpHello: "HELLO", OpAttach: "ATTACH", OpLookup: "LOOKUP", OpGetattr: "GETATTR", OpReaddir: "READDIR",
	OpSetattr: "SETATTR", OpStatfs: "STATFS", OpReadlink: "READLINK", OpMkdir: "MKDIR", OpCreate: "CREATE",
	OpMknod: "MKNOD", OpSymlink: "SYMLINK", OpLink: "LINK", OpUnlink: "UNLINK", OpRmdir: "RMDIR", OpRmtree: "RMTREE",
	OpRename: "RENAME", OpTmpfile: "TMPFILE", OpGetxattr: "GETXATTR", OpSetxattr: "SETXATTR",
	OpListxattr: "LISTXATTR", OpRemovexattr: "REMOVEXATTR", OpOpen: "OPEN", OpRead: "READ",
	OpRelease: "RELEASE", OpSeek: "SEEK", OpCopy: "COPY", OpBegin: "BEGIN", OpWrite: "WRITE",
	OpAllocate: "ALLOCATE", OpState: "STATE", OpEnd: "END", OpPut: "PUT", OpAbort: "ABORT",
	OpForget: "FORGET", OpFsync: "FSYNC", OpGetlk: "GETLK", OpSetlk: "SETLK", OpUnlock: "UNLOCK",
	OpCancel: "CANCEL", PushChanged: "CHANGED", PushReset: "RESET", PushLockLost: "LOCK_LOST",
}

func (o Op) Name() string {
	if name, ok := opNames[o]; ok {
		return name
	}
	return fmt.Sprintf("op %#x", uint8(o))
}
