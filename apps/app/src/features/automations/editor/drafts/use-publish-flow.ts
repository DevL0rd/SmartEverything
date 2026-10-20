import { useCallback, useState } from 'react';
import { background, Logger } from '@smarteverything/logging';
import { confirm } from '../../../../components/confirm-store';
import { notify } from '../../../../components/toast-store';
import type { DraftSyncModel, PublishOutcome, PublishPlan } from './draft-sync-model';
import { publishedMessage } from './sync-copy';

const log = new Logger('app.automations');

export type PublishStage =
  | { readonly kind: 'closed' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'blocked'; readonly plan: Extract<PublishPlan, { kind: 'blocked' }> }
  | { readonly kind: 'review'; readonly plan: Extract<PublishPlan, { kind: 'ready' }> }
  | { readonly kind: 'publishing'; readonly plan: Extract<PublishPlan, { kind: 'ready' }> };

export interface PublishFlow {
  readonly stage: PublishStage;
  readonly start: () => void;
  readonly confirm: () => void;
  readonly close: () => void;
}

const CLOSED: PublishStage = { kind: 'closed' };

function reportUndo(outcome: PublishOutcome): void {
  if (outcome.kind === 'published') {
    notify({ message: 'The publish was undone', tone: 'positive' });
  } else if (outcome.kind === 'refused') {
    notify({ message: outcome.reply.summary, tone: 'critical' });
  } else if (outcome.kind === 'unavailable') {
    notify({ message: outcome.reason, tone: 'critical' });
  } else {
    notify({
      message: 'The publish wasn’t undone because the automation changed',
      tone: 'critical',
    });
  }
}

function reportOutcome(model: DraftSyncModel, outcome: PublishOutcome): void {
  if (outcome.kind === 'published') {
    notify({
      message: publishedMessage(outcome.revision),
      tone: 'positive',
      undo: () => {
        background(
          model
            .undoPublish(outcome.previous)
            .then((undone) => {
              reportUndo(undone);
            })
            .catch((error: unknown) => {
              log.error('automations.undo_publish_failed', error);
              notify({ message: 'The publish wasn’t undone', tone: 'critical', error });
            }),
          'automations.undo_publish',
        );
      },
    });
    return;
  }
  if (outcome.kind === 'refused') {
    notify({ message: outcome.reply.summary, tone: 'critical' });
  }
}

export function usePublishFlow(model: DraftSyncModel): PublishFlow {
  const [stage, setStage] = useState<PublishStage>(CLOSED);
  const start = useCallback(() => {
    setStage({ kind: 'checking' });
    background(
      model.prepare().then((plan) => {
        if (plan.kind === 'ready') setStage({ kind: 'review', plan });
        else if (plan.kind === 'blocked') setStage({ kind: 'blocked', plan });
        else {
          setStage(CLOSED);
          notify({
            message: plan.kind === 'unsaved' ? plan.reason : 'Decide about the changes first.',
            tone: 'critical',
          });
        }
      }),
      'automations.publish_prepare',
    );
  }, [model]);
  const accept = useCallback(() => {
    if (stage.kind !== 'review') return;
    setStage({ kind: 'publishing', plan: stage.plan });
    background(
      model
        .publish()
        .then((outcome) => {
          reportOutcome(model, outcome);
        })
        .catch((error: unknown) => {
          log.error('automations.publish_failed', error);
          notify({ message: 'The automation wasn’t published', tone: 'critical', error });
        })
        .finally(() => {
          setStage(CLOSED);
        }),
      'automations.publish',
    );
  }, [model, stage]);
  const close = useCallback(() => {
    setStage(CLOSED);
  }, []);
  return { stage, start, confirm: accept, close };
}

export function useRestoreAsDraft(model: DraftSyncModel): (revision: number) => void {
  return useCallback(
    (revision) => {
      background(
        confirm({
          title: `Restore version ${String(revision)} as your draft?`,
          body: 'Your current draft is replaced. The live version stays as it is until you publish.',
          confirmLabel: 'Restore as draft',
        }).then(async (accepted) => {
          if (!accepted) return;
          await model.restoreAsDraft(revision);
          notify({ message: `Version ${String(revision)} is now your draft`, tone: 'positive' });
        }),
        'automations.restore_failed',
      );
    },
    [model],
  );
}
