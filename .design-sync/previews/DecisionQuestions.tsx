import { DecisionQuestions, Stage } from 'smarteverything-kit';

const questions = [
  {
    id: 'q1',
    title: 'Which rooms should the scene include?',
    header: 'Evening scene',
    detail: 'You can change this later in the scene settings.',
    multi: true,
    custom: false,
    secret: false,
    options: [
      { id: 'living', label: 'Living room' },
      { id: 'kitchen', label: 'Kitchen' },
      { id: 'bedroom', label: 'Bedroom' },
    ],
  },
  {
    id: 'q2',
    title: 'What should the scene be called?',
    multi: false,
    custom: true,
    secret: false,
    options: [
      { id: 'evening', label: 'Evening lights' },
      { id: 'cozy', label: 'Cozy' },
    ],
  },
];
export const Steps = () => (
  <Stage theme="dark" width={480}>
    <DecisionQuestions questions={questions} pending={false} submit={() => undefined} />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={480}>
    <DecisionQuestions questions={questions} pending={false} submit={() => undefined} />
  </Stage>
);
