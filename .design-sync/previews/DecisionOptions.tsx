import { useState } from 'react';
import { DecisionOptions, Stage } from 'smarteverything-kit';
import { Col } from '../preview-helpers';

const options = [
  { id: 'a', label: 'Turn lights off in every room', description: 'Runs when everyone has left' },
  { id: 'b', label: 'Turn off only the living room' },
  { id: 'c', label: 'Ask me each time', disabled: true },
];
function Demo({ multi }: { multi: boolean }) {
  const [sel, setSel] = useState<readonly string[]>(['b']);
  return (
    <DecisionOptions
      options={options}
      selected={sel}
      multi={multi}
      disabled={false}
      choose={(id) =>
        setSel(multi ? (sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]) : [id])
      }
    />
  );
}
export const Single = () => (
  <Stage theme="dark" width={460}>
    <Demo multi={false} />
  </Stage>
);
export const Multiple = () => (
  <Stage theme="dark" width={460}>
    <Col>
      <Demo multi />
    </Col>
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={460}>
    <Demo multi={false} />
  </Stage>
);
