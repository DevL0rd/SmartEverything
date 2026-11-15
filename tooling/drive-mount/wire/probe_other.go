//go:build !(linux || darwin || freebsd)

package wire

func (p *callProbe) onDumpSignal() {}
