import {
  HUB_UPDATE_ACCEPTANCE,
  APP_PUBLICATION_STATUS,
  DESKTOP_RELEASE_STATUS,
  hubUpdateOutcome,
  type UpdateInput,
} from '@smarteverything/domain';
import type { HubLayout } from '../../../data-layout';
import {
  runConfiguredUpdateCommand,
  runUpdateCommand,
  UpdateBusyError,
} from '../../../self-update/command';
import { rollbackHubUpdate } from '../../../self-update/execute';
import { readHubUpdate } from '../../../self-update/recovery';
import { ToolError, type ToolContext, type ToolOutput } from './registry';
import { layoutOf, updateError } from './update-common';
import { requireUpdateRequester } from './update-requester';
import { requireSourceFields } from './update-source';

type Update = Extract<UpdateInput, { action: 'hub' }>;

type RollbackInput = Omit<Extract<UpdateInput, { action: 'rollback' }>, 'action'>;

export async function update(context: ToolContext, input: Update): Promise<ToolOutput> {
  requireSourceFields(input);
  const { chatId, profileId } = requireUpdateRequester(context);
  const origin = chatId === null ? undefined : { chatId, profileId };
  try {
    return {
      structured: HUB_UPDATE_ACCEPTANCE.parse(
        await runUpdateCommand(context.layout, input, origin),
      ),
    };
  } catch (cause) {
    updateError(cause);
  }
}

async function runStatus(
  layout: HubLayout,
  script: 'self-update-app-command.ts' | 'self-update-desktop-command.ts',
  runId: string,
): Promise<Readonly<Record<string, unknown>>> {
  try {
    return await runConfiguredUpdateCommand(script, layout, { runId });
  } catch (cause) {
    if (cause instanceof UpdateBusyError)
      throw new ToolError(
        'An update is still being prepared. Its outcome is not known yet.',
        'busy',
      );
    updateError(cause);
  }
}

async function runStatusOutput(layout: HubLayout, runId: string): Promise<ToolOutput> {
  const app = APP_PUBLICATION_STATUS.parse(
    await runStatus(layout, 'self-update-app-command.ts', runId),
  );
  if (app.publication !== null) return { structured: { release: null, ...app } };
  const desktop = DESKTOP_RELEASE_STATUS.parse(
    await runStatus(layout, 'self-update-desktop-command.ts', runId),
  );
  return { structured: { release: null, ...(desktop.desktop === null ? app : desktop) } };
}

export async function status(context: ToolContext, runId: string | undefined): Promise<ToolOutput> {
  const layout = layoutOf(context);
  const release = await readHubUpdate(layout, runId);
  if (release === null)
    return runId === undefined ? { structured: { release: null } } : runStatusOutput(layout, runId);
  return {
    structured: {
      release: {
        runId: release.runId,
        phase: release.phase,
        outcome: hubUpdateOutcome(release),
        backup: release.backup,
        checks: release.checks,
        failedChecks: release.failedChecks,
        reason: release.reason,
        finishedAt: release.finishedAt,
      },
    },
  };
}

export async function rollback(context: ToolContext, input: RollbackInput): Promise<ToolOutput> {
  const layout = layoutOf(context);
  if (input.artifact !== 'hub')
    throw new ToolError(
      `update_control cannot roll back the ${input.artifact} release yet. Withdraw or roll it back with the owner's release tools on a dev machine.`,
      'unavailable',
    );
  return { structured: await rollbackHubUpdate(layout, input.id) };
}
