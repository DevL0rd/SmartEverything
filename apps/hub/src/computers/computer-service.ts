import {
  ApiError,
  COMPUTER_ACTIONS,
  HUB_AI_REFUSAL,
  HUB_GUARD_MESSAGE,
  NODE_VERB_SCOPES,
  type COMPUTER_DETAIL,
  type ComputerAction,
  type NodeRequest,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import type { Store } from '../store/store';
import { ComputerAccess, guarded, viewerOf, type ComputerViewer } from './computer-access';
import type { ComputerDirectory } from './computer-directory';
import type { ComputerView } from './computer-session';
import { hubAllows } from './hub-guard';
import type { Caller } from '../server/auth';

const ACTIONS: ReadonlySet<string> = new Set(COMPUTER_ACTIONS);

function isAction(key: string): key is ComputerAction {
  return ACTIONS.has(key);
}

export interface ComputerServiceOptions {
  readonly store: Store;
  readonly directory: ComputerDirectory;
  readonly log: Logger;
  readonly hubPid?: number;
}

export interface ComputerCall {
  readonly caller: Caller;
  readonly deviceId: string;
  readonly request: NodeRequest;
  readonly confirmed?: boolean;
}

export interface ViewerCall {
  readonly deviceId: string;
  readonly request: NodeRequest;
  readonly confirmed: boolean;
  readonly person: boolean;
}

function isPerson(caller: Caller): boolean {
  return caller.kind === 'client' && caller.via === undefined;
}

function machineReport(
  view: ComputerView | null,
): Pick<z.input<typeof COMPUTER_DETAIL>, 'machineActions' | 'permissions'> {
  return { machineActions: view?.hello.actions ?? [], permissions: view?.hello.permissions ?? [] };
}

export class ComputerService {
  readonly access: ComputerAccess;

  constructor(private readonly options: ComputerServiceOptions) {
    this.access = new ComputerAccess(options.store);
  }

  viewer(caller: Caller): ComputerViewer {
    return viewerOf(this.options.store, caller);
  }

  detail(deviceId: string, viewer: ComputerViewer): z.input<typeof COMPUTER_DETAIL> {
    const device = this.access.device(deviceId, viewer);
    const scopes = this.access.scopes(deviceId, viewer);
    const view = this.options.directory.online(deviceId)?.view() ?? null;
    return {
      deviceId,
      online: device.online,
      at: view?.at ?? null,
      features: [...(view?.hello.features ?? [])],
      parts: view?.parts ?? {},
      scopes,
      actions: device.capabilities.map((capability) => capability.key).filter(isAction),
      ...machineReport(view),
    };
  }

  async freshDetail(
    deviceId: string,
    viewer: ComputerViewer,
  ): Promise<z.input<typeof COMPUTER_DETAIL>> {
    this.access.device(deviceId, viewer);
    await this.options.directory.online(deviceId)?.sampled();
    return this.detail(deviceId, viewer);
  }

  ask<T>(call: ComputerCall, schema: z.ZodType<T>): Promise<T> {
    const { caller, deviceId, request } = call;
    const person = isPerson(caller);
    return guarded(() =>
      this.askAs(
        this.viewer(caller),
        { deviceId, request, person, confirmed: person && call.confirmed === true },
        schema,
      ),
    );
  }

  askAs<T>(viewer: ComputerViewer, call: ViewerCall, schema: z.ZodType<T>): Promise<T> {
    const { deviceId, request } = call;
    return guarded(async () => {
      const scope = NODE_VERB_SCOPES[request.verb];
      if (scope === null) this.access.device(deviceId, viewer);
      else this.access.require(deviceId, scope, viewer);
      const startedAt = performance.now();
      const session = this.options.directory.byDevice(deviceId);
      const guard = { role: session.role, hubPid: this.options.hubPid ?? process.pid };
      if (!hubAllows(request, guard, call.confirmed)) {
        this.options.log.warn('computer.hub_guard_refused', { deviceId, verb: request.verb });
        throw new ApiError('conflict', call.person ? HUB_GUARD_MESSAGE : HUB_AI_REFUSAL);
      }
      const value = await session.call(request);
      this.options.log.debug('computer.request_done', () => ({
        deviceId,
        verb: request.verb,
        durationMs: Math.round(performance.now() - startedAt),
      }));
      return schema.parse(value);
    });
  }
}
