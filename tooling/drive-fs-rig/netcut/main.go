package main

import (
	"flag"
	"fmt"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"
)

type routeFlags []string

func (f *routeFlags) String() string { return strings.Join(*f, ",") }

func (f *routeFlags) Set(value string) error {
	*f = append(*f, value)
	return nil
}

func start(specs []string, controlPath string) (*proxy, net.Listener, error) {
	p := &proxy{routes: map[string]*route{}}
	for _, spec := range specs {
		parts := strings.SplitN(spec, "=", 3)
		if len(parts) != 3 {
			p.shutdown()
			return nil, nil, fmt.Errorf("route %q must be name=listen=target", spec)
		}
		ln, err := net.Listen("tcp", parts[1])
		if err != nil {
			p.shutdown()
			return nil, nil, err
		}
		r := newRoute(parts[0], parts[2], ln)
		p.routes[parts[0]] = r
		go r.serve()
	}
	control, err := net.Listen("unix", controlPath)
	if err != nil {
		p.shutdown()
		return nil, nil, err
	}
	go p.control(control)
	return p, control, nil
}

func main() {
	var routes routeFlags
	flag.Var(&routes, "route", "name=listen address=target address (repeatable)")
	controlPath := flag.String("control", "", "unix socket path for commands")
	flag.Parse()
	if *controlPath == "" || len(routes) == 0 {
		fmt.Fprintln(os.Stderr, "netcut: -control and at least one -route are required")
		os.Exit(2)
	}
	p, control, err := start(routes, *controlPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "netcut:", err)
		os.Exit(1)
	}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	control.Close()
	p.shutdown()
	os.Remove(*controlPath)
}
