import type { ReactNode } from 'react';
import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Icon, type IconName } from '../../../components/icon';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';
import { useRow } from '../../../store/selectors';
import { pluginIcon } from '../../plugins';
import type { ChatSource, ChatSourceKind } from '../model/chat-source';

export type SourceMarkSize = 20 | 28 | 32 | 40;

const GLYPH_SIZE: Readonly<Record<SourceMarkSize, 16 | 20>> = { 20: 16, 28: 16, 32: 16, 40: 20 };

interface DiscLook {
  readonly icon: IconName;
  readonly fill: string;
}

const BOX: Readonly<Record<SourceMarkSize, string>> = {
  20: 'size-5',
  28: 'size-7',
  32: 'size-8',
  40: 'size-10',
};

const DISC: Readonly<Record<Exclude<ChatSourceKind, 'app' | 'branch' | 'plugin'>, DiscLook>> = {
  call: { icon: 'phone', fill: 'bg-positive' },
  camera: { icon: 'camera', fill: 'bg-viz-1' },
  schedule: { icon: 'clock', fill: 'bg-viz-6' },
};

function Orb({ size }: { readonly size: SourceMarkSize }): ReactNode {
  const id = `mark-${useId().replaceAll(':', '')}`;
  const core = useColour('primary');
  const deep = useColour('primary-container');
  const shine = useColour('on-primary');
  const teal = useColour('viz-1');
  const violet = useColour('viz-4');
  const r = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={`${id}-core`} cx="38%" cy="32%" r="72%">
          <Stop offset="0" stopColor={shine} stopOpacity={0.55} />
          <Stop offset="0.28" stopColor={core} stopOpacity={1} />
          <Stop offset="1" stopColor={deep} stopOpacity={1} />
        </RadialGradient>
        <RadialGradient id={`${id}-a`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={teal} stopOpacity={0.85} />
          <Stop offset="1" stopColor={teal} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}-b`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={violet} stopOpacity={0.75} />
          <Stop offset="1" stopColor={violet} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill={`url(#${id}-core)`} />
      <Circle cx={r * 1.35} cy={r * 0.7} r={r * 0.62} fill={`url(#${id}-a)`} />
      <Circle cx={r * 0.62} cy={r * 1.38} r={r * 0.56} fill={`url(#${id}-b)`} />
    </Svg>
  );
}

function Disc({ icon, fill, size }: DiscLook & { readonly size: SourceMarkSize }): ReactNode {
  return (
    <View className={cn('items-center justify-center rounded-full', BOX[size], fill)}>
      <Icon name={icon} size={GLYPH_SIZE[size]} colour="bg" />
    </View>
  );
}

function PluginDisc({
  pluginId,
  size,
}: {
  readonly pluginId: string | null;
  readonly size: SourceMarkSize;
}): ReactNode {
  const plugin = useRow('plugins', pluginId);
  return (
    <Disc
      icon={plugin === null ? 'puzzle' : pluginIcon(plugin.manifest)}
      fill="bg-viz-3"
      size={size}
    />
  );
}

function Mark({
  source,
  size,
}: {
  readonly source: ChatSource;
  readonly size: SourceMarkSize;
}): ReactNode {
  switch (source.kind) {
    case 'app':
    case 'branch':
      return <Orb size={size} />;
    case 'plugin':
      return <PluginDisc pluginId={source.pluginId} size={size} />;
    case 'call':
    case 'camera':
    case 'schedule':
      return <Disc {...DISC[source.kind]} size={size} />;
  }
}

export function SourceMark({
  source,
  size,
}: {
  readonly source: ChatSource;
  readonly size: SourceMarkSize;
}): ReactNode {
  return (
    <View aria-hidden className={BOX[size]}>
      <Mark source={source} size={size} />
    </View>
  );
}
