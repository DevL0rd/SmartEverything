package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"
)

const idleLimit = 10 * time.Minute

type options struct {
	flags    *flag.FlagSet
	dir      string
	name     string
	kind     string
	run      int
	sizes    Sizes
	sources  Sources
	drain    Drain
	input    string
	datasets string
	output   string
	title    string
	idleText string
	idle     time.Duration
	tolerate bool
}

func newOptions(command string) *options {
	o := &options{flags: flag.NewFlagSet(command, flag.ContinueOnError)}
	defaults := defaultSizes()
	o.flags.StringVar(&o.dir, "dir", "", "folder on the mount under test")
	o.flags.StringVar(&o.name, "workload", "", "workload name")
	o.flags.StringVar(&o.kind, "kind", "", "mount kind recorded in the result")
	o.flags.IntVar(&o.run, "run", 0, "run number recorded in the result")
	o.flags.IntVar(&o.sizes.SeqMiB, "seq-mib", defaults.SeqMiB, "sequential file size in MiB")
	o.flags.IntVar(&o.sizes.RandMiB, "rand-mib", defaults.RandMiB, "random access file size in MiB")
	o.flags.IntVar(&o.sizes.RandOps, "rand-ops", defaults.RandOps, "random operations per run")
	o.flags.IntVar(&o.sizes.Files, "files", defaults.Files, "small file count")
	o.flags.IntVar(&o.sizes.CreateFiles, "create-files", 0, "files the create workloads write (default: the small file count)")
	o.flags.BoolVar(&o.sizes.TolerateEIO, "tolerate-eio", false, "retry a create that failed with an input/output error without O_EXCL and count it instead of failing")
	o.flags.IntVar(&o.sizes.OfficeMiB, "office-mib", defaults.OfficeMiB, "office save file size in MiB")
	o.flags.IntVar(&o.sizes.Saves, "saves", defaults.Saves, "office saves per run")
	o.flags.StringVar(&o.sources.Tarball, "tarball", "", "git release tarball")
	o.flags.StringVar(&o.sources.Mirror, "mirror", "", "local git mirror")
	o.flags.StringVar(&o.drain.StatusLog, "status-log", "", "helper status log to wait on until uploads drain")
	o.flags.StringVar(&o.drain.Exec, "drain-exec", "", "shell command run after every workload that changes data, repeated until it exits 0, for mounts that upload in the background")
	o.flags.DurationVar(&o.idle, "drain-idle", idleLimit, "how long the helper may make no upload progress before the drain gives up")
	o.flags.BoolVar(&o.drain.Tolerate, "drain-tolerate", false, "when the drain gives up, finish the workload at the last upload progress and record the uploads left instead of failing")
	o.flags.StringVar(&o.drain.Mount, "status-mount", "", "mount id in the status log")
	o.flags.StringVar(&o.datasets, "datasets", "", "comma separated datasets to prepare: seq, rand, list, office (default all)")
	o.flags.StringVar(&o.input, "in", "", "results file, one JSON result per line")
	o.flags.StringVar(&o.output, "out", "", "report file")
	o.flags.StringVar(&o.title, "title", "Drive mount speed benchmark", "report title")
	return o
}

func (o *options) parse(args []string) error {
	if err := o.flags.Parse(args); err != nil {
		return err
	}
	o.drain.IdleLimit = o.idle
	return nil
}

func splitList(value string) []string {
	if value == "" {
		return nil
	}
	return strings.Split(value, ",")
}

func usage() error {
	return fmt.Errorf("usage: bench <run|prepare|cleanup|report|list> [flags]\nworkloads: %s", strings.Join(workloadNames(), ", "))
}

func runCommand(args []string) error {
	o := newOptions("run")
	if err := o.parse(args); err != nil {
		return err
	}
	if o.dir == "" || o.name == "" {
		return errors.New("run needs -dir and -workload")
	}
	result, err := measure(o.name, o.dir, o.sizes, o.sources, o.drain)
	if err != nil {
		return err
	}
	result.Kind = o.kind
	result.Run = o.run
	return json.NewEncoder(os.Stdout).Encode(result)
}

func prepareCommand(args []string) error {
	o := newOptions("prepare")
	if err := o.parse(args); err != nil {
		return err
	}
	if o.dir == "" {
		return errors.New("prepare needs -dir")
	}
	return prepare(o.dir, o.sizes, splitList(o.datasets), o.drain)
}

func cleanupCommand(args []string) error {
	o := newOptions("cleanup")
	if err := o.parse(args); err != nil {
		return err
	}
	if o.dir == "" {
		return errors.New("cleanup needs -dir")
	}
	return cleanup(o.dir, o.drain)
}

func reportCommand(args []string) error {
	o := newOptions("report")
	if err := o.parse(args); err != nil {
		return err
	}
	if o.input == "" {
		return errors.New("report needs -in")
	}
	source, err := os.Open(o.input)
	if err != nil {
		return err
	}
	defer source.Close()
	results, err := readResults(source)
	if err != nil {
		return err
	}
	text, _ := render(results, o.title, workloadNames())
	if o.output == "" {
		_, err = os.Stdout.WriteString(text)
		return err
	}
	return os.WriteFile(o.output, []byte(text), 0o644)
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, usage())
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "run":
		err = runCommand(os.Args[2:])
	case "prepare":
		err = prepareCommand(os.Args[2:])
	case "cleanup":
		err = cleanupCommand(os.Args[2:])
	case "report":
		err = reportCommand(os.Args[2:])
	case "list":
		fmt.Println(strings.Join(workloadNames(), "\n"))
	default:
		err = usage()
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
