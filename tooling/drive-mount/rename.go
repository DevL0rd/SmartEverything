package main

import (
	"context"
	"path"
	"strings"
)

type renamePlan struct {
	root      mountRoot
	from, to  string
	source    entry
	hasSource bool
	target    entry
	hasTarget bool
	moving    []*session
	replaced  []*session
	dest      parentRef
}

func (p *renamePlan) exact() *session { return sessionAt(p.moving, p.from) }

func (p *renamePlan) replacedFile() *session { return sessionAt(p.replaced, p.to) }

func (w *writeBack) Rename(ctx context.Context, root mountRoot, from, to string, replace bool) error {
	if from == to {
		return nil
	}
	if strings.HasPrefix(to, from+"/") {
		return errInvalid
	}
	if strings.HasPrefix(from, to+"/") {
		return errNotEmpty
	}
	moving, err := w.claimUnder(ctx, root, from)
	if err != nil {
		return err
	}
	defer w.unclaim(moving)
	plan := &renamePlan{root: root, from: from, to: to, moving: moving}
	if err := w.survey(ctx, plan); err != nil {
		return err
	}
	defer w.unclaim(plan.replaced)
	if err := w.admit(ctx, plan, replace); err != nil {
		return err
	}
	if err := w.apply(ctx, plan); err != nil {
		return err
	}
	w.refresh(root, from, to)
	return nil
}

func (w *writeBack) survey(ctx context.Context, plan *renamePlan) error {
	var err error
	if plan.source, plan.hasSource, err = w.hubStat(ctx, plan.root, plan.from); err != nil {
		return err
	}
	if !plan.hasSource && plan.exact() == nil {
		return errNotFound
	}
	if plan.dest, err = w.placement(ctx, plan.root, plan.to); err != nil {
		return err
	}
	if plan.replaced, err = w.claimUnder(ctx, plan.root, plan.to); err != nil {
		return err
	}
	plan.target, plan.hasTarget, err = w.hubStat(ctx, plan.root, plan.to)
	return err
}

func (w *writeBack) admit(ctx context.Context, plan *renamePlan, replace bool) error {
	occupied := plan.hasTarget || plan.replacedFile() != nil
	if !occupied {
		return nil
	}
	if !replace {
		return errExists
	}
	sourceDir := plan.hasSource && plan.source.Dir
	targetDir := plan.hasTarget && plan.target.Dir
	switch {
	case sourceDir && !targetDir:
		return errNotDir
	case !sourceDir && targetDir:
		return errIsDir
	case targetDir:
		return w.requireEmpty(ctx, plan.root, plan.to)
	}
	return nil
}

func (w *writeBack) apply(ctx context.Context, plan *renamePlan) error {
	var err error
	if plan.hasSource {
		err = w.moveOnHub(ctx, plan)
	} else {
		err = w.moveSession(plan)
	}
	if err != nil {
		return err
	}
	for _, s := range plan.replaced {
		w.drop(s)
	}
	return nil
}

func (w *writeBack) moveSession(plan *renamePlan) error {
	s := plan.exact()
	target := s.rec.Target
	if target.ItemID == "" {
		target = uploadTarget{FolderID: plan.dest.folder(plan.root), Name: path.Base(plan.to)}
		if plan.hasTarget {
			target = uploadTarget{ItemID: plan.target.ID, BaseRev: plan.target.Rev}
		}
	}
	return w.rekey(s, plan.to, target)
}

func (w *writeBack) moveOnHub(ctx context.Context, plan *renamePlan) error {
	if plan.hasTarget {
		if err := w.hub.remove(ctx, plan.root, plan.target); err != nil {
			return err
		}
	}
	moved, err := w.hub.rename(ctx, plan.root, plan.source, plan.dest, path.Base(plan.to))
	if err != nil {
		return err
	}
	exact := plan.exact()
	for _, s := range plan.moving {
		target := s.rec.Target
		if s == exact && target.ItemID == plan.source.ID && target.BaseRev == plan.source.Rev {
			target.BaseRev = moved.Rev
		}
		if err := w.rekey(s, plan.to+strings.TrimPrefix(s.rec.Path, plan.from), target); err != nil {
			return err
		}
	}
	return nil
}
