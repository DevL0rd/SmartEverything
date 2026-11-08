export interface ScoreAnchor {
  readonly score: number;
  readonly text: string;
}

export const SCORE_ANCHORS: readonly ScoreAnchor[] = [
  { score: 0, text: 'nothing worth keeping' },
  { score: 5, text: 'trivia of one moment ("had toast this morning")' },
  { score: 10, text: 'passing detail ("was sleepy on Tuesday")' },
  { score: 15, text: 'tiny one-off preference ("picked the blue mug once")' },
  { score: 20, text: 'minor taste ("likes the window seat")' },
  { score: 25, text: 'small habit ("drinks tea after lunch")' },
  { score: 30, text: 'mild interest ("watches cooking shows sometimes")' },
  { score: 35, text: 'useful small fact ("Mia\'s school bag is green")' },
  { score: 40, text: 'steady preference ("likes jazz while working")' },
  { score: 45, text: 'routine detail ("walks the dog before work")' },
  { score: 50, text: 'useful fact of daily life ("works at a bakery")' },
  { score: 55, text: 'meaningful habit or dislike ("hates being called before 9")' },
  { score: 60, text: 'recurring interest ("plays Zelda most weekends")' },
  { score: 65, text: 'detail about someone close ("Dan\'s sister Mia is a nurse")' },
  { score: 70, text: 'strong lasting preference ("always wants short answers")' },
  { score: 75, text: 'significant personal fact ("is vegetarian")' },
  { score: 80, text: 'ongoing life project or important person ("is planning a move to Osaka")' },
  { score: 85, text: 'identity-level fact ("is a trans woman")' },
  {
    score: 90,
    text: 'core health routine or key person ("takes estrogen HRT daily", "married to Sam")',
  },
  {
    score: 95,
    text: 'defining life event or shared moment ("played Zelda together for the first time after the surgery")',
  },
  { score: 100, text: 'forgetting it would hurt the person' },
];
