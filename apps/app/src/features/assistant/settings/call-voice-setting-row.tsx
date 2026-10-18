import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { CallVoice } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { measureAnchor, type Rect } from '../../../components/anchor';
import { useScreenPaused } from '../../../design/screen-pause';
import { updateAssistantSettings } from '../../../api/assistant';
import { captureAssistantWrite } from '../../../store/assistant-response-style';
import { useEntityStore } from '../../../store/store-context';
import { useIsOwner } from '../../../store/selectors';
import { useAssistantStatus } from '../data/assistant-data';
import { VoicePreviewPicker } from '../voice-preview/voice-preview-picker';
import { background } from '@smarteverything/logging';

interface VoiceChoiceControl {
  readonly saving: boolean;
  readonly error: string | null;
  readonly pick: (voice: CallVoice | null) => void;
}
function useVoiceChoice(spoken: boolean, close: () => void): VoiceChoiceControl {
  const store = useEntityStore();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
    };
  }, []);
  return {
    saving,
    error,
    pick: (voice): void => {
      const status = store.get().assistant;
      if (pending.current || status === null || (!spoken && voice === null)) return;
      const scope = captureAssistantWrite(store);
      pending.current = true;
      setSaving(true);
      setError(null);
      const next = voice === null || spoken ? { speech_voice: voice } : { voice };
      background(
        updateAssistantSettings({ voice: next }, scope)
          .then((saved) => {
            if (!mounted.current || !scope.current()) return;
            store.update((state) => ({ ...state, assistant: saved }));
            close();
          })
          .catch((cause: unknown) => {
            if (mounted.current && scope.current())
              setError(
                cause instanceof Error ? cause.message : 'The voice could not be saved. Try again.',
              );
          })
          .finally(() => {
            pending.current = false;
            if (mounted.current) setSaving(false);
          }),
        'assistant_settings.update_failed',
      );
    },
  };
}
function selectedVoice(
  status: ReturnType<typeof useAssistantStatus>,
  spoken: boolean,
): CallVoice | null {
  if (status === null) return null;
  return spoken ? status.settings.voice.speech_voice : status.settings.voice.voice;
}
function VoiceSettingRow({ spoken }: { readonly spoken: boolean }): ReactNode {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const close = useCallback((): void => {
    setAnchor(null);
  }, []);
  const status = useAssistantStatus();
  const owner = useIsOwner();
  const paused = useScreenPaused();
  const choice = useVoiceChoice(spoken, close);
  const title = spoken ? 'Voice for spoken lines' : 'Call voice';
  const selected = selectedVoice(status, spoken);
  const shown = selected ?? 'Same as the call voice';
  return (
    <>
      <View ref={ref} collapsable={false}>
        <ListRow
          title={title}
          value={status === null ? 'Loading…' : shown}
          icon="mic"
          chevron
          disabled={!owner || status === null || choice.saving}
          onPress={() => {
            measureAnchor(ref, setAnchor);
          }}
        />
      </View>
      {anchor === null || !owner || paused ? null : (
        <VoicePreviewPicker
          title={title}
          value={selected}
          sameAsCall={spoken}
          anchor={anchor}
          saving={choice.saving}
          error={choice.error}
          onPick={choice.pick}
          onClose={close}
        />
      )}
    </>
  );
}
export function CallVoiceSettingRow(): ReactNode {
  return <VoiceSettingRow spoken={false} />;
}
export function SpokenLineVoiceSettingRow(): ReactNode {
  return <VoiceSettingRow spoken />;
}
