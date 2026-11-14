package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
)

const (
	tusVersion  = "1.0.0"
	uploadsPath = "/drive/uploads"
	offsetType  = "application/offset+octet-stream"
)

var errStaleBase = errors.New("the file changed on the hub since it was opened")

type uploadTarget struct {
	FolderID string `json:"folderId,omitempty"`
	Name     string `json:"name,omitempty"`
	ItemID   string `json:"itemId,omitempty"`
	BaseRev  int64  `json:"baseRev,omitempty"`
}

type hubStatusError struct {
	status int
	op     string
}

func (e hubStatusError) Error() string {
	return fmt.Sprintf("hub status %d on %s", e.status, e.op)
}

type transfer struct {
	target   uploadTarget
	location string
	size     int64
	src      io.ReaderAt
	located  func(location string) error
}

func (t uploadTarget) metadata() string {
	encode := func(value string) string { return base64.StdEncoding.EncodeToString([]byte(value)) }
	if t.ItemID != "" {
		return "itemId " + encode(t.ItemID) + ",baseRev " + encode(strconv.FormatInt(t.BaseRev, 10))
	}
	return "name " + encode(t.Name) + ",folderId " + encode(t.FolderID)
}

type tusBody func() io.Reader

func (c *hubClient) tus(ctx context.Context, method, target string, header http.Header, body tusBody, length int64) (*http.Response, error) {
	res, err := c.send(ctx, true, func(ctx context.Context, base string) (*http.Request, error) {
		var reader io.Reader
		if body != nil {
			reader = body()
		}
		req, err := http.NewRequestWithContext(ctx, method, base+target, reader)
		if err != nil {
			return nil, err
		}
		req.Header = header.Clone()
		req.Header.Set("Tus-Resumable", tusVersion)
		if body != nil {
			req.ContentLength = length
		}
		return req, nil
	})
	if err != nil {
		return nil, err
	}
	if res.StatusCode >= 300 {
		res.Body.Close()
		return nil, hubStatusError{status: res.StatusCode, op: method + " " + res.Request.URL.Path}
	}
	return res, nil
}

func uploadPath(location string) (string, error) {
	ref, err := url.Parse(location)
	if err != nil {
		return "", err
	}
	if ref.RawQuery == "" {
		return ref.EscapedPath(), nil
	}
	return ref.EscapedPath() + "?" + ref.RawQuery, nil
}

func (c *hubClient) createUpload(ctx context.Context, target uploadTarget, size int64) (string, error) {
	header := http.Header{}
	header.Set("Upload-Length", strconv.FormatInt(size, 10))
	header.Set("Upload-Metadata", target.metadata())
	res, err := c.tus(ctx, http.MethodPost, uploadsPath, header, nil, 0)
	if err != nil {
		var status hubStatusError
		if errors.As(err, &status) && status.status == http.StatusConflict {
			return "", errStaleBase
		}
		return "", err
	}
	res.Body.Close()
	location := res.Header.Get("Location")
	if location == "" {
		return "", errors.New("hub answered no upload location")
	}
	return location, nil
}

func (c *hubClient) uploadOffset(ctx context.Context, location string) (int64, error) {
	target, err := uploadPath(location)
	if err != nil {
		return 0, err
	}
	res, err := c.tus(ctx, http.MethodHead, target, http.Header{}, nil, 0)
	if err != nil {
		return 0, err
	}
	res.Body.Close()
	return strconv.ParseInt(res.Header.Get("Upload-Offset"), 10, 64)
}

func (c *hubClient) sendFrom(ctx context.Context, location string, offset int64, up transfer) error {
	target, err := uploadPath(location)
	if err != nil {
		return err
	}
	header := http.Header{}
	header.Set("Content-Type", offsetType)
	header.Set("Upload-Offset", strconv.FormatInt(offset, 10))
	body := func() io.Reader { return io.NewSectionReader(up.src, offset, up.size-offset) }
	res, err := c.tus(ctx, http.MethodPatch, target, header, body, up.size-offset)
	if err != nil {
		return err
	}
	res.Body.Close()
	reached, err := strconv.ParseInt(res.Header.Get("Upload-Offset"), 10, 64)
	if err != nil {
		return err
	}
	if reached != up.size {
		return fmt.Errorf("hub took %d of %d bytes", reached, up.size)
	}
	return nil
}

func (c *hubClient) resume(ctx context.Context, up transfer) (string, int64, error) {
	if up.location == "" {
		return "", 0, nil
	}
	offset, err := c.uploadOffset(ctx, up.location)
	var status hubStatusError
	if errors.As(err, &status) && status.status == http.StatusNotFound {
		return "", 0, nil
	}
	return up.location, offset, err
}

func (c *hubClient) upload(ctx context.Context, up transfer) error {
	location, offset, err := c.resume(ctx, up)
	if err != nil {
		return err
	}
	if location == "" {
		if location, err = c.createUpload(ctx, up.target, up.size); err != nil {
			return err
		}
		if err := up.located(location); err != nil {
			return err
		}
	}
	if offset >= up.size {
		return nil
	}
	return c.sendFrom(ctx, location, offset, up)
}

func isTransient(err error) bool {
	var failure *url.Error
	return errors.As(err, &failure) && failure.Op != "parse" && !errors.Is(err, context.Canceled)
}
