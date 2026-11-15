package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
)

const (
	baseKind      = "nfs"
	baseTolerance = 0.10
)

type Group struct {
	Workload string
	Kind     string
	Results  []Result
}

func readResults(source io.Reader) ([]Result, error) {
	var results []Result
	scanner := bufio.NewScanner(source)
	scanner.Buffer(make([]byte, 0, 1<<16), 1<<24)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var result Result
		if err := json.Unmarshal([]byte(line), &result); err != nil {
			return nil, fmt.Errorf("result line %q: %w", line, err)
		}
		results = append(results, result)
	}
	return results, scanner.Err()
}

func group(results []Result) map[string]map[string][]Result {
	grouped := map[string]map[string][]Result{}
	for _, result := range results {
		if grouped[result.Workload] == nil {
			grouped[result.Workload] = map[string][]Result{}
		}
		grouped[result.Workload][result.Kind] = append(grouped[result.Workload][result.Kind], result)
	}
	return grouped
}

func seconds(results []Result) []float64 {
	values := make([]float64, len(results))
	for index, result := range results {
		values[index] = result.Seconds
	}
	return values
}

func field(results []Result, pick func(Result) float64) float64 {
	values := make([]float64, len(results))
	for index, result := range results {
		values[index] = pick(result)
	}
	return summarize(values).Median
}

func throughput(name string) bool {
	return strings.HasPrefix(name, "seq-") || name == "office-save"
}

func rate(name string, results []Result, total Summary) string {
	if len(results) == 0 || total.Median == 0 {
		return "-"
	}
	first := results[0]
	if throughput(name) && first.Bytes > 0 {
		return fmt.Sprintf("%.1f MB/s", float64(first.Bytes)/float64(mib)/total.Median)
	}
	if first.Ops > 1 {
		return fmt.Sprintf("%.1f ops/s", float64(first.Ops)/total.Median)
	}
	return "-"
}

func limit(base Summary) float64 {
	tolerance := baseTolerance
	if base.Spread > tolerance {
		tolerance = base.Spread
	}
	return 1 + tolerance
}

type Finding struct {
	Workload string
	Kind     string
	Ratio    float64
	Limit    float64
	Close    float64
	Drain    float64
}

func render(results []Result, title string, order []string) (string, []Finding) {
	grouped := group(results)
	kinds := map[string]bool{}
	for _, byKind := range grouped {
		for kind := range byKind {
			kinds[kind] = true
		}
	}
	others := make([]string, 0, len(kinds))
	for kind := range kinds {
		if kind != baseKind {
			others = append(others, kind)
		}
	}
	sort.Strings(others)
	names := append([]string(nil), order...)
	known := map[string]bool{}
	for _, name := range names {
		known[name] = true
	}
	extra := []string{}
	for name := range grouped {
		if !known[name] {
			extra = append(extra, name)
		}
	}
	sort.Strings(extra)
	names = append(names, extra...)

	var out strings.Builder
	if title != "" {
		fmt.Fprintf(&out, "# %s\n\n", title)
	}
	var findings []Finding
	hasBase := false
	fmt.Fprintf(&out, "| workload | kind | runs | median s | p95 s | spread | rate | close s | drain s | ratio to %s |\n", baseKind)
	out.WriteString("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n")
	for _, name := range names {
		byKind, ok := grouped[name]
		if !ok {
			continue
		}
		base := summarize(seconds(byKind[baseKind]))
		if base.Count > 0 {
			hasBase = true
		}
		for _, kind := range append([]string{baseKind}, others...) {
			runs, present := byKind[kind]
			if !present {
				continue
			}
			total := summarize(seconds(runs))
			ratio := "-"
			if kind != baseKind && base.Count > 0 && base.Median > 0 {
				value := total.Median / base.Median
				ratio = fmt.Sprintf("%.2f", value)
				if value > limit(base) {
					ratio += " over"
					findings = append(findings, Finding{
						Workload: name,
						Kind:     kind,
						Ratio:    value,
						Limit:    limit(base),
						Close:    field(runs, func(r Result) float64 { return r.CloseSeconds }),
						Drain:    field(runs, func(r Result) float64 { return r.DrainSeconds }),
					})
				}
			}
			fmt.Fprintf(&out, "| %s | %s | %d | %.3f | %.3f | %.0f%% | %s | %.3f | %.3f | %s |\n",
				name, kind, total.Count, total.Median, total.P95, total.Spread*100, rate(name, runs, total),
				field(runs, func(r Result) float64 { return r.CloseSeconds }),
				field(runs, func(r Result) float64 { return r.DrainSeconds }), ratio)
		}
	}
	out.WriteString("\n")
	if len(others) > 0 && hasBase {
		out.WriteString("## Findings\n\n")
		if len(findings) == 0 {
			out.WriteString("No workload is over its limit.\n")
		}
		for _, finding := range findings {
			fmt.Fprintf(&out, "- %s on %s: %.2f times %s (limit %.2f). Of the median, %.3f s is the time to close and %.3f s the wait for the upload queue to drain.\n",
				finding.Workload, finding.Kind, finding.Ratio, baseKind, finding.Limit, finding.Close, finding.Drain)
		}
	}
	return out.String(), findings
}
