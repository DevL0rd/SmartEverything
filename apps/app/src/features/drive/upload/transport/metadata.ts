import { z } from 'zod';
import {
  DRIVE_UPLOAD_METADATA,
  DRIVE_UPLOAD_TARGET,
  type DriveUploadTarget,
} from '@smarteverything/domain';
import type { UploadRequest } from './types';

const REQUEST_FIELDS = z.strictObject({
  identity: z.string().min(1),
  name: z.string().min(1),
  target: DRIVE_UPLOAD_TARGET,
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
});

export function checkedRequest(request: UploadRequest): UploadRequest {
  const source =
    request.source instanceof Blob
      ? request.source
      : z
          .strictObject({
            uri: z.string().startsWith('content://'),
            size: z.number().int().nonnegative(),
            type: z.string(),
          })
          .parse(request.source);
  const fields = REQUEST_FIELDS.parse({
    identity: request.identity,
    name: request.name,
    target: request.target,
    ...(request.sha256 === undefined ? {} : { sha256: request.sha256 }),
  });
  const { sha256, ...metadata } = fields;
  return { ...metadata, source, ...(sha256 === undefined ? {} : { sha256 }) };
}

export function targetKey(request: UploadRequest): string {
  const { target } = request;
  switch (target.kind) {
    case 'drive':
      return `drive:${target.rootId}`;
    case 'folder':
      return `folder:${target.folderId}`;
    case 'item':
      return `item:${target.itemId}:${String(target.baseRev)}`;
  }
}

function wireTargetOf(target: DriveUploadTarget): Readonly<Record<string, string>> {
  switch (target.kind) {
    case 'drive':
      return { targetKind: 'drive', rootId: target.rootId };
    case 'folder':
      return { targetKind: 'folder', folderId: target.folderId };
    case 'item':
      return { targetKind: 'item', itemId: target.itemId, baseRev: String(target.baseRev) };
  }
}

export function fingerprintOf(request: UploadRequest): string {
  const parts = [request.identity, String(request.source.size), targetKey(request)];
  if (request.sha256 !== undefined) parts.push(request.sha256);
  return parts.join('|');
}

export function uploadMetadata(request: UploadRequest): Readonly<Record<string, string>> {
  const { target, source } = request;
  const metadata: Readonly<Record<string, string>> = {
    filename: request.name,
    ...(source.type === '' ? {} : { filetype: source.type }),
    ...wireTargetOf(target),
    ...(request.sha256 === undefined ? {} : { sha256: request.sha256 }),
  };
  DRIVE_UPLOAD_METADATA.parse(metadata);
  return metadata;
}
