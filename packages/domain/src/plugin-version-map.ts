import { z } from 'zod';
import { IDENT } from './automation-v3/ident';

export const VERSION_MAP = {
  renamed: z.record(IDENT, IDENT).optional(),
  removedPorts: z.array(IDENT).optional(),
  replacedBy: z.string().trim().min(1).optional(),
};

interface DeclaredVersionMap {
  readonly renamed?: Readonly<Record<string, string>> | undefined;
  readonly removedPorts?: readonly string[] | undefined;
}

export function versionMapProblems(
  map: DeclaredVersionMap,
  ports: readonly string[],
): readonly string[] {
  return [
    ...Object.entries(map.renamed ?? {}).flatMap(([from, to]) => [
      ...(ports.includes(from) ? [`renamed lists ${from}, which is still declared`] : []),
      ...(ports.includes(to) ? [] : [`${from} is renamed to ${to}, which is not declared`]),
    ]),
    ...(map.removedPorts ?? [])
      .filter((name) => ports.includes(name))
      .map((name) => `removedPorts lists ${name}, which is still declared`),
  ];
}
