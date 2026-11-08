//go:build linux

package integration

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/smarteverything/drive-mount/integration/fakehub"
)

func within(t *testing.T, what string, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for !ok() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func run(t *testing.T, dir string, name string, args ...string) string {
	t.Helper()
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Env = []string{
		"PATH=" + os.Getenv("PATH"), "HOME=" + t.TempDir(), "GIT_CONFIG_NOSYSTEM=1",
		"GIT_AUTHOR_NAME=Tester", "GIT_AUTHOR_EMAIL=tester@example.invalid",
		"GIT_COMMITTER_NAME=Tester", "GIT_COMMITTER_EMAIL=tester@example.invalid",
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%s %v: %v\n%s", name, args, err, out)
	}
	return string(out)
}

func TestGitInitAddAndCommitOnTheMount(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git missing")
	}
	hub := fakehub.New(t)
	hub.Mkdir("/placeholder")
	h := startHelper(t, hub)
	repo := filepath.Join(h.point, "repo")
	if err := os.Mkdir(repo, 0o755); err != nil {
		t.Fatal(err)
	}
	run(t, repo, "git", "init", "-b", "main")
	if err := os.MkdirAll(filepath.Join(repo, "src", "deep"), 0o755); err != nil {
		t.Fatal(err)
	}
	for name, body := range map[string]string{"README.md": "hello\n", "src/main.go": "package main\n", "src/deep/data.txt": strings.Repeat("x", 100000)} {
		if err := os.WriteFile(filepath.Join(repo, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	run(t, repo, "git", "add", "-A")
	run(t, repo, "git", "commit", "-m", "first")
	if err := os.WriteFile(filepath.Join(repo, "README.md"), []byte("hello again\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	run(t, repo, "git", "commit", "-am", "second")
	if log := run(t, repo, "git", "log", "--oneline"); strings.Count(log, "\n") != 2 {
		t.Fatalf("log %q", log)
	}
	if status := run(t, repo, "git", "status", "--porcelain"); status != "" {
		t.Fatalf("status %q", status)
	}
	run(t, repo, "git", "fsck", "--strict")
	within(t, "the repository on the hub", func() bool {
		head, ok := hub.Content("/repo/.git/HEAD")
		readme, _ := hub.Content("/repo/README.md")
		return ok && head == "ref: refs/heads/main\n" && readme == "hello again\n"
	})
	within(t, "no temporary git files on the hub", func() bool {
		for _, name := range hub.Names("/repo/.git") {
			if strings.HasSuffix(name, ".lock") {
				return false
			}
		}
		return true
	})
}

func TestEditorSaveAndLockFileThroughTheHelperProcess(t *testing.T) {
	hub := fakehub.New(t)
	hub.Put("/report.odt", "draft")
	h := startHelper(t, hub)
	save := func(name, body string) {
		f, err := os.Create(filepath.Join(h.point, name))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.WriteString(body); err != nil {
			t.Fatal(err)
		}
		if err := f.Sync(); err != nil {
			t.Fatal(err)
		}
		if err := f.Close(); err != nil {
			t.Fatal(err)
		}
	}
	lock := ".~lock.report.odt#"
	save(lock, ",user,host,07.11.2026;")
	save("report.odt.tmp", "final")
	if err := os.Rename(filepath.Join(h.point, "report.odt.tmp"), filepath.Join(h.point, "report.odt")); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(h.point, lock)); err != nil {
		t.Fatal(err)
	}
	within(t, "the document on the hub and nothing else", func() bool {
		got, _ := hub.Content("/report.odt")
		return got == "final" && len(hub.Names("/")) == 1
	})
}
