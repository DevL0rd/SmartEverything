import { createHash } from 'node:crypto';
import { mkdir, open, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { AI_PROJECT_RESULT, ApiError, type AiProjectResult } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { ProjectMutation } from './mutations';
import type { ProjectPaths } from './paths';
const RECEIPT_BYTES_MAX = 4 * 1024 * 1024;
export class ProjectReceipts {
  constructor(
    private readonly store: Store,
    private readonly paths: ProjectPaths,
  ) {}
  async previous(chat: string, request: ProjectMutation): Promise<AiProjectResult | undefined> {
    const receipt = this.store.aiProjects.receipt(chat, request.operation_id);
    if (receipt === undefined) return undefined;
    if (receipt.request_hash !== this.hash(request))
      throw new ApiError(
        'conflict',
        'That project operation ID already belongs to different arguments.',
      );
    if (receipt.state === 'pending')
      throw new ApiError(
        'conflict',
        'This project operation has an uncertain outcome; inspect the current file before issuing a new operation.',
      );
    const body = await this.paths.bytes(chat, receipt.result_path, 0, {
      length: RECEIPT_BYTES_MAX,
      validate: (): void => {
        this.store.aiChats.assertWorkAllowed(chat);
      },
    });
    if (body.size > RECEIPT_BYTES_MAX)
      throw new ApiError('internal', 'The project operation receipt exceeds its bound.');
    return AI_PROJECT_RESULT.parse(JSON.parse(body.bytes.toString('utf8')));
  }
  begin(chat: string, request: ProjectMutation): void {
    this.store.aiProjects.begin(
      chat,
      request.operation_id,
      this.hash(request),
      this.relative(request.operation_id),
    );
  }
  async complete(chat: string, request: ProjectMutation, result: AiProjectResult): Promise<void> {
    const path = await this.paths.parent(chat, this.relative(request.operation_id));
    const body = JSON.stringify(AI_PROJECT_RESULT.parse(result));
    if (Buffer.byteLength(body) > RECEIPT_BYTES_MAX)
      throw new ApiError('internal', 'The project operation result exceeds its receipt bound.');
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.part`;
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(body);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
    this.store.aiProjects.complete(chat, request.operation_id);
  }
  private relative(operation: string): string {
    return `transfers/.operations/${operation}.json`;
  }
  private hash(request: ProjectMutation): string {
    return createHash('sha256').update(JSON.stringify(request)).digest('hex');
  }
}
