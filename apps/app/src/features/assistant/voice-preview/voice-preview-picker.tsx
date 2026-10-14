import type { ReactNode } from 'react';
import { useDeferredValue, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SPEECH_VOICES, type VoicePreviewRequest } from '@smarteverything/domain';
import { BottomSheet } from '../../../components/bottom-sheet';
import { Popover } from '../../../components/popover';
import { Interactive } from '../../../components/interactive';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { SearchField } from '../../../components/search-field';
import type { Rect } from '../../../components/anchor';
import { useIdiom } from '../../../design/platform';
import type { EntityStore } from '../../../store/entity-store';
import { useVoicePreview, type VoicePreviewControl } from './use-voice-preview';

export type CallVoice = VoicePreviewRequest['voice'];
export interface VoicePickerProps {
  readonly title: string;
  readonly value: CallVoice | null;
  readonly sameAsCall: boolean;
  readonly anchor: Rect;
  readonly store: EntityStore;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onPick: (voice: CallVoice | null) => void;
  readonly onClose: () => void;
}
function previewLabel(voice: CallVoice, preview: VoicePreviewControl): string {
  const state = preview.state;
  if (state.kind === 'idle' || state.voice !== voice) return `Play sample for ${voice}`;
  if (state.kind === 'loading') return `Loading sample for ${voice}. Stop`;
  if (state.kind === 'playing') return `Stop sample for ${voice}`;
  return `Retry sample for ${voice}`;
}
function sampleAction(active: boolean, retry: boolean): string {
  if (active) return 'Stop';
  return retry ? 'Retry' : 'Play sample';
}
function PreviewButton({
  voice,
  preview,
}: {
  readonly voice: CallVoice;
  readonly preview: VoicePreviewControl;
}): ReactNode {
  const state = preview.state;
  const active = (state.kind === 'loading' || state.kind === 'playing') && state.voice === voice;
  const loading = state.kind === 'loading' && state.voice === voice;
  const retry = state.kind === 'error' && state.voice === voice;
  return (
    <Interactive
      label={previewLabel(voice, preview)}
      onPress={() => {
        preview.toggle(voice);
      }}
      className="min-h-touch-min shrink-0 flex-row items-center gap-1 rounded-sm px-3"
      layerClassName="rounded-sm"
    >
      {loading ? (
        <ActivityIndicator size="small" colorClassName="accent-primary" />
      ) : (
        <Icon name={active ? 'square' : 'play'} size={16} tone="primary" />
      )}
      <Text variant="label" tone="primary">
        {sampleAction(active, retry)}
      </Text>
    </Interactive>
  );
}
interface VoiceChoiceProps {
  readonly voice: CallVoice;
  readonly value: CallVoice | null;
  readonly saving: boolean;
  readonly onPick: (voice: CallVoice | null) => void;
  readonly preview: VoicePreviewControl;
}
function VoiceChoice({ voice, value, saving, onPick, preview }: VoiceChoiceProps): ReactNode {
  const selected = value === voice;
  const state = preview.state;
  return (
    <View>
      <View className="flex-row items-center px-1">
        <Interactive
          role="radio"
          label={voice}
          selected={selected}
          disabled={saving}
          onPress={() => {
            preview.stop();
            onPick(voice);
          }}
          className="min-h-touch-min min-w-0 flex-1 flex-row items-center gap-2 rounded-sm px-3"
          layerClassName="rounded-sm"
        >
          <Text className="min-w-0 flex-1" tone={selected ? 'primary' : 'default'}>
            {voice}
          </Text>
          {selected ? <Icon name="check" size={16} tone="primary" /> : null}
        </Interactive>
        <PreviewButton voice={voice} preview={preview} />
      </View>
      {state.kind === 'error' && state.voice === voice ? (
        <Text variant="footnote" tone="critical" className="px-4 pb-2">
          {state.message}
        </Text>
      ) : null}
    </View>
  );
}
interface VoiceOptionsProps extends VoicePickerProps {
  readonly preview: VoicePreviewControl;
}
function SameAsCallChoice({
  value,
  saving,
  onPick,
  preview,
}: Omit<VoiceChoiceProps, 'voice'>): ReactNode {
  return (
    <Interactive
      role="radio"
      label="Same as the call voice"
      selected={value === null}
      disabled={saving}
      onPress={() => {
        preview.stop();
        onPick(null);
      }}
      className="min-h-touch-min flex-row items-center gap-2 px-4"
    >
      <Text className="flex-1">Same as the call voice</Text>
      {value === null ? <Icon name="check" size={16} tone="primary" /> : null}
    </Interactive>
  );
}
interface VoicePickerHeaderProps {
  readonly sameAsCall: boolean;
  readonly saving: boolean;
  readonly error: string | null;
  readonly query: string;
  readonly setQuery: (value: string) => void;
}
function VoicePickerHeader({
  sameAsCall,
  saving,
  error,
  query,
  setQuery,
}: VoicePickerHeaderProps): ReactNode {
  return (
    <View className="gap-2 px-3 pb-2">
      <SearchField value={query} onChange={setQuery} placeholder="Search voices" />
      <Text variant="footnote" tone="variant">
        Gemini Live call-voice samples{sameAsCall ? '; spoken lines can sound different.' : '.'}
      </Text>
      {saving ? (
        <Text variant="footnote" tone="variant">
          Saving voice…
        </Text>
      ) : null}
      {error === null ? null : (
        <Text variant="footnote" tone="critical">
          {error}
        </Text>
      )}
    </View>
  );
}
function VoiceOptions({
  title,
  sameAsCall,
  saving,
  error,
  value,
  onPick,
  preview,
}: VoiceOptionsProps): ReactNode {
  const [query, setQuery] = useState('');
  const needle = useDeferredValue(query.trim().toLowerCase());
  const voices = SPEECH_VOICES.filter((voice) => voice.toLowerCase().includes(needle));
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={title}>
      <VoicePickerHeader
        sameAsCall={sameAsCall}
        saving={saving}
        error={error}
        query={query}
        setQuery={setQuery}
      />
      {sameAsCall && 'same as the call voice'.includes(needle) ? (
        <SameAsCallChoice value={value} saving={saving} onPick={onPick} preview={preview} />
      ) : null}
      {voices.map((voice) => (
        <VoiceChoice
          key={voice}
          voice={voice}
          value={value}
          saving={saving}
          onPick={onPick}
          preview={preview}
        />
      ))}
      {voices.length === 0 && !(sameAsCall && 'same as the call voice'.includes(needle)) ? (
        <Text tone="variant" className="px-4 py-3">
          No voices match this search.
        </Text>
      ) : null}
    </View>
  );
}
export function VoicePreviewPicker(props: VoicePickerProps): ReactNode {
  const preview = useVoicePreview(props.store, props.onClose);
  const touch = useIdiom() === 'touch';
  const close = (): void => {
    preview.stop();
    props.onClose();
  };
  const body = <VoiceOptions {...props} preview={preview} />;
  if (touch)
    return (
      <BottomSheet open onClose={close} title={props.title} label={props.title} detents={['full']}>
        {body}
      </BottomSheet>
    );
  return (
    <Popover open onClose={close} anchor={props.anchor} label={props.title} width={360}>
      {body}
    </Popover>
  );
}
