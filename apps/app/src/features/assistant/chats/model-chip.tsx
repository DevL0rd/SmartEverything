import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { AiChatRow } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { effortLabel } from '../picker/efforts';
import { useModelLabel, type ModelLabel } from '../picker/engine-models';
import { ProviderLogo } from '../picker/provider-logo';
import { changeChat } from './chat-actions';
import { EnginePicker } from './engine-picker';

function ChipFace({
  label,
  effort,
}: {
  readonly label: ModelLabel;
  readonly effort: string;
}): ReactNode {
  return (
    <View className="h-9 flex-row items-center gap-1.5 rounded-full bg-surface-3 pl-1.5 pr-2">
      {label.provider === null ? null : (
        <ProviderLogo
          provider={label.provider}
          name={label.providerLabel ?? label.provider}
          size="s"
        />
      )}
      <Text variant="label" numberOfLines={1} className="shrink">
        {label.name}
      </Text>
      {effort === '' ? null : (
        <Text variant="label" tone="variant">
          {effort}
        </Text>
      )}
      <Icon name="chevronDown" size={16} tone="variant" />
    </View>
  );
}

export function ModelChip({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const [open, setOpen] = useState(false);
  const label = useModelLabel(chat.engine);
  const effort = chat.engine.effort === null ? '' : effortLabel(chat.engine.effort);
  return (
    <>
      <Interactive
        label={`Model: ${label.name}${effort === '' ? '' : `, ${effort} thinking`}`}
        onPress={() => {
          setOpen(true);
        }}
        className="min-h-touch-min max-w-56 justify-center"
        layerClassName="rounded-full"
      >
        <ChipFace label={label} effort={effort} />
      </Interactive>
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Model and thinking"
        detents={['full']}
        scroll={false}
      >
        <EnginePicker
          engine={chat.engine}
          onChange={(engine) => {
            void changeChat(chat.id, { engine });
          }}
        />
      </Sheet>
    </>
  );
}
