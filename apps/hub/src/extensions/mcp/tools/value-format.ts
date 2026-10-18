import { COLOR_FORMAT_REASON, type ValueDescriptor } from '@smarteverything/domain';

export function formatOf(descriptor: ValueDescriptor): string {
  switch (descriptor.kind) {
    case 'boolean':
      return 'true or false';
    case 'number':
      return `a number from ${String(descriptor.min)} to ${String(descriptor.max)} in steps of ${String(descriptor.step)}${descriptor.unit === undefined ? '' : ` (${descriptor.unit})`}`;
    case 'enum':
      return `one of: ${descriptor.options.join(', ')}`;
    case 'color':
      return COLOR_FORMAT_REASON.replace(/^not an /u, 'an ');
    case 'text':
      return `text of at most ${String(descriptor.maxLength)} characters`;
    case 'action':
      return descriptor.arguments === undefined
        ? 'null runs it'
        : `an object with ${descriptor.arguments.join(', ')}`;
  }
}
