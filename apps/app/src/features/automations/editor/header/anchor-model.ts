import type { AutomationV4 } from '@smarteverything/domain';

export const HEADER_ANCHOR = 'header';

export function headerAnchorKey(program: AutomationV4): string {
  return program.triggers[0]?.key ?? HEADER_ANCHOR;
}
