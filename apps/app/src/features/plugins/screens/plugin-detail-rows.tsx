import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { pluginAdds, pluginPowers, type PluginRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { confirm } from '../../../components/confirm-store';
import { ListRow } from '../../../components/list-row';
import { ActionRow, NavRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { plural } from '../../../format/text';
import { notify } from '../../../components/toast-store';
import { usePluginTool, type PluginToolResult } from '../../../plugins/use-plugin-tool';
import { remove, restart, savePlugin, switchPlugin } from '../data/plugin-actions';
import { usePluginTools } from '../data/plugin-queries';

export function PowerRows({ row }: { readonly row: PluginRow }): ReactNode {
  const powers = pluginPowers(row.manifest);
  const adds = pluginAdds(row.manifest);
  return (
    <List inset title="What it can do">
      {[
        ...powers.map((power) => <ListRow key={power} icon="shield" title={power} />),
        ...adds.map((add) => <ListRow key={add} icon="plus" title={`Adds ${add}`} />),
        ...(powers.length + adds.length === 0
          ? [<ListRow key="tools" icon="wrench" title="Offers tools to your AI" />]
          : []),
      ]}
    </List>
  );
}

function trust(row: PluginRow, on: boolean): void {
  const change = (): void => {
    void savePlugin(row, { trusted: on }, 'The sandbox setting wasn’t saved');
  };
  if (!on) {
    change();
    return;
  }
  void confirm({
    title: `Run ${row.manifest.name} outside the sandbox?`,
    body: 'It can then read and change any file your account can. Only do this for plugins you trust.',
    confirmLabel: 'Run outside',
    tone: 'destructive',
  }).then((accepted) => {
    if (accepted) {
      change();
    }
  });
}

export function SwitchRows({ row }: { readonly row: PluginRow }): ReactNode {
  return (
    <List inset>
      <SwitchRow
        icon="power"
        title="On"
        value={row.enabled}
        onChange={(on) => void switchPlugin(row, on)}
      />
      {row.source === 'local' ? (
        <SwitchRow
          icon="shield"
          title="Run outside the sandbox"
          subtitle="Lets it use files outside its own folder"
          value={row.trusted}
          onChange={(on) => {
            trust(row, on);
          }}
        />
      ) : null}
    </List>
  );
}

function toolsValue(row: PluginRow, count: number | undefined): string {
  if (row.status !== 'running') {
    return 'When it runs';
  }
  return count === undefined ? '' : plural(count, 'tool');
}

function reportDone(result: PluginToolResult | null): void {
  const done = result?.['done'];
  if (typeof done === 'string') {
    notify({ message: done, tone: 'positive' });
  }
}

export function ToolRows({ row }: { readonly row: PluginRow }): ReactNode {
  const tools = usePluginTools(row).data;
  const runner = usePluginTool(row.id);
  const setup = (tools ?? []).filter((tool) => tool.human_only && tool.name.startsWith('setup_'));
  return (
    <List inset>
      {[
        ...setup.map((tool) => (
          <ActionRow
            key={tool.name}
            icon="wrench"
            title={tool.title}
            onPress={() => {
              void runner.run(tool.name, {}).then(reportDone);
            }}
          />
        )),
        <NavRow
          key="tools"
          icon="list"
          title="Tools"
          value={toolsValue(row, tools?.length)}
          href={href.pluginSettings(row.id, 'tools')}
        />,
        ...(row.manifest.permissions.inbound
          ? [
              <NavRow
                key="people"
                icon="users"
                title="People"
                href={href.pluginSettings(row.id, 'people')}
              />,
            ]
          : []),
      ]}
    </List>
  );
}

export function UpkeepRows({ row }: { readonly row: PluginRow }): ReactNode {
  const router = useRouter();
  return (
    <List inset>
      <NavRow icon="fileText" title="Log" href={href.pluginSettings(row.id, 'log')} />
      {row.enabled ? (
        <ActionRow
          icon="refresh"
          title="Restart"
          onPress={() => {
            restart(row);
          }}
        />
      ) : null}
      {row.source === 'builtin' ? null : (
        <ActionRow
          icon="trash"
          title={`Remove ${row.manifest.name}`}
          destructive
          onPress={() => {
            void remove(row).then((removed) => {
              if (removed) {
                router.replace(href.settings.page('plugins'));
              }
            });
          }}
        />
      )}
    </List>
  );
}
