import type { GraphNode, ProgramV4 } from '@smarteverything/domain';

export type CalledFunctions = ReadonlyMap<string, { readonly name: string }> | undefined;

const JOIN_DEFAULT = 'Wait for all';
const JOIN_TITLES: Readonly<Record<string, string>> = {
  first: 'First to finish',
  settled: 'Wait for all, record each',
};

export function pathLabel(name: string): string {
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

export function forksOf(
  program: ProgramV4,
  joinOf: ReadonlyMap<string, string>,
): readonly GraphNode[] {
  return program.nodes.filter((node) => joinOf.has(node.key));
}

function joinTitlesOf(
  program: ProgramV4,
  joinOf: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  const joinId = (key: string | undefined): string =>
    program.nodes.find((node) => node.key === key)?.id ?? '';
  return new Map(
    forksOf(program, joinOf).map((fork) => {
      const option = fork.ports?.['join'];
      const chosen =
        option !== undefined && 'lit' in option && typeof option.lit === 'string' ? option.lit : '';
      return [joinId(joinOf.get(fork.key)), JOIN_TITLES[chosen] ?? JOIN_DEFAULT];
    }),
  );
}

const CALL_KIND = 'fn.call';

function calledTitlesOf(
  program: ProgramV4,
  functions: CalledFunctions,
): ReadonlyMap<string, string> {
  if (functions === undefined) return new Map();
  return new Map(
    program.nodes.flatMap((node): (readonly [string, string])[] => {
      const fn = node.ports?.['fn'];
      const id = fn !== undefined && 'lit' in fn && typeof fn.lit === 'string' ? fn.lit : null;
      const name = id === null ? undefined : functions.get(id)?.name;
      return node.kind === CALL_KIND && node.label === undefined && name !== undefined
        ? [[node.id, name]]
        : [];
    }),
  );
}

export function titlesOf(
  program: ProgramV4,
  joinOf: ReadonlyMap<string, string>,
  functions: CalledFunctions,
): ReadonlyMap<string, string> {
  return new Map([...joinTitlesOf(program, joinOf), ...calledTitlesOf(program, functions)]);
}

export function pairsOf(
  program: ProgramV4,
  joinOf: ReadonlyMap<string, string>,
): ReadonlyMap<string, number> {
  const pairs = new Map<string, number>();
  forksOf(program, joinOf).forEach((fork, index) => {
    pairs.set(fork.id, index);
    const join = program.nodes.find((node) => node.key === joinOf.get(fork.key));
    if (join !== undefined) pairs.set(join.id, index);
  });
  return pairs;
}

function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

export function summariesOf(
  program: ProgramV4,
  joinOf: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  return new Map(
    forksOf(program, joinOf).flatMap((fork): (readonly [string, string])[] => {
      const join = program.nodes.find((node) => node.key === joinOf.get(fork.key));
      const names = (fork.paths ?? []).map((path) => pathLabel(path.name));
      if (names.length === 0) return [];
      const own: readonly [string, string] = [fork.id, `Runs ${listed(names)} at once`];
      return join === undefined ? [own] : [own, [join.id, `Waits for ${listed(names)}`]];
    }),
  );
}
