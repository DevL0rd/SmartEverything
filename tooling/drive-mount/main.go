package main

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

const tokenFD = 3

func readToken() (string, error) {
	pipe := os.NewFile(tokenFD, "token")
	if pipe == nil {
		return "", fmt.Errorf("token pipe missing")
	}
	defer pipe.Close()
	line, err := bufio.NewReader(pipe).ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(line), nil
}

func newFilesystem(hubURL, token, cacheDir, journalDir string) (*writeBack, error) {
	hub := newHubClient(hubURL, token, &http.Client{Timeout: 30 * time.Second})
	cache := newBlockCache(directSource{hub: hub}, cacheDir)
	return newWriteBack(cache, hub, journalDir)
}

func serve(in io.Reader, out io.Writer, source Filesystem, stop <-chan os.Signal) error {
	report := newReporter(out)
	set := newMountSet(source, report)
	finished := make(chan error, 1)
	go func() { finished <- runControl(in, set, report) }()
	var err error
	select {
	case err = <-finished:
	case <-stop:
	}
	if closeErr := set.closeAll(); err == nil {
		err = closeErr
	}
	return err
}

func main() {
	hubURL := flag.String("hub", "", "hub base url")
	cacheDir := flag.String("cache", "", "block cache folder")
	flag.Parse()
	if *cacheDir == "" {
		fmt.Fprintln(os.Stderr, "cache: folder missing")
		os.Exit(2)
	}
	token, err := readToken()
	if err != nil {
		fmt.Fprintln(os.Stderr, "token:", err)
		os.Exit(2)
	}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	files, err := newFilesystem(*hubURL, token, *cacheDir, filepath.Join(filepath.Dir(filepath.Clean(*cacheDir)), "journal"))
	if err != nil {
		fmt.Fprintln(os.Stderr, "journal:", err)
		os.Exit(1)
	}
	err = serve(os.Stdin, os.Stdout, files, stop)
	files.Close()
	if err != nil {
		fmt.Fprintln(os.Stderr, "helper:", err)
		os.Exit(1)
	}
}
