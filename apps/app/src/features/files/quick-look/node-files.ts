import { notify } from '../../../components/toast-store';
import { downloadFile, previewFile } from '../../../platform/file-actions';
import type { FileLinks, FileNode } from '../source/types';

export const NOT_READY_LINE = 'The link to this file is not ready yet. Try again in a moment.';

export function nodeKeyOf(node: Pick<FileNode, 'key' | 'modifiedAt'>): string {
  return `${node.key}:${node.modifiedAt ?? ''}`;
}

export function openNode(node: FileNode, links: FileLinks): void {
  if (links.file === null) notify({ message: NOT_READY_LINE });
  else previewFile(links.file, node.name);
}

export function downloadNode(node: FileNode, links: FileLinks): void {
  if (links.download === null) notify({ message: NOT_READY_LINE });
  else downloadFile(links.download, node.name);
}
