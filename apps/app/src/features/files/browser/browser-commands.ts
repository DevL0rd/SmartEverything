import { background } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { plural } from '../../../format/text';
import { pickFiles, type PickedBlob, type PickedFile } from '../../../platform/pick-files';
import { opNoticeOf, type FileOp, type OpNotice, type OpResult } from '../source/ops';
import type { FileLocation, FileNode, FileSource } from '../source/types';
import { UploadQueue } from '../transfer/upload-queue';
import { isBuiltin, type BuiltinAction } from './menu-specs';

const QUEUES = new Map<string, UploadQueue>();

export function uploadQueueOf<O>(source: FileSource<O>): UploadQueue {
  const known = QUEUES.get(source.id);
  if (known !== undefined) {
    known.setTransport(source.upload);
    return known;
  }
  const queue = new UploadQueue(source.upload, () => undefined);
  QUEUES.set(source.id, queue);
  return queue;
}

export function isBlob(file: PickedFile): file is PickedBlob {
  return 'blob' in file && typeof file.blob === 'function';
}

export function sendUploads<O>(
  source: FileSource<O>,
  files: readonly PickedFile[],
  to: FileLocation,
  present: ReadonlySet<string>,
): void {
  const blobs = files.filter(isBlob);
  if (blobs.length > 0) uploadQueueOf(source).add(blobs, to, present);
}

async function chooseInto<O>(
  source: FileSource<O>,
  to: FileLocation,
  present: ReadonlySet<string>,
): Promise<void> {
  try {
    sendUploads(source, await pickFiles('files'), to, present);
  } catch (error) {
    notify({ message: 'Files couldn’t be chosen', error, tone: 'critical' });
  }
}

export function chooseUploads<O>(
  source: FileSource<O>,
  to: FileLocation,
  present: ReadonlySet<string>,
): void {
  background(chooseInto(source, to, present), 'files.upload_pick_failed');
}

function toneOf(notice: OpNotice): 'critical' | 'positive' | 'default' {
  if (notice.tone === 'failed') return 'critical';
  return notice.tone === 'done' && notice.follow !== null ? 'positive' : 'default';
}

function noticeOf<O>(op: FileOp<O>, result: OpResult): void {
  const notice = opNoticeOf(op, result);
  const detail = notice.reasons.join(' ');
  const { follow, undo } = notice;
  const message = follow === null || notice.tone !== 'done' ? notice.title : follow.message;
  const base = { message, tone: toneOf(notice), ...(detail === '' ? {} : { detail }) };
  if (undo === null) {
    const action = follow === null ? null : follow.action;
    notify(action === null ? base : { ...base, action });
    return;
  }
  notify({
    ...base,
    undo: () => {
      background(
        undo().then((undone) => {
          if (undone.failed.length > 0)
            notify({ message: 'It couldn’t be undone', tone: 'critical' });
        }),
        'files.undo_failed',
      );
    },
  });
}

export function runOp<O>(source: FileSource<O>, op: FileOp<O>): void {
  background(
    source.run(op).then(
      (result) => {
        noticeOf(op, result);
      },
      (error: unknown) => {
        notify({ message: 'That didn’t work', error, tone: 'critical' });
      },
    ),
    'files.op_failed',
  );
}

async function deleteAfterAsking<O>(
  source: FileSource<O>,
  nodes: readonly FileNode<O>[],
): Promise<void> {
  const only = nodes.length === 1 ? nodes[0] : undefined;
  const accepted = await confirm({
    title:
      only === undefined
        ? `Delete ${plural(nodes.length, 'item')} for good?`
        : `Delete ${only.name} for good?`,
    body: 'This can’t be undone.',
    confirmLabel: 'Delete for good',
    tone: 'destructive',
  });
  if (accepted) runOp(source, { kind: 'delete_now', nodes });
}

export function deleteNow<O>(source: FileSource<O>, nodes: readonly FileNode<O>[]): void {
  background(deleteAfterAsking(source, nodes), 'files.delete_now_failed');
}

export interface MenuTargets<O> {
  readonly open: (node: FileNode<O>) => void;
  readonly quickLook: (node: FileNode<O>) => void;
  readonly details: (node: FileNode<O>) => void;
  readonly rename: (node: FileNode<O>) => void;
  readonly transfer: (kind: 'move' | 'copy' | 'download', nodes: readonly FileNode<O>[]) => void;
}

function runOnFirst<O>(nodes: readonly FileNode<O>[], run: (node: FileNode<O>) => void): void {
  const [first] = nodes;
  if (first !== undefined) run(first);
}

type OneTarget = 'open' | 'quickLook' | 'details' | 'rename';

const ONE_TARGET: ReadonlySet<BuiltinAction> = new Set(['open', 'quickLook', 'details', 'rename']);

function isOneTarget(action: BuiltinAction): action is OneTarget {
  return ONE_TARGET.has(action);
}

function runBuiltin<O>(
  action: BuiltinAction,
  nodes: readonly FileNode<O>[],
  source: FileSource<O>,
  targets: MenuTargets<O>,
): void {
  if (isOneTarget(action)) {
    runOnFirst(nodes, targets[action]);
    return;
  }
  switch (action) {
    case 'download':
    case 'move':
    case 'copy':
      targets.transfer(action, nodes);
      return;
    case 'deleteNow':
      deleteNow(source, nodes);
      return;
    case 'star':
    case 'unstar':
    case 'trash':
    case 'restore':
      runOp(source, { kind: action, nodes });
  }
}

export function runMenuAction<O>(
  id: string,
  nodes: readonly FileNode<O>[],
  source: FileSource<O>,
  targets: MenuTargets<O>,
): void {
  if (isBuiltin(id)) {
    runBuiltin(id, nodes, source, targets);
    return;
  }
  source
    .actions(nodes)
    .find((action) => action.id === id)
    ?.run(nodes);
}
