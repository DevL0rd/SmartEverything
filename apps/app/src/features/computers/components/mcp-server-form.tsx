import { Logger } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { z } from 'zod';
import {
  CLAUDE_MCP_SERVER,
  CLAUDE_MCP_SERVERS,
  type ClaudeMcpServers,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { McpToolPolicyFields, type McpToolPolicies } from './mcp-tool-policies';
import { TextField } from '../../../components/text-field';

const log = new Logger('app.computers');
function pairsOf(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const index = line.indexOf('=');
        if (index < 1) throw new Error('Use one name=value per line.');
        return [line.slice(0, index).trim(), line.slice(index + 1)];
      }),
  );
}
function pairText(values: Readonly<Record<string, string>> | undefined): string {
  return Object.entries(values ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}
interface ServerFields {
  readonly type: 'stdio' | 'http' | 'sse';
  readonly command: string;
  readonly args: string;
  readonly env: string;
  readonly url: string;
  readonly headers: string;
  readonly timeout: string;
  readonly alwaysLoad: boolean;
  readonly tools: McpToolPolicies;
}
function transportFields(
  server: z.infer<typeof CLAUDE_MCP_SERVER> | undefined,
): Pick<ServerFields, 'command' | 'args' | 'env' | 'url' | 'headers' | 'tools'> {
  if (server === undefined)
    return { command: '', args: '', env: '', url: '', headers: '', tools: [] };
  if (server.type === 'stdio')
    return {
      command: server.command,
      args: (server.args ?? []).join('\n'),
      env: pairText(server.env),
      url: '',
      headers: '',
      tools: [],
    };
  return {
    command: '',
    args: '',
    env: '',
    url: server.url,
    headers: pairText(server.headers),
    tools: server.tools ?? [],
  };
}
function initialFields(server: z.infer<typeof CLAUDE_MCP_SERVER> | undefined): ServerFields {
  return {
    ...transportFields(server),
    type: server?.type ?? 'stdio',
    timeout: server?.timeout === undefined ? '' : String(server.timeout),
    alwaysLoad: server?.alwaysLoad === true,
  };
}
function transportOf(fields: ServerFields): z.infer<typeof CLAUDE_MCP_SERVER> {
  const common = {
    alwaysLoad: fields.alwaysLoad,
    ...(fields.timeout === '' ? {} : { timeout: Number(fields.timeout) }),
  };
  if (fields.type === 'stdio')
    return CLAUDE_MCP_SERVER.parse({
      ...common,
      type: fields.type,
      command: fields.command,
      args: fields.args.split('\n').filter((line) => line !== ''),
      env: pairsOf(fields.env),
    });
  const tools = fields.tools;
  return CLAUDE_MCP_SERVER.parse({
    ...common,
    type: fields.type,
    url: fields.url,
    headers: pairsOf(fields.headers),
    tools,
  });
}
function TransportFields({
  fields,
  change,
}: {
  readonly fields: ServerFields;
  readonly change: (value: ServerFields) => void;
}): ReactNode {
  const entries =
    fields.type === 'stdio'
      ? ([
          { key: 'command', title: 'Command', help: 'Program to run on this computer' },
          { key: 'args', title: 'Arguments', help: 'One argument per line' },
          { key: 'env', title: 'Environment', help: 'One name=value per line' },
        ] as const)
      : ([
          { key: 'url', title: 'Server URL', help: 'HTTP or HTTPS endpoint' },
          { key: 'headers', title: 'Headers', help: 'One name=value per line' },
        ] as const);
  return (
    <>
      {entries.map((field) => (
        <TextField
          key={field.key}
          label={field.title}
          helper={field.help}
          value={fields[field.key]}
          multiline={field.key !== 'command' && field.key !== 'url'}
          onChange={(text) => {
            change({ ...fields, [field.key]: text });
          }}
        />
      ))}
    </>
  );
}
function ServerOptions({
  fields,
  change,
}: {
  readonly fields: ServerFields;
  readonly change: (fields: ServerFields) => void;
}): ReactNode {
  return (
    <>
      <SelectRow
        title="Transport"
        value={fields.type}
        options={(['stdio', 'http', 'sse'] as const).map((type) => ({ value: type, label: type }))}
        onChange={(type) => {
          change({ ...fields, type });
        }}
      />
      <TransportFields fields={fields} change={change} />
      {fields.type === 'stdio' ? null : (
        <McpToolPolicyFields
          tools={fields.tools}
          change={(tools) => {
            change({ ...fields, tools });
          }}
        />
      )}
      <TextField
        label="Timeout in milliseconds"
        helper="Leave empty for the default. 1,000–3,600,000 ms"
        kind="number"
        value={fields.timeout}
        onChange={(timeout) => {
          change({ ...fields, timeout });
        }}
      />
      <SwitchRow
        title="Always load"
        value={fields.alwaysLoad}
        onChange={(alwaysLoad) => {
          change({ ...fields, alwaysLoad });
        }}
      />
    </>
  );
}
export function McpServerForm({
  name: original,
  servers,
  save,
}: {
  readonly name: string | null;
  readonly servers: ClaudeMcpServers;
  readonly save: (servers: ClaudeMcpServers) => void;
}): ReactNode {
  const server = original === null ? undefined : servers[original];
  const [name, setName] = useState(original ?? '');
  const [fields, change] = useState(initialFields(server));
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (): void => {
    try {
      if (name !== original && servers[name] !== undefined)
        throw new Error('A server with this name already exists.');
      const value = transportOf(fields);
      const previous = Object.fromEntries(
        Object.entries(servers).filter(([key]) => key !== original),
      );
      save(CLAUDE_MCP_SERVERS.parse({ ...previous, [name]: value }));
      log.info('mcp_server.submitted', { renamed: name !== original, created: original === null });
    } catch (error) {
      log.warn('mcp_server.invalid', {
        error: error instanceof Error ? error.name : typeof error,
        created: original === null,
      });
      setProblem(error instanceof Error ? error.message : 'Server settings are invalid.');
    }
  };
  return (
    <View className="gap-4">
      <TextField
        label="Server name"
        helper="Letters, numbers, underscore or hyphen. The home bridge is protected."
        value={name}
        onChange={setName}
      />
      <ServerOptions fields={fields} change={change} />
      {problem === null ? null : <Text tone="critical">{problem}</Text>}
      <Button label="Save server" onPress={submit} />
    </View>
  );
}
