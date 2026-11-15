package main

import (
	"flag"
	"fmt"
	"net"
	"os"
	"time"

	"github.com/go-git/go-billy/v5"
	"github.com/go-git/go-billy/v5/osfs"
	nfs "github.com/willscott/go-nfs"
	nfshelper "github.com/willscott/go-nfs/helpers"
)

const handleCache = 1 << 20

type syncedFS struct {
	billy.Filesystem
}

func (s syncedFS) absolute(name string) string {
	return s.Join(s.Root(), name)
}

func (s syncedFS) SyncPath(name string) error {
	handle, err := os.Open(s.absolute(name))
	if err != nil {
		return err
	}
	defer handle.Close()
	return handle.Sync()
}

func (s syncedFS) Chmod(name string, mode os.FileMode) error {
	return os.Chmod(s.absolute(name), mode)
}

func (s syncedFS) Lchown(name string, uid, gid int) error {
	return os.Lchown(s.absolute(name), uid, gid)
}

func (s syncedFS) Chown(name string, uid, gid int) error {
	return os.Chown(s.absolute(name), uid, gid)
}

func (s syncedFS) Chtimes(name string, atime time.Time, mtime time.Time) error {
	return os.Chtimes(s.absolute(name), atime, mtime)
}

func main() {
	address := flag.String("addr", ":0", "address to listen on")
	flag.Parse()
	if flag.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: nfsd [-addr host:port] <exported folder>")
		os.Exit(2)
	}
	listener, err := net.Listen("tcp", *address)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Printf("listening %s exporting %s\n", listener.Addr(), flag.Arg(0))
	handler := nfshelper.NewCachingHandler(nfshelper.NewNullAuthHandler(syncedFS{osfs.New(flag.Arg(0))}), handleCache)
	fmt.Fprintln(os.Stderr, nfs.Serve(listener, handler))
	os.Exit(1)
}
