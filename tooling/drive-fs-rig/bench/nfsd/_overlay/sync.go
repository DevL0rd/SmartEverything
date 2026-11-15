package nfs

import "github.com/go-git/go-billy/v5"

type pathSyncer interface {
	SyncPath(name string) error
}

func syncPath(fs billy.Filesystem, name string) error {
	if syncer, ok := fs.(pathSyncer); ok {
		return syncer.SyncPath(name)
	}
	return nil
}
