import {
  PLUGIN_OPTION_IDS_MAX,
  PLUGIN_OPTION_PAGE_MAX,
  type PluginOption,
  type PluginOptionPage,
  type PluginOptionQuery,
} from '@smarteverything/domain';

function matches(option: PluginOption, query: string): boolean {
  const needle = query.toLocaleLowerCase();
  return (
    needle === '' ||
    `${option.label} ${option.detail ?? ''} ${option.id}`.toLocaleLowerCase().includes(needle)
  );
}

function startOf(query: PluginOptionQuery): number {
  const start = Number(query.after ?? '0');
  return Number.isInteger(start) && start >= 0 ? start : 0;
}

export function optionPage(
  options: readonly PluginOption[],
  query: PluginOptionQuery,
): PluginOptionPage {
  if (query.ids !== undefined) {
    const wanted = new Set(query.ids.split(',').filter((id) => id !== ''));
    return {
      state: 'ready',
      options: options.filter((option) => wanted.has(option.id)).slice(0, PLUGIN_OPTION_IDS_MAX),
      next: null,
    };
  }
  const found = options.filter((option) => matches(option, query.q ?? ''));
  const start = startOf(query);
  const end = start + PLUGIN_OPTION_PAGE_MAX;
  return {
    state: 'ready',
    options: found.slice(start, end),
    next: end < found.length ? String(end) : null,
  };
}
