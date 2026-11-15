package wire

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const goldenDir = "../../../packages/domain/test/drive/mount/golden"

func goldenFiles(t *testing.T) []string {
	t.Helper()
	files, err := filepath.Glob(filepath.Join(goldenDir, "*.bin"))
	if err != nil || len(files) < 80 {
		t.Fatalf("golden frames missing: %d files, %v", len(files), err)
	}
	return files
}

func TestGoldenFramesRoundTripByteForByte(t *testing.T) {
	for _, file := range goldenFiles(t) {
		name := strings.TrimSuffix(filepath.Base(file), ".bin")
		t.Run(name, func(t *testing.T) {
			golden, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			frame, err := DecodeFrame(golden)
			if err != nil {
				t.Fatalf("decode frame: %v", err)
			}
			meta, err := DecodeMeta(frame.Meta)
			if err != nil {
				t.Fatalf("decode meta: %v", err)
			}
			again, err := EncodeMeta(meta)
			if err != nil {
				t.Fatalf("encode meta: %v", err)
			}
			if !bytes.Equal(again, frame.Meta) {
				t.Fatalf("meta differs\n got %x\nwant %x", again, frame.Meta)
			}
			frame.Meta = again
			out, err := EncodeFrame(frame)
			if err != nil {
				t.Fatalf("encode frame: %v", err)
			}
			if !bytes.Equal(out, golden) {
				t.Fatalf("frame differs\n got %x\nwant %x", out, golden)
			}
		})
	}
}

func readGolden(t *testing.T, name string) Frame {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(goldenDir, name+".bin"))
	if err != nil {
		t.Fatal(err)
	}
	frame, err := DecodeFrame(raw)
	if err != nil {
		t.Fatal(err)
	}
	return frame
}

func goldenMeta(t *testing.T, name string) Meta {
	t.Helper()
	meta, err := DecodeMeta(readGolden(t, name).Meta)
	if err != nil {
		t.Fatal(err)
	}
	return meta
}

func TestHelloBuiltFromTypedResumeMatchesGolden(t *testing.T) {
	session := make([]byte, SessionBytes)
	for i := range session {
		session[i] = byte(9 + i*7)
	}
	resume := Resume{
		Seqs:    []RootSeq{{Root: "3f6f1a52-7c5b-4a77-9d5c-0a1f2d3e4b5c", Seq: 811}},
		Handles: []HeldHandle{{Handle: 12, Ino: 42}},
		Locks:   []HeldLock{{Ino: 42, Owner: 0xdeadbeefcafef00d, Lock: Lock{Type: LockTypeWrite, Start: 0, End: EndOfFile, Pid: 4321}}},
		Commits: []uint64{5, 6},
	}
	built, err := EncodeMeta(resume.meta(session))
	if err != nil {
		t.Fatal(err)
	}
	want := readGolden(t, "hello-request")
	if !bytes.Equal(built, want.Meta) {
		t.Fatalf("hello meta differs\n got %x\nwant %x", built, want.Meta)
	}
}

func TestEmptyResumeEncodesEmptyArraysAndNullSession(t *testing.T) {
	meta, err := EncodeMeta(Resume{}.meta(nil))
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := DecodeMeta(meta)
	if err != nil {
		t.Fatal(err)
	}
	if decoded[KeySession] != nil {
		t.Fatalf("session = %v, want null", decoded[KeySession])
	}
	for _, key := range []uint64{KeySeqs, KeyHandles, KeyLocks, KeyCommits} {
		if items, err := decoded.Array(key); err != nil || len(items) != 0 {
			t.Fatalf("key %d = %v, %v; want an empty array", key, decoded[key], err)
		}
	}
}

func TestTypedParsersReadTheGoldenReplies(t *testing.T) {
	attr, err := ParseAttr(mustMap(t, goldenMeta(t, "getattr-reply"), KeyAttr))
	if err != nil {
		t.Fatal(err)
	}
	if attr.Ino != 42 || attr.Nlink != 2 || attr.UID != nil || attr.GID == nil || *attr.GID != 1000 ||
		attr.Size != 5368709120 || attr.MtimeNs != 1763100001000000000 || attr.Etag != `W/"7"` || attr.Rev != 7 {
		t.Fatalf("attr = %+v", attr)
	}
	entry, err := ParseEntry(goldenMeta(t, "lookup-reply"))
	if err != nil || entry.Ino != 42 || entry.Attr.Ino != 42 {
		t.Fatalf("entry = %+v, %v", entry, err)
	}
	page, err := ParseDirPage(goldenMeta(t, "readdir-reply"))
	if err != nil || len(page.Entries) == 0 {
		t.Fatalf("page = %+v, %v", page, err)
	}
	more, err := ParseDirPage(goldenMeta(t, "readdir-reply-more"))
	if err != nil || len(more.Entries) != 0 || more.Next == nil || *more.Next != 77 {
		t.Fatalf("page more = %+v, %v", more, err)
	}
	if _, err := ParseStatfs(goldenMeta(t, "statfs-reply")); err != nil {
		t.Fatal(err)
	}
	if _, err := ParseRoot(goldenMeta(t, "attach-reply")); err != nil {
		t.Fatal(err)
	}
	if _, err := ParseCommitted(goldenMeta(t, "end-reply")); err != nil {
		t.Fatal(err)
	}
	if _, err := ParseNames(goldenMeta(t, "listxattr-reply")); err != nil {
		t.Fatal(err)
	}
	locked := goldenMeta(t, "getlk-reply")
	lock, err := ParseLock(locked[KeyLock])
	if err != nil || lock == nil || lock.End != EndOfFile {
		t.Fatalf("lock = %+v, %v", lock, err)
	}
	progress, err := ParseRanges(goldenMeta(t, "begin-reply")[KeyRanges], KeyRanges)
	if err != nil || len(progress) == 0 {
		t.Fatalf("ranges = %v, %v", progress, err)
	}
}

func TestPushFramesBecomeTypedActions(t *testing.T) {
	changed := readGolden(t, "push-changed")
	meta := goldenMeta(t, "push-changed")
	action, err := pushAction(changed.Op, meta)
	if err != nil {
		t.Fatal(err)
	}
	recorder := &recordingHandler{}
	action(recorder)
	if len(recorder.changed) != 1 || recorder.changed[0].Root == "" || len(recorder.changed[0].Entries) == 0 {
		t.Fatalf("changed = %+v", recorder.changed)
	}
	for _, name := range []string{"push-reset", "push-lock-lost"} {
		frame := readGolden(t, name)
		action, err := pushAction(frame.Op, goldenMeta(t, name))
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		action(recorder)
	}
	if len(recorder.reset) != 1 || len(recorder.lost) != 1 {
		t.Fatalf("reset %v lost %v", recorder.reset, recorder.lost)
	}
	if _, err := pushAction(OpRead, Meta{}); err == nil {
		t.Fatal("a request op must not be a push")
	}
}

func TestErrorFramesCarryTheCodeAndRev(t *testing.T) {
	plain, err := parseRemoteError(goldenMeta(t, "error-plain"))
	if err != nil || plain.Code == 0 || plain.HasRev {
		t.Fatalf("plain = %+v, %v", plain, err)
	}
	stale, err := parseRemoteError(goldenMeta(t, "error-stale"))
	if err != nil || stale.Code != ErrESTALE || !stale.HasRev {
		t.Fatalf("stale = %+v, %v", stale, err)
	}
}

func mustMap(t *testing.T, m Meta, key uint64) Meta {
	t.Helper()
	inner, err := m.Map(key)
	if err != nil {
		t.Fatal(err)
	}
	return inner
}
