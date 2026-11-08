import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { NavRow } from '../../../components/rows';
import { List, Section } from '../../../components/section';
import { Text } from '../../../components/text';
import { useSettingEnv } from '../../../settings/env';
import { useSettingsFocus } from '../../../settings/settings-focus';
import { SettingsFrame } from '../../../settings/settings-frame';
import { AnchoredSettingRow } from '../../../settings/settings-row';
import { pageHref } from '../../../settings/tree';
import { RUNTIME_LOGS_PAGE } from '../../../settings/tree-developer';
import type { SettingDefinition, SettingEnv } from '../../../settings/types';
import { DEVELOPER_SECTIONS as SECTION, DEVELOPER_SETTINGS } from '../settings';

type SectionName = (typeof SECTION)[keyof typeof SECTION];

const PANEL = 'min-w-0 max-w-reading grow shrink basis-96 gap-section-gap';

function rowsIn(settings: readonly SettingDefinition[], section: SectionName): ReactNode {
  return settings
    .filter((setting) => setting.section === section)
    .map((setting) => <AnchoredSettingRow key={setting.id} setting={setting} />);
}

function ProfilingGroup({
  title,
  caption,
}: {
  readonly title: string;
  readonly caption?: string;
}): ReactNode {
  return (
    <View className="gap-0.5 bg-surface-2 px-4 py-2.5">
      <Text variant="body-strong" accessibilityRole="header">
        {title}
      </Text>
      {caption === undefined ? null : (
        <Text variant="footnote" tone="variant">
          {caption}
        </Text>
      )}
    </View>
  );
}

function DeveloperTools({
  settings,
  env,
}: {
  readonly settings: readonly SettingDefinition[];
  readonly env: SettingEnv;
}): ReactNode {
  return (
    <View className={PANEL}>
      <List inset title={SECTION.logs}>
        <NavRow
          title={RUNTIME_LOGS_PAGE.title}
          subtitle={RUNTIME_LOGS_PAGE.subtitle}
          icon={RUNTIME_LOGS_PAGE.icon}
          href={pageHref(RUNTIME_LOGS_PAGE)}
          wrapSubtitle
        />
        {rowsIn(settings, SECTION.logs)}
      </List>
      <List inset>
        {rowsIn(settings, SECTION.profiling)}
        <ProfilingGroup
          title="Sampling options"
          caption="Turn on Performance sampling to use the indented options."
        />
        {rowsIn(settings, SECTION.sampling)}
        <ProfilingGroup title={SECTION.probes} />
        {rowsIn(settings, SECTION.probes)}
      </List>
      {env.platform === 'android' ? (
        <List inset title={SECTION.watch}>
          {rowsIn(settings, SECTION.watch)}
        </List>
      ) : null}
      <List inset title={SECTION.actions}>
        {rowsIn(settings, SECTION.actions)}
      </List>
    </View>
  );
}

function DeveloperOverview({
  settings,
}: {
  readonly settings: readonly SettingDefinition[];
}): ReactNode {
  return (
    <View className={PANEL}>
      <List inset title={SECTION.diagnostics} caption="This device">
        {rowsIn(settings, SECTION.diagnostics)}
      </List>
      <Section title={SECTION.repair} caption="Home Hub">
        <List inset>{rowsIn(settings, SECTION.repair)}</List>
        {rowsIn(settings, SECTION.investigations)}
      </Section>
    </View>
  );
}

function OwnerDeveloper({ env }: { readonly env: SettingEnv }): ReactNode {
  const settings = DEVELOPER_SETTINGS.filter((setting) => setting.visible?.(env) ?? true);
  useSettingsFocus(settings);
  return (
    <SettingsFrame page="developer" contentWidth="full">
      <View className="flex-row flex-wrap items-start gap-section-gap">
        <DeveloperOverview settings={settings} />
        {env.developer ? <DeveloperTools settings={settings} env={env} /> : null}
      </View>
    </SettingsFrame>
  );
}

export function DeveloperScreen(): ReactNode {
  const env = useSettingEnv();
  return env.owner ? <OwnerDeveloper env={env} /> : <Redirect href={href.settings.index()} />;
}
