package main

import (
	"context"
	"errors"
	"syscall"
	"testing"
	"time"
)

func TestParseMountOptionsFollowsTheLastAtimeChoice(t *testing.T) {
	cases := []struct {
		names    []string
		want     mountOptions
		note     bool
		strict   bool
		readOnly bool
	}{
		{nil, mountOptions{atime: atimeRelative}, true, false, false},
		{[]string{"strictatime"}, mountOptions{atime: atimeStrict}, true, true, false},
		{[]string{"noatime"}, mountOptions{atime: atimeNever}, false, false, false},
		{[]string{"noatime", "relatime", "nodiratime"}, mountOptions{atime: atimeRelative}, true, false, false},
		{[]string{"strictatime", "ro"}, mountOptions{atime: atimeStrict, readOnly: true}, false, true, true},
		{[]string{"ro", "rw", "defaults"}, mountOptions{atime: atimeRelative}, true, false, false},
	}
	for _, c := range cases {
		got, err := parseMountOptions(c.names)
		if err != nil {
			t.Fatalf("%v: %v", c.names, err)
		}
		if got != c.want {
			t.Fatalf("%v: got %+v, want %+v", c.names, got, c.want)
		}
		note, strict := got.notesAccess()
		if note != c.note || strict != c.strict {
			t.Fatalf("%v: notes access %t strict %t, want %t %t", c.names, note, strict, c.note, c.strict)
		}
	}
}

func TestParseMountOptionsRefusesAnUnknownOption(t *testing.T) {
	if _, err := parseMountOptions([]string{"relatime", "sync"}); err == nil {
		t.Fatal("an unknown option was accepted")
	}
}

func TestReadOnlySourceRefusesEveryChange(t *testing.T) {
	src := mountOptions{readOnly: true}.source(nil)
	ctx := context.Background()
	refusals := map[string]error{}
	_, _, refusals["create"] = src.Create(ctx, CreateArgs{})
	_, refusals["open for writing"] = src.OpenWrite(ctx, 2, false)
	_, _, refusals["tmpfile"] = src.Tmpfile(ctx, CreateArgs{})
	_, refusals["mkdir"] = src.Mkdir(ctx, CreateArgs{})
	_, refusals["mknod"] = src.Mknod(ctx, CreateArgs{})
	_, refusals["symlink"] = src.Symlink(ctx, CreateArgs{})
	_, refusals["link"] = src.Link(ctx, 2, 1, "x")
	refusals["unlink"] = src.Unlink(ctx, 1, "x")
	refusals["rmdir"] = src.Rmdir(ctx, 1, "x")
	refusals["rename"] = src.Rename(ctx, RenameArgs{})
	_, refusals["setattr"] = src.Setattr(ctx, SetattrArgs{})
	refusals["setxattr"] = src.Setxattr(ctx, 2, "user.a", nil, 0)
	refusals["removexattr"] = src.Removexattr(ctx, 2, "user.a")
	_, refusals["access"] = src.Access(ctx, 2, false)
	for name, err := range refusals {
		if !errors.Is(err, syscall.EROFS) {
			t.Fatalf("%s: got %v, want EROFS", name, err)
		}
	}
}

type attrSource struct {
	InodeSource
	attr Attr
}

func (s attrSource) Getattr(context.Context, uint64) (Attr, error) { return s.attr, nil }

func TestAccessDueFollowsRelatime(t *testing.T) {
	now := time.Now().UnixNano()
	relatime := mountOptions{atime: atimeRelative}
	cases := []struct {
		name string
		attr Attr
		want bool
	}{
		{"read before the last change", Attr{AtimeNs: now - 10, MtimeNs: now - 5, CtimeNs: now - 5}, true},
		{"read after the last change", Attr{AtimeNs: now - 1, MtimeNs: now - 5, CtimeNs: now - 5}, false},
		{"read a day ago", Attr{AtimeNs: now - relatimeWindowNs, MtimeNs: now - 2*relatimeWindowNs, CtimeNs: now - 2*relatimeWindowNs}, true},
	}
	for _, c := range cases {
		if got := accessDue(context.Background(), attrSource{attr: c.attr}, relatime, 1); got != c.want {
			t.Fatalf("%s: due %t, want %t", c.name, got, c.want)
		}
	}
	fresh := attrSource{attr: Attr{AtimeNs: now, MtimeNs: now - 5, CtimeNs: now - 5}}
	if !accessDue(context.Background(), fresh, mountOptions{atime: atimeStrict}, 1) {
		t.Fatal("strictatime skipped an access")
	}
	if accessDue(context.Background(), fresh, mountOptions{atime: atimeNever}, 1) {
		t.Fatal("noatime noted an access")
	}
}
