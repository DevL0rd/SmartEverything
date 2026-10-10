import { API_ENDPOINTS as E, type IrCodeRow, type IrRemoteRow } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.infrared');

export interface NewRemote {
  readonly blasterId: string;
  readonly name: string;
  readonly category: string;
  readonly brand: string | null;
}

export async function createIrRemote(remote: NewRemote): Promise<IrRemoteRow> {
  const row = await api().call(E.createIrRemote, {
    body: {
      blaster_id: remote.blasterId,
      name: remote.name,
      category: remote.category,
      brand: remote.brand,
    },
  });
  log.info('remote.added', { remoteId: row.id });
  return row;
}

export async function removeIrRemote(remoteId: string): Promise<void> {
  await api().call(E.removeIrRemote, { params: { remoteId } });
  log.info('remote.removed', { remoteId });
}

export interface NewCode {
  readonly remoteId: string;
  readonly button: string;
  readonly format: IrCodeRow['format'];
  readonly code: string;
}

export async function saveIrCode(code: NewCode): Promise<IrCodeRow> {
  const row = await api().call(E.saveIrCode, {
    body: { remote_id: code.remoteId, button: code.button, format: code.format, code: code.code },
  });
  log.info('remote.button_saved', { remoteId: code.remoteId, codeId: row.id });
  return row;
}

export async function removeIrCode(codeId: string): Promise<void> {
  await api().call(E.removeIrCode, { params: { codeId } });
  log.info('remote.button_removed', { codeId });
}
