package main

import (
	"os"
	"os/signal"
	"syscall"
)

func startReaper() {
	if os.Getpid() != 1 {
		return
	}
	exited := make(chan os.Signal, 1)
	signal.Notify(exited, syscall.SIGCHLD)
	go func() {
		for range exited {
			reapExited()
		}
	}()
	reapExited()
}

func reapExited() int {
	reaped := 0
	for {
		var status syscall.WaitStatus
		pid, err := syscall.Wait4(-1, &status, syscall.WNOHANG, nil)
		if err == syscall.EINTR {
			continue
		}
		if pid <= 0 || err != nil {
			return reaped
		}
		reaped++
	}
}
