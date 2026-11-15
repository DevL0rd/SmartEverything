package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

const platformName = "linux"

const (
	maxUserBgreqPath      = "/sys/module/fuse/parameters/max_user_bgreq"
	maxUserCongThreshPath = "/sys/module/fuse/parameters/max_user_congthresh"
	maxPagesLimitPath     = "/proc/sys/fs/fuse/max_pages_limit"
)

func readKernelNumber(path string) (int64, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return 0, fmt.Errorf("kernel limit: %w", err)
	}
	value, err := strconv.ParseInt(strings.TrimSpace(string(raw)), 10, 64)
	if err != nil {
		return 0, fmt.Errorf("kernel limit: %s holds %q, not a number", path, strings.TrimSpace(string(raw)))
	}
	return value, nil
}

func readKernelLimitsFrom(bgreq, congthresh, pages string) (*kernelLimits, error) {
	limits := &kernelLimits{PageSize: pageSize()}
	var err error
	if limits.MaxUserBgreq, err = readKernelNumber(bgreq); err != nil {
		return nil, err
	}
	if limits.MaxUserCongThresh, err = readKernelNumber(congthresh); err != nil {
		return nil, err
	}
	if limits.MaxPagesLimit, err = readKernelNumber(pages); err != nil {
		return nil, err
	}
	return limits, nil
}

func readKernelLimits() (*kernelLimits, error) {
	return readKernelLimitsFrom(maxUserBgreqPath, maxUserCongThreshPath, maxPagesLimitPath)
}
