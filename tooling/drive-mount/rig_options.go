package main

import (
	"fmt"
	"os"
	"strings"
)

const rigOptionsVariable = "SE_DRIVE_MOUNT_RIG"

type rigOptions struct {
	allowOther  bool
	directMount bool
}

var rigMount = rigOptionsFromEnvironment()

func parseRigOptions(value string) (rigOptions, error) {
	var options rigOptions
	if value == "" {
		return options, nil
	}
	for _, name := range strings.Split(value, ",") {
		switch name {
		case "allow_other":
			options.allowOther = true
		case "direct_mount":
			options.directMount = true
		default:
			return rigOptions{}, fmt.Errorf("%s: unknown option %q (allow_other and direct_mount are the rig options)", rigOptionsVariable, name)
		}
	}
	return options, nil
}

func rigOptionsFromEnvironment() rigOptions {
	options, err := parseRigOptions(os.Getenv(rigOptionsVariable))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	return options
}

func rigMountFlags() (allowOther, directMount bool) {
	return rigMount.allowOther, rigMount.directMount
}
