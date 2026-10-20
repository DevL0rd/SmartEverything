import { MODEL_CHOICES } from '@smarteverything/domain';
import type { BrushBrandUi } from '../toothbrush/brand-ui';
import { BRAND_TEXT } from '../toothbrush/model/brand-text';
import { colourFrom } from '../toothbrush/model/mode-colour';
import { SonicareCareCards } from './components/motor-card';
import { HandleStrip } from './components/handle-strip';
import { SonicareStageExtras } from './components/stage-extras';
import { MODE_COLOUR } from './model/mode-colour';
import { BRAND_ROWS } from '../toothbrush/model/search-index';
import { SonicareDiagnostics } from './settings/diagnostics-rows';
import { SonicareHandleSettings } from './settings/handle-settings';
import { SonicarePairStep } from './setup/pair-step';
import { STEPS } from '../toothbrush/model/setup-model';

export const SONICARE_UI: BrushBrandUi = {
  label: BRAND_TEXT.sonicare.label,
  keywords: ['sonicare', 'philips'],
  modeColour: colourFrom(MODE_COLOUR),
  pressure: {
    no_contact: {
      label: 'No contact',
      tone: 'neutral',
      icon: 'circle',
      colour: 'outline',
      opacity: 0.5,
    },
    optimal: {
      label: 'Just right',
      tone: 'positive',
      icon: 'circleCheck',
      colour: 'positive',
      opacity: 0.9,
    },
    too_high: {
      label: 'Too hard',
      tone: 'warning',
      icon: 'warning',
      colour: 'viz-violet',
      opacity: 1,
    },
  },
  modelChoices: MODEL_CHOICES.map((choice) => ({ value: choice.key, label: choice.label })),
  HeroStage: null,
  RestHero: null,
  WidgetFace: null,
  StageExtras: SonicareStageExtras,
  Recap: null,
  HandleStrip,
  HeadCard: null,
  CareCards: SonicareCareCards,
  StatsExtras: null,
  HandleSettings: SonicareHandleSettings,
  Diagnostics: SonicareDiagnostics,
  setupSteps: { steps: STEPS, PairStep: SonicarePairStep },
  SetupFlow: null,
  searchRows: BRAND_ROWS.sonicare,
};
