import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge, type BadgeTone } from '../../../components/badge';
import { Banner } from '../../../components/banner';
import type { PrinterLive } from '../../../features/device-visuals';
import { chipsOf, fixCardsOf, type ChipTone } from '../model/chips';

const BADGE: Readonly<Record<ChipTone, BadgeTone>> = {
  critical: 'critical',
  warning: 'warning',
  neutral: 'neutral',
  positive: 'positive',
};

export function ChipRow({ live }: { readonly live: PrinterLive }): ReactNode {
  const chips = chipsOf(live);
  return chips.length === 0 ? null : (
    <View className="flex-row flex-wrap gap-2">
      {chips.map((chip) => (
        <Badge key={chip.key} label={chip.label} tone={BADGE[chip.tone]} />
      ))}
    </View>
  );
}

export function FixCards({ live }: { readonly live: PrinterLive }): ReactNode {
  const cards = fixCardsOf(live);
  return cards.length === 0 ? null : (
    <View className="gap-2">
      {cards.map((card) => (
        <Banner key={card.key} tone={card.tone} title={card.title} body={card.cause} wrapBody />
      ))}
    </View>
  );
}
