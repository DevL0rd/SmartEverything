import {
  ApiError,
  JSON_VALUE,
  type JsonValue,
  type ShellyPresenceAction,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { ShellyRpc } from './rpc';
import { supportedMethod } from './action-plan';
export class ShellyFirmwareUpload {
  private transfer: { size: number; offset: number } | null = null;
  constructor(
    private readonly rpc: () => ShellyRpc,
    private readonly methods: () => readonly string[],
  ) {}
  async execute(action: ShellyPresenceAction): Promise<JsonValue | undefined> {
    if (action.action === 'firmware_upload_start') {
      const result = await this.rpc().call(
        supportedMethod(this.methods(), 'OTA.Start'),
        { size: action.size },
        JSON_VALUE,
      );
      this.transfer = { size: action.size, offset: 0 };
      return result;
    }
    if (action.action === 'firmware_upload_abort') {
      const result = await this.rpc().call(
        supportedMethod(this.methods(), 'OTA.Abort'),
        {},
        JSON_VALUE,
      );
      this.transfer = null;
      return result;
    }
    if (action.action !== 'firmware_upload_write') return undefined;
    return this.write(action);
  }
  reset(): void {
    this.transfer = null;
  }
  private async write(
    action: Extract<ShellyPresenceAction, { action: 'firmware_upload_write' }>,
  ): Promise<JsonValue> {
    const transfer = this.transfer;
    const data = Buffer.from(action.data, 'base64');
    if (action.offset !== transfer?.offset)
      throw new ApiError(
        'conflict',
        'The firmware upload offset no longer matches its accepted transfer.',
      );
    if (
      data.toString('base64') !== action.data ||
      data.byteLength > 2048 ||
      data.byteLength > transfer.size - transfer.offset
    )
      throw new ApiError(
        'invalid_request',
        'Firmware chunks must contain at most 2048 bytes within the declared file size.',
      );
    const result = await this.rpc().call(
      supportedMethod(this.methods(), 'OTA.Write'),
      { offset: action.offset, data: action.data },
      z.object({ offset: z.int().nonnegative() }),
    );
    if (result.offset !== transfer.offset + data.byteLength)
      throw new ApiError(
        'upstream_failed',
        'The sensor accepted an unexpected firmware offset; inspect upload state before continuing.',
      );
    this.transfer = result.offset === transfer.size ? null : { ...transfer, offset: result.offset };
    return result;
  }
}
