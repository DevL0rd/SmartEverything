import {
  Children,
  createElement,
  isValidElement,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it } from 'vitest';
import { ChatFrame } from './chat-frame';

function Conversation(props: { readonly wide: boolean }): ReactNode {
  return props.wide;
}

function List(props: { readonly open: boolean }): ReactNode {
  return props.open;
}

function SlideOver(props: { readonly open: boolean }): ReactNode {
  return props.open;
}

function frameOf(wide: boolean): ReactElement {
  const frame = ChatFrame({
    list: createElement(List, { open: wide }, wide ? 'pane' : null),
    conversation: createElement(Conversation, { key: 'chat-1', wide }),
    slideOver: createElement(SlideOver, { open: false }),
  });
  if (!isValidElement<{ readonly children: ReactNode }>(frame)) {
    throw new Error('ChatFrame did not return an element');
  }
  return frame;
}

function typeName(type: ElementType): string {
  return typeof type === 'function' ? type.name : type;
}

function signature(node: ReactNode, path: readonly number[] = []): string[] {
  if (!isValidElement<{ readonly children?: ReactNode }>(node)) {
    return [];
  }
  const own = [
    path.join('.'),
    typeof node.type === 'string' ? node.type : typeName(node.type),
    node.key ?? '',
  ].join(':');
  return [
    own,
    ...Children.toArray(node.props.children).flatMap((child, index) =>
      signature(child, [...path, index]),
    ),
  ];
}

describe('ChatFrame', () => {
  it('keeps the list, conversation and slide-over at the same position and type across layouts', () => {
    expect(signature(frameOf(false))).toEqual(signature(frameOf(true)));
  });

  it('places the conversation under the same parent chain when the layout widens', () => {
    const conversation = (wide: boolean): string | undefined =>
      signature(frameOf(wide)).find((entry) => entry.includes('Conversation'));
    expect(conversation(false)).toBe(conversation(true));
    expect(conversation(true)).toContain('chat-1');
  });

  it('keeps the list at the same position when the conversation is hidden for the full-width list', () => {
    const hidden = ChatFrame({
      list: createElement(List, { open: true }, 'pane'),
      conversation: null,
      slideOver: createElement(SlideOver, { open: false }),
    });
    const listEntry = (node: ReactNode): string | undefined =>
      signature(node).find((entry) => entry.includes('List'));
    expect(listEntry(hidden)).toBe(listEntry(frameOf(true)));
  });
});
