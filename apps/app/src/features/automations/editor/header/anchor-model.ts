import type { AutomationV3 } from '@smarteverything/domain';

export const HEADER_ANCHOR = 'header';

export function headerAnchorKey(program: AutomationV3): string {
  return program.triggers[0]?.key ?? HEADER_ANCHOR;
}
