import type { Href } from 'expo-router';
import {
  harnessTargetKey,
  type AiHarnessCatalogue,
  type AiHarnessConfigurationCatalogue,
  type AiHarnessExtensions,
  type HarnessExtensionItem,
  type SearchSources,
} from '@smarteverything/domain';
import {
  deviceStatus,
  extensionHref,
  extensionBrowseHref,
  bundledSkillHref,
  hostDescription,
  pageKind,
} from '../features/assistant';
import type { IconName } from '../components/icon';
import type { SourceLinks } from './sources';

export interface ExtensionSearchData {
  readonly extensions: AiHarnessExtensions | undefined;
  readonly configuration: AiHarnessConfigurationCatalogue | undefined;
  readonly inventory: AiHarnessCatalogue | undefined;
}

interface Page {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly to: Href;
  readonly icon?: IconName;
}

function page(out: SourceLinks, parent: string, entry: Page): SearchSources['pages'][number] {
  out.links.set(`page:${entry.path}`, entry.to);
  out.icons.set(`page:${entry.path}`, entry.icon ?? 'puzzle');
  out.parents.set(`page:${entry.path}`, parent);
  return {
    path: entry.path,
    title: entry.title,
    description: entry.description,
    keywords: ['extension', 'skill', 'workspace', entry.title, entry.description],
  };
}

function actionPages(item: HarnessExtensionItem, out: SourceLinks): SearchSources['pages'] {
  const path = `extension:${item.id}`;
  const actions = ['On', 'Off', ...(item.source.kind === 'included' ? [] : ['Remove'])];
  return actions.map((title) =>
    page(out, `page:${path}`, {
      path: `${path}:action:${title}`,
      title,
      description: item.name,
      to: extensionHref(item.id, pageKind(item)),
    }),
  );
}

function itemPages(
  item: HarnessExtensionItem,
  owner: boolean,
  out: SourceLinks,
): SearchSources['pages'] {
  const path = `extension:${item.id}`;
  const root = page(
    out,
    item.kind === 'skill' ? 'setting:page/assistant/skills' : 'setting:page/assistant/extensions',
    {
      path,
      title: item.name,
      description: item.description,
      to: extensionHref(item.id, pageKind(item)),
    },
  );
  const details: readonly Page[] = [
    {
      path: `${path}:devices`,
      title: 'Devices',
      description: item.name,
      to: extensionHref(item.id, pageKind(item), 'devices'),
      icon: 'monitor',
    },
    {
      path: `${path}:source`,
      title: 'Source',
      description: `${item.publisher} · ${item.name}`,
      to: extensionHref(item.id, pageKind(item), 'source'),
      icon: 'link',
    },
    {
      path: `${path}:compatibility`,
      title: 'Works with',
      description: item.platforms.join(', '),
      to: extensionHref(item.id, pageKind(item)),
    },
    ...declaredPages(item),
  ];
  return [
    root,
    ...details.map((entry) => page(out, `page:${path}`, entry)),
    ...(owner ? actionPages(item, out) : []),
  ];
}

function devicePages(data: ExtensionSearchData, out: SourceLinks): SearchSources['pages'] {
  return (data.configuration?.hosts ?? []).map((host) => {
    const description = hostDescription(host, data.inventory);
    const status = deviceStatus(host);
    return page(out, 'setting:page/assistant/extensions', {
      path: `extension-device:${harnessTargetKey(host.target)}`,
      title: description.name,
      description: status.title,
      to: {
        pathname: '/settings/[...page]',
        params: { page: ['assistant', 'extensions'], section: 'devices' },
      },
      icon: 'monitor',
    });
  });
}

export function extensionPages(
  data: ExtensionSearchData,
  owner: boolean,
  out: SourceLinks,
): SearchSources['pages'] {
  const items = data.extensions?.items ?? [];
  return [
    ...browsePages(owner, out),
    ...items.flatMap((item) => itemPages(item, owner, out)),
    ...bundledSkillPages(data, out),
    ...devicePages(data, out),
  ];
}

function declaredPages(item: HarnessExtensionItem): readonly Page[] {
  const path = `extension:${item.id}`;
  return [
    ...item.capabilities.map((title): Page => ({
      path: `${path}:capability:${title}`,
      title,
      description: item.name,
      to: extensionHref(item.id, pageKind(item)),
      icon: 'wrench',
    })),
    ...item.requirements.map((title): Page => ({
      path: `${path}:requirement:${title}`,
      title,
      description: item.name,
      to: extensionHref(item.id, pageKind(item)),
      icon: 'shield',
    })),
  ];
}

function browsePages(owner: boolean, out: SourceLinks): SearchSources['pages'] {
  const entries = [
    page(out, 'setting:page/assistant/extensions', {
      path: 'extension-browse',
      title: 'Browse extensions',
      description: 'Find workspace features',
      to: extensionBrowseHref(),
      icon: 'plus',
    }),
    page(out, 'setting:page/assistant/skills', {
      path: 'skill-browse',
      title: 'Browse skills',
      description: 'Find included instructions and shared skills',
      to: extensionBrowseHref('skill'),
      icon: 'fileText',
    }),
  ];
  if (owner)
    entries.push(
      page(out, 'page:skill-browse', {
        path: 'extension-import',
        title: 'From a skill link',
        description: 'Install a skill or plugin from a git repository',
        to: extensionBrowseHref('skill'),
        icon: 'link',
      }),
    );
  return entries;
}

function bundledSkillPages(data: ExtensionSearchData, out: SourceLinks): SearchSources['pages'] {
  return (data.extensions?.bundled_skills ?? []).flatMap((skill) => {
    const path = `bundled-skill:${skill.id}`;
    return [
      page(out, 'setting:page/assistant/skills', {
        path,
        title: skill.name,
        description: `${skill.description} · Included in SmartEverything`,
        to: bundledSkillHref(skill.id),
        icon: 'fileText',
      }),
      ...bundledSourcePages(skill, path, out),
    ];
  });
}

function bundledSourcePages(
  skill: NonNullable<AiHarnessExtensions['bundled_skills']>[number],
  path: string,
  out: SourceLinks,
): SearchSources['pages'] {
  const source = `${path}:source`;
  const rows = [
    { id: 'publisher', title: 'Publisher', description: `${skill.publisher} · ${skill.name}` },
    { id: 'skill-name', title: 'Skill name', description: skill.id },
    { id: 'revision', title: 'Bundled revision', description: `${skill.name} · ${skill.revision}` },
  ];
  return [
    page(out, `page:${path}`, {
      path: source,
      title: 'Source',
      description: skill.name,
      to: bundledSkillHref(skill.id),
      icon: 'link',
    }),
    ...rows.map((row) =>
      page(out, `page:${source}`, {
        path: `${source}:${row.id}`,
        title: row.title,
        description: row.description,
        to: bundledSkillHref(skill.id),
        icon: 'fileText',
      }),
    ),
    ...bundledCopyPages(skill, source, out),
  ];
}

function bundledCopyPages(
  skill: NonNullable<AiHarnessExtensions['bundled_skills']>[number],
  source: string,
  out: SourceLinks,
): SearchSources['pages'] {
  return [
    page(out, `page:${source}:skill-name`, {
      path: `${source}:skill-name:copy`,
      title: 'Copy skill name',
      description: skill.id,
      to: bundledSkillHref(skill.id),
      icon: 'copy',
    }),
    page(out, `page:${source}:revision`, {
      path: `${source}:revision:copy`,
      title: 'Copy revision',
      description: `${skill.name} · ${skill.revision}`,
      to: bundledSkillHref(skill.id),
      icon: 'copy',
    }),
  ];
}
