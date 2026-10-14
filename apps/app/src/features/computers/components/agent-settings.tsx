import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { CLAUDE_PROVIDER_OPTIONS, type ClaudeProviderOptions } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ActionRow, NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { TextField } from '../../../components/text-field';
import { Text } from '../../../components/text';
import { agentDraft, AgentFields } from './agent-fields';
import { AgentMcp } from './agent-mcp';

type Agents = NonNullable<ClaudeProviderOptions['agents']>;
function AgentForm({
  name: original,
  agents,
  save,
}: {
  readonly name: string | null;
  readonly agents: Agents;
  readonly save: (agents: Agents) => void;
}): ReactNode {
  const [name, setName] = useState(original ?? '');
  const [draft, change] = useState<Readonly<Record<string, unknown>>>(
    original === null ? {} : (agents[original] ?? {}),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (): void => {
    if (name !== original && Object.hasOwn(agents, name)) {
      setProblem('An agent with this name already exists.');
      return;
    }
    const rest = Object.fromEntries(Object.entries(agents).filter(([key]) => key !== original));
    const checked = CLAUDE_PROVIDER_OPTIONS.shape.agents.safeParse({
      ...rest,
      [name]: agentDraft(draft),
    });
    if (checked.success && checked.data !== undefined) save(checked.data);
    else
      setProblem(
        checked.error?.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ') ?? 'Agent settings are invalid.',
      );
  };
  return (
    <View className="gap-4">
      <TextField label="Agent name" value={name} onChange={setName} />
      <AgentFields value={draft} change={change} />
      <AgentMcp value={draft} change={change} />
      {problem === null ? null : <Text tone="critical">{problem}</Text>}
      <Button label="Save agent" onPress={submit} />
    </View>
  );
}
function AgentRows({
  agents,
  change,
  edit,
}: {
  readonly agents: Agents;
  readonly change: (agents: Agents) => void;
  readonly edit: (name: string | null) => void;
}): ReactNode {
  return (
    <List
      title="Custom agents"
      footer="Local agent instructions for this computer’s provider. Runtime discovery also lists installed agents."
    >
      {Object.entries(agents).map(([key, agent]) => (
        <View key={key}>
          <NavRow
            title={key}
            subtitle={agent.description}
            onPress={() => {
              edit(key);
            }}
          />
          <ActionRow
            title={`Remove ${key}`}
            destructive
            onPress={() => {
              change(Object.fromEntries(Object.entries(agents).filter(([name]) => name !== key)));
            }}
          />
        </View>
      ))}
      <ActionRow
        title="Add agent"
        onPress={() => {
          edit(null);
        }}
      />
    </List>
  );
}
export function AgentSettings({
  agents,
  change,
}: {
  readonly agents: Agents;
  readonly change: (agents: Agents) => void;
}): ReactNode {
  const [name, setName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <AgentRows
        agents={agents}
        change={change}
        edit={(value) => {
          setName(value);
          setOpen(true);
        }}
      />
      <Sheet
        open={open}
        title="Custom agent"
        onClose={() => {
          setOpen(false);
        }}
        detents={['full']}
      >
        {open ? (
          <AgentForm
            key={name ?? 'new'}
            name={name}
            agents={agents}
            save={(value) => {
              change(value);
              setOpen(false);
            }}
          />
        ) : null}
      </Sheet>
    </>
  );
}
