package main

import (
	"testing"
	"time"
)

func TestTuningChangeReachesRunningClient(t *testing.T) {
	saved := live.load()
	defer live.store(saved)
	start := saved
	start.ping, start.deadAfter = 10*time.Second, 30*time.Second
	live.store(start)

	dir := t.TempDir()
	fs, err := newFilesystem(routeSpec{}, "token", dir+"/cache", dir+"/journal")
	if err != nil {
		t.Fatal(err)
	}
	defer fs.Close()
	if ping, dead := fs.client.Liveness(); ping != 10*time.Second || dead != 30*time.Second {
		t.Fatalf("connect liveness %s %s", ping, dead)
	}

	next := start
	next.ping, next.deadAfter = 3*time.Second, 9*time.Second
	live.store(next)
	if ping, dead := fs.client.Liveness(); ping != 3*time.Second || dead != 9*time.Second {
		t.Fatalf("running client liveness %s %s", ping, dead)
	}
}
