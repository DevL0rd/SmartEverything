import {
  APP_PUBLICATION_RESULT,
  DESKTOP_RELEASE_RESULT,
  type AppPublicationInput,
  type DesktopReleaseInput,
  type PipelineComponent,
  type ReleaseSource,
} from '@smarteverything/domain';
import { APP_IDENTITY } from '@smarteverything/domain/app-identity';
import { AndroidBuilds } from '../../../app-updates/android-builds';
import { publishProvidedApk } from '../../../releases/publish-apk';
import { publishStagedDesktop } from '../../../releases/publish-desktop';
import { publishStagedUi } from '../../../releases/publish-ui';
import { releaseStaging } from '../../../releases/staging';
import { runConfiguredUpdateCommand, UpdateBusyError } from '../../../self-update/command';
import { MachineUpdatePublisher } from '../../../updates/machine-update-publication';
import { loadRelease, ReleaseFolder } from '../../../updates/release-folder';
import { ToolError, type ToolContext, type ToolOutput } from './registry';
import { layoutOf, publicServer, updateError } from './update-common';
import { requireSourceFields } from './update-source';
import { stagedUpload } from './update-staged-upload';

type AppInput = Extract<AppPublicationInput, { action: 'app' }>;

type UiInput = Extract<AppPublicationInput, { action: 'ui' }>;

async function publication(
  context: ToolContext,
  script: 'self-update-app-command.ts' | 'self-update-desktop-command.ts',
  input: AppPublicationInput | DesktopReleaseInput,
): Promise<Readonly<Record<string, unknown>>> {
  const layout = await layoutOf(context);
  try {
    return await runConfiguredUpdateCommand(script, layout, {
      input,
      server: publicServer(context),
    });
  } catch (cause) {
    if (cause instanceof UpdateBusyError)
      throw new ToolError(
        'An update is being prepared. Check its request ID in status before retrying.',
        'busy',
      );
    updateError(cause);
  }
}

async function sourceOf(
  context: ToolContext,
  artifact: 'apk' | 'ui' | 'desktop',
  requested: ReleaseSource | undefined,
): Promise<ReleaseSource> {
  return requested ?? (await context.store.host.read('buildSources', null))[artifact];
}

async function announced(
  context: ToolContext,
  component: PipelineComponent,
  commit: string | null,
): Promise<void> {
  if (commit !== null) await context.publications.published(component, commit);
}

async function publishStagedApp(
  context: ToolContext,
  input: AppInput,
  upload: string,
): Promise<ToolOutput> {
  const layout = await layoutOf(context);
  const builds = new AndroidBuilds(context.store.androidBuildObservations);
  const staging = releaseStaging(layout, () => context.clock.now());
  const commit = (await staging.read(upload)).release?.commit ?? null;
  const result = await publishProvidedApk({
    layout,
    identity: APP_IDENTITY,
    staging,
    upload,
    runId: input.runId,
    clientId: input.clientId ?? null,
    notes: input.notes,
    server: publicServer(context),
    targets: async () => builds.paired(await context.store.host.call('clients', 'list')),
    now: () => context.clock.now(),
  });
  if (result.status === 'published') await announced(context, 'app', commit);
  return { structured: result };
}

async function publishStagedUiUpdate(
  context: ToolContext,
  input: UiInput,
  source: Exclude<ReleaseSource, 'hub'>,
): Promise<ToolOutput> {
  if (input.platform !== undefined && source !== 'github')
    throw new ToolError('platform only works with source github');
  const upload = await stagedUpload(context, {
    artifact: 'ui',
    source,
    input,
    target: input.platform,
  });
  const layout = await layoutOf(context);
  const builds = new AndroidBuilds(context.store.androidBuildObservations);
  const clients = await context.store.host.call('clients', 'list');
  const result = await publishStagedUi(
    {
      layout,
      staging: releaseStaging(layout, () => context.clock.now()),
      now: () => context.clock.now(),
      paired: () => builds.paired(clients),
    },
    {
      runId: input.runId,
      upload,
      notes: input.notes,
      channel: input.channel,
      clientId: input.clientId,
    },
  );
  if (result.status === 'published') await announced(context, 'ui', result.entry.commit);
  return { structured: result };
}

export async function publishApp(
  context: ToolContext,
  input: AppPublicationInput,
): Promise<ToolOutput> {
  requireSourceFields(input);
  if (input.action === 'app') {
    const source = await sourceOf(context, 'apk', input.source);
    if (source !== 'hub')
      return publishStagedApp(
        context,
        input,
        await stagedUpload(context, { artifact: 'apk', source, input, target: 'android' }),
      );
  }
  if (input.action === 'ui') {
    const source = await sourceOf(context, 'ui', input.source);
    if (source !== 'hub') return publishStagedUiUpdate(context, input, source);
  }
  const result = await publication(context, 'self-update-app-command.ts', input);
  return { structured: APP_PUBLICATION_RESULT.parse(result) };
}

export async function publishDesktop(
  context: ToolContext,
  input: DesktopReleaseInput,
): Promise<ToolOutput> {
  requireSourceFields(input);
  const source = await sourceOf(context, 'desktop', input.source);
  if (source !== 'hub') {
    const upload = await stagedUpload(context, { artifact: 'desktop', source, input });
    const layout = await layoutOf(context);
    const result = await publishStagedDesktop(
      {
        staging: releaseStaging(layout, () => context.clock.now()),
        publisher: new MachineUpdatePublisher(layout, new ReleaseFolder(layout)),
        current: () => loadRelease(layout.system.updates.machineUpdates),
      },
      {
        runId: input.runId,
        upload,
        notes: input.notes,
        arches: input.arches,
      },
    );
    if (result.status === 'published') await announced(context, 'desktop', result.release.commit);
    return { structured: result };
  }
  const result = await publication(context, 'self-update-desktop-command.ts', input);
  return { structured: DESKTOP_RELEASE_RESULT.parse(result) };
}
