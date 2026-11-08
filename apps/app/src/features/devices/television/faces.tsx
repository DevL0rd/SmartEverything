import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { FrameClass } from '../../../components/widget-board';
import type { CardFaceProps } from '../card/card-face';
import { useClaimSchedule } from '../card/standalone-shell';
import { isWideClass } from '../card/wide-card';
import { launchableApps } from './apps';
import { Glow } from './glow';
import { CompactRemote, TallRemote, TileRemote, type MiniProps } from './mini-remote';
import { RestingCard } from './quiet';
import { remoteLayoutOf } from './remote-layout';
import { useTvSheets } from './sheet-state';
import { TelevisionSheets } from './sheets';
import { useTelevision } from './use-television';
import { useTelevisionActions } from './use-television-actions';
import { WideRemote } from './wide-remote';

const STRIP_CLASSES: ReadonlySet<FrameClass> = new Set(['w', 'l', 'xl']);

const REMOTES = {
  compact: CompactRemote,
  tall: TallRemote,
  wide: WideRemote,
} as const;

function Body({
  cls,
  remote,
}: {
  readonly cls: FrameClass;
  readonly remote: MiniProps;
}): ReactNode {
  const { tv } = remote;
  if (!isWideClass(cls)) {
    return <TileRemote tv={tv} />;
  }
  if (tv.view.mode !== 'on') {
    return <RestingCard tv={tv} cls={cls} />;
  }
  const Remote = REMOTES[remoteLayoutOf(cls)];
  return <Remote {...remote} />;
}

export function TelevisionFace({ device, cls, frame }: CardFaceProps): ReactNode {
  const tv = useTelevision(device);
  const actions = useTelevisionActions(tv);
  const sheets = useTvSheets();
  const apps = launchableApps(device);
  useClaimSchedule(tv.view.mode === 'on' && STRIP_CLASSES.has(cls));
  return (
    <>
      <View className="flex-1" pointerEvents="box-none">
        <Glow tv={tv} />
        <Body cls={cls} remote={{ tv, actions, sheets, apps, width: frame.width }} />
      </View>
      <TelevisionSheets tv={tv} sheets={sheets} actions={actions} apps={apps} />
    </>
  );
}
