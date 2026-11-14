import type { UpdateRevision, UpdateRevisionStep } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { noteHeadline, revisionView, stepState } from './revision-view';

const TIP = 'c'.repeat(40);
const BASE = 'a'.repeat(40);

function step(
  component: UpdateRevisionStep['component'],
  status: UpdateRevisionStep['status'],
  offered = false,
): UpdateRevisionStep {
  return { component, status, runId: null, offered, detail: null };
}

function revision(patch: Partial<UpdateRevision>): UpdateRevision {
  return {
    id: '5f0c2b55-9d7e-4b8a-a0b1-7c3e2d1f0a99',
    tip: TIP,
    pushedFrom: 'b'.repeat(40),
    base: BASE,
    status: 'running',
    steps: [],
    notes: 'Camera previews reconnect.\n\n- Faster.',
    failure: null,
    receivedAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:05:00.000Z',
    finishedAt: null,
    ...patch,
  };
}

describe('a pushed revision as shown in Updates', () => {
  it('shows each planned component with its own state in release order', () => {
    const view = revisionView(
      revision({
        steps: [step('hub', 'done'), step('app', 'done', true), step('ui', 'running')],
      }),
    );
    expect(view.steps.map((entry) => [entry.name, entry.look.label])).toEqual([
      ['Hub', 'Done'],
      ['Android app', 'Offered'],
      ['Over the air', 'Running'],
    ]);
    expect(view.look.label).toBe('Releasing');
  });

  it('names the failed component, its reason and that the Hub was rolled back', () => {
    const failed = revision({
      status: 'failed',
      steps: [step('hub', 'failed'), step('ui', 'skipped')],
      failure: { component: 'hub', message: 'Health check failed.', rollback: 'reverted' },
    });
    const view = revisionView(failed);
    expect(view.steps.map((entry) => entry.state)).toEqual(['rolled_back', 'not_run']);
    expect(view.failure).toBe('Hub: Health check failed.');
    expect(view.rollback).toContain('previous Hub version');
  });

  it('marks a failure whose rollback did not finish', () => {
    const failed = revision({
      status: 'failed',
      steps: [step('hub', 'failed')],
      failure: { component: 'hub', message: 'Restart failed.', rollback: 'unrecoverable' },
    });
    expect(stepState(failed, step('hub', 'failed'))).toBe('rollback_failed');
  });

  it('keeps a refusal reason that names no component', () => {
    const view = revisionView(
      revision({
        status: 'refused',
        failure: {
          component: null,
          message: 'No release-notes/hub.json in the tip.',
          rollback: 'none',
        },
      }),
    );
    expect(view.failure).toBe('No release-notes/hub.json in the tip.');
    expect(view.rollback).toBeNull();
    expect(view.look.label).toBe('Refused');
  });

  it('explains a revision that a newer push replaced before it was planned', () => {
    const view = revisionView(revision({ status: 'superseded' }));
    expect(view.steps).toEqual([]);
    expect(view.waiting).toContain('newer push');
  });

  it('shows skipped steps of a superseded revision as superseded', () => {
    const superseded = revision({ status: 'superseded' });
    expect(stepState(superseded, step('ui', 'skipped'))).toBe('superseded');
  });

  it('shows the range from the released base to the tip', () => {
    expect(revisionView(revision({})).range).toBe(`${'a'.repeat(8)} → ${'c'.repeat(8)}`);
  });

  it('uses the first written line of the release notes as the headline', () => {
    expect(noteHeadline('\n  First line  \nSecond')).toBe('First line');
    expect(noteHeadline(null)).toBeNull();
  });
});
