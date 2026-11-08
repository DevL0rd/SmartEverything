import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { clock } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { phoneFacts } from '../model/facts/phone';
import { displayOf, ioStateOf } from '../model/io-look';
import { boxStyle, scaled, type Box } from '../parts/frame';
import { DisplayRest, TimerText } from '../parts/io-display';
import { screenBounds, slabOf } from '../parts/phone-geometry';
import { ScreenFace as PhoneScreen } from '../parts/phone-screen';
import { Panel, useBodyInk, usePrinterTints } from '../parts/printer-body';
import { DIAL_FIGURES, Readout } from '../parts/readout';
import type { VisualComponent, VisualState } from '../types';
import { LaundryVisual } from '../visuals/laundry-visual';
import { MicrowaveVisual } from '../visuals/microwave-visual';
import { TreadmillVisual } from '../visuals/treadmill-visual';
import { rectStyle, type AnchorFrame } from '../../models';
import { EffectOverlay } from './effect-overlay';
import {
  EFFECT_PARTS,
  overlayPlans,
  unitBox,
  type OverlayContext,
  type ScreenFaceProps,
  type ScreenPart,
  type ScreenPlan,
  type ScreenRenderer,
} from './registry';

export const PRINTER_PANEL: Box = { x: 226, y: 98, w: 52, h: 62 };

const MICROWAVE_PANEL: Box = { x: 75, y: 26.5, w: 18, h: 10 };

const TREADMILL_CONSOLE: Box = { x: 63, y: 24.5, w: 15, h: 6 };

export const LAUNDRY_FACE: Box = { x: 28, y: 35, w: 44, h: 44 };

export const IO_GLASS: Box = { x: 13, y: 88, w: 14, h: 33 };

export function phoneRegion(state: VisualState): Box {
  const { x, y, w, h } = screenBounds(slabOf(phoneFacts(state).fold));
  return { x, y, w, h };
}

export interface Crop {
  readonly left: number;
  readonly top: number;
  readonly px: number;
}

export function cropOf(target: Box, region: Box, px: number): Crop {
  const width = scaled(target.w, px);
  const height = scaled(target.h, px);
  const visual = Math.min(width / region.w, height / region.h) * 100;
  return {
    left: (width - scaled(region.w, visual)) / 2 - scaled(region.x, visual),
    top: (height - scaled(region.h, visual)) / 2 - scaled(region.y, visual),
    px: visual,
  };
}

function cropped(Visual: VisualComponent, region: Box): ScreenRenderer {
  function Face({ box, px, state, size, tone, moving, reduced }: ScreenFaceProps): ReactNode {
    const crop = cropOf(box, region, px);
    const frame: ViewStyle = { ...boxStyle(box, px), overflow: 'hidden' };
    const stage: ViewStyle = {
      position: 'absolute',
      left: crop.left,
      top: crop.top,
      width: crop.px,
      height: crop.px,
    };
    return (
      <View pointerEvents="none" style={frame}>
        <View style={stage}>
          <Visual
            state={state}
            size={size}
            px={crop.px}
            tone={tone}
            moving={moving}
            reduced={reduced}
          />
        </View>
      </View>
    );
  }
  return { region: () => null, Face };
}

function ReadoutFace({ box, px, state, size, tone }: ScreenFaceProps): ReactNode {
  const { reading } = state;
  return reading === null ? null : (
    <Readout
      box={box}
      px={px}
      size={size}
      tone={tone}
      figures={DIAL_FIGURES}
      value={reading.text}
      unit={reading.unit}
    />
  );
}

function IoFace({ state, tone }: ScreenFaceProps): ReactNode {
  const facts = state.toothbrush;
  if (facts === undefined) return null;
  const display = displayOf(facts, ioStateOf(facts, tone));
  return (
    <>
      <DisplayRest display={display} />
      <TimerText display={display} />
    </>
  );
}

function PhoneFace({
  state,
  size,
  time,
}: Pick<ScreenFaceProps, 'state' | 'size'> & { readonly time: string | null }): ReactNode {
  const tint = useColour('viz-2');
  const facts = phoneFacts(state);
  const slab = slabOf(facts.fold);
  return <PhoneScreen facts={facts} slab={slab} size={size} tint={tint} time={time} />;
}

function ClockedPhoneFace(props: Pick<ScreenFaceProps, 'state' | 'size'>): ReactNode {
  return <PhoneFace {...props} time={clock(useMinute())} />;
}

function PhoneScreenFace({ state, size, tone }: ScreenFaceProps): ReactNode {
  if (!phoneFacts(state).screenOn || tone === 'offline') return null;
  return size === 'hero' ? (
    <ClockedPhoneFace state={state} size={size} />
  ) : (
    <PhoneFace state={state} size={size} time={null} />
  );
}

function PrinterFace({ state }: ScreenFaceProps): ReactNode {
  const ink = useBodyInk();
  const tints = usePrinterTints();
  const facts = state.printer;
  return facts === undefined ? null : <Panel ink={ink} facts={facts} tints={tints} />;
}

export const SCREEN_PARTS: Readonly<Record<ScreenPart, ScreenRenderer>> = {
  readout: { region: () => null, Face: ReadoutFace },
  io: { region: () => IO_GLASS, Face: IoFace },
  phone: { region: phoneRegion, Face: PhoneScreenFace },
  printer: { region: () => PRINTER_PANEL, Face: PrinterFace },
  microwave: cropped(MicrowaveVisual, MICROWAVE_PANEL),
  treadmill: cropped(TreadmillVisual, TREADMILL_CONSOLE),
  laundry: cropped(LaundryVisual, LAUNDRY_FACE),
};

export function viewBoxOf(box: Box): string {
  return `${String(box.x)} ${String(box.y)} ${String(box.w)} ${String(box.h)}`;
}

function ScreenOverlay({
  plan,
  renderer,
  context,
  px,
}: {
  readonly plan: ScreenPlan;
  readonly renderer: ScreenRenderer;
  readonly context: OverlayContext;
  readonly px: number;
}): ReactNode {
  const { Face } = renderer;
  const region = renderer.region(context.state);
  if (region === null) return <Face {...context} box={unitBox(plan.rect, px)} px={px} />;
  return (
    <View pointerEvents="none" className="absolute" style={rectStyle(plan.rect)}>
      <Svg
        width={plan.rect.width}
        height={plan.rect.height}
        viewBox={viewBoxOf(region)}
        preserveAspectRatio="xMidYMid meet"
      >
        <Face {...context} box={region} px={px} />
      </Svg>
    </View>
  );
}

export interface ModelOverlay {
  readonly state: OverlayContext['state'];
  readonly size: OverlayContext['size'];
  readonly tone: OverlayContext['tone'];
}

export function AnchorOverlays({
  frame,
  overlay,
}: {
  readonly frame: AnchorFrame;
  readonly overlay: ModelOverlay;
}): ReactNode {
  const { spec, anchors, gate, px } = frame;
  const context: OverlayContext = { ...overlay, ...gate };
  return overlayPlans(spec, anchors, overlay.state).map((plan) =>
    plan.kind === 'screen' ? (
      <ScreenOverlay
        key={plan.id}
        plan={plan}
        renderer={SCREEN_PARTS[plan.part]}
        context={context}
        px={px}
      />
    ) : (
      <EffectOverlay
        key={plan.id}
        plan={plan}
        Part={EFFECT_PARTS[plan.look.part]}
        context={context}
        px={px}
      />
    ),
  );
}
