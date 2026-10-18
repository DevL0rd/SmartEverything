import type { JsonValue, NodeRequest } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { SystemControls } from './controls/system-controls';

const log = new Logger('hub.node-system');

export type SystemGroupRequest = Extract<
  NodeRequest,
  {
    verb:
      | 'system'
      | 'system_set'
      | 'startup'
      | 'startup_set'
      | 'services'
      | 'service_set'
      | 'process_detail'
      | 'priority'
      | 'files_search'
      | 'file_properties'
      | 'file_write'
      | 'file_upload'
      | 'file_places'
      | 'download_open'
      | 'download_read'
      | 'download_close';
  }
>;

const SYSTEM_GROUP_VERBS: ReadonlySet<string> = new Set([
  'system',
  'system_set',
  'startup',
  'startup_set',
  'services',
  'service_set',
  'process_detail',
  'priority',
  'files_search',
  'file_properties',
  'file_write',
  'file_upload',
  'file_places',
  'download_open',
  'download_read',
  'download_close',
]);

export function isSystemGroupRequest(request: NodeRequest): request is SystemGroupRequest {
  return SYSTEM_GROUP_VERBS.has(request.verb);
}

type FileRequest = Extract<
  SystemGroupRequest,
  {
    verb:
      | 'files_search'
      | 'file_properties'
      | 'file_write'
      | 'file_upload'
      | 'file_places'
      | 'download_open'
      | 'download_read'
      | 'download_close';
  }
>;

function isFileRequest(request: SystemGroupRequest): request is FileRequest {
  return request.verb.startsWith('file') || request.verb.startsWith('download');
}

export function handleSystemRequest(
  request: SystemGroupRequest,
  controls: SystemControls,
): Promise<JsonValue> {
  return isFileRequest(request)
    ? handleFileRequest(request, controls)
    : handleSettingsRequest(request, controls);
}

async function handleSettingsRequest(
  request: Exclude<SystemGroupRequest, FileRequest>,
  controls: SystemControls,
): Promise<JsonValue> {
  switch (request.verb) {
    case 'system':
      return controls.settings.state();
    case 'system_set':
      await controls.settings.apply(request.change);
      log.info('system.changed', { action: request.change.action });
      return controls.settings.state();
    case 'startup':
      return controls.startup.list();
    case 'startup_set':
      await controls.startup.set(request.change);
      log.info('startup.changed', { enabled: request.change.enabled });
      return controls.startup.list();
    case 'services':
      return controls.services.list();
    case 'service_set':
      await controls.services.set(request.change);
      log.info('service.changed', { operation: request.change.operation });
      return controls.services.list();
    case 'process_detail':
      return controls.processes.detail(request.pid);
    case 'priority':
      await controls.processes.prioritise(request.pid, request.nice);
      log.info('process.prioritised', { pid: request.pid, nice: request.nice });
      return controls.processes.detail(request.pid);
  }
}

function handleFileRequest(request: FileRequest, controls: SystemControls): Promise<JsonValue> {
  switch (request.verb) {
    case 'files_search':
      return controls.files.search(request.query);
    case 'file_properties':
      return controls.files.properties(request.path);
    case 'file_write':
      return writeFiles(request.change, controls);
    case 'file_upload':
      return uploadFile(request.chunk, controls);
    case 'file_places':
      return controls.files.places();
    case 'download_open':
      return openDownload(request.paths, controls);
    case 'download_read':
      return controls.files.readDownload(request.id, request.length);
    case 'download_close':
      return closeDownload(request.id, controls);
  }
}

async function writeFiles(
  change: Extract<SystemGroupRequest, { verb: 'file_write' }>['change'],
  controls: SystemControls,
): Promise<JsonValue> {
  const result = await controls.files.write(change);
  log.info('files.written', {
    action: change.action,
    done: result.done.length,
    failed: result.failed.length,
  });
  return result;
}

async function uploadFile(
  chunk: Extract<SystemGroupRequest, { verb: 'file_upload' }>['chunk'],
  controls: SystemControls,
): Promise<JsonValue> {
  const result = await controls.files.upload(chunk);
  if (result.complete) {
    log.info('files.uploaded', { size: result.size });
  }
  return result;
}

async function openDownload(
  paths: readonly string[],
  controls: SystemControls,
): Promise<JsonValue> {
  const plan = await controls.files.openDownload(paths);
  log.info('files.download_opened', {
    kind: plan.kind,
    files: plan.files,
    folders: plan.folders,
    skipped: plan.skipped.length,
  });
  return plan;
}

async function closeDownload(id: string, controls: SystemControls): Promise<JsonValue> {
  await controls.files.closeDownload(id);
  return null;
}
