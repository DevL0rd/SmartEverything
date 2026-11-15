import {
  UPDATE_APP_INPUT,
  UPDATE_DESKTOP_INPUT,
  UPDATE_DISCARD_INPUT,
  UPDATE_HUB_INPUT,
  UPDATE_RECOVER_INPUT,
  UPDATE_RELEASE_KEYS_INPUT,
  UPDATE_ROLLBACK_INPUT,
  UPDATE_STATUS_INPUT,
  UPDATE_UI_INPUT,
} from '@smarteverything/domain';
import { recoverHubUpdate } from '../../../self-update/execute';
import { defineTool, PHYSICAL, READS, REMOVES, type Tool } from './registry';
import { layoutOf } from './update-common';
import { publishApp, publishDesktop } from './update-publish';
import { releaseKeys } from './update-release-keys';
import { rollback, status, update } from './update-runs';
import { discardStagedUpload } from './update-staged-upload';

export const UPDATE_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'update_status',
    input: UPDATE_STATUS_INPUT.omit({ action: true }),
    annotations: READS,
    run: (context, input) => status(context, input.id),
  }),
  defineTool({
    name: 'update_hub',
    input: UPDATE_HUB_INPUT.omit({ action: true }),
    annotations: PHYSICAL,
    answer: true,
    run: (context, input) => update(context, { ...input, action: 'hub' }),
  }),
  defineTool({
    name: 'update_app',
    input: UPDATE_APP_INPUT.omit({ action: true }),
    annotations: PHYSICAL,
    answer: true,
    run: (context, input) => publishApp(context, { ...input, action: 'app' }),
  }),
  defineTool({
    name: 'update_ui',
    input: UPDATE_UI_INPUT.omit({ action: true }),
    annotations: PHYSICAL,
    answer: true,
    run: (context, input) => publishApp(context, { ...input, action: 'ui' }),
  }),
  defineTool({
    name: 'update_desktop',
    input: UPDATE_DESKTOP_INPUT.omit({ action: true }),
    annotations: PHYSICAL,
    answer: true,
    run: (context, input) => publishDesktop(context, { ...input, action: 'desktop' }),
  }),
  defineTool({
    name: 'update_recover',
    input: UPDATE_RECOVER_INPUT.omit({ action: true }),
    annotations: PHYSICAL,
    answer: true,
    run: async (context, input) => ({
      structured: await recoverHubUpdate(layoutOf(context), input.id, input.holdSeconds),
    }),
  }),
  defineTool({
    name: 'update_rollback',
    input: UPDATE_ROLLBACK_INPUT.omit({ action: true }),
    annotations: PHYSICAL,
    answer: true,
    run: (context, input) => rollback(context, input),
  }),
  defineTool({
    name: 'update_release_keys',
    input: UPDATE_RELEASE_KEYS_INPUT.omit({ action: true }),
    annotations: REMOVES,
    answer: true,
    run: (context, input) => releaseKeys(context, input),
  }),
  defineTool({
    name: 'update_discard',
    input: UPDATE_DISCARD_INPUT.omit({ action: true }),
    annotations: REMOVES,
    answer: true,
    run: (context, input) => discardStagedUpload(context, input.upload),
  }),
];
