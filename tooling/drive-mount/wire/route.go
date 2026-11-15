package wire

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"

	"github.com/coder/websocket"
)

const MountPath = "/drive/mount"

type Route struct {
	URL    string
	Server string
	Pin    string
}

func (r Route) Empty() bool { return r.URL == "" }

type Conn interface {
	Read(ctx context.Context) ([]byte, error)
	Write(ctx context.Context, frame []byte) error
	Ping(ctx context.Context) error
	Close() error
}

type Dialer interface {
	Dial(ctx context.Context, route Route, token string) (Conn, error)
}

type WebsocketDialer struct{}

func PinnedTLS(server, pin string) *tls.Config {
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

func httpClientFor(route Route) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if route.Pin != "" {
		transport.TLSClientConfig = PinnedTLS(route.Server, route.Pin)
	}
	return &http.Client{Transport: transport}
}

func (WebsocketDialer) Dial(ctx context.Context, route Route, token string) (Conn, error) {
	header := http.Header{}
	header.Set("Authorization", "Bearer "+token)
	client := httpClientFor(route)
	conn, _, err := websocket.Dial(ctx, strings.TrimSuffix(route.URL, "/")+MountPath, &websocket.DialOptions{
		HTTPClient:      client,
		HTTPHeader:      header,
		Subprotocols:    []string{Subprotocol},
		CompressionMode: websocket.CompressionDisabled,
	})
	if err != nil {
		client.CloseIdleConnections()
		return nil, err
	}
	if conn.Subprotocol() != Subprotocol {
		_ = conn.CloseNow()
		client.CloseIdleConnections()
		return nil, errors.New("the hub did not accept the drive mount subprotocol")
	}
	conn.SetReadLimit(MaxFrameBytes)
	return &wsConn{conn: conn, client: client}, nil
}

type wsConn struct {
	conn   *websocket.Conn
	client *http.Client
}

func (c *wsConn) Read(ctx context.Context) ([]byte, error) {
	kind, data, err := c.conn.Read(ctx)
	if err != nil {
		return nil, err
	}
	if kind != websocket.MessageBinary {
		return nil, errors.New("the hub sent a text message on the drive mount socket")
	}
	return data, nil
}

func (c *wsConn) Write(ctx context.Context, frame []byte) error {
	return c.conn.Write(ctx, websocket.MessageBinary, frame)
}

func (c *wsConn) Ping(ctx context.Context) error { return c.conn.Ping(ctx) }

func (c *wsConn) Close() error {
	err := c.conn.CloseNow()
	c.client.CloseIdleConnections()
	return err
}
