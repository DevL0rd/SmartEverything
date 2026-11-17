package main

import (
	"encoding/json"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRangeSetMatchesABitmapModel(t *testing.T) {
	rng := rand.New(rand.NewSource(3))
	for round := 0; round < 300; round++ {
		var set rangeSet
		model := make([]bool, 200)
		for step := 0; step < 40; step++ {
			a := uint64(rng.Intn(200))
			b := a + uint64(rng.Intn(60))
			if b > 200 {
				b = 200
			}
			switch rng.Intn(3) {
			case 0:
				set.add(a, b)
				for i := a; i < b; i++ {
					model[i] = true
				}
			case 1:
				set.remove(a, b)
				for i := a; i < b; i++ {
					model[i] = false
				}
			case 2:
				set.cut(a)
				for i := a; i < 200; i++ {
					model[i] = false
				}
			}
			for i := 0; i < 200; i++ {
				_, in := set.at(uint64(i))
				if in != model[i] {
					t.Fatalf("round %d step %d: position %d is %v want %v spans %v", round, step, i, in, model[i], set.spans)
				}
			}
			for i := 1; i < len(set.spans); i++ {
				if set.spans[i-1][1] >= set.spans[i][0] {
					t.Fatalf("spans not disjoint and separated: %v", set.spans)
				}
			}
			var total uint64
			for _, m := range model {
				if m {
					total++
				}
			}
			if set.total() != total {
				t.Fatalf("total %d want %d", set.total(), total)
			}
		}
	}
}

func TestRangeSetIntersectSubtractCoverAndNext(t *testing.T) {
	a := spansToSet([][2]uint64{{0, 10}, {20, 30}})
	b := spansToSet([][2]uint64{{5, 25}})
	got := a.intersect(b)
	if len(got.spans) != 2 || got.spans[0] != [2]uint64{5, 10} || got.spans[1] != [2]uint64{20, 25} {
		t.Fatalf("%v", got.spans)
	}
	a.subtract(b)
	if len(a.spans) != 2 || a.spans[0] != [2]uint64{0, 5} || a.spans[1] != [2]uint64{25, 30} {
		t.Fatalf("%v", a.spans)
	}
	if !a.covers(1, 4) || a.covers(4, 6) || !a.covers(3, 3) {
		t.Fatal("covers")
	}
	if next, ok := a.nextStart(5); !ok || next != 25 {
		t.Fatalf("next %d %v", next, ok)
	}
}

func TestJournalRecordsSurviveAReload(t *testing.T) {
	j, err := openJournal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer j.close()
	id, _ := newSessionID()
	rec := journalRecord{ID: id, Ino: 7, Phase: phaseSealed, Ranges: [][2]uint64{{1, 5}}, Unit: &unitRecord{Commit: 9, BeginKey: "aa", EndKey: "bb", WrittenNs: 1_763_100_000_123_456_789}}
	if err := j.save(rec); err != nil {
		t.Fatal(err)
	}
	if err := j.saveDurable(rec); err != nil {
		t.Fatal(err)
	}
	got, err := j.load()
	if err != nil || len(got) != 1 || got[0].Unit == nil || got[0].Unit.Commit != 9 || got[0].Ranges[0] != [2]uint64{1, 5} {
		t.Fatalf("%+v %v", got, err)
	}
	if err := j.remove(id); err != nil {
		t.Fatal(err)
	}
	if left, _ := j.load(); len(left) != 0 {
		t.Fatal("record left")
	}
}

func TestJournalRefusesAUnitWithoutAWriteTime(t *testing.T) {
	j, err := openJournal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer j.close()
	id, _ := newSessionID()
	if err := j.save(journalRecord{ID: id, Ino: 7, Phase: phaseSealed, Unit: &unitRecord{Commit: 9, BeginKey: "aa", EndKey: "bb"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := j.load(); err == nil || !strings.Contains(err.Error(), "no write time") {
		t.Fatalf("load: %v, want a refusal naming the missing write time", err)
	}
}

func TestTheSessionLogIgnoresATornLastLineAndMovesOldRecordFilesIn(t *testing.T) {
	dir := t.TempDir()
	old, _ := newSessionID()
	raw, _ := json.Marshal(journalRecord{ID: old, Ino: 3, Phase: phaseSealed})
	if err := os.WriteFile(filepath.Join(dir, old+".json"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	j, err := openJournal(dir)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := newSessionID()
	if err := j.save(journalRecord{ID: id, Ino: 4, Phase: phaseSealed}); err != nil {
		t.Fatal(err)
	}
	j.close()
	if _, err := os.Stat(filepath.Join(dir, old+".json")); !os.IsNotExist(err) {
		t.Fatal("the old record file was kept beside the log")
	}
	f, err := os.OpenFile(filepath.Join(dir, sessionsFile), os.O_WRONLY|os.O_APPEND, 0)
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString(`{"op":"set","rec":{"id":"torn`)
	f.Close()
	j, err = openJournal(dir)
	if err != nil {
		t.Fatalf("a torn last line must not stop the helper: %v", err)
	}
	defer j.close()
	got, err := j.load()
	if err != nil || len(got) != 2 || got[0].ID != old || got[1].ID != id {
		t.Fatalf("%+v %v", got, err)
	}
}

func TestRemovedSessionsCompactTheLog(t *testing.T) {
	dir := t.TempDir()
	j, err := openJournal(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer j.close()
	for range compactLines {
		id, _ := newSessionID()
		if err := j.save(journalRecord{ID: id, Ino: 1, Phase: phaseSealed}); err != nil {
			t.Fatal(err)
		}
		if err := j.remove(id); err != nil {
			t.Fatal(err)
		}
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		info, err := os.Stat(filepath.Join(dir, sessionsFile))
		if err == nil && info.Size() == 0 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("the log kept %d bytes for no live session", info.Size())
		}
		time.Sleep(5 * time.Millisecond)
	}
}
