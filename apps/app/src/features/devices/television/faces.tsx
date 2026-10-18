import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { CardFaceProps } from '../card/card-face';
import { useClaimSchedule } from '../card/standalone-shell';
import { launchableApps } from './apps';
import { Glow } from './glow';
import { CardRemote, CompactRemote, TallRemote, TileRemote } from './mini-remote';
import { remoteLayoutOf } from './remote-layout';
import { useTvSheets } from './sheet-state';
import { TelevisionSheets } from './sheets';
import { useTelevision } from './use-television';
import { useTelevisionActions } from './use-television-actions';
import { WideRemote } from './wide-remote';

const REMOTES = {
  tile: TileRemote,
  compact: CompactRemote,
  card: CardRemote,
  tall: TallRemote,
  wide: WideRemote,
} as const;

export function TelevisionFace({ device, frame }: CardFaceProps): ReactNode {
  const tv = useTelevision(device);
  const actions = useTelevisionActions(tv);
  const sheets = useTvSheets();
  const apps = launchableApps(device);
  useClaimSchedule(tv.view.mode === 'on');
  const Remote = REMOTES[remoteLayoutOf(frame)];
  return (
    <>
      <View className="flex-1" pointerEvents="box-none">
        <Glow tv={tv} />
        <Remote tv={tv} actions={actions} sheets={sheets} apps={apps} frame={frame} />
      </View>
      <TelevisionSheets tv={tv} sheets={sheets} actions={actions} apps={apps} />
    </>
  );
}
