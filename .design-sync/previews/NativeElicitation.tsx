import { NativeElicitation, Stage } from 'smarteverything-kit';

const request = {
  message: 'Tell us how to set up the guest room.',
  requestedSchema: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', title: 'Room name' },
      heating: { type: 'boolean', title: 'Include heating' },
      mode: { type: 'string', title: 'Default mode', enum: ['Comfort', 'Eco', 'Away'] },
    },
  },
};
export const Form = () => (
  <Stage theme="dark" width={480}>
    <NativeElicitation request={request} url={false} pending={false} submit={() => undefined} />
  </Stage>
);
export const LightTheme = () => (
  <Stage theme="light" width={480}>
    <NativeElicitation request={request} url={false} pending={false} submit={() => undefined} />
  </Stage>
);
