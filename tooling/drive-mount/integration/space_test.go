//go:build linux

package integration

import (
	"os"
	"os/exec"
	"strings"
	"syscall"
	"testing"

	"github.com/smarteverything/drive-mount/integration/fakehub"
)

func TestTheMountShowsTheDriveSizeAndListsAsANetworkShare(t *testing.T) {
	hub := fakehub.New(t)
	h := startHelper(t, hub)
	var stat syscall.Statfs_t
	if err := syscall.Statfs(h.point, &stat); err != nil {
		t.Fatal(err)
	}
	if total := int64(stat.Blocks) * stat.Bsize; total != fakehub.SpaceTotal {
		t.Fatalf("size %d, want %d", total, fakehub.SpaceTotal)
	}
	if free := int64(stat.Bavail) * stat.Bsize; free != fakehub.SpaceFree {
		t.Fatalf("free %d, want %d", free, fakehub.SpaceFree)
	}
	out, err := exec.Command("df", "-h", h.point).CombinedOutput()
	if err != nil || !strings.Contains(string(out), "200G") || !strings.Contains(string(out), "//smarteverything/mnt") {
		t.Fatalf("df: %v\n%s", err, out)
	}
	info, err := os.ReadFile("/proc/self/mountinfo")
	if err != nil {
		t.Fatal(err)
	}
	for _, line := range strings.Split(string(info), "\n") {
		if strings.Contains(line, " "+h.point+" ") {
			if !strings.Contains(line, " - fuse.smarteverything //smarteverything/mnt ") {
				t.Fatalf("mount table line %q", line)
			}
			return
		}
	}
	t.Fatal("the mount is missing from the mount table")
}
