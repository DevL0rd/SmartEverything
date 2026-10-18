import type { AirBand, DeviceFamily, LaundryPhase, LaundryStage } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import type { IrCategory } from './model/ir-category';

export type VisualSize = 'tile' | 'card' | 'hero';

export type VisualPower = 'on' | 'off' | 'unknown';

export type ThermalMode = 'heat' | 'cool' | 'idle';

export interface VisualReading {
  readonly text: string;
  readonly unit: string | null;
  readonly at: string;
}

export type Illumination = 'dark' | 'twilight' | 'bright';

export type MicrowavePhase = 'idle' | 'running' | 'paused';

export interface MicrowaveFacts {
  readonly phase: MicrowavePhase;
  readonly finished: boolean;
  readonly remaining: number | null;
  readonly progress: number | null;
  readonly mode: string | null;
  readonly open: boolean;
  readonly lamp: boolean;
  readonly locked: boolean;
  readonly power: number | null;
  readonly finishedAt: string | null;
}

export type LaundryGlow =
  'rest' | 'wash' | 'rinse' | 'spin' | 'dry' | 'delay' | 'paused' | 'done' | 'fault';

export type LaundryMotion = 'none' | 'tumble' | 'weigh' | 'spin' | 'slow' | 'steam' | 'anti';

type LaundryTint = 'warm' | 'cool' | 'mist';

type LaundryDisplay = 'blank' | 'program' | 'time' | 'clock' | 'done' | 'clean' | 'error';

export type LaundryDoor = 'open' | 'closed' | 'locked' | 'hot';

export interface LaundryFacts {
  readonly stage: LaundryStage;
  readonly phase: LaundryPhase;
  readonly motion: LaundryMotion;
  readonly glow: LaundryGlow;
  readonly display: LaundryDisplay;
  readonly running: boolean;
  readonly paused: boolean;
  readonly frozen: boolean;
  readonly remaining: number | null;
  readonly progress: number | null;
  readonly water: number;
  readonly suds: boolean;
  readonly drops: boolean;
  readonly rinse: boolean;
  readonly blur: boolean;
  readonly drain: boolean;
  readonly heat: boolean;
  readonly puffs: boolean;
  readonly tint: LaundryTint | null;
  readonly hosted?: boolean;
  readonly door: LaundryDoor;
  readonly drumLight: boolean;
  readonly childLock: boolean;
  readonly lowSupply: boolean;
  readonly remoteOff: boolean;
  readonly faultCode: number | null;
  readonly finished: boolean;
  readonly cleaned: boolean;
  readonly spin: number | null;
  readonly dial: number | null;
}

export interface DiffuserFacts {
  readonly spray: string | null;
  readonly charging: boolean;
  readonly fault: boolean;
}

export type RobotMood = 'awake' | 'listening' | 'speaking' | 'worried' | 'asleep';

export interface RobotFacts {
  readonly mood: RobotMood;
  readonly onBase: boolean | null;
  readonly move: string | null;
}

export type ButtonGesture = 'single' | 'double' | 'long';

export interface ButtonFacts {
  readonly lastPress: { readonly gesture: ButtonGesture; readonly at: string } | null;
}

export interface HubFacts {
  readonly children: number | null;
}

export interface IrFacts {
  readonly category: IrCategory;
  readonly on: boolean | null;
  readonly assumed: boolean;
  readonly failed: boolean;
  readonly sentAt: string | null;
}

export interface DetectionFacts {
  readonly objects: number | null;
  readonly light: Illumination | null;
}

export type PhoneRinger = 'normal' | 'vibrate' | 'silent' | 'dnd';

export type PhoneFold = 'open' | 'folded';

export interface PhoneFacts {
  readonly level: number | null;
  readonly charging: boolean;
  readonly ringer: PhoneRinger | null;
  readonly ringing: boolean;
  readonly torch: boolean;
  readonly screenOn: boolean;
  readonly playing: boolean;
  readonly notifications: number;
  readonly inCall: boolean;
  readonly hot: boolean;
  readonly fold: PhoneFold | null;
}

export interface VisualState {
  readonly power: VisualPower;
  readonly online: boolean;
  readonly level: number;
  readonly band: AirBand | null;
  readonly target: number | null;
  readonly targetShare: number | null;
  readonly current: number | null;
  readonly oscillating: boolean;
  readonly angle: number | null;
  readonly colour: string | null;
  readonly ambientLight: boolean | null;
  readonly waterLow: boolean;
  readonly waterLevel: number | null;
  readonly thermal: ThermalMode;
  readonly locked: boolean | null;
  readonly position: number | null;
  readonly progress: number | null;
  readonly battery: number | null;
  readonly pulse: number | null;
  readonly syncing: boolean;
  readonly load: number | null;
  readonly reading: VisualReading | null;
  readonly source: string | null;
  readonly presence: boolean | null;
  readonly open: boolean | null;
  readonly microwave?: MicrowaveFacts;
  readonly diffuser?: DiffuserFacts;
  readonly laundry?: LaundryFacts;
  readonly detection?: DetectionFacts;
  readonly robot?: RobotFacts;
  readonly button?: ButtonFacts;
  readonly hub?: HubFacts;
  readonly ir?: IrFacts;
  readonly phone?: PhoneFacts;
}

export type VisualTone = 'active' | 'idle' | 'offline';

export interface VisualProps {
  readonly state: VisualState;
  readonly size: VisualSize;
  readonly px: number;
  readonly tone: VisualTone;
  readonly moving: boolean;
  readonly reduced: boolean;
}

export type VisualComponent = (props: VisualProps) => ReactNode;

export type VisualRegistry = Readonly<Record<DeviceFamily, VisualComponent>>;
