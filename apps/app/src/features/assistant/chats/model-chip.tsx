import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { AiChatRow, Engine } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { Tooltip } from '../../../components/tooltip';
import { useIdiom } from '../../../design/platform';
import { useSizeClass } from '../../../design/size-class';
import { ProviderLogo } from '../picker/provider-logo';
import { changeChat } from './chat-actions';
import { useChatModel, type ChatModel } from './chat-model';
import { ChatModelPicker } from './chat-model-picker';

function ChipFace({
  model,
  compact,
  hovered,
}: {
  readonly model: ChatModel;
  readonly compact: boolean;
  readonly hovered: boolean;
}): ReactNode {
  const name = compact ? model.shortName : model.name;
  return (
    <View className="h-10 flex-row items-center gap-1.5 rounded-full bg-surface-1 pl-2 pr-2">
      {model.provider === null ? null : (
        <ProviderLogo
          provider={model.provider}
          name={model.providerLabel ?? model.provider}
          size="s"
        />
      )}
      <Text variant="label" numberOfLines={1} className="shrink">
        {name}
      </Text>
      {model.effort === null ? null : (
        <Text variant="label" tone="variant" numberOfLines={1}>
          {`· ${model.effort}`}
        </Text>
      )}
      {model.effort === null && model.isDefault && !compact ? (
        <Text variant="caption" tone="variant" className="shrink-0">
          Default
        </Text>
      ) : null}
      <Icon name="chevronDown" size={16} tone="variant" />
      {hovered ? <Tooltip text="Model and thinking" placement="above" /> : null}
    </View>
  );
}

function labelOf(model: ChatModel): string {
  const effort = model.effort === null ? '' : `, ${model.effort} thinking`;
  return `Model: ${model.name}${effort}`;
}

export function EngineSheet({
  open,
  onClose,
  engine,
  onChange,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
}): ReactNode {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Model and thinking"
      detents={['full']}
      scroll={false}
    >
      <ChatModelPicker engine={engine} onChange={onChange} />
    </Sheet>
  );
}

export function ModelChip({
  engine,
  onChange,
}: {
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const model = useChatModel(engine);
  const compact = useSizeClass().width === 'compact';
  const showTip = useIdiom() === 'pointer' && hovered;
  return (
    <View
      className="min-w-0 shrink"
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
    >
      <Interactive
        label={labelOf(model)}
        onPress={() => {
          setOpen(true);
        }}
        className="min-h-touch-min max-w-80 justify-center"
        layerClassName="rounded-full"
      >
        <ChipFace model={model} compact={compact} hovered={showTip} />
      </Interactive>
      <EngineSheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        engine={engine}
        onChange={onChange}
      />
    </View>
  );
}

export function ChatModelChip({ chat }: { readonly chat: AiChatRow }): ReactNode {
  return (
    <ModelChip
      engine={chat.engine}
      onChange={(engine) => {
        void changeChat(chat.id, { engine });
      }}
    />
  );
}
