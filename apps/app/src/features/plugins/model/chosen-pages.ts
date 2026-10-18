import {
  PLUGIN_OPTION_IDS_MAX,
  type PluginOptionPage,
  type PluginOptionQuery,
} from '@smarteverything/domain';

export function idChunks(ids: readonly string[]): readonly string[] {
  const chunks: string[] = [];
  for (let start = 0; start < ids.length; start += PLUGIN_OPTION_IDS_MAX) {
    chunks.push(ids.slice(start, start + PLUGIN_OPTION_IDS_MAX).join(','));
  }
  return chunks;
}

function mergeChosenPages(pages: readonly PluginOptionPage[]): PluginOptionPage {
  const unavailable = pages.find((page) => page.state === 'unavailable');
  if (unavailable !== undefined) {
    return unavailable;
  }
  return {
    state: 'ready',
    options: pages.flatMap((page) => (page.state === 'ready' ? page.options : [])),
    next: null,
  };
}

export async function readChosen(
  read: (query: PluginOptionQuery) => Promise<PluginOptionPage>,
  ids: readonly string[],
): Promise<PluginOptionPage> {
  return mergeChosenPages(await Promise.all(idChunks(ids).map((chunk) => read({ ids: chunk }))));
}
