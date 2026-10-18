import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { ThemeScope } from '../../../../design/theme-scope';
import { Glow } from '../../../../components/glow';
import { cn } from '../../../../design/cn';
import { stopSharing } from '../call-actions';
import { callActive, type CallView } from '../call-state';
import { CallAura } from '../components/call-aura';
import { CallCaptions } from '../components/call-captions';
import { CallFooter } from '../components/call-footer';
import { CallHeader } from '../components/call-header';
import { CallLayers } from '../components/call-layers';
import { CallStage } from '../components/call-stage';
import { CallStatus } from '../components/call-status';
import { CallWave } from '../components/call-wave';
import { ConsentBanner } from '../components/consent-banner';
import { CostChips } from '../components/cost-chips';
import { LookedChip } from '../components/looked-chip';
import { MissedRequest } from '../components/missed-request';
import { ShowThisButton } from '../components/show-this-button';
import { ToolLines } from '../components/tool-lines';
import { useRecentLook } from '../components/use-recent-look';
import { isMediaStage, stageOf } from '../model/call-stage';
import { CallSettingsPanel, CallSettingsSheet } from '../settings-sheet/call-settings';
import { useCallRoom, type CallRoomModel } from '../use-call-room';

export interface CallRoomProps {
  readonly action: string | null;
  readonly onAgain: () => void;
  readonly onLeave: () => void;
}

function useInitialAction(
  action: string | null,
  call: CallView,
  run: (action: string) => void,
): void {
  const done = useRef(false);
  useEffect(() => {
    if (action !== null && !done.current && call.phase === 'listening') {
      done.current = true;
      run(action);
    }
  }, [action, call.phase, run]);
}

function Footer({
  model,
  onAgain,
  onLeave,
}: {
  readonly model: CallRoomModel;
  readonly onAgain: () => void;
  readonly onLeave: () => void;
}): ReactNode {
  const { call, layers, handlers } = model;
  const menu = layers.layer?.kind === 'menu' ? layers.layer.which : null;
  return (
    <>
      {call.phase !== 'ended' && model.pref.video_mode === 'on_demand' && callActive(call) ? (
        <View className="pb-3">
          <ShowThisButton
            onPress={() => {
              layers.open({ kind: 'picker', scope: 'all', still: true });
            }}
          />
        </View>
      ) : null}
      <View className="px-gutter">
        <CallFooter
          call={call}
          name={model.name}
          layout={model.layout}
          reasons={model.reasons}
          handlers={handlers}
          cameraAnchor={model.cameraAnchor}
          shareAnchor={model.shareAnchor}
          settingsOpen={layers.layer?.kind === 'settings'}
          menu={menu}
          onAgain={onAgain}
          onClose={onLeave}
        />
      </View>
    </>
  );
}

function Chips({ model }: { readonly model: CallRoomModel }): ReactNode {
  const look = useRecentLook(model.call.looks);
  return (
    <View className="items-center gap-2">
      <CostChips call={model.call} pref={model.pref} />
      {look === null ? null : <LookedChip look={look} />}
    </View>
  );
}

interface BodyProps {
  readonly model: CallRoomModel;
  readonly tight: boolean;
  readonly onAgain: () => void;
  readonly onLeave: () => void;
}

function stageOfModel(model: CallRoomModel, captions: ReactNode): ReactNode {
  const { call, layout } = model;
  return (
    <>
      <CallStage
        call={call}
        layout={layout}
        level={model.level}
        stoppable={model.stoppable}
        actions={model.stage}
        captions={captions}
      />
      {stageOf(call) === 'orb' || !callActive(call) ? null : (
        <View className="items-center pt-2">
          <CallWave compact phase={call.phase} level={model.level} muted={call.muted} />
        </View>
      )}
    </>
  );
}

function SideBody({ model, onAgain, onLeave }: Omit<BodyProps, 'tight'>): ReactNode {
  const { call } = model;
  const captions = <CallCaptions call={call} name={model.name} />;
  return (
    <View className="flex-1 flex-row items-center justify-center gap-8 px-gutter">
      <View className="h-full min-w-0 flex-1 justify-center py-2">
        {stageOfModel(model, captions)}
      </View>
      <View className="w-full max-w-call flex-1 justify-center gap-3">
        <CallStatus call={call} name={model.name} />
        <Chips model={model} />
        {captions}
        <ToolLines lines={call.tools} />
        <Footer model={model} onAgain={onAgain} onLeave={onLeave} />
      </View>
    </View>
  );
}

function Body({ model, tight, onAgain, onLeave }: BodyProps): ReactNode {
  const { call } = model;
  if (model.layout.kind === 'side') {
    return <SideBody model={model} onAgain={onAgain} onLeave={onLeave} />;
  }
  const captions = <CallCaptions call={call} name={model.name} />;
  return (
    <>
      <View className="items-center gap-2 px-gutter pb-3">
        <CallStatus call={call} name={model.name} hidden={tight} />
        <Chips model={model} />
      </View>
      {stageOfModel(model, captions)}
      {tight ? null : <View className="pt-4">{captions}</View>}
      <ToolLines lines={call.tools} />
      <View className="pt-3">
        <Footer model={model} onAgain={onAgain} onLeave={onLeave} />
      </View>
    </>
  );
}

function Overlays({ model }: { readonly model: CallRoomModel }): ReactNode {
  const { call, layout, layers } = model;
  const settingsOpen = layers.layer?.kind === 'settings';
  return (
    <>
      <CallLayers model={model} />
      {layout.settings === 'sheet' ? (
        <CallSettingsSheet open={settingsOpen} call={call} onClose={layers.close} />
      ) : null}
      {call.request === null && call.missed === null ? null : (
        <View pointerEvents="box-none" className="absolute inset-x-0 top-0 pt-safe">
          <View pointerEvents="box-none" className="mt-app-bar items-center gap-2 px-gutter">
            {call.request === null ? null : (
              <ConsentBanner
                key={call.request.requestId}
                request={call.request}
                name={model.name}
                onAnswer={model.answer}
                onExpire={model.expire}
              />
            )}
            {call.request !== null || call.missed === null ? null : (
              <MissedRequest
                key={call.missed.requestId}
                missed={call.missed}
                name={model.name}
                onShow={() => {
                  if (call.missed !== null) {
                    model.showMissed(call.missed);
                  }
                }}
              />
            )}
          </View>
        </View>
      )}
    </>
  );
}

export function CallRoom({ action, onAgain, onLeave }: CallRoomProps): ReactNode {
  const model = useCallRoom();
  const { call, layout, layers } = model;
  useInitialAction(action, call, model.runAction);
  const stage = stageOf(call);
  const tight = layout.kind === 'column' && !layout.roomy && isMediaStage(stage);
  const active = callActive(call);
  const room = (
    <View className="flex-1 flex-row bg-bg">
      <View className={cn('min-w-0 flex-1 pb-safe-offset-6 pt-safe')}>
        {isMediaStage(stage) ? null : (
          <>
            <Glow
              colour="primary"
              y="40%"
              radius="70%"
              strength={active ? 0.35 : 0.2}
              breathing={active}
            />
            <CallAura phase={call.phase} level={model.level} muted={call.muted} />
          </>
        )}
        <CallHeader
          call={call}
          mode={model.pref.video_mode}
          onMinimise={onLeave}
          onStopSight={stopSharing}
        />
        <Body model={model} tight={tight} onAgain={onAgain} onLeave={onLeave} />
        <Overlays model={model} />
      </View>
      {layout.settings === 'panel' ? (
        <CallSettingsPanel
          open={layers.layer?.kind === 'settings'}
          call={call}
          onClose={layers.close}
        />
      ) : null}
    </View>
  );
  return tight ? <ThemeScope theme="dark">{room}</ThemeScope> : room;
}
