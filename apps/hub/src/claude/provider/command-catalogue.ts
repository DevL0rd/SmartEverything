import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { JSON_VALUE, AI_NATIVE_COMMAND_DESCRIPTOR, type JsonValue } from '@smarteverything/domain';
import { ProviderInputError } from './input';
import { canonicalRuntimeInput } from '../../computers/runtime-receipts';

export const CLAUDE_COMMAND_CAPABILITY_REVISION = 'claude-sdk-0.3.296-commands-r2';
export const CLAUDE_COMPACT_NAME = 'compact';
const COMMAND = z.object({
  name: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\s/]+$/),
  description: z.string().max(4000),
  argumentHint: z.string().max(2000),
  aliases: z
    .array(
      z
        .string()
        .min(1)
        .max(200)
        .regex(/^[^\s/]+$/),
    )
    .max(100)
    .optional(),
  builtin: z.boolean().optional(),
});
type NativeCommand = z.infer<typeof COMMAND>;
type Descriptor = z.infer<typeof AI_NATIVE_COMMAND_DESCRIPTOR>;
const TERMINAL = new Set([
  'help',
  'exit',
  'quit',
  'login',
  'logout',
  'theme',
  'vim',
  'terminal-setup',
  'keybindings',
  'copy',
]);
const CHANGES_SESSION = new Set([
  'clear',
  'new',
  'resume',
  'fork',
  'remote-control',
  'teleport',
  'desktop',
]);
const CHANGES_OPTIONS = new Set([
  'model',
  'permissions',
  'config',
  'settings',
  'add-dir',
  'fast',
  'effort',
  'output-style',
]);

export class ProviderCommandCatalogue {
  private commands: NativeCommand[] = [];
  private terminal = new Set<string>();
  private initialized = false;
  async refresh(query: Query): Promise<void> {
    this.commands = z
      .array(COMMAND)
      .max(2000)
      .parse(await query.supportedCommands());
  }
  capture(message: SDKMessage): void {
    if (message.type !== 'system') return;
    if (message.subtype === 'init') {
      this.initialized = true;
      this.terminal = new Set(message.terminal_slash_commands ?? []);
    }
    if (message.subtype === 'commands_changed')
      this.commands = z.array(COMMAND).max(2000).parse(message.commands);
  }
  get revision(): string {
    return digest({
      commands: this.commands,
      terminal: [...this.terminal].sort(),
      initialized: this.initialized,
    });
  }
  descriptors(): Descriptor[] {
    return this.commands
      .filter((command) => !this.isTerminal(command))
      .map((command) => this.describe(command));
  }
  select(definition: string, revision: string): Descriptor {
    if (!this.initialized || revision !== this.revision)
      throw new ProviderInputError(
        'The Claude command catalogue or initialized native session changed.',
      );
    const matches = this.descriptors().filter((entry) => entry.definition_id === definition);
    const command = matches[0];
    if (matches.length !== 1 || command?.enabled !== true)
      throw new ProviderInputError(
        command?.unavailable_reason ??
          'The exact native command definition is unavailable or ambiguous.',
      );
    return command;
  }
  private isTerminal(command: NativeCommand): boolean {
    return (
      this.terminal.has(command.name) || (command.builtin === true && TERMINAL.has(command.name))
    );
  }
  private describe(command: NativeCommand): Descriptor {
    const reason = this.unavailableReason(command);
    return AI_NATIVE_COMMAND_DESCRIPTOR.parse({
      definition_id: `claude:slash:${digest(command)}`,
      name: command.name,
      description: command.description || `Run /${command.name} in this owned native session.`,
      aliases: (command.aliases ?? []).filter((alias) => this.aliasResolves(alias, command)),
      builtin: command.builtin === true,
      source: command.builtin === true ? 'builtin' : 'native',
      native_name: command.name,
      path: null,
      enabled: reason === null,
      argument_hint: command.argumentHint,
      arguments: true,
      attachments: false,
      unavailable_reason: reason,
    });
  }
  private unavailableReason(command: NativeCommand): string | null {
    const named = this.commands.filter((entry) => entry.name === command.name);
    const builtins = named.filter((entry) => entry.builtin === true);
    const winners = builtins.length === 0 ? named : builtins;
    let reason: string | null = null;
    if (!this.initialized) reason = 'The native session has not published initialization.';
    else if (winners.length !== 1 || winners[0] !== command)
      reason = 'Native name precedence selects another or ambiguous definition.';
    else if (command.builtin === true && CHANGES_SESSION.has(command.name))
      reason =
        'This command changes native session ownership; atomic shared-chat rebinding is unavailable.';
    else if (command.builtin === true && CHANGES_OPTIONS.has(command.name))
      reason =
        'Use the owned provider settings/control operation so model and permission bindings remain synchronized.';
    return reason;
  }
  private aliasResolves(alias: string, command: NativeCommand): boolean {
    if (this.commands.some((entry) => entry.name === alias)) return false;
    const matches = this.commands.filter((entry) => (entry.aliases ?? []).includes(alias));
    return matches.length === 1 && matches[0] === command && !this.terminal.has(alias);
  }
  raw(): JsonValue {
    const value: unknown = JSON.parse(JSON.stringify(this.commands));
    return JSON_VALUE.parse(value);
  }
}
function digest(value: unknown): string {
  return createHash('sha256').update(canonicalRuntimeInput(value)).digest('hex');
}
