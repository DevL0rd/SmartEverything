import {
  API_ENDPOINTS as E,
  type IrAppliance,
  type IrCodeRow,
  type IrLibraryBrand,
  type IrLibraryCategory,
  type IrLibraryModel,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.infrared');

export async function promoteIrRemote(remoteId: string): Promise<IrAppliance> {
  const appliance = await api().call(E.promoteIrRemote, { params: { remoteId } });
  log.info('appliance.promoted', { remoteId, applianceId: appliance.id });
  return appliance;
}

export async function rebindIrAppliance(
  applianceId: string,
  blasterId: string,
): Promise<IrAppliance> {
  const appliance = await api().call(E.rebindIrAppliance, {
    params: { applianceId },
    body: { blaster_id: blasterId },
  });
  log.info('appliance.rebound', { applianceId, blasterId });
  return appliance;
}

export interface NewApplianceKey {
  readonly applianceId: string;
  readonly button: string;
  readonly format: IrCodeRow['format'];
  readonly code: string;
}

export async function saveIrApplianceKey(key: NewApplianceKey): Promise<IrAppliance> {
  const appliance = await api().call(E.saveIrApplianceKey, {
    params: { applianceId: key.applianceId },
    body: { button: key.button, format: key.format, code: key.code },
  });
  log.info('appliance.key_saved', { applianceId: key.applianceId });
  return appliance;
}

export async function removeIrAppliance(applianceId: string): Promise<void> {
  await api().call(E.removeIrAppliance, { params: { applianceId } });
  log.info('appliance.removed', { applianceId });
}

export async function listIrLibraryCategories(): Promise<IrLibraryCategory[]> {
  return api().call(E.listIrLibraryCategories, {});
}

export async function listIrLibraryBrands(category: string): Promise<IrLibraryBrand[]> {
  return api().call(E.listIrLibraryBrands, { query: { category } });
}

export async function listIrLibraryModels(
  category: string,
  brand: string,
): Promise<IrLibraryModel[]> {
  return api().call(E.listIrLibraryModels, { query: { category, brand } });
}

export interface NewLibraryAppliance {
  readonly libraryId: string;
  readonly blasterId: string;
  readonly name: string;
  readonly roomId: string | null;
}

export async function createIrApplianceFromLibrary(
  appliance: NewLibraryAppliance,
): Promise<IrAppliance> {
  const created = await api().call(E.createIrApplianceFromLibrary, {
    body: {
      library_id: appliance.libraryId,
      blaster_id: appliance.blasterId,
      name: appliance.name,
      ...(appliance.roomId === null ? {} : { room_id: appliance.roomId }),
    },
  });
  log.info('appliance.created_from_library', {
    applianceId: created.id,
    libraryId: appliance.libraryId,
    blasterId: appliance.blasterId,
  });
  return created;
}
