import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useUniwind } from 'uniwind';
import { Card } from '../../components/card';
import { LiveFigure } from '../../components/live-figure';
import { Glow } from '../../components/glow';
import { Skeleton } from '../../components/skeleton';
import { Text } from '../../components/text';
import { useIdiom } from '../../design/platform';
import { useSizeClass } from '../../design/size-class';
import { joinParts } from '../../format/text';
import { widestOf } from './figure-width';
import type { MedallionTone } from './medallion-model';

const WIDE_FROM = 600;
const GLOW_STRENGTH = { light: 0.066, dark: 0.11 } as const;

export interface HeroFigure {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
}

export interface ServiceHeroProps {
  readonly medallion: ReactNode;
  readonly state: { readonly title: string; readonly tone: MedallionTone };
  readonly subtitle?: string;
  readonly figures?: readonly [HeroFigure, HeroFigure?];
  readonly ringNote?: string;
  readonly facts?: readonly string[];
  readonly actions?: ReactNode;
  readonly trailing?: ReactNode;
  readonly aside?: ReactNode;
  readonly stale?: boolean;
}

function Figures({
  figures,
  stale,
}: {
  readonly figures: readonly (HeroFigure | undefined)[];
  readonly stale: boolean;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-end gap-x-6 gap-y-1">
      {figures.map((figure) =>
        figure === undefined ? null : (
          <View key={figure.label} className="min-w-0">
            <Text variant="caption" tone="variant">
              {figure.label}
            </Text>
            <LiveFigure
              value={figure.value}
              widest={widestOf(figure.value)}
              size="l"
              stale={stale}
              {...(figure.unit === undefined ? {} : { unit: figure.unit })}
            />
          </View>
        ),
      )}
    </View>
  );
}

function Head({
  hero: { state, subtitle, trailing, stale = false },
}: {
  readonly hero: ServiceHeroProps;
}): ReactNode {
  const tone = stale || state.tone === 'neutral' ? 'default' : state.tone;
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="flex-row items-start gap-2">
        <Text variant="title-1" tone={tone} accessibilityRole="header" className="min-w-0 flex-1">
          {state.title}
        </Text>
        {trailing}
      </View>
      {subtitle === undefined ? null : (
        <Text variant="callout" tone="variant">
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function Details({
  hero: { figures, ringNote, facts, actions, stale = false },
}: {
  readonly hero: ServiceHeroProps;
}): ReactNode {
  const line = joinParts(facts ?? []);
  return (
    <>
      {figures === undefined ? null : <Figures figures={figures} stale={stale} />}
      {ringNote === undefined && line === '' ? null : (
        <View className="gap-0.5">
          {ringNote === undefined ? null : <Text variant="footnote">{ringNote}</Text>}
          {line === '' ? null : (
            <Text variant="footnote" tone="variant">
              {line}
            </Text>
          )}
        </View>
      )}
      {actions === undefined ? null : (
        <View className="flex-row flex-wrap items-center gap-2">{actions}</View>
      )}
    </>
  );
}

function HeroGlow({ tone }: { readonly tone: Exclude<MedallionTone, 'neutral'> }): ReactNode {
  const strength = GLOW_STRENGTH[useUniwind().theme === 'light' ? 'light' : 'dark'];
  return <Glow colour={tone} x="14%" y="40%" radius="70%" strength={strength} />;
}

export function ServiceHero(hero: ServiceHeroProps): ReactNode {
  const { medallion, state, aside, stale = false } = hero;
  const wide = useSizeClass().area >= WIDE_FROM;
  const head = <Head hero={hero} />;
  const details = <Details hero={hero} />;
  return (
    <Card className="overflow-hidden">
      {stale || state.tone === 'neutral' ? null : <HeroGlow tone={state.tone} />}
      <View accessibilityRole="summary" accessibilityLabel={state.title}>
        {wide ? (
          <View className="flex-row items-center gap-5">
            {medallion}
            <View className="min-w-0 flex-1 gap-2.5">
              {head}
              {details}
            </View>
            {aside === undefined ? null : <View className="w-1/3 min-w-36 shrink-0">{aside}</View>}
          </View>
        ) : (
          <View className="gap-3.5">
            <View className="flex-row items-center gap-4">
              {medallion}
              {head}
            </View>
            {details}
          </View>
        )}
      </View>
    </Card>
  );
}

export function ServiceHeroSkeleton(): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <Card>
      <View accessibilityLabel="Loading" aria-busy className="flex-row items-center gap-4">
        <Skeleton shape="circle" className={pointer ? 'size-28 shrink-0' : 'size-24 shrink-0'} />
        <View className="min-w-0 flex-1 gap-3">
          <Skeleton shape="text" />
          <Skeleton shape="line" />
          <Skeleton shape="line" />
        </View>
      </View>
    </Card>
  );
}
