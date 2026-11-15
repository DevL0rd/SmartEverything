package main

import (
	"context"
	"testing"

	"github.com/smarteverything/drive-mount/wire"
)

func namesOf(entries []wire.DirEntry) []string {
	out := make([]string, 0, len(entries))
	for _, e := range entries {
		out = append(out, e.Name)
	}
	return out
}

func fiveFiles(t *testing.T) (*fakeHub, *blockCache, wire.Root) {
	t.Helper()
	hub := newFakeHub()
	for _, name := range []string{"a", "b", "c", "d", "e"} {
		hub.file(hub.rootIno, name, []byte(name))
	}
	c, root := attached(t, hub, cacheDirFor(t))
	return hub, c, root
}

func TestAttachIsAnsweredOnceAndRemembered(t *testing.T) {
	hub := newFakeHub()
	c, root := attached(t, hub, cacheDirFor(t))
	if root.Root != hub.root || root.Ino != hub.rootIno || root.Seq != 7 || root.Attr.Type != wire.InodeTypeDirectory {
		t.Fatalf("root %+v", root)
	}
	again, err := c.Attach(context.Background(), hub.placement)
	if err != nil || again.Ino != root.Ino || hub.count(wire.OpAttach) != 1 {
		t.Fatalf("second attach: %v, %d hub calls", err, hub.count(wire.OpAttach))
	}
}

func TestLookupKeepsAnswersAndNegativesUntilAPushInvalidatesThem(t *testing.T) {
	hub := newFakeHub()
	file := hub.file(hub.rootIno, "a.txt", []byte("hello"))
	c, root := attached(t, hub, cacheDirFor(t))
	first := lookup(t, c, root.Ino, "a.txt")
	if first.Ino != file || first.Attr.Size != 5 {
		t.Fatalf("entry %+v", first)
	}
	lookup(t, c, root.Ino, "a.txt")
	for range 2 {
		if _, err := c.Lookup(context.Background(), root.Ino, "missing"); !remoteCode(err, wire.ErrENOENT) {
			t.Fatalf("missing name: %v", err)
		}
	}
	if hub.count(wire.OpLookup) != 2 {
		t.Fatalf("%d lookups, want one hit and one miss", hub.count(wire.OpLookup))
	}
	hub.file(hub.rootIno, "missing", []byte("now"))
	c.Changed(wire.Changed{Root: hub.root, Seq: 8, Entries: []wire.NameRef{{Parent: root.Ino, Name: "missing"}}})
	if got := lookup(t, c, root.Ino, "missing"); got.Attr.Size != 3 {
		t.Fatalf("name pushed as changed was not looked up again: %+v", got)
	}
}

func TestReaddirServesPagesFromOneFetchedListing(t *testing.T) {
	hub, c, root := fiveFiles(t)
	all, err := c.Readdir(context.Background(), root.Ino, 0)
	if err != nil || all.Next != nil {
		t.Fatalf("first page: %v, %+v", err, all)
	}
	if got := namesOf(all.Entries); len(got) != 5 || got[0] != "a" || got[4] != "e" {
		t.Fatalf("names %v", got)
	}
	if all.Entries[2].Attr.Size != 1 || all.Entries[2].Ino == 0 {
		t.Fatalf("entry carries no attributes: %+v", all.Entries[2])
	}
	tail, err := c.Readdir(context.Background(), root.Ino, 3)
	if err != nil || len(tail.Entries) != 2 || tail.Entries[0].Name != "d" {
		t.Fatalf("tail %v %+v", err, tail)
	}
	end, err := c.Readdir(context.Background(), root.Ino, 5)
	if err != nil || len(end.Entries) != 0 {
		t.Fatalf("end %v %+v", err, end)
	}
	if hub.count(wire.OpReaddir) != 3 {
		t.Fatalf("%d hub pages for one listing of 5 entries at 2 per page", hub.count(wire.OpReaddir))
	}
}

func TestListingAnswersLookupsAndMissesWithoutTheHub(t *testing.T) {
	hub, c, root := fiveFiles(t)
	if _, err := c.Readdir(context.Background(), root.Ino, 0); err != nil {
		t.Fatal(err)
	}
	if got := lookup(t, c, root.Ino, "c"); got.Attr.Size != 1 {
		t.Fatalf("entry %+v", got)
	}
	if _, err := c.Lookup(context.Background(), root.Ino, "zz"); !remoteCode(err, wire.ErrENOENT) {
		t.Fatalf("miss: %v", err)
	}
	if hub.count(wire.OpLookup) != 0 {
		t.Fatalf("%d lookups after a full listing", hub.count(wire.OpLookup))
	}
}

func TestPushedEntryChangeRelistsTheFolder(t *testing.T) {
	hub, c, root := fiveFiles(t)
	if _, err := c.Readdir(context.Background(), root.Ino, 0); err != nil {
		t.Fatal(err)
	}
	hub.file(hub.rootIno, "f", []byte("ff"))
	c.Changed(wire.Changed{Root: hub.root, Seq: 8, Entries: []wire.NameRef{{Parent: root.Ino, Name: "f"}}})
	page, err := c.Readdir(context.Background(), root.Ino, 0)
	if err != nil || len(page.Entries) != 6 || page.Entries[5].Name != "f" {
		t.Fatalf("listing after a pushed new name: %v %v", err, namesOf(page.Entries))
	}
}

func TestPushedInodeChangeRelistsTheFoldersThatShowIt(t *testing.T) {
	hub, c, root := fiveFiles(t)
	page, err := c.Readdir(context.Background(), root.Ino, 0)
	if err != nil {
		t.Fatal(err)
	}
	b := page.Entries[1]
	hub.rewrite(b.Ino, []byte("twelve bytes"))
	c.Changed(wire.Changed{Root: hub.root, Seq: 8, Inodes: []uint64{b.Ino}})
	c.tasks.Wait()
	page, err = c.Readdir(context.Background(), root.Ino, 0)
	if err != nil || page.Entries[1].Attr.Size != 12 {
		t.Fatalf("listing after a pushed change: %v %+v", err, page.Entries[1].Attr)
	}
	attr, err := c.Getattr(context.Background(), b.Ino)
	if err != nil || attr.Size != 12 {
		t.Fatalf("attr %v %+v", err, attr)
	}
}

func TestRemovedInodeIsForgotten(t *testing.T) {
	hub, c, root := fiveFiles(t)
	page, err := c.Readdir(context.Background(), root.Ino, 0)
	if err != nil {
		t.Fatal(err)
	}
	gone := page.Entries[0]
	hub.remove(hub.rootIno, "a")
	c.Changed(wire.Changed{Root: hub.root, Seq: 8, Removed: []uint64{gone.Ino}, Entries: []wire.NameRef{{Parent: root.Ino, Name: "a"}}})
	if _, err := c.Lookup(context.Background(), root.Ino, "a"); !remoteCode(err, wire.ErrENOENT) {
		t.Fatalf("removed name: %v", err)
	}
	page, err = c.Readdir(context.Background(), root.Ino, 0)
	if err != nil || len(page.Entries) != 4 {
		t.Fatalf("listing %v %v", err, namesOf(page.Entries))
	}
}

func TestResetMakesEveryAnswerStaleAndTellsTheFilesystem(t *testing.T) {
	hub, c, root := fiveFiles(t)
	if _, err := c.Readdir(context.Background(), root.Ino, 0); err != nil {
		t.Fatal(err)
	}
	var got []Change
	c.OnChange(func(ch Change) { got = append(got, ch) })
	c.Reset(wire.Reset{Root: hub.root, Seq: 20})
	if len(got) != 1 || !got[0].Reset || got[0].Root != hub.root {
		t.Fatalf("changes %+v", got)
	}
	before := hub.count(wire.OpReaddir)
	if _, err := c.Readdir(context.Background(), root.Ino, 0); err != nil || hub.count(wire.OpReaddir) == before {
		t.Fatalf("listing after a reset must be fetched again: %v", err)
	}
	if seqs := c.Seqs(); len(seqs) != 1 || seqs[0].Seq != 20 {
		t.Fatalf("seqs %+v", seqs)
	}
}

func TestAMetadataOutageServesLastKnownAnswers(t *testing.T) {
	hub, c, root := fiveFiles(t)
	if _, err := c.Readdir(context.Background(), root.Ino, 0); err != nil {
		t.Fatal(err)
	}
	c.Reset(wire.Reset{Root: hub.root, Seq: 9})
	hub.setDown(wire.ErrConnLost)
	if page, err := c.Readdir(context.Background(), root.Ino, 0); err != nil || len(page.Entries) != 5 {
		t.Fatalf("stale listing: %v", err)
	}
	if got, err := c.Lookup(context.Background(), root.Ino, "b"); err != nil || got.Attr.Size != 1 {
		t.Fatalf("stale lookup: %v", err)
	}
	if _, err := c.Getattr(context.Background(), root.Ino); err != nil {
		t.Fatalf("stale attr: %v", err)
	}
}

func TestOfflineStartServesPersistedFolders(t *testing.T) {
	hub := newFakeHub()
	sub := hub.dir(hub.rootIno, "docs")
	hub.file(sub, "note.txt", []byte("12345"))
	hub.link(sub, "next", "note.txt")
	dir := cacheDirFor(t)
	c, root := attached(t, hub, dir)
	docs := lookup(t, c, root.Ino, "docs")
	if _, err := c.Readdir(context.Background(), docs.Ino, 0); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Readlink(context.Background(), lookup(t, c, docs.Ino, "next").Ino); err != nil {
		t.Fatal(err)
	}
	c.Close()
	offline := newBlockCache(hub, dir)
	defer offline.Close()
	offline.SetReachable(false)
	hub.setDown(wire.ErrNoRoute)
	again, err := offline.Attach(context.Background(), hub.placement)
	if err != nil || again.Ino != root.Ino {
		t.Fatalf("offline attach: %v %+v", err, again)
	}
	got, err := offline.Lookup(context.Background(), root.Ino, "docs")
	if err != nil || got.Ino != docs.Ino {
		t.Fatalf("offline lookup: %v %+v", err, got)
	}
	page, err := offline.Readdir(context.Background(), docs.Ino, 0)
	if err != nil || len(page.Entries) != 2 || page.Entries[0].Name != "next" {
		t.Fatalf("offline listing: %v %v", err, namesOf(page.Entries))
	}
	if _, err := offline.Lookup(context.Background(), docs.Ino, "other"); !remoteCode(err, wire.ErrENOENT) {
		t.Fatalf("a name missing from a complete stored listing: %v", err)
	}
	if _, err := offline.Lookup(context.Background(), page.Entries[0].Ino, "x"); err == nil {
		t.Fatal("a folder never listed has no offline answer")
	}
	if target, err := offline.Readlink(context.Background(), page.Entries[0].Ino); err != nil || target != "note.txt" {
		t.Fatalf("offline readlink: %v %q", err, target)
	}
	if _, err := offline.Attach(context.Background(), "33333333-3333-4333-8333-333333333333"); err == nil {
		t.Fatal("an unknown placement has no offline root")
	}
}

func TestReadlinkXattrsAndStatfs(t *testing.T) {
	hub := newFakeHub()
	link := hub.link(hub.rootIno, "l", "somewhere")
	file := hub.file(hub.rootIno, "f", []byte("x"))
	hub.nodes[file].xattrs["user.k"] = []byte("v")
	c, root := attached(t, hub, cacheDirFor(t))
	ctx := context.Background()
	lookup(t, c, root.Ino, "l")
	lookup(t, c, root.Ino, "f")
	for range 2 {
		if target, err := c.Readlink(ctx, link); err != nil || target != "somewhere" {
			t.Fatalf("readlink %v %q", err, target)
		}
	}
	if hub.count(wire.OpReadlink) != 1 {
		t.Fatalf("readlink asked %d times", hub.count(wire.OpReadlink))
	}
	for range 2 {
		if v, err := c.Getxattr(ctx, file, "user.k"); err != nil || string(v) != "v" {
			t.Fatalf("getxattr %v %q", err, v)
		}
		if _, err := c.Getxattr(ctx, file, "security.capability"); !remoteCode(err, wire.ErrENODATA) {
			t.Fatalf("absent xattr: %v", err)
		}
	}
	if hub.count(wire.OpGetxattr) != 2 {
		t.Fatalf("getxattr asked %d times, hits and misses must both be kept", hub.count(wire.OpGetxattr))
	}
	for range 2 {
		if names, err := c.Listxattr(ctx, file); err != nil || len(names) != 1 || names[0] != "user.k" {
			t.Fatalf("listxattr %v %v", err, names)
		}
	}
	if hub.count(wire.OpListxattr) != 1 {
		t.Fatalf("listxattr asked %d times", hub.count(wire.OpListxattr))
	}
	hub.nodes[file].xattrs["user.k"] = []byte("w")
	c.Changed(wire.Changed{Root: hub.root, Seq: 8, Inodes: []uint64{file}})
	if v, err := c.Getxattr(ctx, file, "user.k"); err != nil || string(v) != "w" {
		t.Fatalf("xattr after a push: %v %q", err, v)
	}
	space, err := c.Statfs(ctx, root.Ino)
	if err != nil || space.Free != 60 || space.Bsize != 4096 {
		t.Fatalf("statfs %v %+v", err, space)
	}
	c.SetReachable(false)
	hub.setDown(wire.ErrNoRoute)
	if again, err := c.Statfs(ctx, root.Ino); err != nil || again != space {
		t.Fatalf("offline statfs %v %+v", err, again)
	}
}
