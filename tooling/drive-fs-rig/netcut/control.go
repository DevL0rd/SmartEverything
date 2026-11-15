package main

import (
	"bufio"
	"fmt"
	"net"
	"sort"
	"strings"
)

var commandModes = map[string]mode{
	"cut":      modeCut,
	"cutreply": modeCutReply,
	"stall":    modeStall,
	"reset":    modeReset,
	"restore":  modeOpen,
}

type proxy struct {
	routes map[string]*route
}

func (p *proxy) targets(name string) ([]*route, error) {
	if name == "all" {
		out := make([]*route, 0, len(p.routes))
		for _, r := range p.routes {
			out = append(out, r)
		}
		return out, nil
	}
	if r, ok := p.routes[name]; ok {
		return []*route{r}, nil
	}
	var out []*route
	for key, r := range p.routes {
		if strings.HasPrefix(key, name+"-") {
			out = append(out, r)
		}
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("no route %q", name)
	}
	return out, nil
}

func (p *proxy) execute(line string) string {
	fields := strings.Fields(line)
	if len(fields) == 0 {
		return "error: empty command"
	}
	if fields[0] == "status" {
		names := make([]string, 0, len(p.routes))
		for name := range p.routes {
			names = append(names, name)
		}
		sort.Strings(names)
		lines := make([]string, 0, len(names))
		for _, name := range names {
			lines = append(lines, p.routes[name].status())
		}
		return "ok " + strings.Join(lines, ",")
	}
	next, known := commandModes[fields[0]]
	if !known {
		return "error: unknown command " + fields[0]
	}
	if len(fields) != 2 {
		return "error: " + fields[0] + " needs a route name"
	}
	routes, err := p.targets(fields[1])
	if err != nil {
		return "error: " + err.Error()
	}
	for _, r := range routes {
		r.set(next)
	}
	return "ok"
}

func (p *proxy) control(ln net.Listener) {
	for {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		go func() {
			defer conn.Close()
			scanner := bufio.NewScanner(conn)
			for scanner.Scan() {
				fmt.Fprintln(conn, p.execute(scanner.Text()))
			}
		}()
	}
}

func (p *proxy) shutdown() {
	for _, r := range p.routes {
		r.shutdown()
	}
}
