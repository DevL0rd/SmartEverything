interface SubmitProps {
  readonly returnKeyType?: 'send';
  readonly submitBehavior?: 'submit';
  readonly onSubmitEditing?: () => void;
}

const NONE: SubmitProps = {};

export function submitPropsOf(native: boolean, onSend: () => void): SubmitProps {
  if (!native) return NONE;
  return { returnKeyType: 'send', submitBehavior: 'submit', onSubmitEditing: onSend };
}
