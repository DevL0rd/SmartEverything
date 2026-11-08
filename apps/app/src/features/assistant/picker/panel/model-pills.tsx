import type { ReactNode } from 'react';
import type { Engine } from '@smarteverything/domain';
import { useFocusRequest } from '../../../../components/focus-request';
import type { IconName } from '../../../../components/icon';
import { ListRow } from '../../../../components/list-row';
import { useChatModel } from '../../chats/chat-model';
import { sameChoice, useImageCatalog, useSelectedImageModel } from '../image/use-image-models';
import { KeyedRow } from './panel-chrome';
import type { ModelPanelState } from './panel-state';

export const AI_MODEL_ROW = 'ai-model';
export const IMAGE_MODEL_ROW = 'image-model';

function Pill({
  id,
  icon,
  label,
  value,
  focus,
  onPress,
}: {
  readonly id: string;
  readonly icon: IconName;
  readonly label: string;
  readonly value: string;
  readonly focus: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const ref = useFocusRequest(focus);
  return (
    <KeyedRow id={id} className="rounded-sm">
      <ListRow
        pressRef={ref}
        compact
        icon={icon}
        overline={label}
        title={value}
        label={`${label}: ${value}`}
        chevron
        onPress={onPress}
      />
    </KeyedRow>
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
  returnFocus,
  onAiModel,
  onImageModel,
}: {
  readonly engine: Engine;
  readonly returnFocus: Exclude<ModelPanelState['returnFocus'], 'folder'>;
  readonly onAiModel: () => void;
  readonly onImageModel: () => void;
}): ReactNode {
  const model = useChatModel(engine);
  const image = useImageModelName();
  return (
    <>
      <Pill
        id={AI_MODEL_ROW}
        icon="brain"
        label="AI model"
        value={model.name}
        focus={returnFocus === 'library'}
        onPress={onAiModel}
      />
      <Pill
        id={IMAGE_MODEL_ROW}
        icon="image"
        label="Image model"
        value={image}
        focus={returnFocus === 'image-library'}
        onPress={onImageModel}
      />
    </>
  );
}
