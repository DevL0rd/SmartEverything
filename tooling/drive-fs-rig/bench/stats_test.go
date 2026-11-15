package main

import (
	"math"
	"testing"
)

func TestSummarizeOddAndEven(t *testing.T) {
	odd := summarize([]float64{5, 1, 3, 2, 4})
	if odd.Median != 3 || odd.Min != 1 || odd.Max != 5 || odd.P95 != 5 {
		t.Fatalf("odd summary %+v", odd)
	}
	if math.Abs(odd.Spread-4.0/3.0) > 1e-9 {
		t.Fatalf("spread %v", odd.Spread)
	}
	even := summarize([]float64{1, 2, 3, 10})
	if even.Median != 2.5 {
		t.Fatalf("even median %v", even.Median)
	}
}

func TestSummarizeEmpty(t *testing.T) {
	if summarize(nil).Count != 0 {
		t.Fatal("empty input must give an empty summary")
	}
}

func TestP95OfTwentyRuns(t *testing.T) {
	values := make([]float64, 20)
	for index := range values {
		values[index] = float64(index + 1)
	}
	if summarize(values).P95 != 19 {
		t.Fatalf("p95 %v", summarize(values).P95)
	}
}
