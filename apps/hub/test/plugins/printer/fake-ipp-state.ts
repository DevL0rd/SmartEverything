import {
  OPERATION,
  GROUP_TAG,
  attribute,
  ipp,
  type IppAttribute,
  type IppGroup,
} from '@smarteverything/ipp';

export interface FakeSupply {
  readonly name: string;
  readonly type: string;
  readonly cls: 'supplyThatIsConsumed' | 'receptacleThatIsFilled';
  readonly colorant: string;
  level: number;
}

export interface FakeJob {
  id: number;
  name: string;
  user: string;
  state: number;
  impressions: number;
  done: number;
  createdAt: number;
}

export interface FakeState {
  state: 3 | 4 | 5;
  reasons: string[];
  accepting: boolean;
  upTime: number;
  stateChangeTime: number;
  configChangeTime: number;
  markerChangeTime: number;
  alerts: string[];
  supplies: FakeSupply[];
  trayLevel: number;
  jobs: FakeJob[];
  pages: number | null;
  colorPages: number | null;
  name: string;
  uuid: string;
}

export interface Seen {
  readonly operation: number;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly dataLength: number;
}

export interface FakeOptions {
  readonly secure?: boolean;
  readonly auth?: { readonly user: string; readonly password: string } | null;
  readonly operations?: readonly number[];
  readonly subscriptions?: boolean;
  readonly formats?: readonly string[];
  readonly path?: string;
  readonly port?: number;
}

export const DEFAULT_OPERATIONS: readonly number[] = [
  OPERATION.printJob,
  OPERATION.validateJob,
  OPERATION.createJob,
  OPERATION.sendDocument,
  OPERATION.cancelJob,
  OPERATION.getJobAttributes,
  OPERATION.getJobs,
  OPERATION.getPrinterAttributes,
  OPERATION.cancelMyJobs,
  OPERATION.identifyPrinter,
];

export function freshState(): FakeState {
  return {
    state: 3,
    reasons: [],
    accepting: true,
    upTime: 1000,
    stateChangeTime: 900,
    configChangeTime: 10,
    markerChangeTime: 20,
    alerts: [],
    supplies: [
      { name: 'Black ink', type: 'ink', cls: 'supplyThatIsConsumed', colorant: 'black', level: 80 },
      { name: 'Cyan ink', type: 'ink', cls: 'supplyThatIsConsumed', colorant: 'cyan', level: 60 },
      {
        name: 'Waste tank',
        type: 'waste-ink',
        cls: 'receptacleThatIsFilled',
        colorant: 'unknown',
        level: 10,
      },
    ],
    trayLevel: 100,
    jobs: [],
    pages: 120,
    colorPages: 20,
    name: 'Hall printer',
    uuid: '5ea8558e-a16f-3ee9-703c-df37e677edab',
  };
}

export function text(name: string, value: string): IppAttribute {
  return attribute(name, ipp.text(value));
}

export function jobGroup(job: FakeJob): IppGroup {
  return {
    tag: GROUP_TAG.job,
    attributes: [
      attribute('job-id', ipp.integer(job.id)),
      attribute('job-state', ipp.enumeration(job.state)),
      attribute('job-name', ipp.name(job.name)),
      attribute('job-originating-user-name', ipp.name(job.user)),
      attribute('job-impressions', ipp.integer(job.impressions)),
      attribute('job-impressions-completed', ipp.integer(job.done)),
      attribute('time-at-creation', ipp.integer(job.createdAt)),
    ],
  };
}
