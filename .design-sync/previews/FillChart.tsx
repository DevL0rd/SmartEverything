import { FillChart, Stage } from 'smarteverything-kit';

const vals = [62, 68, 71, null, 74, 79, 83, 80, 76, 72].map((value, i) => ({
  key: `h${i}`,
  value,
}));
export const Line = () => (
  <Stage theme="dark" width={480}>
    <div style={{ height: 160, display: 'flex', flexDirection: 'column' }}>
      <FillChart
        values={vals}
        kind="line"
        colour="heart"
        label="Resting heart rate"
        reference={70}
        band={{ min: 60, max: 80 }}
      />
    </div>
  </Stage>
);
export const BarsKind = () => (
  <Stage theme="dark" width={480}>
    <div style={{ height: 160, display: 'flex', flexDirection: 'column' }}>
      <FillChart
        values={[3, 5, 4, 7, 6, 8, 5].map((value, i) => ({ key: `b${i}`, value }))}
        kind="bars"
        colour="exercise"
        label="Workout minutes"
      />
    </div>
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={480}>
    <div style={{ height: 160, display: 'flex', flexDirection: 'column' }}>
      <FillChart
        values={vals}
        kind="line"
        colour="heart"
        label="Resting heart rate"
        reference={70}
      />
    </div>
  </Stage>
);
