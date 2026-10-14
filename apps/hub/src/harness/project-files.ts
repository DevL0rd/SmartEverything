import type { ProjectAuthority } from '../projects/authority';
import type { HarnessGrant } from './grant';
import type { ConversationAuthority } from './authority-contract';
import { currentRequestSignal } from '../server/request-signal';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  ApiError,
  DSH_SESSION_ID,
  JSON_VALUE,
  type AiProjectRequest,
  type AiProjectResult,
  type HarnessTransportRequest,
} from '@smarteverything/domain';
import { managedProjectPath } from './project-path';
import { admitCanonicalTool, type CentralToolRequest } from './canonical-tools';
import type { HarnessService } from './service';
import type { ProjectFilesService } from '../projects/service';
import {
  eventAuthority,
  validateExecutionAuthority,
  admitExecutionTool,
} from '../assistant/execution-authority';

type Request = Extract<HarnessTransportRequest['request'], { operation: 'project_file' }>;
const CALL = z.object({ arguments: z.string() });
const installations = new WeakMap<HarnessService, ProjectFilesService>();
export function bindProjectFiles(service: HarnessService, projects: ProjectFilesService): void {
  installations.set(service, projects);
}
export async function nativeProjectFile(
  service: HarnessService,
  request: Request,
  verify: () => void,
): Promise<AiProjectResult> {
  verify();
  const canonical = projectCanonical(service, request);
  const grant = service.storage.grant(request.claim.session_id);
  const metadata = service.store.dshSessions.stat(grant.session_id, grant.profile_id);
  const projects = installations.get(service);
  if (
    metadata === undefined ||
    projects === undefined ||
    grant.storage_binding?.kind !== 'managed' ||
    grant.storage_binding.chat_id !== metadata.chat_id
  )
    throw new ApiError('forbidden', 'This session has no admitted central project binding.');
  const authority =
    grant.event_id === null
      ? undefined
      : eventAuthority(service.store, service.store.assistantEvents.event(grant.event_id));
  if (authority === undefined)
    throw new ApiError('forbidden', 'Managed files require their canonical initiating authority.');
  const file = canonicalFile(canonical, request.file);
  const validate = projectValidation(
    service,
    { grant, canonical, authority, file, chatId: metadata.chat_id },
    verify,
  );
  admitFileOperation(canonical, file);
  return projects.execute(
    { chatId: metadata.chat_id, profileId: grant.profile_id, validate },
    projectOperation(canonical, file),
  );
}
function projectCanonical(service: HarnessService, request: Request): CentralToolRequest {
  const grant = service.storage.grant(request.claim.session_id);
  const event = service.store.dshSessions.read(
    { session_id: DSH_SESSION_ID.parse(grant.session_id), offset: request.call_seq, limit: 1 },
    grant.profile_id,
  ).events[0];
  if (event?.type !== 'tool/call')
    throw new ApiError('forbidden', 'Managed file call has no canonical tool event.');
  const call = CALL.parse(event.data);
  if (createHash('sha256').update(call.arguments).digest('hex') !== request.arguments_hash)
    throw new ApiError('forbidden', 'Managed file call arguments differ from the canonical event.');
  return {
    operation: 'tool',
    claim: request.claim,
    call_id: request.call_id,
    call_seq: request.call_seq,
    name: request.name,
    arguments: z.record(z.string(), JSON_VALUE).parse(JSON.parse(call.arguments)),
  };
}
function admitFileOperation(call: CentralToolRequest, request: AiProjectRequest): void {
  const rawPath = call.arguments['file_path'];
  if (typeof rawPath !== 'string' || managedProjectPath(rawPath) !== request.path)
    throw new ApiError('forbidden', 'Managed file request differs from its canonical file path.');
  if (['stat', 'read', 'list'].includes(request.operation)) return;
  if (call.name === 'write') {
    admitWrite(call.arguments, request);
    return;
  }
  if (canonicalEdit(call, request)) return;
  throw new ApiError(
    'forbidden',
    'Managed file mutation differs from its canonical tool operation.',
  );
}
function canonicalEdit(call: CentralToolRequest, request: AiProjectRequest): boolean {
  if (call.name !== 'edit' || request.operation !== 'edit') return false;
  return (
    call.arguments['old_string'] === request.old_string &&
    call.arguments['new_string'] === request.new_string &&
    (call.arguments['replace_all'] ?? false) === request.replace_all
  );
}
function admitWrite(args: Readonly<Record<string, unknown>>, request: AiProjectRequest): void {
  const content = args['content'];
  if (typeof content !== 'string')
    throw new ApiError('forbidden', 'Canonical write content is absent.');
  const bytes = Buffer.from(content);
  const allowed = writeMatches(request, content) || transferMatches(request, bytes);
  if (!allowed)
    throw new ApiError(
      'forbidden',
      'Managed write transfer differs from its canonical native content.',
    );
}
function writeMatches(request: AiProjectRequest, content: string): boolean {
  return (
    request.operation === 'write' && request.encoding === 'utf8' && request.content === content
  );
}
function transferMatches(request: AiProjectRequest, bytes: Buffer): boolean {
  if (request.operation === 'transfer_start')
    return request.encoding === 'utf8' && request.total_bytes === bytes.length;
  if (request.operation === 'transfer_chunk')
    return (
      request.content ===
      bytes.subarray(request.offset, request.offset + 256 * 1024).toString('base64')
    );
  return request.operation === 'transfer_finish' || request.operation === 'transfer_cancel';
}
function projectOperation(call: CentralToolRequest, request: AiProjectRequest): AiProjectRequest {
  if (!('operation_id' in request)) return request;
  const lineage = `${call.claim.session_id}:${String(call.call_seq)}:${call.call_id}`;
  const operation_id = operationId(
    `${lineage}:${request.operation}:${String('offset' in request ? request.offset : 0)}`,
  );
  return 'transfer_id' in request
    ? { ...request, operation_id, transfer_id: operationId(`${lineage}:transfer`) }
    : { ...request, operation_id };
}
function operationId(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function canonicalFile(call: CentralToolRequest, file: AiProjectRequest): AiProjectRequest {
  if (call.name !== 'edit' || file.operation !== 'edit') return file;
  const args = z
    .object({
      old_string: z.string().min(1),
      new_string: z.string(),
      replace_all: z.boolean().optional(),
    })
    .parse(call.arguments);
  return {
    ...file,
    old_string: args.old_string,
    new_string: args.new_string,
    replace_all: args.replace_all ?? false,
  };
}

interface ProjectCallScope {
  readonly grant: HarnessGrant;
  readonly canonical: CentralToolRequest;
  readonly authority: ConversationAuthority;
  readonly chatId: string;
  readonly file: AiProjectRequest;
}
function projectValidation(
  service: HarnessService,
  scope: ProjectCallScope,
  verify: () => void,
): ProjectAuthority['validate'] {
  const signal = currentRequestSignal();
  return (write: boolean): void => {
    signal?.throwIfAborted();
    verify();
    admitCanonicalTool(service, scope.canonical);
    const current = service.storage.grant(scope.grant.session_id);
    if (JSON.stringify(current) !== JSON.stringify(scope.grant))
      throw new ApiError('forbidden', 'Managed file initiating grant changed.');
    validateExecutionAuthority(service.store, scope.authority);
    admitExecutionTool(
      service.store,
      write ? 'write_project_files' : 'read_project_files',
      { chatId: scope.chatId, request: scope.file },
      scope.authority,
    );
    if (write && scope.grant.permission.sandbox === 'read-only')
      throw new ApiError(
        'forbidden',
        'Managed project is read-only under this session permission.',
      );
  };
}
