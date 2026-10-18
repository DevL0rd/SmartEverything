import { z } from 'zod';
import { area, choice, colour, flag, num, text, timeWindow, type Place } from './settings-meta';

const detection = (group: string): Place => ['presence-detection', group];
const tuning = (group: string): Place => ['presence-tuning', group];
const light = (group: string): Place => ['presence-light', group];
const room = (group: string): Place => ['presence-room', group];
const LEVELS = ['low', 'medium', 'high'];
const LEFT_CENTER_RIGHT = ['left', 'center', 'right'];

export const SHELLY_PRESENCE_SETTINGS = z.looseObject({
  enable: flag('Presence detection', detection('enabled'), {
    keywords: ['pause', 'resume', 'radar'],
  }),
  num_tracks: num('Track limit', detection('track-limit'), {
    min: 1,
    max: 10,
    step: 1,
    keywords: ['objects', 'count'],
  }),
  zmin: num('Minimum detection height', detection('height-limits'), {
    min: 0,
    max: 2.9,
    unit: 'm',
    nullable: true,
    keywords: ['pet', 'floor', 'height'],
  }),
  zmax: num('Maximum detection height', detection('height-limits'), {
    min: 0.1,
    max: 5,
    unit: 'm',
    nullable: true,
    keywords: ['ceiling', 'height'],
  }),
  sensor: z
    .looseObject({
      height: num('Mounting height', detection('mounting-height'), {
        min: 0,
        max: 5,
        unit: 'm',
        keywords: ['mount', 'floor'],
      }),
      position: choice('Mounting position', detection('mounting-position'), LEFT_CENTER_RIGHT, {
        keywords: LEFT_CENTER_RIGHT,
      }),
      flipped: flag('Flipped mounting', detection('flipped'), {
        keywords: ['upside down', 'orientation'],
      }),
      tilt: num('Sensor tilt', detection('tilt-calibration'), {
        unit: '°',
        keywords: ['angle', 'calibrate'],
      }),
      power: choice('Transmission power', detection('power'), LEVELS, {
        keywords: ['range', 'radar'],
      }),
      sensitivity: choice('Sensitivity', detection('sensitivity'), LEVELS, {
        keywords: ['detect', 'preset'],
      }),
      room_preset: choice('Room preset', detection('room-preset'), ['default', 'small_room'], {
        keywords: ['small room', 'default'],
      }),
      points: num('Object recognition threshold', tuning('recognition'), {
        min: 10,
        max: 100,
        keywords: ['points', 'recognition'],
      }),
      snr: num('Signal threshold', tuning('recognition'), {
        min: 10,
        max: 100,
        keywords: ['snr', 'noise'],
      }),
      velocity: num('Velocity threshold', tuning('velocity'), {
        min: 0.01,
        max: 1,
        unit: 'm/s',
        keywords: ['speed', 'movement'],
      }),
      max_velocity: num('Maximum velocity difference', tuning('velocity'), {
        min: 1,
        max: 50,
        unit: 'm/s',
        keywords: ['speed', 'movement'],
      }),
      state: z
        .looseObject({
          det_act_thr: num('Motion activation threshold', tuning('motion'), {
            min: 1,
            max: 100,
            step: 1,
            unit: 'frames',
            keywords: ['activate', 'frames'],
          }),
          det_free_thr: num('Motion release threshold', tuning('motion'), {
            min: 1,
            max: 100,
            step: 1,
            unit: 'frames',
            keywords: ['release', 'frames'],
          }),
          act_free_thr: num('Tracking loss threshold', tuning('tracking'), {
            min: 1,
            max: 1000,
            step: 1,
            unit: 'frames',
            keywords: ['lost', 'frames'],
          }),
          stat_free_thr: num('Stillness tracking threshold', tuning('tracking'), {
            min: 1,
            max: 1000,
            step: 1,
            unit: 'frames',
            keywords: ['still', 'frames'],
          }),
          sleep_free_thr: num('Stillness timeout threshold', tuning('stillness'), {
            min: 1,
            max: 65535,
            step: 1,
            unit: 'frames',
            keywords: ['sleep', 'frames'],
          }),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  ui: z
    .looseObject({
      imperial: flag('Imperial units', detection('units'), { keywords: ['feet', 'meters'] }),
    })
    .nullable()
    .optional(),
  blind: area('Blind spots', room('blind-spots'), { keywords: ['curtains', 'ignore'] }),
  leds: z
    .looseObject({
      brightness: num('Indicator brightness', light('indicator'), {
        min: 0,
        max: 100,
        unit: '%',
        keywords: ['led', 'light'],
      }),
      night_mode: z
        .looseObject({
          enable: flag('Night indicator mode', light('night-mode'), {
            keywords: ['night', 'sleep'],
          }),
          brightness: num('Night indicator brightness', light('night-mode'), {
            min: 0,
            max: 100,
            unit: '%',
            keywords: ['night', 'led'],
          }),
          active_between: timeWindow('Night indicator hours', light('night-mode'), {
            keywords: ['start', 'end', 'time'],
          }),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  main_zone: z.string().optional(),
});

export const SHELLY_ZONE_SETTINGS = z.looseObject({
  id: z.int().nonnegative(),
  name: text('Zone name', room('zone-identity'), {
    nullable: true,
    keywords: ['rename', 'label'],
  }),
  enable: flag('Zone enabled', room('zone-identity'), { keywords: ['pause', 'resume'] }),
  color: colour('Zone color', room('zone-identity'), { keywords: ['colour', 'map'] }),
  presence_delay: num('Presence delay', room('zone-delays'), {
    min: 0,
    max: 3600,
    unit: 's',
    nullable: true,
    keywords: ['occupied', 'threshold'],
  }),
  absence_delay: num('Absence delay', room('zone-delays'), {
    min: 0,
    max: 3600,
    unit: 's',
    nullable: true,
    keywords: ['empty', 'clear', 'threshold'],
  }),
  presence_thr: z.number().nullable().optional(),
  absence_thr: z.number().nullable().optional(),
  area: area('Zone area', room('zone-map'), { keywords: ['map', 'paint', 'rectangle'] }),
});

export const SHELLY_LIGHT_SETTINGS = z.looseObject({
  id: z.int().nonnegative(),
  name: text('Light sensor name', light('sensor'), {
    nullable: true,
    keywords: ['rename', 'illuminance'],
  }),
  dark_thr: num('Dark threshold', light('thresholds'), {
    min: 0,
    unit: 'lux',
    keywords: ['lux', 'dark'],
  }),
  bright_thr: num('Bright threshold', light('thresholds'), {
    min: 0,
    unit: 'lux',
    keywords: ['lux', 'bright'],
  }),
});
