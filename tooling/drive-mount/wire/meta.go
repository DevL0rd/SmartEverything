package wire

import (
	"fmt"
	"reflect"
	"sync"

	"github.com/fxamacker/cbor/v2"
)

type Meta map[uint64]any

var (
	metaEncMode = sync.OnceValue(func() cbor.EncMode {
		mode, err := cbor.CoreDetEncOptions().EncMode()
		if err != nil {
			panic(err)
		}
		return mode
	})
	metaDecMode = sync.OnceValue(func() cbor.DecMode {
		mode, err := cbor.DecOptions{
			DefaultMapType: reflect.TypeOf(Meta(nil)),
			DupMapKey:      cbor.DupMapKeyEnforcedAPF,
			TagsMd:         cbor.TagsForbidden,
			IndefLength:    cbor.IndefLengthForbidden,
		}.DecMode()
		if err != nil {
			panic(err)
		}
		return mode
	})
)

func EncodeMeta(m Meta) ([]byte, error) {
	if m == nil {
		m = Meta{}
	}
	return metaEncMode().Marshal(m)
}

func DecodeMeta(b []byte) (Meta, error) {
	var m Meta
	if err := metaDecMode().Unmarshal(b, &m); err != nil {
		return nil, fmt.Errorf("drive mount meta: %w", err)
	}
	if m == nil {
		m = Meta{}
	}
	return m, nil
}

type FieldError struct {
	Key    uint64
	Expect string
	Got    any
}

func (e *FieldError) Error() string {
	if e.Got == nil {
		return fmt.Sprintf("drive mount meta key %d: expected %s, found nothing", e.Key, e.Expect)
	}
	return fmt.Sprintf("drive mount meta key %d: expected %s, found %T", e.Key, e.Expect, e.Got)
}

func (m Meta) Has(key uint64) bool {
	v, ok := m[key]
	return ok && v != nil
}

func (m Meta) Uint(key uint64) (uint64, error) {
	switch v := m[key].(type) {
	case uint64:
		return v, nil
	case int64:
		if v >= 0 {
			return uint64(v), nil
		}
	}
	return 0, &FieldError{key, "unsigned integer", m[key]}
}

func (m Meta) Int(key uint64) (int64, error) {
	switch v := m[key].(type) {
	case int64:
		return v, nil
	case uint64:
		if v <= 1<<63-1 {
			return int64(v), nil
		}
	}
	return 0, &FieldError{key, "signed integer", m[key]}
}

func (m Meta) OptUint32(key uint64) (*uint32, error) {
	if m[key] == nil {
		return nil, nil
	}
	v, err := m.Uint(key)
	if err != nil || v > 0xffff_ffff {
		return nil, &FieldError{key, "32 bit unsigned integer or null", m[key]}
	}
	out := uint32(v)
	return &out, nil
}

func (m Meta) String(key uint64) (string, error) {
	if v, ok := m[key].(string); ok {
		return v, nil
	}
	return "", &FieldError{key, "text", m[key]}
}

func (m Meta) Bytes(key uint64) ([]byte, error) {
	if v, ok := m[key].([]byte); ok {
		return v, nil
	}
	return nil, &FieldError{key, "bytes", m[key]}
}

func (m Meta) Bool(key uint64) (bool, error) {
	if v, ok := m[key].(bool); ok {
		return v, nil
	}
	return false, &FieldError{key, "boolean", m[key]}
}

func (m Meta) Map(key uint64) (Meta, error) {
	if v, ok := m[key].(Meta); ok {
		return v, nil
	}
	return nil, &FieldError{key, "map", m[key]}
}

func (m Meta) Array(key uint64) ([]any, error) {
	if v, ok := m[key].([]any); ok {
		return v, nil
	}
	return nil, &FieldError{key, "array", m[key]}
}

func asMeta(v any, key uint64) (Meta, error) {
	if m, ok := v.(Meta); ok {
		return m, nil
	}
	return nil, &FieldError{key, "map", v}
}

func asUint(v any, key uint64) (uint64, error) {
	return Meta{key: v}.Uint(key)
}
