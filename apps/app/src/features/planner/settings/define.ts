import { createElement, type ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import type { SettingDefinition, SettingEnv } from '../../../settings/types';
import type { Option } from './options';
import {
  PrefLinkRow,
  PrefSelectRow,
  PrefSwitchRow,
  PrefTimeRow,
  type LinkSpec,
  type SwitchSpec,
  type ValueSpec,
} from './rows';

export const PLANNER_SETTINGS_PAGE = 'planner';

export const PLANNER_CLOCK_SETTING = 'planner.clock.sound';

export interface Where {
  readonly page: string;
  readonly section?: string;
  readonly visible?: (env: SettingEnv) => boolean;
}

export const at = (section: string): Where => ({ page: PLANNER_SETTINGS_PAGE, section });

export const sub = (page: string, section?: string): Where => ({
  page: `${PLANNER_SETTINGS_PAGE}/${page}`,
  ...(section === undefined ? {} : { section }),
});

export const subHref = (page: string): AppHref =>
  href.settings.page(`${PLANNER_SETTINGS_PAGE}/${page}`);

export interface CustomRow {
  readonly title: string;
  readonly render: () => ReactNode;
}

export function custom(
  id: string,
  where: Where,
  keywords: readonly string[],
  row: CustomRow,
): SettingDefinition {
  return {
    id: `planner.${id}`,
    ...where,
    title: row.title,
    keywords: ['planner', ...keywords],
    scope: 'server',
    control: 'custom',
    row: true,
    render: row.render,
  };
}

export const toggle = (
  id: string,
  where: Where,
  spec: SwitchSpec,
  keywords: readonly string[],
): SettingDefinition =>
  custom(id, where, keywords, {
    title: spec.title,
    render: () => createElement(PrefSwitchRow, { spec }),
  });

export const choose = (
  id: string,
  where: Where,
  spec: ValueSpec & {
    readonly options: readonly Option[] | ((value: string) => readonly Option[]);
  },
  keywords: readonly string[],
): SettingDefinition =>
  custom(id, where, keywords, {
    title: spec.title,
    render: () => createElement(PrefSelectRow, { spec, options: spec.options }),
  });

export const link = (
  id: string,
  where: Where,
  spec: LinkSpec,
  keywords: readonly string[],
): SettingDefinition =>
  custom(id, where, keywords, {
    title: spec.title,
    render: () => createElement(PrefLinkRow, { spec }),
  });

export const time = (
  id: string,
  where: Where,
  spec: ValueSpec,
  keywords: readonly string[],
): SettingDefinition =>
  custom(id, where, keywords, {
    title: spec.title,
    render: () => createElement(PrefTimeRow, { spec }),
  });
