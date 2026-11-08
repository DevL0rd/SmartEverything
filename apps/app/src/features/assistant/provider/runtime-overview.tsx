import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ProviderMetadata } from '@smarteverything/domain';
import { Disclosure } from '../../../components/disclosure';
import { ListRow } from '../../../components/list-row';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { setDraft } from '../data/drafts';
import { ProviderResult } from './provider-result';

const INITIALIZATION_LISTS = [
  { key: 'tools', title: 'Native tools' },
  { key: 'skills', title: 'Skills' },
  { key: 'plugins', title: 'Plugins' },
  { key: 'mcp_servers', title: 'MCP servers' },
] as const;

interface RuntimeValueProps {
  readonly title: string;
  readonly value: string;
}

export function RuntimeValue({ title, value }: RuntimeValueProps): ReactNode {
  return (
    <View className="gap-0.5">
      <Text variant="caption" tone="variant">
        {title}
      </Text>
      <Text variant="footnote" selectable>
        {value}
      </Text>
    </View>
  );
}

export function WorkStatus({ value }: { readonly value: string }): ReactNode {
  return (
    <Text variant="callout" className="px-1">
      <Text variant="label" tone="variant">
        Status ·{' '}
      </Text>
      {value}
    </Text>
  );
}

function RuntimeMetadata({
  metadata,
  runtime,
}: {
  readonly metadata: ProviderMetadata;
  readonly runtime: string;
}): ReactNode {
  const directory = metadata.initialization['cwd'];
  return (
    <>
      <RuntimeValue title={`${runtime} version`} value={metadata.runtime_version} />
      <RuntimeValue
        title="Working directory"
        value={typeof directory === 'string' ? directory : 'Unavailable'}
      />
      {INITIALIZATION_LISTS.map((section) => {
        const value = metadata.initialization[section.key];
        return value === undefined ? (
          <RuntimeValue
            key={section.key}
            title={section.title}
            value="Unavailable from this runtime"
          />
        ) : (
          <ProviderResult key={section.key} title={section.title} value={value} />
        );
      })}
    </>
  );
}

function RuntimeCommands({
  chatId,
  commands,
}: {
  readonly chatId: string;
  readonly commands: ProviderMetadata['commands'];
}): ReactNode {
  if (commands.length === 0) return null;
  return (
    <List title="Commands" footer="Select a command to prepare it in the composer.">
      {commands.map((command) => (
        <NavRow
          key={command.name}
          title={`/${command.name}`}
          subtitle={`${command.description}${command.argument_hint === null ? '' : ` · ${command.argument_hint}`}`}
          onPress={() => {
            setDraft(chatId, `/${command.name} `);
          }}
        />
      ))}
    </List>
  );
}

function DiscoveredAgents({ agents }: { readonly agents: ProviderMetadata['agents'] }): ReactNode {
  if (agents.length === 0) return null;
  return (
    <List title="Runtime agent definitions">
      {agents.map((agent) => (
        <ListRow
          key={agent.name}
          title={agent.name}
          subtitle={agent.description}
          value={agent.model ?? 'Runtime default'}
        />
      ))}
    </List>
  );
}

export function RuntimeOverview({
  chatId,
  metadata,
  runtime = 'Claude Code',
  children,
}: {
  readonly chatId: string;
  readonly metadata: ProviderMetadata | null;
  readonly runtime?: string;
  readonly children: ReactNode;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <View className="gap-3">
      {metadata === null ? null : (
        <>
          <RuntimeCommands chatId={chatId} commands={metadata.commands} />
          <DiscoveredAgents agents={metadata.agents} />
        </>
      )}
      <Disclosure
        label="Runtime details"
        open={open}
        onToggle={() => {
          setOpen(!open);
        }}
        bodyClassName="gap-2 px-1 pb-2"
      >
        {children}
        {metadata === null ? (
          <Text variant="footnote" tone="variant">
            Start a turn on this computer to load runtime details.
          </Text>
        ) : (
          <RuntimeMetadata metadata={metadata} runtime={runtime} />
        )}
      </Disclosure>
    </View>
  );
}
