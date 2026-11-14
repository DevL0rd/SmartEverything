//go:build windows

package main

import (
	"encoding/binary"
	"os"

	"golang.org/x/sys/windows"
)

const (
	fsctlSetSparse      = 0x900C4
	fsctlSetZeroData    = 0x980C8
	fileStandardInfo    = 1
	standardInfoBytes   = 24
	zeroDataRequestSize = 16
)

func markSparse(f *os.File) error {
	var returned uint32
	return windows.DeviceIoControl(windows.Handle(f.Fd()), fsctlSetSparse, nil, 0, nil, 0, &returned, nil)
}

func punchHole(f *os.File, off, length int64) error {
	var request [zeroDataRequestSize]byte
	binary.LittleEndian.PutUint64(request[0:8], uint64(off))
	binary.LittleEndian.PutUint64(request[8:16], uint64(off+length))
	var returned uint32
	return windows.DeviceIoControl(windows.Handle(f.Fd()), fsctlSetZeroData, &request[0], zeroDataRequestSize, nil, 0, &returned, nil)
}

func allocatedBytes(f *os.File) (int64, error) {
	var info [standardInfoBytes]byte
	if err := windows.GetFileInformationByHandleEx(windows.Handle(f.Fd()), fileStandardInfo, &info[0], standardInfoBytes); err != nil {
		return 0, err
	}
	return int64(binary.LittleEndian.Uint64(info[0:8])), nil
}

func diskFree(dir string) (int64, error) {
	name, err := windows.UTF16PtrFromString(dir)
	if err != nil {
		return 0, err
	}
	var free, total, all uint64
	if err := windows.GetDiskFreeSpaceEx(name, &free, &total, &all); err != nil {
		return 0, err
	}
	return int64(free), nil
}
