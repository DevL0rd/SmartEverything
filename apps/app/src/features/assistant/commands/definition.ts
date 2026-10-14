import type { CommandDescriptor } from './types';
export function commandDefinition(
  commands: readonly CommandDescriptor[],
  name: string,
  definitionId: string | null,
): CommandDescriptor | undefined {
  const matches = commands.filter((command) =>
    definitionId === null
      ? command.name === name || command.aliases.includes(name)
      : command.id === definitionId && (command.name === name || command.aliases.includes(name)),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
