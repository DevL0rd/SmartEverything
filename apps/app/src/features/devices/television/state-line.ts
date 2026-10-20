import type { TvVolume } from '@smarteverything/domain';
import type { DeviceValues } from '../../../store/state';
import type { DeviceModel } from '../model/device-model';
import { televisionView, type TvView } from './view';

export function volumeText(volume: TvVolume): string | null {
  if (volume.muted) {
    return 'Muted';
  }
  return volume.level === null ? null : `${volume.stale ? '≈' : ''}${String(volume.level)}`;
}

export function televisionLine(view: TvView): string {
  switch (view.mode) {
    case 'turning_on':
      return 'Turning on…';
    case 'updating':
      return 'Updating';
    case 'unreachable':
      return 'Not responding';
    case 'standby':
    case 'off_unreachable':
      return 'Off';
    case 'on':
      return onLine(view);
  }
}

function onLine(view: TvView): string {
  const where = view.watching.label;
  const volume = volumeText(view.volume);
  if (volume === null) {
    return where === '' ? 'On' : where;
  }
  const level = view.volume.muted ? volume : `Vol ${volume}`;
  return where === '' ? level : `${where} · ${level}`;
}

export function televisionStateLine(values: DeviceValues, model: DeviceModel): string {
  return televisionLine(televisionView(model.device, values, { turningOn: false, settings: null }));
}

export interface StageText {
  readonly title: string;
  readonly meta: string;
}

function onText(view: TvView): StageText {
  const volume = volumeText(view.volume);
  return {
    title: view.watching.label === '' ? 'On' : view.watching.label,
    meta: volume === null ? '' : view.volume.muted ? 'Muted' : `Vol ${volume}`,
  };
}

export function stageText(view: TvView): StageText {
  switch (view.mode) {
    case 'on':
      return onText(view);
    case 'standby':
      return { title: 'Off', meta: 'Ready to turn on' };
    case 'turning_on':
      return view.wakesOverNetwork
        ? { title: 'Waking…', meta: 'Waiting for it to come online' }
        : { title: 'Turning on…', meta: 'Waiting for the TV to answer' };
    case 'updating':
      return { title: 'Updating', meta: 'Buttons come back when it restarts' };
    case 'unreachable':
      return { title: 'Not responding', meta: 'Check that it is plugged in and on Wi-Fi' };
    case 'off_unreachable':
      return { title: 'Off', meta: 'Link it directly in its settings' };
  }
}
