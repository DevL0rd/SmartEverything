import type { DshSessionComposition } from '@smarteverything/domain';

const PORTABLE_ALPHA_2_REVISION =
  '47e1ef2aacaa181cafe5ea38fccbe136be0d6d6f6cc1db40a198afc3db87876b';
const ALPHA_2_HOST_CATALOG_REVISIONS: ReadonlySet<string> = new Set([
  'e83a27712aa2b5e74ea52a25ce91d7ac80c67a4acad4fb3c02ae4f215b5748ff',
  'e85c1a2960f8002503b0d012c4b3a6bc1f5387e44b70dc3f694d8ed2c5ec44b1',
  '18a295c6497a8e5fcb34769af4320c32a1f337b19dac0f01f5d6d4e4b6e50bcd',
]);

export function portableRestoreRevision(value: DshSessionComposition): string | undefined {
  if (
    value.dsh_version === '0.2.1-alpha.2' &&
    value.session_format === 4 &&
    value.preset === 'smarteverything' &&
    value.restore_revision !== undefined &&
    ALPHA_2_HOST_CATALOG_REVISIONS.has(value.restore_revision)
  )
    return PORTABLE_ALPHA_2_REVISION;
  return value.restore_revision;
}
