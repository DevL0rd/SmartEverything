import { useEffect } from 'react';
import { attempt } from './call-actions';
import { callActive, useCall } from './call-state';
import { callEngine } from './engine/engine';
import { useCallAudio } from './settings-sheet/call-audio-pref';

export function CallAudioSync(): null {
  const active = callActive(useCall());
  const { pref } = useCallAudio();
  useEffect(() => {
    console.log('call.DEBUG_sync', active, callEngine.capabilities().audio);
    if (active && callEngine.capabilities().audio === null) {
      attempt('Call settings did not apply', () => {
        callEngine.applyAudio(pref);
      });
    }
  }, [active, pref]);
  return null;
}
