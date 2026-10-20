import {
  BROWSER_PAGE_ELEMENTS_MAX,
  BROWSER_PAGE_NAME_MAX,
  BROWSER_PAGE_TEXT_MAX,
  BROWSER_PAGE_VALUE_MAX,
} from './browser-page';

const SELECTOR = [
  'a[href]',
  'button',
  'input:not([type=hidden])',
  'select',
  'textarea',
  'summary',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role=button]',
  '[role=link]',
  '[role=checkbox]',
  '[role=radio]',
  '[role=tab]',
  '[role=menuitem]',
  '[role=switch]',
  '[role=textbox]',
  '[role=combobox]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const BROWSER_PAGE_SCRIPT = `(function (op, start) {
  var TEXT_MAX = ${String(BROWSER_PAGE_TEXT_MAX)};
  var ELEMENT_MAX = ${String(BROWSER_PAGE_ELEMENTS_MAX)};
  var NAME_MAX = ${String(BROWSER_PAGE_NAME_MAX)};
  var VALUE_MAX = ${String(BROWSER_PAGE_VALUE_MAX)};
  var SELECTOR = ${JSON.stringify(SELECTOR)};
  var STATE = Symbol.for('smarteverything.page');
  var SENSITIVE_TYPES = ['password', 'file'];
  var SENSITIVE_COMPLETE = /(^|\\s)(cc-|current-password|new-password|one-time-code)/;
  var NOT_TEXT_TYPES = ['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'range', 'color', 'hidden', 'file'];
  var INPUT_ROLES = {
    checkbox: 'checkbox', radio: 'radio', submit: 'button', button: 'button', reset: 'button',
    image: 'button', range: 'slider', search: 'searchbox', file: 'file chooser', password: 'password field'
  };
  var win = window;
  var doc = document;

  function fail(message) { return { ok: false, error: message }; }
  function tag(el) { return el.tagName.toLowerCase(); }
  function typeOf(el) { return tag(el) === 'input' ? String(el.type || 'text').toLowerCase() : ''; }
  function squash(text, limit) {
    var flat = String(text == null ? '' : text).replace(/\\s+/g, ' ').trim();
    return flat.length > limit ? flat.slice(0, limit) : flat;
  }
  function tidy(text) {
    return String(text == null ? '' : text)
      .replace(/[ \\t\\r\\f\\v]+/g, ' ')
      .replace(/ ?\\n[ \\n]*/g, '\\n')
      .trim();
  }
  function shown(el) {
    if (!el.isConnected) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    var style = win.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }
  function sensitive(el) {
    var complete = String(el.getAttribute('autocomplete') || '').toLowerCase();
    return SENSITIVE_TYPES.indexOf(typeOf(el)) >= 0 || SENSITIVE_COMPLETE.test(complete);
  }
  function roleOf(el) {
    var explicit = el.getAttribute('role');
    if (explicit) return explicit;
    var name = tag(el);
    if (name === 'a') return 'link';
    if (name === 'button' || name === 'summary') return 'button';
    if (name === 'select') return 'combobox';
    if (name === 'textarea') return 'textbox';
    if (name === 'input') return INPUT_ROLES[typeOf(el)] || 'textbox';
    return el.isContentEditable ? 'textbox' : 'generic';
  }
  function labelledBy(el) {
    var ids = el.getAttribute('aria-labelledby');
    if (!ids) return '';
    return ids.split(/\\s+/).map(function (id) {
      var target = doc.getElementById(id);
      return target ? target.textContent : '';
    }).join(' ');
  }
  function labelText(el) {
    var labels = el.labels;
    if (!labels || labels.length === 0) return '';
    return Array.prototype.map.call(labels, function (label) { return label.textContent; }).join(' ');
  }
  function ownText(el) {
    var name = tag(el);
    if (name === 'input' || name === 'textarea' || name === 'select') return '';
    return el.innerText || el.textContent;
  }
  function buttonValue(el) {
    return /^(submit|button|reset)$/.test(typeOf(el)) ? el.value : '';
  }
  function nameOf(el) {
    var candidates = [
      el.getAttribute('aria-label'), labelledBy(el), labelText(el), ownText(el),
      el.getAttribute('alt'), el.getAttribute('title'), el.getAttribute('placeholder'), buttonValue(el)
    ];
    for (var index = 0; index < candidates.length; index += 1) {
      var text = squash(candidates[index], NAME_MAX);
      if (text) return text;
    }
    return '';
  }
  function valueOf(el) {
    var name = tag(el);
    if (name !== 'input' && name !== 'textarea' && name !== 'select') {
      return el.isContentEditable ? squash(el.textContent, VALUE_MAX) : null;
    }
    if (sensitive(el)) return null;
    var type = typeOf(el);
    if (type === 'checkbox' || type === 'radio') return null;
    return squash(el.value, VALUE_MAX);
  }
  function checkedOf(el) {
    var type = typeOf(el);
    if (type === 'checkbox' || type === 'radio') return Boolean(el.checked);
    var aria = el.getAttribute('aria-checked');
    return aria === null ? null : aria === 'true';
  }
  function describe(el, ref) {
    return {
      ref: ref, role: roleOf(el), name: nameOf(el), value: valueOf(el),
      checked: checkedOf(el), disabled: el.disabled === true
    };
  }
  function snapshot() {
    var nodes = Array.prototype.filter.call(doc.querySelectorAll(SELECTOR), shown);
    var chosen = nodes.slice(0, ELEMENT_MAX);
    var refs = new Map();
    var elements = chosen.map(function (el, index) {
      var ref = 'e' + (start + index);
      refs.set(ref, el);
      return describe(el, ref);
    });
    win[STATE] = { generation: start, last: start + chosen.length - 1, refs: refs };
    var text = tidy(doc.body ? doc.body.innerText : '');
    return {
      ok: true,
      reading: {
        generation: start,
        end: start + Math.max(1, chosen.length),
        title: squash(doc.title, 1024),
        text: text.slice(0, TEXT_MAX),
        textTruncated: text.length > TEXT_MAX,
        elements: elements,
        elementsTruncated: nodes.length > ELEMENT_MAX
      }
    };
  }
  function resolve(ref) {
    var state = win[STATE];
    if (!state) return fail('This page has not been read since it loaded. Read the page first, then use a ref from that reading.');
    var el = state.refs.get(ref);
    if (!el) {
      var range = state.refs.size === 0 ? '' : ', refs e' + state.generation + ' to e' + state.last;
      return fail('The ref ' + ref + ' belongs to an earlier reading. The current reading is generation ' + state.generation + range + '. Read the page again and use its refs.');
    }
    if (!el.isConnected) return fail('The element ' + ref + ' is no longer on the page. Read the page again.');
    return { el: el };
  }
  function reach(ref) {
    var found = resolve(ref);
    if (!found.el) return found;
    if (!shown(found.el)) return fail('The element ' + ref + ' is not visible.');
    if (found.el.disabled === true) return fail('The element ' + ref + ' is disabled.');
    return found;
  }
  function bring(el) {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  }
  function editable(el) {
    var name = tag(el);
    if (name === 'textarea') return true;
    if (name === 'input') return NOT_TEXT_TYPES.indexOf(typeOf(el)) < 0;
    return Boolean(el.isContentEditable);
  }
  function writable(ref) {
    var found = reach(ref);
    if (!found.el) return found;
    if (sensitive(found.el)) return fail('The element ' + ref + ' holds a password, code or file. Ask the person to fill it in.');
    if (!editable(found.el)) return fail('The element ' + ref + ' is not a text field.');
    return found;
  }
  function clickable(ref) {
    var found = reach(ref);
    if (!found.el) return found;
    if (typeOf(found.el) === 'file') return fail('File choosers are blocked. Ask the person to choose the file.');
    return found;
  }
  function locate() {
    var found = clickable(op.ref);
    if (!found.el) return found;
    bring(found.el);
    var rect = found.el.getBoundingClientRect();
    return { ok: true, x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  }
  function click() {
    var found = clickable(op.ref);
    if (!found.el) return found;
    bring(found.el);
    found.el.focus();
    found.el.click();
    return { ok: true };
  }
  function selectAll(el) {
    if (tag(el) === 'input' || tag(el) === 'textarea') {
      el.select();
      return;
    }
    var range = doc.createRange();
    range.selectNodeContents(el);
    var selection = win.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  function focus() {
    var found = writable(op.ref);
    if (!found.el) return found;
    bring(found.el);
    found.el.focus();
    selectAll(found.el);
    return { ok: true };
  }
  function assign(el, text) {
    if (!(tag(el) === 'input' || tag(el) === 'textarea')) {
      el.textContent = text;
      return;
    }
    var proto = tag(el) === 'textarea' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
  }
  function submit(el) {
    if (el.form) {
      if (el.form.requestSubmit) el.form.requestSubmit();
      else el.form.submit();
      return;
    }
    var init = { key: 'Enter', code: 'Enter', bubbles: true };
    el.dispatchEvent(new win.KeyboardEvent('keydown', init));
    el.dispatchEvent(new win.KeyboardEvent('keyup', init));
  }
  function type() {
    var found = writable(op.ref);
    if (!found.el) return found;
    bring(found.el);
    found.el.focus();
    assign(found.el, op.text);
    found.el.dispatchEvent(new win.Event('input', { bubbles: true }));
    found.el.dispatchEvent(new win.Event('change', { bubbles: true }));
    if (op.submit) submit(found.el);
    return { ok: true };
  }
  function scroll() {
    if (op.ref) {
      var found = reach(op.ref);
      if (!found.el) return found;
      bring(found.el);
    } else if (op.dx || op.dy) {
      win.scrollBy({ left: op.dx || 0, top: op.dy || 0, behavior: 'instant' });
    } else {
      return fail('Scroll needs a ref, or a nonzero dx or dy.');
    }
    return { ok: true, x: win.scrollX, y: win.scrollY };
  }
  function guard() {
    var active = doc.activeElement;
    if (active && active !== doc.body && sensitive(active)) {
      return fail('A password, code or file field has the focus. Ask the person to fill it in.');
    }
    return { ok: true };
  }
  var operations = {
    snapshot: snapshot, locate: locate, focus: focus, click: click, type: type, scroll: scroll, guard: guard
  };
  var run = operations[op.kind];
  return run ? run() : fail('Unknown page operation ' + String(op.kind));
})`;
