import type {
  ComputerAiRuntime,
  ComputerRuntimeTarget,
  ComputerRuntimeRequest,
  ComputerRuntimeSettingsPatch,
  ComputerRuntimeProviderTurn,
  CodexCommandConfiguration,
  AiNativeCommandWrite,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import type { Store } from '../store/store';
import type { Caller } from '../server/auth';
import { ComputerRuntimeDirectory } from './runtime-directory';
import type { ComputerRuntimeHost } from './runtime-host';
export class ComputerRuntimePorts {
  readonly runtimes: ComputerRuntimeDirectory;
  constructor(store: Store, log: Logger) {
    this.runtimes = new ComputerRuntimeDirectory(store, log);
  }
  runtimeConnectionGeneration(target: ComputerRuntimeTarget): string {
    return this.runtimes.connectionGeneration(target);
  }
  assertRuntimeCommandAvailable(input: AiNativeCommandWrite): void {
    this.runtimes.assertCommandAvailable(input);
  }
  startRuntimeCommand(
    input: AiNativeCommandWrite,
    authorize: () => void,
    configuration?: CodexCommandConfiguration,
  ): ReturnType<ComputerRuntimeDirectory['startCommand']> {
    return this.runtimes.startCommand(input, authorize, configuration);
  }
  runtimeStatus(target: ComputerRuntimeTarget): ReturnType<ComputerRuntimeDirectory['status']> {
    return this.runtimes.status(target);
  }
  updateRuntime(
    target: ComputerRuntimeTarget,
    patch: ComputerRuntimeSettingsPatch,
  ): ReturnType<ComputerRuntimeDirectory['update']> {
    return this.runtimes.update(target, patch);
  }
  requestRuntime<T>(
    target: ComputerRuntimeTarget,
    request: ComputerRuntimeRequest,
    schema: z.ZodType<T>,
  ): Promise<T> {
    return this.runtimes.request(target, request, schema);
  }
  nativeRuntimeRequest<T>(
    target: ComputerRuntimeTarget,
    request: ComputerRuntimeRequest,
    schema: z.ZodType<T>,
    caller: Caller,
  ): Promise<T> {
    return this.runtimes.nativeRequest(target, request, schema, caller);
  }
  runtimeModels(target: ComputerRuntimeTarget): ReturnType<ComputerRuntimeDirectory['models']> {
    return this.runtimes.models(target);
  }
  startRuntimeTurn(
    turn: ComputerRuntimeProviderTurn,
  ): ReturnType<ComputerRuntimeDirectory['startTurn']> {
    return this.runtimes.startTurn(turn);
  }
  setLocalRuntimeFactory(
    runtime: ComputerAiRuntime,
    factory: (deviceId: string) => ComputerRuntimeHost,
  ): void {
    this.runtimes.setLocalFactory(runtime, factory);
  }
}
