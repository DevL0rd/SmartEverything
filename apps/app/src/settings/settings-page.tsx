import type { ComponentType, ReactNode } from 'react';
import { List } from '../components/section';
import { NavRow } from '../components/rows';
import { shallowEqual, useStoreSelector } from '../store/store-context';
import { useSettingEnv } from './env';
import { settingsOn } from './registry';
import { AnchoredSettingRow } from './settings-row';
import { useSettingsFocus } from './settings-focus';
import { pageReachable, useBuiltSettingsPages } from './availability';
import { childrenOf, pageHref, settingsPage } from './tree';
import type { SettingDefinition, SettingEnv, SettingsPageDefinition } from './types';

type Block =
  | {
      readonly kind: 'rows';
      readonly key: string;
      readonly section: string;
      readonly rows: readonly SettingDefinition[];
    }
  | { readonly kind: 'custom'; readonly key: string; readonly setting: SettingDefinition };

function blocksOf(settings: readonly SettingDefinition[]): readonly Block[] {
  const blocks: Block[] = [];
  for (const setting of settings) {
    if (setting.control === 'custom' && setting.row !== true) {
      blocks.push({ kind: 'custom', key: setting.id, setting });
      continue;
    }
    const section = setting.section ?? '';
    const last = blocks.at(-1);
    if (last?.kind === 'rows' && last.section === section) {
      blocks[blocks.length - 1] = { ...last, rows: [...last.rows, setting] };
    } else {
      blocks.push({ kind: 'rows', key: setting.id, section, rows: [setting] });
    }
  }
  return blocks;
}

function SubPageRow({ page }: { readonly page: SettingsPageDefinition }): ReactNode {
  const summary = useStoreSelector((state) => page.summary?.(state) ?? null);
  return (
    <NavRow
      title={page.title}
      icon={page.icon}
      href={pageHref(page)}
      {...(page.subtitle === undefined ? {} : { subtitle: page.subtitle })}
      {...(summary === null ? {} : { value: summary })}
    />
  );
}

function SubPages({ page, env }: { readonly page: string; readonly env: SettingEnv }): ReactNode {
  const built = useBuiltSettingsPages();
  const pages = childrenOf(page).filter((child) => pageReachable(child, { env, built }));
  if (pages.length === 0) {
    return null;
  }
  return (
    <List inset>
      {pages.map((child) => (
        <SubPageRow key={child.id} page={child} />
      ))}
    </List>
  );
}

function BlockView({ block }: { readonly block: Block }): ReactNode {
  if (block.kind === 'custom') {
    return <AnchoredSettingRow setting={block.setting} />;
  }
  return (
    <List inset {...(block.section === '' ? {} : { title: block.section })}>
      {block.rows.map((setting) => (
        <AnchoredSettingRow key={setting.id} setting={setting} />
      ))}
    </List>
  );
}

export type SettingsBlocksLayout = ComponentType<{ readonly children: ReactNode }>;

export function SettingsPageBody({
  page,
  BlocksLayout,
}: {
  readonly page: string;
  readonly BlocksLayout?: SettingsBlocksLayout;
}): ReactNode {
  const env = useSettingEnv();
  const settings = settingsOn(page, env);
  const shown = useStoreSelector(
    (state) =>
      settings.filter((setting) => setting.when?.(state) ?? true).map((setting) => setting.id),
    shallowEqual,
  );
  const allVisible = settings.filter((setting) => shown.includes(setting.id));
  useSettingsFocus(allVisible);
  const definition = settingsPage(page);
  const blocks = blocksOf(allVisible.filter((setting) => setting.control !== 'listed')).map(
    (block) => <BlockView key={block.key} block={block} />,
  );
  return (
    <>
      {BlocksLayout === undefined ? blocks : <BlocksLayout>{blocks}</BlocksLayout>}
      {definition?.childrenInline === false ? null : <SubPages page={page} env={env} />}
    </>
  );
}
