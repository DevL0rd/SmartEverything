import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { ApiError, HUB_UPDATE_COMMIT } from '@smarteverything/domain';
import { z } from 'zod';

const SIGNATURE_PREFIX = 'sha256=';
const GITHUB_URL =
  /^(?:git@github\.com:|(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com[:/])(.+)$/iu;
const REPOSITORY = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/u;

const PUSH = z.looseObject({
  ref: z.string().min(1),
  before: HUB_UPDATE_COMMIT,
  after: HUB_UPDATE_COMMIT,
  deleted: z.boolean(),
  repository: z.looseObject({ full_name: z.string().min(1) }),
});

export interface PushTarget {
  readonly repository: string;
  readonly branch: string;
}

export type PushDecision =
  | { readonly kind: 'accepted'; readonly tip: string; readonly before: string }
  | { readonly kind: 'pong' }
  | {
      readonly kind: 'ignored';
      readonly reason: 'event' | 'other_branch' | 'branch_deleted' | 'other_repository';
    }
  | { readonly kind: 'malformed' };

export function pushSignature(secret: string, body: Uint8Array): string {
  return `${SIGNATURE_PREFIX}${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function signatureMatches(expected: string, presented: string): boolean {
  const wanted = Buffer.from(expected);
  const actual = Buffer.from(presented);
  return wanted.length === actual.length && timingSafeEqual(wanted, actual);
}

export function validPushSignature(
  secret: string,
  body: Uint8Array,
  presented: string | undefined,
): boolean {
  return presented !== undefined && signatureMatches(pushSignature(secret, body), presented);
}

export function readSignedPush(
  request: IncomingMessage,
  secret: string,
  presented: string,
  limit: number,
): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const mac = createHmac('sha256', secret);
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > limit) {
        reject(
          new ApiError('payload_too_large', `The body is larger than ${String(limit)} bytes.`),
        );
        request.destroy();
        return;
      }
      mac.update(chunk);
      chunks.push(chunk);
    });
    request.once('end', () => {
      resolve(
        signatureMatches(`${SIGNATURE_PREFIX}${mac.digest('hex')}`, presented)
          ? Buffer.concat(chunks)
          : null,
      );
    });
    request.once('error', reject);
  });
}

export function repositoryOf(remoteUrl: string): string | undefined {
  const path = GITHUB_URL.exec(remoteUrl.trim())?.[1];
  const match = path === undefined ? null : REPOSITORY.exec(path);
  const owner = match?.[1];
  const name = match?.[2];
  return owner === undefined || name === undefined ? undefined : `${owner}/${name}`.toLowerCase();
}

export function decidePush(
  event: string | undefined,
  body: unknown,
  target: PushTarget,
): PushDecision {
  if (event === 'ping') return { kind: 'pong' };
  if (event !== 'push') return { kind: 'ignored', reason: 'event' };
  const parsed = PUSH.safeParse(body);
  if (!parsed.success) return { kind: 'malformed' };
  const { ref, before, after, deleted, repository } = parsed.data;
  if (repository.full_name.toLowerCase() !== target.repository)
    return { kind: 'ignored', reason: 'other_repository' };
  if (ref !== `refs/heads/${target.branch}`) return { kind: 'ignored', reason: 'other_branch' };
  if (deleted) return { kind: 'ignored', reason: 'branch_deleted' };
  return { kind: 'accepted', tip: after, before };
}
