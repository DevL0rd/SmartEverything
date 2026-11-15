import { appendTo, type FileWriteChange, type FileWriteResult } from '@smarteverything/domain';
import type { FileOp, OpResult, FileLocation, FileNode } from '../../files';
import type { ComputerOrigin } from './computer-node';
import { joinPath, parentOf } from './computer-path';

type Op = FileOp<ComputerOrigin>;

type Node = FileNode<ComputerOrigin>;

export function pathOfLocation(location: FileLocation): string {
  return location.folder ?? location.place;
}

function pathsOf(nodes: readonly Node[]): string[] {
  return nodes.map((node) => node.origin.path);
}

function trashIdsOf(nodes: readonly Node[]): readonly string[] {
  return nodes.flatMap((node) => (node.origin.trashId === null ? [] : [node.origin.trashId]));
}

function transferOf(
  action: 'move' | 'copy',
  nodes: readonly Node[],
  to: FileLocation,
): FileWriteChange | null {
  const paths = pathsOf(nodes);
  return paths.length === 0 ? null : { action, paths, to: pathOfLocation(to), replace: false };
}

function trashChangeOf(nodes: readonly Node[]): FileWriteChange | null {
  const paths = pathsOf(nodes);
  return paths.length === 0 ? null : { action: 'trash', paths };
}

function binChangeOf(
  action: 'restore' | 'delete_now',
  nodes: readonly Node[],
): FileWriteChange | null {
  const items = trashIdsOf(nodes);
  return items.length === 0 ? null : { action, items: [...items] };
}

export function changeOfOp(op: Op): FileWriteChange | null {
  switch (op.kind) {
    case 'new_folder':
      return { action: 'new_folder', path: joinPath(pathOfLocation(op.in), op.name) };
    case 'rename':
      return { action: 'rename', path: op.node.origin.path, name: op.name };
    case 'move':
    case 'copy':
      return transferOf(op.kind, op.nodes, op.to);
    case 'trash':
      return trashChangeOf(op.nodes);
    case 'restore':
    case 'delete_now':
      return binChangeOf(op.kind, op.nodes);
    case 'star':
    case 'unstar':
      return null;
  }
}

function trashIdsOfResult(result: FileWriteResult): readonly string[] {
  return result.done.flatMap((item) => (item.trashId === null ? [] : [item.trashId]));
}

function newPathsOf(result: FileWriteResult): readonly string[] {
  return result.done.flatMap((item) => (item.newPath === null ? [] : [item.newPath]));
}

function movesBackOf(result: FileWriteResult): readonly FileWriteChange[] {
  const back = new Map<string, string[]>();
  for (const item of result.done) {
    const from = parentOf(item.path);
    if (item.newPath !== null && from !== null) appendTo(back, from, item.newPath);
  }
  return [...back].map(([to, paths]): FileWriteChange => ({
    action: 'move',
    paths,
    to,
    replace: false,
  }));
}

export function undoChangesOf(
  change: FileWriteChange,
  result: FileWriteResult,
): readonly FileWriteChange[] {
  switch (change.action) {
    case 'trash': {
      const items = trashIdsOfResult(result);
      return items.length === 0 ? [] : [{ action: 'restore', items: [...items] }];
    }
    case 'move':
      return movesBackOf(result);
    case 'copy': {
      const paths = newPathsOf(result);
      return paths.length === 0 ? [] : [{ action: 'trash', paths: [...paths] }];
    }
    case 'new_folder':
    case 'rename':
    case 'restore':
    case 'delete_now':
      return [];
  }
}

export function mergedResults(results: readonly OpResult[]): OpResult {
  return {
    done: results.flatMap((result) => result.done),
    failed: results.flatMap((result) => result.failed),
    undo: null,
  };
}

export function opResultOf(
  result: FileWriteResult,
  undo: (() => Promise<OpResult>) | null,
): OpResult {
  return {
    done: result.done.map((item) => item.path),
    failed: result.failed.map((failure) => ({ key: failure.path, reason: failure.reason })),
    undo,
  };
}
