import { searchKeyOf, type SearchInput } from './query';
import { addToken, removeLastToken, removeToken, type SearchToken } from './tokens';

export interface SearchState {
  readonly tokens: readonly SearchToken[];
  readonly input: string;
  readonly words: string;
}

export type SearchAction =
  | { readonly type: 'type'; readonly value: string }
  | { readonly type: 'pick'; readonly token: SearchToken }
  | { readonly type: 'commit' }
  | { readonly type: 'backspace' }
  | { readonly type: 'remove'; readonly token: SearchToken }
  | { readonly type: 'apply'; readonly search: SearchInput }
  | { readonly type: 'clear' };

export function initialSearch(text: string): SearchState {
  const words = text.trim();
  return { tokens: [], input: words, words };
}

function typed(state: SearchState, value: string): SearchState {
  return value.trim() === '' ? { ...state, input: value, words: '' } : { ...state, input: value };
}

export function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case 'type':
      return typed(state, action.value);
    case 'pick':
      return { tokens: addToken(state.tokens, action.token), input: '', words: '' };
    case 'commit':
      return { ...state, words: state.input.trim() };
    case 'backspace':
      return state.input === '' ? { ...state, tokens: removeLastToken(state.tokens) } : state;
    case 'remove':
      return { ...state, tokens: removeToken(state.tokens, action.token) };
    case 'apply':
      return { tokens: action.search.tokens, input: action.search.text, words: action.search.text };
    case 'clear':
      return { tokens: [], input: '', words: '' };
  }
}

export function queryInputOf(state: SearchState): SearchInput {
  return { tokens: state.tokens, text: state.words };
}

export function isTyping(state: SearchState): boolean {
  return state.input.trim() !== '' && state.input.trim() !== state.words;
}

export function searchMoved(state: SearchState, next: SearchState): boolean {
  return isTyping(next) || searchKeyOf(queryInputOf(next)) !== searchKeyOf(queryInputOf(state));
}
