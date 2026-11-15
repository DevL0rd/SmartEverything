package wire

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func tlsHub(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{Subprotocol}, CompressionMode: websocket.CompressionDisabled})
		if err != nil {
			return
		}
		<-r.Context().Done()
		_ = conn.CloseNow()
	}))
	t.Cleanup(server.Close)
	sum := sha256.Sum256(server.Certificate().RawSubjectPublicKeyInfo)
	return server, hex.EncodeToString(sum[:])
}

func TestWebsocketDialerAcceptsOnlyThePinnedCertificateKey(t *testing.T) {
	server, pin := tlsHub(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, err := WebsocketDialer{}.Dial(ctx, Route{URL: server.URL, Server: "hub.local", Pin: pin}, "token")
	if err != nil {
		t.Fatalf("the pinned key must connect: %v", err)
	}
	_ = conn.Close()
	wrong := sha256.Sum256([]byte("another key"))
	if _, err := (WebsocketDialer{}).Dial(ctx, Route{URL: server.URL, Server: "hub.local", Pin: hex.EncodeToString(wrong[:])}, "token"); err == nil {
		t.Fatal("a certificate with another key must be refused")
	}
	if _, err := (WebsocketDialer{}).Dial(ctx, Route{URL: server.URL}, "token"); err == nil {
		t.Fatal("an unpinned route must not trust a self-signed certificate")
	}
}

func TestRefusedSubprotocolFailsTheDial(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		<-r.Context().Done()
		_ = conn.CloseNow()
	}))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := (WebsocketDialer{}).Dial(ctx, Route{URL: server.URL}, "token"); err == nil {
		t.Fatal("a hub that does not speak the subprotocol must be refused")
	}
}
