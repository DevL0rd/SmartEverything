import type { BrushPressure } from '@smarteverything/domain';
import type { PressureLook } from '../../toothbrush/brand-ui';
import type { PressureBand } from './gauge-model';

export const ORALB_PRESSURE: Readonly<Record<BrushPressure, PressureLook>> = {
  no_contact: {
    label: 'Light',
    tone: 'neutral',
    icon: 'circle',
    colour: 'on-surface-variant',
    opacity: 0.85,
  },
  optimal: {
    label: 'Good',
    tone: 'positive',
    icon: 'circleCheck',
    colour: 'positive',
    opacity: 0.9,
  },
  too_high: {
    label: 'Too hard',
    tone: 'critical',
    icon: 'warning',
    colour: 'critical',
    opacity: 1,
  },
};

export const PRESSURE_OF_BAND: Readonly<Record<PressureBand, BrushPressure>> = {
  light: 'no_contact',
  good: 'optimal',
  hard: 'too_high',
};
