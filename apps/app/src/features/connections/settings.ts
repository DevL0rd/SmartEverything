import { href } from '../../app-shell/hrefs';
import type { SettingDefinition, SettingEnv } from '../../settings/types';
import { ASSISTANTS } from './model/assistants';
import { toolsSummary } from './model/tools';

const owner = (env: SettingEnv): boolean => env.owner;

const ACCOUNTS: readonly SettingDefinition[] = [
  {
    id: 'connections.xiaomi',
    page: 'connections/add',
    title: 'Link a Xiaomi account',
    icon: 'link',
    keywords: ['mi home', 'mijia', 'sign in', 'provider'],
    scope: 'server',
    visible: owner,
    control: 'link',
    href: href.connect('xiaomi'),
  },
  {
    id: 'connections.tuya',
    page: 'connections/add',
    title: 'Link Smart Life',
    icon: 'link',
    keywords: ['tuya', 'user code', 'provider'],
    scope: 'server',
    visible: owner,
    control: 'link',
    href: href.connect('tuya'),
  },
  {
    id: 'connections.tuya-developer',
    page: 'connections/add',
    title: 'Tuya developer project',
    icon: 'remote',
    keywords: ['ir', 'remotes', 'blaster', 'learning', 'iot.tuya.com'],
    scope: 'server',
    visible: owner,
    control: 'link',
    href: href.connect('tuya-developer'),
  },
  {
    id: 'connections.smartthings',
    page: 'connections/add',
    title: 'Link SmartThings',
    icon: 'link',
    keywords: ['samsung', 'token', 'provider'],
    scope: 'server',
    visible: owner,
    control: 'link',
    href: href.connect('smartthings'),
  },
];

const ASSISTANT_SETTINGS: readonly SettingDefinition[] = [
  ...ASSISTANTS.map((assistant): SettingDefinition => ({
    id: `assistants.${assistant.key}`,
    page: 'assistant/integrations',
    title: `Connect ${assistant.name}`,
    icon: 'sparkles',
    keywords: ['ai', 'mcp', 'assistant', assistant.name.toLowerCase()],
    scope: 'server',
    visible: owner,
    control: 'link',
    href: href.assistant(assistant.key),
  })),
  {
    id: 'assistants.tools',
    page: 'assistant/integrations/tools',
    title: 'Tools assistants can use',
    icon: 'wrench',
    keywords: ['mcp tools', 'permissions', 'control'],
    scope: 'server',
    visible: owner,
    control: 'link',
    href: href.settings.page('assistant/integrations/tools'),
    value: (state) =>
      state.settings === null ? null : toolsSummary(state.settings.mcp_disabled_tools),
  },
  {
    id: 'assistants.code',
    page: 'assistant/integrations',
    title: 'Show an approval code',
    icon: 'qr',
    keywords: ['approval', 'code', 'consent'],
    scope: 'server',
    visible: owner,
    control: 'link',
    href: href.settings.page('assistant/integrations'),
  },
];

const SERVER: readonly SettingDefinition[] = [
  {
    id: 'server.public-url',
    page: 'server',
    title: 'Public address',
    icon: 'globe',
    keywords: ['public url', 'remote access', 'tunnel', 'https', 'verify'],
    scope: 'server',
    control: 'link',
    href: href.settings.page('server'),
    value: (state) => state.settings?.public_url ?? null,
  },
  {
    id: 'server.firewall-fix',
    page: 'server/firewall',
    title: 'Fix the firewall',
    icon: 'shield',
    keywords: ['ports', 'blocked camera', 'ufw', 'firewalld'],
    scope: 'device',
    visible: (env) => env.owner && env.platform === 'desktop',
    control: 'link',
    href: href.firewallFix(),
  },
  {
    id: 'server.unpair',
    page: 'server',
    title: 'Unpair this device',
    icon: 'signOut',
    keywords: ['switch server', 'disconnect', 'forget'],
    scope: 'device-local',
    control: 'link',
    href: href.settings.page('server'),
  },
];

export const SETTINGS: readonly SettingDefinition[] = [
  ...ACCOUNTS,
  ...ASSISTANT_SETTINGS,
  ...SERVER,
];
