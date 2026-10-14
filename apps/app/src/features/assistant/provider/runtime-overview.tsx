import type { ReactNode } from 'react';
import type { ProviderMetadata } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { NavRow, ValueRow } from '../../../components/rows';
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

function RuntimeLists({ metadata }: { readonly metadata: ProviderMetadata }): ReactNode {
  return (
    <>
      {INITIALIZATION_LISTS.map((section) => {
        const value = metadata.initialization[section.key];
        return value === undefined ? (
          <Text key={section.key} tone="variant">
            {section.title}: unavailable from this runtime.
          </Text>
        ) : (
          <ProviderResult key={section.key} title={section.title} value={value} />
        );
      })}
    </>
  );
}

export function RuntimeOverview({
  chatId,
  metadata,
  runtime = 'Claude Code',
}: {
  readonly chatId: string;
  readonly metadata: ProviderMetadata;
  readonly runtime?: string;
}): ReactNode {
  return (
    <>
      <List title="Runtime">
        <ValueRow title={`${runtime} version`} value={metadata.runtime_version} />
        <ValueRow
          title="Working directory"
          value={
            typeof metadata.initialization['cwd'] === 'string'
              ? metadata.initialization['cwd']
              : 'Unavailable'
          }
        />
      </List>
      <List
        title="Commands"
        footer="Select a command to prepare it in the existing composer. Add its arguments and send."
      >
        {metadata.commands.map((command) => (
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
      <DiscoveredAgents metadata={metadata} />
      <RuntimeLists metadata={metadata} />
    </>
  );
}

function DiscoveredAgents({ metadata }: { readonly metadata: ProviderMetadata }): ReactNode {
  return (
    <List
      title="Runtime agent definitions"
      footer="These agents were discovered by the selected runtime."
    >
      {metadata.agents.map((agent) => (
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
