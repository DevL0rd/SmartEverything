import type { ReactNode } from 'react';
import { View } from 'react-native';
import { buttonLabel } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { sameJson } from '../../../store/same-json';
import { useStoreSelector } from '../../../store/store-context';
import { checkCandidatesOf } from './check-candidates';
import type { RemoteSource } from './remote-source';
import { markRemote, setCheck, useAssumed } from './use-assumed';
import { useRemoteSend } from './use-remote-send';

function FixMenu({ source }: { readonly source: RemoteSource }): ReactNode {
  const assumed = useAssumed(source.id);
  const send = useRemoteSend(source);
  const again: readonly MenuItem[] =
    assumed.sentKey === null || !source.online
      ? []
      : [
          {
            label: `Press ${buttonLabel(assumed.sentKey)} again`,
            icon: 'refresh',
            onPress: (): void => {
              if (assumed.sentKey !== null) {
                send.press(assumed.sentKey);
              }
            },
          },
        ];
  const items: readonly MenuItem[] = [
    ...again,
    {
      label: assumed.on === true ? 'Mark as off' : 'Mark as on',
      icon: 'power',
      onPress: (): void => {
        markRemote(source.id, assumed.on !== true);
      },
    },
  ];
  const { ref, open, menu } = useAnchoredMenu(items, 'It didn’t work?');
  return (
    <View ref={ref} collapsable={false}>
      <Button label="It didn’t work?" variant="text" icon="info" onPress={open} />
      {menu}
    </View>
  );
}

function CheckMenu({ remoteId }: { readonly remoteId: string }): ReactNode {
  const checkDeviceId = useAssumed(remoteId).checkDeviceId;
  const candidates = useStoreSelector(checkCandidatesOf, sameJson);
  const stop: readonly MenuItem[] =
    checkDeviceId === null
      ? []
      : [
          {
            label: 'Stop checking',
            icon: 'close',
            onPress: (): void => {
              setCheck(remoteId, null);
            },
          },
        ];
  const items: readonly MenuItem[] = [
    ...candidates.map((candidate): MenuItem => ({
      label: candidate.label,
      icon: checkDeviceId === candidate.id ? 'check' : 'plug',
      onPress: (): void => {
        setCheck(remoteId, candidate.id);
      },
    })),
    ...stop,
  ];
  const { ref, open, menu } = useAnchoredMenu(items, 'Check with');
  if (candidates.length === 0) {
    return null;
  }
  const chosen = candidates.find((candidate) => candidate.id === checkDeviceId);
  return (
    <View ref={ref} collapsable={false}>
      <Button
        label={chosen === undefined ? 'Check with a plug' : `Check with ${chosen.label}`}
        variant="text"
        icon="plug"
        onPress={open}
      />
      {menu}
    </View>
  );
}

export function RemoteExtras({ source }: { readonly source: RemoteSource }): ReactNode {
  if (source.keys.length === 0) {
    return null;
  }
  return (
    <View className="flex-row flex-wrap items-center gap-x-2">
      <FixMenu source={source} />
      <CheckMenu remoteId={source.id} />
    </View>
  );
}
