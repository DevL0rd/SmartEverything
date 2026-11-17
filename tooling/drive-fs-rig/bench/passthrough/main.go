package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
)

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "usage: passthrough <folder> <mount point>")
		os.Exit(2)
	}
	root, err := fs.NewLoopbackRoot(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, "passthrough:", err)
		os.Exit(1)
	}
	server, err := fs.Mount(os.Args[2], root, &fs.Options{MountOptions: fuse.MountOptions{FsName: "passthrough", Name: "passthrough"}})
	if err != nil {
		fmt.Fprintln(os.Stderr, "passthrough:", err)
		os.Exit(1)
	}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-stop
		if err := server.Unmount(); err != nil {
			fmt.Fprintln(os.Stderr, "passthrough:", err)
		}
	}()
	server.Wait()
}
