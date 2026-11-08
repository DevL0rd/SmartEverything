import type { BrushBrandUi } from '../toothbrush/brand-ui';
import { BRAND_TEXT } from '../toothbrush/model/brand-text';
import { colourFrom } from '../toothbrush/model/mode-colour';
import { ORALB_MODE_COLOUR } from '../toothbrush/model/oralb-mode-colour';
import { STEPS } from '../toothbrush/model/setup-model';
import { OralbCareCards } from './components/care-cards';
import { OralbRecap } from './components/recap';
import { OralbHeadCard } from './components/head-card';
import { OralbStage } from './components/live-stage';
import { OralbRestHero } from './components/rest-hero';
import { OralbRestStrip } from './components/rest-strip';
import { OralbStatsExtras } from './components/stats-extras';
import { ORALB_PRESSURE } from './model/pressure-look';
import { ORALB_KEYWORDS, ORALB_ROWS } from './model/search-rows';
import { OralbLiveFace } from './widgets/live-face';
import { OralbSetupFlow } from './setup/setup-flow';
import { OralbDiagnostics } from './settings/diagnostics';
import { OralbHandleSettings } from './settings/handle-settings';

export const ORALB_STEPS = STEPS.filter((step) => step !== 'pair');

export const ORALB_UI: BrushBrandUi = {
  label: BRAND_TEXT.oralb.label,
  keywords: ORALB_KEYWORDS,
  modeColour: colourFrom(ORALB_MODE_COLOUR),
  pressure: ORALB_PRESSURE,
  modelChoices: [],
  HeroStage: OralbStage,
  RestHero: OralbRestHero,
  WidgetFace: OralbLiveFace,
  StageExtras: null,
  Recap: OralbRecap,
  HandleStrip: OralbRestStrip,
  HeadCard: OralbHeadCard,
  CareCards: OralbCareCards,
  StatsExtras: OralbStatsExtras,
  HandleSettings: OralbHandleSettings,
  Diagnostics: OralbDiagnostics,
  setupSteps: { steps: ORALB_STEPS, PairStep: null },
  SetupFlow: OralbSetupFlow,
  searchRows: ORALB_ROWS,
};
