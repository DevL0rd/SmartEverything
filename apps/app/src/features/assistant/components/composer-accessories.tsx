import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { useComposerClass } from './composer-accessory-layout';
import { AttachButton, ExpandButton } from './composer-extras';
import { SendControls } from './composer-send';
import type { ComposerProps } from './composer';
import type { ComposerState } from './use-composer-state';

interface PartProps {
  readonly config: ComposerProps;
  readonly state: ComposerState;
}

export function ComposerSend({ config, state }: PartProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <SendControls
      mode={state.mode}
      composerClass={useComposerClass()}
      ring={state.ring}
      onSend={state.send}
      onStop={(): void => {
        config.stop?.();
      }}
      shortcut={pointer ? 'Enter' : null}
    />
  );
}

export function AccessoryRow({ config, state }: PartProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const tight = useComposerClass() === 'tight';
  const expand = !pointer && state.expandable;
  return (
    <View className={cn('min-h-touch-min flex-row items-center', tight ? 'gap-1' : 'gap-2')}>
      <AttachButton disabled={config.disabled} reason={config.reason ?? null} />
      {expand ? (
        <ExpandButton
          onPress={(): void => {
            state.setEditor(true);
          }}
        />
      ) : null}
      {config.accessory}
      {tight ? null : config.tools}
      <View className="min-w-0 flex-1" />
      {config.rightAccessory}
      <ComposerSend config={config} state={state} />
    </View>
  );
}
