//go:build linux || darwin || freebsd

package wire

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

func (p *callProbe) onDumpSignal() {
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGUSR1)
	go func() {
		for range signals {
			if err := p.dump(); err != nil {
				fmt.Fprintln(os.Stderr, "call probe:", err)
			}
		}
	}()
}
