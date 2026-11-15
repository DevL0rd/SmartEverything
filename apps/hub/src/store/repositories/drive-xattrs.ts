import { z } from 'zod';
import type { StoreContext } from '../context';

export const XATTR_NAME_MAX_BYTES = 255;

export const XATTR_VALUE_MAX_BYTES = 65536;

export const XATTR_LIST_MAX_BYTES = 65536;

export const XATTR_NAMESPACES = ['user.', 'trusted.', 'security.'] as const;

export type XattrFlag = 'any' | 'create' | 'replace';

export type XattrRefusal =
  'unsupported' | 'name_invalid' | 'exists' | 'missing' | 'value_too_big' | 'list_too_big';

export type XattrSetResult =
  { readonly stored: true } | { readonly stored: false; readonly refusal: XattrRefusal };

const NAME = z.strictObject({ name: z.string() });

const VALUE = z.strictObject({ value: z.instanceof(Uint8Array) });

const LIST_BYTES = z.strictObject({ bytes: z.number() });

const HELD = z.strictObject({ held: z.number() });

const ENCODER = new TextEncoder();

function byteLength(text: string): number {
  return ENCODER.encode(text).length;
}

export function xattrNameRefusal(name: string): XattrRefusal | null {
  if (name.length === 0 || byteLength(name) > XATTR_NAME_MAX_BYTES) return 'name_invalid';
  const namespace = XATTR_NAMESPACES.find((prefix) => name.startsWith(prefix));
  if (namespace === undefined) return 'unsupported';
  return name.length === namespace.length ? 'name_invalid' : null;
}

export class DriveXattrsRepository {
  constructor(private readonly context: StoreContext) {}

  get(inodeId: number, name: string): Uint8Array | undefined {
    return this.context.sql.get(
      VALUE,
      'select value from drive_xattrs where inode_id = $inodeId and name = $name',
      { inodeId, name },
    )?.value;
  }

  names(inodeId: number): string[] {
    return this.context.sql
      .all(NAME, 'select name from drive_xattrs where inode_id = $inodeId order by name', {
        inodeId,
      })
      .map((row) => row.name);
  }

  listBytes(inodeId: number): number {
    return (
      this.context.sql.get(
        LIST_BYTES,
        `select coalesce(sum(length(cast(name as blob)) + 1), 0) as bytes
          from drive_xattrs where inode_id = $inodeId`,
        { inodeId },
      )?.bytes ?? 0
    );
  }

  set(inodeId: number, name: string, value: Uint8Array, flag: XattrFlag): XattrSetResult {
    const nameRefusal = xattrNameRefusal(name);
    if (nameRefusal !== null) return { stored: false, refusal: nameRefusal };
    if (value.length > XATTR_VALUE_MAX_BYTES) return { stored: false, refusal: 'value_too_big' };
    return this.context.write((): XattrSetResult => {
      const held = this.context.sql.get(
        HELD,
        'select count(*) as held from drive_xattrs where inode_id = $inodeId and name = $name',
        { inodeId, name },
      );
      const exists = (held?.held ?? 0) > 0;
      if (flag === 'create' && exists) return { stored: false, refusal: 'exists' };
      if (flag === 'replace' && !exists) return { stored: false, refusal: 'missing' };
      if (!exists && this.listBytes(inodeId) + byteLength(name) + 1 > XATTR_LIST_MAX_BYTES) {
        return { stored: false, refusal: 'list_too_big' };
      }
      this.context.sql.run(
        'store the extended attribute',
        `insert into drive_xattrs (inode_id, name, value) values ($inodeId, $name, $value)
          on conflict (inode_id, name) do update set value = excluded.value`,
        { inodeId, name, value },
      );
      return { stored: true };
    });
  }

  remove(inodeId: number, name: string): boolean {
    return (
      this.context.write(() =>
        this.context.sql.run(
          'remove the extended attribute',
          'delete from drive_xattrs where inode_id = $inodeId and name = $name',
          { inodeId, name },
        ),
      ) > 0
    );
  }

  copy(fromInodeId: number, toInodeId: number): void {
    this.context.write(() => {
      this.context.sql.run(
        'copy the extended attributes',
        `insert into drive_xattrs (inode_id, name, value)
          select $toInodeId, name, value from drive_xattrs where inode_id = $fromInodeId`,
        { fromInodeId, toInodeId },
      );
    });
  }
}
