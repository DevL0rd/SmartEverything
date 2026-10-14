import type { ReactNode, RefObject } from 'react';
import { TextInput, View } from 'react-native';
import type { BrowserStatus } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import type { BrowserHandle } from '../../../platform/browser-contract';
export function BrowserToolbar({
  address,
  onAddress,
  navigate,
  status,
  controls,
  ready,
  tools,
  inputRef,
  onEditing,
}: {
  readonly address: string;
  readonly onAddress: (value: string) => void;
  readonly navigate: () => void;
  readonly status: BrowserStatus;
  readonly controls: BrowserHandle;
  readonly ready: boolean;
  readonly tools: ReactNode;
  readonly inputRef: RefObject<TextInput | null>;
  readonly onEditing: (value: boolean) => void;
}): ReactNode {
  return (
    <View className="min-w-0 flex-row items-center border-b border-outline-variant bg-surface-1 px-1">
      <BrowserNavigation status={status} controls={controls} ready={ready} />
      <BrowserAddressField
        address={address}
        onAddress={onAddress}
        navigate={navigate}
        inputRef={inputRef}
        onEditing={onEditing}
      />
      {tools}
    </View>
  );
}

function BrowserAddressField({
  address,
  onAddress,
  navigate,
  inputRef,
  onEditing,
}: {
  readonly address: string;
  readonly onAddress: (value: string) => void;
  readonly navigate: () => void;
  readonly inputRef: RefObject<TextInput | null>;
  readonly onEditing: (value: boolean) => void;
}): ReactNode {
  return (
    <TextInput
      ref={inputRef}
      accessibilityLabel="Browser address"
      value={address}
      onChangeText={onAddress}
      onSubmitEditing={navigate}
      onFocus={() => {
        onEditing(true);
      }}
      onBlur={() => {
        onEditing(false);
      }}
      placeholder="Address or /path"
      keyboardType="url"
      autoCapitalize="none"
      autoCorrect={false}
      placeholderTextColorClassName="accent-on-surface-faint"
      cursorColorClassName="accent-primary"
      className="min-w-0 flex-1 rounded-sm bg-surface-2 px-2 py-2 font-mono text-caption text-on-surface focus:outline-2 focus:outline-focus"
    />
  );
}

function BrowserNavigation({
  status,
  controls,
  ready,
}: {
  readonly status: BrowserStatus;
  readonly controls: BrowserHandle;
  readonly ready: boolean;
}): ReactNode {
  return (
    <>
      <IconButton
        icon="arrowLeft"
        label="Back in browser"
        disabled={!status.back}
        onPress={() => {
          controls.back();
        }}
      />
      <IconButton
        icon="arrowRight"
        label="Forward in browser"
        disabled={!status.forward}
        onPress={() => {
          controls.forward();
        }}
      />
      <IconButton
        icon={status.loading ? 'close' : 'refresh'}
        label={status.loading ? 'Stop loading' : 'Reload page'}
        disabled={!ready}
        onPress={() => {
          if (status.loading) controls.stop();
          else controls.reload();
        }}
      />
    </>
  );
}
