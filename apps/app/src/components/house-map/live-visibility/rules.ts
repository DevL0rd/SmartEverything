export interface StageFacts {
  readonly onScreen: boolean;
  readonly screenFocused: boolean;
  readonly appForeground: boolean;
  readonly modalCovered: boolean;
  readonly stillReady: boolean;
}

export interface StageState {
  readonly live: boolean;
  readonly mounted: boolean;
  readonly showStill: boolean;
}

export const STAGE_NOT_REGISTERED: StageState = {
  live: false,
  mounted: false,
  showStill: true,
};

export const INITIAL_FACTS: StageFacts = {
  onScreen: false,
  screenFocused: false,
  appForeground: true,
  modalCovered: false,
  stillReady: false,
};

export function isVisible(facts: StageFacts): boolean {
  return facts.onScreen && facts.screenFocused && facts.appForeground && !facts.modalCovered;
}

function keepsDomComponent(facts: StageFacts): boolean {
  return facts.onScreen && facts.screenFocused && facts.appForeground;
}

function staysAttached(facts: StageFacts): boolean {
  return facts.appForeground;
}

export function stageState(previous: StageState, facts: StageFacts): StageState {
  const live = isVisible(facts);
  const mounted =
    live ||
    (previous.mounted &&
      (keepsDomComponent(facts) || (!facts.stillReady && staysAttached(facts))));
  return { live, mounted, showStill: !live };
}

export function sameStageState(a: StageState, b: StageState): boolean {
  return a.live === b.live && a.mounted === b.mounted && a.showStill === b.showStill;
}

export function sameFacts(a: StageFacts, b: StageFacts): boolean {
  return (
    a.onScreen === b.onScreen &&
    a.screenFocused === b.screenFocused &&
    a.appForeground === b.appForeground &&
    a.modalCovered === b.modalCovered &&
    a.stillReady === b.stillReady
  );
}
