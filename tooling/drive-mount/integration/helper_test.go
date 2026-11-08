//go:build linux

package integration

import (
	"bufio"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/integration/fakehub"
)

type helper struct {
	t     *testing.T
	cmd   *exec.Cmd
	in    *os.File
	point string
}

func buildHelper(t *testing.T) string {
	t.Helper()
	bin := filepath.Join(t.TempDir(), "se-drive-mount")
	build := exec.Command("go", "build", "-o", bin, ".")
	build.Dir = ".."
	build.Env = append(os.Environ(), "CGO_ENABLED=0")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	return bin
}

func requireFuse(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("fusermount3"); err != nil {
		t.Skip("fusermount3 missing")
	}
	if _, err := os.Stat("/dev/fuse"); err != nil {
		t.Skip("/dev/fuse missing")
	}
}

func startHelper(t *testing.T, hub *fakehub.Hub) *helper {
	t.Helper()
	requireFuse(t)
	bin := buildHelper(t)
	work := t.TempDir()
	tokenRead, tokenWrite, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	stdinRead, stdinWrite, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, err := os.CreateTemp(work, "status")
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(bin, "-hub", hub.URL, "-cache", filepath.Join(work, "cache"))
	cmd.Stdin, cmd.Stdout, cmd.Stderr, cmd.ExtraFiles = stdinRead, stdout, os.Stderr, []*os.File{tokenRead}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	tokenRead.Close()
	stdinRead.Close()
	tokenWrite.WriteString(fakehub.Token + "\n")
	tokenWrite.Close()
	h := &helper{t: t, cmd: cmd, in: stdinWrite, point: filepath.Join(work, "mnt")}
	if err := os.Mkdir(h.point, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(h.stop)
	h.send(map[string]string{"op": "mount", "mount": "m", "root": "r", "folder": "f1", "point": h.point})
	h.awaitStatus(stdout.Name(), "mounted")
	return h
}

func (h *helper) send(line map[string]string) {
	h.t.Helper()
	raw, err := json.Marshal(line)
	if err != nil {
		h.t.Fatal(err)
	}
	if _, err := h.in.Write(append(raw, '\n')); err != nil {
		h.t.Fatal(err)
	}
}

func (h *helper) awaitStatus(file, state string) {
	h.t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		f, err := os.Open(file)
		if err == nil {
			scan := bufio.NewScanner(f)
			for scan.Scan() {
				if strings.Contains(scan.Text(), `"state":"`+state+`"`) {
					f.Close()
					return
				}
				if strings.Contains(scan.Text(), `"type":"error"`) {
					f.Close()
					h.t.Skipf("helper could not mount: %s", scan.Text())
				}
			}
			f.Close()
		}
		time.Sleep(20 * time.Millisecond)
	}
	h.t.Fatalf("helper never reported %s", state)
}

func (h *helper) stop() {
	h.in.Close()
	done := make(chan struct{})
	go func() { h.cmd.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(15 * time.Second):
		h.cmd.Process.Kill()
		exec.Command("fusermount3", "-u", "-z", h.point).Run()
		<-done
	}
}
