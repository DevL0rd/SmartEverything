package main

import (
	"math/rand/v2"
)

const poolBytes = 64 * mib

type pool struct {
	data []byte
}

func newPool(seed uint64) *pool {
	data := make([]byte, poolBytes)
	source := rand.NewChaCha8([32]byte{byte(seed), byte(seed >> 8), byte(seed >> 16), byte(seed >> 24)})
	source.Read(data)
	return &pool{data: data}
}

func (p *pool) slice(index, length int) []byte {
	start := (index * 4099) % (len(p.data) - length)
	return p.data[start : start+length]
}

func generator(name string) *rand.Rand {
	var seed [32]byte
	copy(seed[:], name)
	return rand.New(rand.NewChaCha8(seed))
}
