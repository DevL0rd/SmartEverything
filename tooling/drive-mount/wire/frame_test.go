package wire

import (
	"bytes"
	"errors"
	"testing"
)

func TestFrameRoundTrip(t *testing.T) {
	cases := []Frame{
		{Type: FrameRequest, Op: OpLookup, RequestID: 7, Meta: []byte{0xa0}},
		{Type: FrameReply, Op: OpRead, RequestID: 1<<64 - 1, Meta: []byte{0xa0}, Payload: []byte("data")},
		{Type: FrameReply, Op: OpRead, RequestID: 9, Meta: []byte{0xa0}, Payload: []byte{}},
		{Type: FrameReply, Op: OpReaddir, RequestID: 9, More: true, Meta: []byte{0xa0}},
		{Type: FramePush, Op: PushReset, Meta: []byte{0xa0}},
	}
	for _, in := range cases {
		raw, err := EncodeFrame(in)
		if err != nil {
			t.Fatal(err)
		}
		out, err := DecodeFrame(raw)
		if err != nil {
			t.Fatal(err)
		}
		if out.Type != in.Type || out.Op != in.Op || out.RequestID != in.RequestID || out.More != in.More ||
			!bytes.Equal(out.Meta, in.Meta) || (out.Payload == nil) != (in.Payload == nil) || !bytes.Equal(out.Payload, in.Payload) {
			t.Fatalf("round trip changed %+v into %+v", in, out)
		}
	}
}

func TestFrameRejections(t *testing.T) {
	good, _ := EncodeFrame(Frame{Type: FrameRequest, Op: OpLookup, RequestID: 1, Meta: []byte{0xa0}})
	with := func(edit func([]byte) []byte) []byte { return edit(append([]byte(nil), good...)) }
	cases := map[string]struct {
		raw   []byte
		fault FrameFault
	}{
		"short":           {good[:10], FaultShort},
		"unknown type":    {with(func(b []byte) []byte { b[0] = 9; return b }), FaultType},
		"reserved flags":  {with(func(b []byte) []byte { b[2] = 0x04; return b }), FaultFlags},
		"meta too long":   {with(func(b []byte) []byte { b[12] = 200; return b }), FaultMeta},
		"trailing bytes":  {with(func(b []byte) []byte { return append(b, 1) }), FaultPayload},
		"push with id":    {with(func(b []byte) []byte { b[0] = byte(FramePush); return b }), FaultRequestID},
		"more on request": {with(func(b []byte) []byte { b[2] = FlagMore; return b }), FaultFlags},
	}
	for name, c := range cases {
		_, err := DecodeFrame(c.raw)
		var fault *InvalidFrameError
		if !errors.As(err, &fault) || fault.Fault != c.fault {
			t.Fatalf("%s: err = %v, want fault %s", name, err, c.fault)
		}
	}
}

func TestFrameEncodeRejectsOversize(t *testing.T) {
	if _, err := EncodeFrame(Frame{Type: FrameReply, Op: OpRead, Meta: []byte{0xa0}, Payload: make([]byte, MaxPayloadBytes+1)}); err == nil {
		t.Fatal("an oversize payload must be refused")
	}
	if _, err := EncodeFrame(Frame{Type: FrameReply, Op: OpRead, Meta: make([]byte, MaxMetaBytes+1)}); err == nil {
		t.Fatal("an oversize meta must be refused")
	}
	if _, err := EncodeFrame(Frame{Type: FrameReply, Op: OpRead, Meta: []byte{0xa0}, Payload: make([]byte, MaxPayloadBytes)}); err != nil {
		t.Fatalf("a payload of exactly the limit is valid: %v", err)
	}
}

func TestMetaRejectsMalformedInput(t *testing.T) {
	if _, err := DecodeMeta([]byte{0xa1, 0x01}); err == nil {
		t.Fatal("a truncated map must fail")
	}
	if _, err := DecodeMeta([]byte{0xa0, 0x00}); err == nil {
		t.Fatal("trailing bytes must fail")
	}
	if _, err := DecodeMeta([]byte{0xa2, 0x01, 0x01, 0x01, 0x02}); err == nil {
		t.Fatal("a duplicate key must fail")
	}
	if _, err := DecodeMeta([]byte{0xbf, 0xff}); err == nil {
		t.Fatal("an indefinite length map must fail")
	}
	if _, err := DecodeMeta([]byte{0x01}); err == nil {
		t.Fatal("a non-map meta must fail")
	}
}

func TestMetaEncodingIsDeterministic(t *testing.T) {
	a, _ := EncodeMeta(Meta{KeyNames: []any{}, KeyCode: uint64(1), KeyMessage: "x", KeyFrameLimit: uint64(MaxFrameBytes)})
	b, _ := EncodeMeta(Meta{KeyFrameLimit: uint64(MaxFrameBytes), KeyMessage: "x", KeyCode: uint64(1), KeyNames: []any{}})
	if !bytes.Equal(a, b) {
		t.Fatalf("different encodings %x %x", a, b)
	}
	if a[0] != 0xa4 || a[1] != 0x00 {
		t.Fatalf("keys are not ascending: %x", a)
	}
}

func TestMetaGettersNameTheFailingKey(t *testing.T) {
	m := Meta{KeyIno: "text", KeySize: int64(-1), KeyUid: uint64(1 << 40)}
	if _, err := m.Uint(KeyIno); err == nil {
		t.Fatal("text is not an unsigned integer")
	}
	if _, err := m.Uint(KeySize); err == nil {
		t.Fatal("negative is not unsigned")
	}
	if _, err := m.OptUint32(KeyUid); err == nil {
		t.Fatal("a 40 bit value is not a uint32")
	}
	if v, err := m.OptUint32(KeyGid); err != nil || v != nil {
		t.Fatalf("an absent key is null: %v %v", v, err)
	}
	var field *FieldError
	if _, err := m.String(KeyMode); !errors.As(err, &field) || field.Key != KeyMode {
		t.Fatalf("err = %v", err)
	}
}
