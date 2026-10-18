import { MEAL_TYPES } from './health-entries';

export interface HcCode {
  readonly code: number;
  readonly label: string;
  readonly short: string;
}

type HcRow = readonly [number, string] | readonly [number, string, string];

function table(rows: readonly HcRow[]): readonly HcCode[] {
  return rows.map(([code, label, short]) => ({ code, label, short: short ?? label }));
}

const FLOW = table([
  [0, 'Unknown flow', 'Not set'],
  [1, 'Light flow', 'Light'],
  [2, 'Medium flow', 'Medium'],
  [3, 'Heavy flow', 'Heavy'],
]);

export const HC_CODES = {
  flow: FLOW,
  sensation: FLOW.map(({ code, short }) => ({ code, label: short, short })),
  ovulationResult: table([
    [1, 'Positive'],
    [2, 'High'],
    [3, 'Negative'],
    [0, 'Inconclusive'],
  ]),
  mucusAppearance: table([
    [0, 'Unknown', 'Not set'],
    [1, 'Dry'],
    [2, 'Sticky'],
    [3, 'Creamy'],
    [4, 'Watery'],
    [5, 'Egg white'],
    [6, 'Unusual'],
  ]),
  protection: table([
    [0, 'Protection not recorded', 'Not set'],
    [1, 'Protected'],
    [2, 'Unprotected'],
  ]),
  bodyPosition: table([
    [0, 'Not set'],
    [1, 'Standing'],
    [2, 'Sitting'],
    [3, 'Lying down'],
    [4, 'Reclining'],
  ]),
  bloodPressureLocation: table([
    [0, 'Not set'],
    [1, 'Left wrist'],
    [2, 'Right wrist'],
    [3, 'Left upper arm'],
    [4, 'Right upper arm'],
  ]),
  relationToMeal: table([
    [0, 'Not set'],
    [1, 'Any time'],
    [2, 'Fasting'],
    [3, 'Before a meal'],
    [4, 'After a meal'],
  ]),
  specimenSource: table([
    [0, 'Not set'],
    [1, 'Sensor (interstitial)'],
    [2, 'Finger prick'],
    [3, 'Plasma'],
    [4, 'Serum'],
    [5, 'Tears'],
    [6, 'Whole blood'],
  ]),
  temperatureLocation: table([
    [0, 'Not set'],
    [1, 'Armpit'],
    [2, 'Finger'],
    [3, 'Forehead'],
    [4, 'Mouth'],
    [5, 'Rectum'],
    [6, 'Temple'],
    [7, 'Toe'],
    [8, 'Ear'],
    [9, 'Wrist'],
    [10, 'Vagina'],
  ]),
  mealType: table([
    [MEAL_TYPES.unknown, 'Not set'],
    [MEAL_TYPES.breakfast, 'Breakfast'],
    [MEAL_TYPES.lunch, 'Lunch'],
    [MEAL_TYPES.dinner, 'Dinner'],
    [MEAL_TYPES.snack, 'Snack'],
  ]),
  mindfulnessType: table([
    [1, 'Meditation'],
    [3, 'Breathing'],
    [4, 'Music'],
    [5, 'Movement'],
    [6, 'Unguided'],
    [2, 'Other'],
  ]),
  exerciseType: table([
    [0, 'Workout'],
    [2, 'Badminton'],
    [4, 'Baseball'],
    [5, 'Basketball'],
    [8, 'Cycling'],
    [9, 'Stationary bike'],
    [10, 'Boot camp'],
    [11, 'Boxing'],
    [13, 'Calisthenics'],
    [14, 'Cricket'],
    [16, 'Dancing'],
    [25, 'Elliptical'],
    [26, 'Exercise class'],
    [27, 'Fencing'],
    [28, 'American football'],
    [29, 'Australian football'],
    [31, 'Frisbee'],
    [32, 'Golf'],
    [33, 'Guided breathing'],
    [34, 'Gymnastics'],
    [35, 'Handball'],
    [36, 'HIIT'],
    [37, 'Hiking'],
    [38, 'Ice hockey'],
    [39, 'Ice skating'],
    [44, 'Martial arts'],
    [46, 'Paddling'],
    [47, 'Paragliding'],
    [48, 'Pilates'],
    [50, 'Racquetball'],
    [51, 'Rock climbing'],
    [52, 'Roller hockey'],
    [53, 'Rowing'],
    [54, 'Rowing machine'],
    [55, 'Rugby'],
    [56, 'Running'],
    [57, 'Treadmill'],
    [58, 'Sailing'],
    [59, 'Scuba diving'],
    [60, 'Skating'],
    [61, 'Skiing'],
    [62, 'Snowboarding'],
    [63, 'Snowshoeing'],
    [64, 'Football'],
    [65, 'Softball'],
    [66, 'Squash'],
    [68, 'Stair climbing'],
    [69, 'Stair machine'],
    [70, 'Strength training'],
    [71, 'Stretching'],
    [72, 'Surfing'],
    [73, 'Open water swim'],
    [74, 'Pool swim'],
    [75, 'Table tennis'],
    [76, 'Tennis'],
    [78, 'Volleyball'],
    [79, 'Walking'],
    [80, 'Water polo'],
    [81, 'Weightlifting'],
    [82, 'Wheelchair'],
    [83, 'Yoga'],
  ]),
} as const;

export type SleepStageKind = 'awake' | 'rem' | 'light' | 'deep' | 'asleep' | 'unknown';

export const SLEEP_STAGE_KINDS: Readonly<Record<number, SleepStageKind>> = {
  0: 'unknown',
  1: 'awake',
  2: 'asleep',
  3: 'awake',
  4: 'light',
  5: 'deep',
  6: 'rem',
  7: 'awake',
};

export function hcEntry(codes: readonly HcCode[], code: number): HcCode | undefined {
  return codes.find((entry) => entry.code === code);
}

export function hcLabel(codes: readonly HcCode[], code: number): string {
  return hcEntry(codes, code)?.label ?? `Code ${String(code)}`;
}
