import frameBudget from './frame-budget.js';
import lazyDebugPayload from './lazy-debug-payload.js';
import noComponentInterval from './no-component-interval.js';
import noDeviceListSlice from './no-device-list-slice.js';
import noFrameMeasure from './no-frame-measure.js';
import noRawModal from './no-raw-modal.js';
import noSwallowedErrors from './no-swallowed-errors.js';
import noRawExternalStore from './no-raw-external-store.js';
import noVoidPromise from './no-void-promise.js';
import noWholeStoreSubscribe from './no-whole-store-subscribe.js';
import noStrayText from './no-stray-text.js';
import preferMinuteSelector from './prefer-minute-selector.js';
import thumbnailSize from './thumbnail-size.js';
import workletCallsWorklets from './worklet-calls-worklets.js';

const CONTROL = /^\s*(eslint|global|globals|exported|prettier-ignore)\b/;

const noComments = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid code comments. Naming and structure carry meaning; prose belongs in docs/.',
    },
    schema: [],
    messages: {
      comment:
        'Code comments are forbidden. Name it so it explains itself, or put the explanation in docs/. Only eslint and prettier control comments are allowed.',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (CONTROL.test(comment.value)) continue;
          context.report({ node: comment, messageId: 'comment' });
        }
      },
    };
  },
};

export default {
  rules: {
    'frame-budget': frameBudget,
    'lazy-debug-payload': lazyDebugPayload,
    'no-comments': noComments,
    'no-component-interval': noComponentInterval,
    'no-device-list-slice': noDeviceListSlice,
    'no-frame-measure': noFrameMeasure,
    'no-raw-modal': noRawModal,
    'no-raw-external-store': noRawExternalStore,
    'no-stray-text': noStrayText,
    'no-swallowed-errors': noSwallowedErrors,
    'no-void-promise': noVoidPromise,
    'no-whole-store-subscribe': noWholeStoreSubscribe,
    'prefer-minute-selector': preferMinuteSelector,
    'thumbnail-size': thumbnailSize,
    'worklet-calls-worklets': workletCallsWorklets,
  },
};
