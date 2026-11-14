//go:build linux

package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestReadMovesToTheNewRouteWhenTheRouteSwitchesMidRead(t *testing.T) {
	entered := make(chan struct{})
	stuck := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(entered)
		<-r.Context().Done()
	}))
	t.Cleanup(stuck.Close)
	h := newStubHub(t)
	h.set("r", "", "/a.bin", "fresh")
	client := newHubClient(routeSpec{URL: stuck.URL}, stubToken)
	client.known[location{mountRoot{RootID: "r"}, "/a.bin"}] = entry{Name: "a.bin", ID: "id:/a.bin", Size: 5}
	got := make(chan string, 1)
	go func() {
		buf := make([]byte, 5)
		n, err := client.readAt(context.Background(), mountRoot{RootID: "r"}, "/a.bin", 0, buf)
		if err != nil {
			got <- err.Error()
			return
		}
		got <- string(buf[:n])
	}()
	<-entered
	if err := client.switchRoute(routeSpec{URL: h.server.URL}); err != nil {
		t.Fatal(err)
	}
	select {
	case text := <-got:
		if text != "fresh" {
			t.Fatalf("read %q", text)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the read stayed on the old route")
	}
}

func TestNoRouteFailsAsATransientNetworkError(t *testing.T) {
	client := newHubClient(routeSpec{}, stubToken)
	_, err := client.request(context.Background(), "/drive/fs/r/list", nil, "")
	if !errors.Is(err, errNoRoute) || !isTransient(err) {
		t.Fatalf("err %v", err)
	}
}

func TestPinnedRouteRefusesAnotherCertificateKey(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"entries":[],"next":null}`))
	}))
	t.Cleanup(server.Close)
	sum := sha256.Sum256(server.Certificate().RawSubjectPublicKeyInfo)
	good := newHubClient(routeSpec{URL: server.URL, Server: "example.com", Pin: hex.EncodeToString(sum[:])}, stubToken)
	if _, err := good.list(context.Background(), mountRoot{RootID: "r"}, "/"); err != nil {
		t.Fatalf("pinned route refused the paired key: %v", err)
	}
	bad := newHubClient(routeSpec{URL: server.URL, Server: "example.com", Pin: strings.Repeat("0", 64)}, stubToken)
	if _, err := bad.list(context.Background(), mountRoot{RootID: "r"}, "/"); err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("pinned route accepted another key: %v", err)
	}
}

func TestSpaceIsReadFromTheHubAndKeptForOffline(t *testing.T) {
	h := newStubHub(t)
	files := newFS(t, h)
	root := mountRoot{RootID: "r", FolderID: "f1"}
	space, err := files.Space(context.Background(), root)
	if err != nil || space.Total != stubSpace.Total || space.Free != stubSpace.Free {
		t.Fatalf("space %+v err %v", space, err)
	}
	if err := files.SwitchRoute(routeSpec{}); err != nil {
		t.Fatal(err)
	}
	offline, err := files.Space(context.Background(), root)
	if err != nil || offline != space {
		t.Fatalf("offline space %+v err %v", offline, err)
	}
}

func TestMountSourceNamesANetworkShare(t *testing.T) {
	options := serverOptions("/home/me/SmartEverything/My Drive")
	if options.MountOptions.FsName != "//smarteverything/My_Drive" || options.MountOptions.Name != "smarteverything" {
		t.Fatalf("source %q type %q", options.MountOptions.FsName, options.MountOptions.Name)
	}
}
