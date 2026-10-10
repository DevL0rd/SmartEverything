import type { ReactNode } from 'react';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import type { PluginInstall } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { installPlugin } from '../../../api/plugin-admin';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { appPlatform } from '../../../design/platform';
import { SettingsFrame } from '../../../settings/settings-frame';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';

type Source = PluginInstall['source'];

const LINK = /^https?:\/\/[^\s/?#]+[^\s]*$/;

function linkProblem(value: string): string | null {
  return LINK.test(value) ? null : 'Enter a link starting with https://';
}

function requestOf(
  source: Source,
  install: (body: PluginInstall) => Promise<void>,
): TextEditRequest {
  if (source === 'url') {
    return {
      title: 'Add from a link',
      label: 'Plugin link',
      initial: '',
      placeholder: 'https://example.com/mcp',
      confirmLabel: 'Add',
      maxLength: 500,
      kind: 'url',
      helper: 'The address of the plugin’s MCP server.',
      problemOf: linkProblem,
      save: (url) => install({ source: 'url', url }),
    };
  }
  return {
    title: 'Add from this computer',
    label: 'Plugin folder',
    initial: '',
    placeholder: '/home/you/plugins/my-plugin',
    confirmLabel: 'Add',
    maxLength: 1000,
    helper: 'A folder with a smarteverything-plugin.json file.',
    save: (path) => install({ source: 'local', path }),
  };
}

export function AddPluginScreen(): ReactNode {
  const router = useRouter();
  const [source, setSource] = useState<Source | null>(null);
  const install = async (body: PluginInstall): Promise<void> => {
    const row = await installPlugin(body);
    router.replace(href.pluginSettings(row.id));
  };
  return (
    <SettingsFrame page="plugins/add">
      <Text variant="callout" tone="variant" className="px-4">
        Added plugins start switched off, so you can look at what they do first.
      </Text>
      <List inset>
        <NavRow
          icon="link"
          title="From a link"
          subtitle="A plugin running on the web or your network"
          onPress={() => {
            setSource('url');
          }}
        />
        {appPlatform() === 'desktop' ? (
          <NavRow
            icon="monitor"
            title="From this computer"
            subtitle="A plugin folder on the server’s computer"
            onPress={() => {
              setSource('local');
            }}
          />
        ) : null}
      </List>
      <TextEditSheet
        request={source === null ? null : requestOf(source, install)}
        onClose={() => {
          setSource(null);
        }}
      />
    </SettingsFrame>
  );
}
