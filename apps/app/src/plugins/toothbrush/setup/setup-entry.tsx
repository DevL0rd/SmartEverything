import { BRUSH_BRANDS, type BrushBrand } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { isBrushLinked } from '../../../../modules/health-connect';
import { FlowFrame } from '../../../components/flow-frame';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { brandUi } from '../brands';
import { boxStyle } from '../charts/style';
import { BRAND_TEXT } from '../model/brand-text';
import { BrushSetupFlow } from './setup-flow';
import { StaticBrush } from './static-brush';

const ART_PX = 96;
const ART_WIDTH = 56;

function BrandCard({
  brand,
  onPick,
}: {
  readonly brand: BrushBrand;
  readonly onPick: () => void;
}): ReactNode {
  const text = BRAND_TEXT[brand];
  return (
    <Interactive
      role="button"
      label={`${text.label}. ${text.blurb}`}
      onPress={onPick}
      className="min-h-touch-min flex-row items-center gap-4 rounded-lg border-hairline border-outline-variant bg-surface-1 p-4"
    >
      <View
        className="items-center justify-center overflow-hidden"
        style={boxStyle(ART_WIDTH, ART_PX)}
      >
        <StaticBrush brand={brand} px={ART_PX} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="title-3">{text.label}</Text>
        <Text variant="callout" tone="variant">
          {text.blurb}
        </Text>
      </View>
      <Icon name="chevronRight" size={20} tone="faint" />
    </Interactive>
  );
}

export function ToothbrushSetup(): ReactNode {
  const router = useRouter();
  const [brand, setBrand] = useState<BrushBrand | null>(null);
  if (!isBrushLinked || brand !== null) {
    const Flow = brand === null ? null : brandUi(brand).SetupFlow;
    return Flow === null || brand === null ? (
      <BrushSetupFlow brand={brand ?? 'sonicare'} />
    ) : (
      <Flow />
    );
  }
  return (
    <FlowFrame
      title="Add a toothbrush"
      onCancel={() => {
        router.back();
      }}
    >
      <Text variant="callout" tone="variant">
        Which toothbrush are you adding?
      </Text>
      <View className="gap-3">
        {BRUSH_BRANDS.map((known) => (
          <BrandCard
            key={known}
            brand={known}
            onPick={() => {
              setBrand(known);
            }}
          />
        ))}
      </View>
    </FlowFrame>
  );
}
