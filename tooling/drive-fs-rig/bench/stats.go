package main

import (
	"math"
	"sort"
)

type Summary struct {
	Count  int
	Median float64
	P95    float64
	Min    float64
	Max    float64
	Spread float64
}

func summarize(values []float64) Summary {
	if len(values) == 0 {
		return Summary{}
	}
	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	count := len(sorted)
	median := sorted[count/2]
	if count%2 == 0 {
		median = (sorted[count/2-1] + sorted[count/2]) / 2
	}
	rank := int(math.Ceil(0.95*float64(count))) - 1
	spread := 0.0
	if median > 0 {
		spread = (sorted[count-1] - sorted[0]) / median
	}
	return Summary{Count: count, Median: median, P95: sorted[rank], Min: sorted[0], Max: sorted[count-1], Spread: spread}
}
