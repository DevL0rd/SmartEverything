import type { ReactNode } from 'react';
import { View } from 'react-native';
import { usePanelFrame } from '../../../../components/adaptive-panel';
import type { Engine } from '@smarteverything/domain';
import { Icon, type IconName } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { useChatModel } from '../../chats/chat-model';
import { sameChoice, useImageCatalog, useSelectedImageModel } from '../image/use-image-models';
import { KeyedRow, PanelSection } from './panel-chrome';

const WIDE_FROM = 520;

export const AI_MODEL_ROW = 'ai-model';
export const IMAGE_MODEL_ROW = 'image-model';

function Pill({
  id,
  icon,
  label,
  value,
  wide,
  onPress,
}: {
  readonly id: string;
  readonly icon: IconName;
  readonly label: string;
  readonly value: string;
  readonly wide: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <View className={wide ? 'min-w-0 flex-1' : 'min-w-0'}>
      <KeyedRow id={id} className="rounded-lg">
        <Interactive
          label={`${label}: ${value}`}
          onPress={onPress}
          className="min-h-14 flex-row items-center gap-3 rounded-lg border border-outline px-3 py-2"
          layerClassName="rounded-lg"
        >
          <Icon name={icon} size={20} tone="variant" />
          <View className="min-w-0 flex-1">
            <Text variant="caption" tone="variant" numberOfLines={1}>
              {label}
            </Text>
            <Text variant="callout" numberOfLines={1}>
              {value}
            </Text>
          </View>
          <Icon name="chevronRight" size={16} tone="variant" />
        </Interactive>
      </KeyedRow>
    </View>
  );
}

function useImageModelName(): string {
  const selected = useSelectedImageModel();
  const catalog = useImageCatalog();
  if (selected === null) return 'AI chooses';
  const found = catalog.data?.endpoints.find((endpoint) => sameChoice(endpoint, selected));
  return found?.name ?? selected.model;
}

export function ModelPills({
  engine,
  onAiModel,
  onImageModel,
}: {
  readonly engine: Engine;
  readonly onAiModel: () => void;
  readonly onImageModel: () => void;
}): ReactNode {
  const model = useChatModel(engine);
  const image = useImageModelName();
  const wide = usePanelFrame().width >= WIDE_FROM;
  return (
    <PanelSection title="Models">
      <View className={wide ? 'flex-row gap-2' : 'gap-2'}>
        <Pill
          id={AI_MODEL_ROW}
          icon="brain"
          label="AI model"
          value={model.name}
          wide={wide}
          onPress={onAiModel}
        />
        <Pill
          id={IMAGE_MODEL_ROW}
          icon="image"
          label="Image model"
          value={image}
          wide={wide}
          onPress={onImageModel}
        />
      </View>
    </PanelSection>
  );
}
