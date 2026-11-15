import type { FileProperties } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { shortDate } from '../../../format/time';
import type { InfoRow } from '../../files';
import type { ComputerNode } from './computer-node';

const TRIPLETS = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'] as const;

export function modeText(mode: number): string {
  const digits = [(mode >> 6) & 7, (mode >> 3) & 7, mode & 7];
  const letters = digits.map((digit) => TRIPLETS[digit] ?? '---').join('');
  return `${letters} (${mode.toString(8).padStart(3, '0')})`;
}

function permissionWords(permissions: FileProperties['permissions']): string {
  if (permissions.readable && permissions.writable) return 'Read and change';
  return permissions.readable ? 'Read only' : 'No access';
}

export function baseRowsOf(node: ComputerNode): readonly InfoRow[] {
  if (node.origin.trashId !== null) {
    return [
      { key: 'original', label: 'Was in', value: node.origin.path },
      ...(node.modifiedAt === null
        ? []
        : [{ key: 'deleted', label: 'Deleted', value: shortDate(node.modifiedAt) }]),
      ...(node.size === null ? [] : [{ key: 'size', label: 'Size', value: bytes(node.size) }]),
    ];
  }
  return [
    { key: 'path', label: 'Location', value: node.origin.path },
    ...(node.size === null ? [] : [{ key: 'size', label: 'Size', value: bytes(node.size) }]),
    ...(node.modifiedAt === null
      ? []
      : [{ key: 'modified', label: 'Modified', value: shortDate(node.modifiedAt) }]),
  ];
}

export function propertyRowsOf(properties: FileProperties): readonly InfoRow[] {
  return [
    ...(properties.createdAt === null
      ? []
      : [{ key: 'created', label: 'Created', value: shortDate(properties.createdAt) }]),
    { key: 'owner', label: 'Owner', value: properties.owner },
    { key: 'group', label: 'Group', value: properties.group },
    {
      key: 'mode',
      label: 'Permissions',
      value: `${permissionWords(properties.permissions)} · ${modeText(properties.permissions.mode)}`,
    },
    ...(properties.linkTarget === null
      ? []
      : [{ key: 'link', label: 'Link to', value: properties.linkTarget }]),
  ];
}

export function infoRowsOf(
  node: ComputerNode,
  properties: FileProperties | undefined,
): readonly InfoRow[] {
  const base = baseRowsOf(node);
  return properties === undefined ? base : [...base, ...propertyRowsOf(properties)];
}
