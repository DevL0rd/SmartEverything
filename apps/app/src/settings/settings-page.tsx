import { useEffect, type ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { highlights } from '../components/highlight-anchors';
import { anchorKey } from '../components/highlight-keys';
import { List } from '../components/section';
import { useHighlightAnchor } from '../components/use-highlight-anchor';
import { NavRow } from '../components/rows';
import { shallowEqual, useStoreSelector } from '../store/store-context';
import { useSettingEnv } from './env';
import { settingsOn } from './registry';
import { SettingsRow } from './settings-row';
import { pageAvailable, useBuiltSettingsPages } from './availability';
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

function SettingFrame({
  setting,
  children,
}: {
  readonly setting: SettingDefinition;
  readonly children: ReactNode;
}): ReactNode {
  const anchor = useHighlightAnchor(anchorKey.setting(setting.id), setting.title);
  return (
    <View {...anchor} className="gap-section-gap">
      {children}
    </View>
  );
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
  const pages = childrenOf(page).filter((child) => pageAvailable(child, { env, built }));
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
    return (
      <SettingFrame setting={block.setting}>
        <SettingsRow setting={block.setting} />
      </SettingFrame>
    );
  }
  return (
    <List inset {...(block.section === '' ? {} : { title: block.section })}>
      {block.rows.map((setting) => (
        <SettingFrame key={setting.id} setting={setting}>
          <SettingsRow setting={setting} />
        </SettingFrame>
      ))}
    </List>
  );
}

function useUrlHighlight(settingId: string | undefined): void {
  useEffect(() => {
    if (settingId === undefined) {
      return undefined;
    }
    const leaving = new AbortController();
    background(
      highlights.request([anchorKey.setting(settingId)], leaving.signal),
      'settings.highlight_failed',
    );
    return (): void => {
      leaving.abort();
    };
  }, [settingId]);
}

export function SettingsPageBody({ page }: { readonly page: string }): ReactNode {
  const env = useSettingEnv();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const settings = settingsOn(page, env);
  const shown = useStoreSelector(
    (state) =>
      settings.filter((setting) => setting.when?.(state) ?? true).map((setting) => setting.id),
    shallowEqual,
  );
  const allVisible = settings.filter((setting) => shown.includes(setting.id));
  const listed = allVisible.find((setting) => setting.id === focus);
  useUrlHighlight(listed?.control === 'listed' ? listed.in : focus);
  const render = (list: readonly SettingDefinition[]): ReactNode =>
    blocksOf(list.filter((setting) => setting.control !== 'listed')).map((block) => (
      <BlockView key={block.key} block={block} />
    ));
  const definition = settingsPage(page);
  const subPages = definition?.childrenInline === false ? null : <SubPages page={page} env={env} />;
  const first = definition?.subPagesFirst === true;
  return (
    <>
      {render(allVisible.filter((setting) => setting.beforeSubPages === true))}
      {first ? subPages : null}
      {render(allVisible.filter((setting) => setting.beforeSubPages !== true))}
      {first ? null : subPages}
    </>
  );
}
