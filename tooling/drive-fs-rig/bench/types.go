package main

import "time"

const (
	mib = 1 << 20

	seqSizeMiB  = 1024
	randSizeMiB = 256
	officeBytes = 10 * mib
	officeSaves = 20
	randBlock   = 4096
	randOps     = 16384
	smallBytes  = 4096
	fileCount   = 10000

	seqFile    = "seq.bin"
	randFile   = "rand.bin"
	listFolder = "listdir"
	officeFile = "office.odt"
	treeFolder = "tree"
	treeCount  = "tree.count"
	cloneName  = "clone"
)

type Sizes struct {
	SeqMiB      int
	RandMiB     int
	RandOps     int
	Files       int
	OfficeMiB   int
	Saves       int
	CreateFiles int
	TolerateEIO bool
}

func defaultSizes() Sizes {
	return Sizes{
		SeqMiB:    seqSizeMiB,
		RandMiB:   randSizeMiB,
		RandOps:   randOps,
		Files:     fileCount,
		OfficeMiB: officeBytes / mib,
		Saves:     officeSaves,
	}
}

type Sources struct {
	Tarball string
	Mirror  string
}

type Drain struct {
	StatusLog string
	Exec      string
	Tolerate  bool
	Mount     string
	IdleLimit time.Duration
}

type Result struct {
	Workload       string  `json:"workload"`
	Kind           string  `json:"kind,omitempty"`
	Run            int     `json:"run,omitempty"`
	Seconds        float64 `json:"seconds"`
	CloseSeconds   float64 `json:"closeSeconds"`
	DrainSeconds   float64 `json:"drainSeconds"`
	StalledPending int64   `json:"stalledPending,omitempty"`
	Bytes          int64   `json:"bytes"`
	Ops            int64   `json:"ops"`
	Threads        int     `json:"threads"`
	Errors         int64   `json:"errors,omitempty"`
}

type Outcome struct {
	Bytes   int64
	Ops     int64
	Threads int
	Errors  int64
}
