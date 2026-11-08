import {
  HUB_UPDATE_SOURCE_CHECK,
  HUB_UPDATE_SOURCE_PATH,
  HUB_UPDATE_SOURCE_SAVE,
  HUB_UPDATE_SOURCE_SAVED,
  HUB_UPDATE_SOURCE_SAVE_PATH,
  HUB_UPDATE_SOURCE_START,
  HUB_UPDATE_SOURCE_START_PATH,
} from '../hub-update-source';
import { HUB_UPDATE_ACCEPTANCE } from '../self-update';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING } from './primitives';

export const HUB_UPDATE_SOURCE_ENDPOINTS = {
  checkHubUpdateSource: endpoint({
    method: 'GET',
    path: HUB_UPDATE_SOURCE_PATH,
    access: 'owner',
    summary: 'Check the configured Git branch tip and count pending local files without pulling',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: HUB_UPDATE_SOURCE_CHECK,
  }),
  saveHubUpdateSource: endpoint({
    method: 'POST',
    path: HUB_UPDATE_SOURCE_SAVE_PATH,
    access: 'owner',
    summary: 'Save the reviewed pending work to a local recovery branch',
    params: NOTHING,
    query: NOTHING,
    body: HUB_UPDATE_SOURCE_SAVE,
    response: HUB_UPDATE_SOURCE_SAVED,
  }),
  startHubUpdateSource: endpoint({
    method: 'POST',
    path: HUB_UPDATE_SOURCE_START_PATH,
    access: 'owner',
    summary: 'Release the reviewed remote snapshot',
    params: NOTHING,
    query: NOTHING,
    body: HUB_UPDATE_SOURCE_START,
    response: HUB_UPDATE_ACCEPTANCE,
  }),
} as const;
