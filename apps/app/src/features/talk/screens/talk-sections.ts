import type { TalkChannelRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { shellRailOf } from '../../../components/page-shell/layout';
import type { RailEntry, RailGroup } from '../../../components/page-shell/section-rail';
import type { ShellSections } from '../../../components/page-shell/shell-sections';
import { useSizeClass } from '../../../design/size-class';
import { useMyChannels, useTalkChannels } from '../data/talk-data';

function entryOf(channel: TalkChannelRow): RailEntry {
  return { id: channel.id, label: channel.name, icon: channel.icon, missing: null, detail: null };
}

export function talkSectionsOf(
  mine: readonly TalkChannelRow[],
  all: readonly TalkChannelRow[],
  active: string | null,
): ShellSections | undefined {
  if (all.length === 0) return undefined;
  const own = new Set(mine.map((channel) => channel.id));
  const groups: readonly RailGroup[] = [
    { title: 'Your channels', entries: mine.map(entryOf) },
    { title: 'Other channels', entries: all.filter((row) => !own.has(row.id)).map(entryOf) },
  ];
  return {
    label: 'Channels',
    groups: groups.filter((group) => group.entries.length > 0),
    active: active ?? '',
    hrefOf: href.talkChannel,
    master: true,
  };
}

export function useTalkSections(active: string | null): ShellSections | undefined {
  const { area } = useSizeClass();
  const mine = useMyChannels();
  const all = useTalkChannels();
  return shellRailOf(area, 'master') === null ? undefined : talkSectionsOf(mine, all, active);
}
