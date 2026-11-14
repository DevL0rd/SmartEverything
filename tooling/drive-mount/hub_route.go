package main

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const requestTimeout = 30 * time.Second

var errNoRoute = errors.New("no route to the hub")

type routeSpec struct {
	URL    string
	Server string
	Pin    string
}

type hubRoute struct {
	gen    uint64
	base   string
	quick  *http.Client
	bulk   *http.Client
	ctx    context.Context
	cancel context.CancelFunc
}

func pinnedTLS(server, pin string) *tls.Config {
	return &tls.Config{
		ServerName:         server,
		InsecureSkipVerify: true,
		VerifyPeerCertificate: func(raw [][]byte, _ [][]*x509.Certificate) error {
			if len(raw) == 0 {
				return errors.New("the hub presented no certificate")
			}
			cert, err := x509.ParseCertificate(raw[0])
			if err != nil {
				return err
			}
			sum := sha256.Sum256(cert.RawSubjectPublicKeyInfo)
			if hex.EncodeToString(sum[:]) != pin {
				return errors.New("the hub certificate key does not match the paired identity")
			}
			return nil
		},
	}
}

func transportFor(spec routeSpec) http.RoundTripper {
	if spec.Pin == "" {
		return http.DefaultTransport.(*http.Transport).Clone()
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.TLSClientConfig = pinnedTLS(spec.Server, spec.Pin)
	return transport
}

func newRoute(gen uint64, spec routeSpec, transport http.RoundTripper) *hubRoute {
	ctx, cancel := context.WithCancel(context.Background())
	return &hubRoute{
		gen:    gen,
		base:   strings.TrimSuffix(spec.URL, "/"),
		quick:  &http.Client{Transport: transport, Timeout: requestTimeout},
		bulk:   &http.Client{Transport: transport},
		ctx:    ctx,
		cancel: cancel,
	}
}

func (c *hubClient) current() *hubRoute {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.route
}

func (c *hubClient) switchRoute(spec routeSpec) error {
	if spec.URL != "" {
		if _, err := url.Parse(spec.URL); err != nil {
			return err
		}
	}
	c.mu.Lock()
	old := c.route
	c.route = newRoute(old.gen+1, spec, transportFor(spec))
	c.mu.Unlock()
	old.cancel()
	old.quick.CloseIdleConnections()
	return nil
}

type routeBody struct {
	io.ReadCloser
	done func()
}

func (b routeBody) Close() error {
	err := b.ReadCloser.Close()
	b.done()
	return err
}

type buildRequest func(ctx context.Context, base string) (*http.Request, error)

func (c *hubClient) send(ctx context.Context, bulk bool, build buildRequest) (*http.Response, error) {
	for {
		r := c.current()
		res, err := c.sendOn(ctx, r, bulk, build)
		if err == nil || ctx.Err() != nil || c.current().gen == r.gen {
			return res, err
		}
	}
}

func (c *hubClient) sendOn(ctx context.Context, r *hubRoute, bulk bool, build buildRequest) (*http.Response, error) {
	if r.base == "" {
		return nil, &url.Error{Op: "Get", URL: "hub", Err: errNoRoute}
	}
	reqCtx, cancel := context.WithCancel(ctx)
	stop := context.AfterFunc(r.ctx, cancel)
	done := func() {
		stop()
		cancel()
	}
	req, err := build(reqCtx, r.base)
	if err != nil {
		done()
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	client := r.quick
	if bulk {
		client = r.bulk
	}
	res, err := client.Do(req)
	if err != nil {
		done()
		return nil, err
	}
	res.Body = routeBody{ReadCloser: res.Body, done: done}
	return res, nil
}
