import { isMcpToolName } from './served';

export const MCP_TOOL_DOMAINS = [
  'home',
  'room',
  'provider',
  'place',
  'weather',
  'device',
  'group',
  'remote',
  'phone',
  'watch',
  'scene',
  'history',
  'event',
  'camera',
  'sight',
  'transcript',
  'listening',
  'schedule',
  'signal',
  'automation',
  'automation_runs',
  'secret',
  'value',
  'health',
  'food',
  'person',
  'presence',
  'settings',
  'talk',
  'reference',
  'project',
  'browser',
  'image',
  'chat',
  'subagent',
  'widget',
  'app',
  'model',
  'usage',
  'outreach',
  'voice',
  'call',
  'inbox',
  'machine',
  'tool',
  'tool_result',
  'operation',
  'computer',
  'computer_audio',
  'computer_display',
  'computer_system',
  'computer_app',
  'process',
  'file',
  'claude',
  'plugin',
] as const;

export const MCP_TOOL_VERBS = [
  'read',
  'find',
  'search',
  'edit',
  'control',
  'run',
  'stop',
  'press',
  'record',
  'look',
  'log',
  'send',
  'post',
  'notify',
  'speak',
  'show',
  'gen',
  'call',
  'start',
  'end',
  'switch',
  'sync',
  'answer',
  'use',
  'set',
  'capture',
] as const;

const DOMAIN_SET: ReadonlySet<string> = new Set(MCP_TOOL_DOMAINS);
const VERB_SET: ReadonlySet<string> = new Set(MCP_TOOL_VERBS);

export function mcpToolScheme(name: string): { readonly domain: string; readonly verb: string } {
  const cut = name.lastIndexOf('_');
  return { domain: name.slice(0, cut), verb: name.slice(cut + 1) };
}

export function looksLikeMcpTool(word: string): boolean {
  const { domain, verb } = mcpToolScheme(word);
  return DOMAIN_SET.has(domain) && VERB_SET.has(verb);
}

export function isUnknownMcpTool(word: string): boolean {
  return looksLikeMcpTool(word) && !isMcpToolName(word);
}
