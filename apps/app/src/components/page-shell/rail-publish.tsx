import { useLayoutEffect, useState } from 'react';
import { useIsFocused } from 'expo-router';
import type { RailHost } from './rail-host';
import type { ShellLayout } from './shell-frame';
import type { ShellSections } from './shell-sections';
import type { StandardShellProps } from './shell-types';

export function railSectionsOf(
  shell: StandardShellProps,
  layout: ShellLayout,
): ShellSections | null {
  return layout.rail === null || shell.sections === undefined ? null : shell.sections;
}

export function withoutSections(shell: StandardShellProps): StandardShellProps {
  const { sections, ...rest } = shell;
  return sections === undefined ? shell : rest;
}

export function besideHostedRail(layout: ShellLayout): ShellLayout {
  return { ...layout, rail: null, column: { left: layout.gutter, width: layout.column.width } };
}

export function RailPublisher({
  host,
  sections,
}: {
  readonly host: RailHost;
  readonly sections: ShellSections | null;
}): null {
  const focused = useIsFocused();
  const [owner] = useState(() => ({}));
  useLayoutEffect(() => {
    if (focused) host.show(owner, sections);
  }, [focused, host, owner, sections]);
  useLayoutEffect(
    () => (): void => {
      host.drop(owner);
    },
    [host, owner],
  );
  return null;
}
