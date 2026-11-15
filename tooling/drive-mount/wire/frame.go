package wire

import (
	"encoding/binary"
	"fmt"
)

type Frame struct {
	Type      FrameType
	Op        Op
	More      bool
	RequestID uint64
	Meta      []byte
	Payload   []byte
}

type FrameFault string

const (
	FaultShort     FrameFault = "short"
	FaultType      FrameFault = "type"
	FaultFlags     FrameFault = "flags"
	FaultRequestID FrameFault = "request-id"
	FaultMeta      FrameFault = "meta-length"
	FaultPayload   FrameFault = "payload"
)

type InvalidFrameError struct {
	Fault  FrameFault
	Detail string
}

func (e *InvalidFrameError) Error() string {
	return fmt.Sprintf("invalid drive mount frame (%s): %s", e.Fault, e.Detail)
}

func frameError(fault FrameFault, format string, args ...any) *InvalidFrameError {
	return &InvalidFrameError{Fault: fault, Detail: fmt.Sprintf(format, args...)}
}

func (f Frame) check() error {
	switch f.Type {
	case FrameRequest, FrameReply, FrameError, FramePush:
	default:
		return frameError(FaultType, "%d is unknown", f.Type)
	}
	if f.Type == FramePush && f.RequestID != 0 {
		return frameError(FaultRequestID, "a push carries request id 0")
	}
	if f.More && f.Type != FrameReply {
		return frameError(FaultFlags, "only a reply can be followed by more replies")
	}
	if len(f.Meta) > MaxMetaBytes {
		return frameError(FaultMeta, "%d bytes exceed the limit", len(f.Meta))
	}
	if len(f.Payload) > MaxPayloadBytes {
		return frameError(FaultPayload, "%d bytes exceed the limit", len(f.Payload))
	}
	return nil
}

func (f Frame) HasPayload() bool { return f.Payload != nil }

func EncodeFrame(f Frame) ([]byte, error) {
	if err := f.check(); err != nil {
		return nil, err
	}
	out := make([]byte, HeaderBytes+len(f.Meta)+len(f.Payload))
	out[0] = byte(f.Type)
	out[1] = byte(f.Op)
	var flags uint16
	if f.Payload != nil {
		flags |= FlagPayload
	}
	if f.More {
		flags |= FlagMore
	}
	binary.LittleEndian.PutUint16(out[2:], flags)
	binary.LittleEndian.PutUint64(out[4:], f.RequestID)
	binary.LittleEndian.PutUint32(out[12:], uint32(len(f.Meta)))
	copy(out[HeaderBytes:], f.Meta)
	copy(out[HeaderBytes+len(f.Meta):], f.Payload)
	return out, nil
}

func DecodeFrame(b []byte) (Frame, error) {
	if len(b) < HeaderBytes {
		return Frame{}, frameError(FaultShort, "%d bytes hold no header", len(b))
	}
	flags := binary.LittleEndian.Uint16(b[2:])
	if flags&^(FlagPayload|FlagMore) != 0 {
		return Frame{}, frameError(FaultFlags, "%d sets reserved bits", flags)
	}
	metaLength := uint64(binary.LittleEndian.Uint32(b[12:]))
	metaEnd := HeaderBytes + metaLength
	if metaEnd > uint64(len(b)) {
		return Frame{}, frameError(FaultMeta, "%d does not fit the frame", metaLength)
	}
	hasPayload := flags&FlagPayload != 0
	if !hasPayload && metaEnd != uint64(len(b)) {
		return Frame{}, frameError(FaultPayload, "bytes follow the meta without the payload flag")
	}
	f := Frame{
		Type:      FrameType(b[0]),
		Op:        Op(b[1]),
		More:      flags&FlagMore != 0,
		RequestID: binary.LittleEndian.Uint64(b[4:]),
		Meta:      b[HeaderBytes:metaEnd],
	}
	if hasPayload {
		f.Payload = b[metaEnd:]
		if f.Payload == nil {
			f.Payload = []byte{}
		}
	}
	if err := f.check(); err != nil {
		return Frame{}, err
	}
	return f, nil
}
