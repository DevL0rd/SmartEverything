package main

import "testing"

func TestRigOptionsAreOffUnlessThePassingEnvironmentNamesThem(t *testing.T) {
	cases := map[string]rigOptions{
		"":                         {},
		"allow_other":              {allowOther: true},
		"direct_mount":             {directMount: true},
		"allow_other,direct_mount": {allowOther: true, directMount: true},
		"direct_mount,allow_other": {allowOther: true, directMount: true},
	}
	for value, want := range cases {
		got, err := parseRigOptions(value)
		if err != nil || got != want {
			t.Fatalf("%q parsed to %+v, %v; want %+v", value, got, err, want)
		}
	}
}

func TestRigOptionsRejectAnythingElse(t *testing.T) {
	for _, value := range []string{"allow", "allow_other,", "dev", "allow_other direct_mount"} {
		if _, err := parseRigOptions(value); err == nil {
			t.Fatalf("%q must be rejected", value)
		}
	}
}

func TestRigFlagsAreOffWithoutTheEnvironment(t *testing.T) {
	if allowOther, directMount := rigMountFlags(); allowOther || directMount {
		t.Fatalf("flags must be off in a normal helper, got %v %v", allowOther, directMount)
	}
}
