import { describe, expect, it } from 'vitest';
import {
  BROWSER_PAGE_ELEMENTS_MAX,
  BROWSER_PAGE_NOTICE,
  BROWSER_PAGE_PROBE_RESULT,
  BROWSER_PAGE_TEXT_MAX,
  BrowserPageDriver,
  BrowserPageError,
  type BrowserPageHost,
  type BrowserPageReading,
  type ParsedKeyCombo,
} from '../src';
import { FakeForm, FakePage } from './support/fake-page';

function reading(page: FakePage, start = 1): BrowserPageReading {
  const result = BROWSER_PAGE_PROBE_RESULT.parse(page.run({ kind: 'snapshot' }, start));
  if (!result.ok || result.reading === undefined) throw new Error('no reading');
  return result.reading;
}

function failure(page: FakePage, operation: unknown): string {
  const result = BROWSER_PAGE_PROBE_RESULT.parse(page.run(operation));
  if (result.ok) throw new Error('expected a refusal');
  return result.error;
}

describe('reading a page', () => {
  it('lists the visible interactive elements with refs counted from the start given', () => {
    const page = new FakePage();
    page.add({ tagName: 'a', attributes: { href: '/x' }, text: 'Pricing' });
    page.add({ tagName: 'button', attributes: { 'aria-label': 'Close' }, text: 'x' });
    page.add({ tagName: 'input', type: 'text', value: 'abc', labels: ['Search'] });
    page.add({ tagName: 'input', type: 'checkbox', checked: true, attributes: { title: 'Agree' } });
    page.add({ tagName: 'input', type: 'submit', value: 'Go' });
    page.add({ tagName: 'select', value: 'two', attributes: { placeholder: 'Pick' } });
    page.add({ tagName: 'textarea', value: 'long', disabled: true });
    page.add({ tagName: 'div', editable: true, text: 'Notes' });
    page.add({ tagName: 'summary', text: 'More' });
    page.add({ tagName: 'input', type: 'range' });
    const read = reading(page, 40);
    expect(read.generation).toBe(40);
    expect(read.end).toBe(50);
    expect(read.title).toBe('Example page');
    expect(read.text).toBe('Hello world');
    expect(read.elements.map((element) => [element.ref, element.role, element.name])).toEqual([
      ['e40', 'link', 'Pricing'],
      ['e41', 'button', 'Close'],
      ['e42', 'textbox', 'Search'],
      ['e43', 'checkbox', 'Agree'],
      ['e44', 'button', 'Go'],
      ['e45', 'combobox', 'Pick'],
      ['e46', 'textbox', ''],
      ['e47', 'textbox', 'Notes'],
      ['e48', 'button', 'More'],
      ['e49', 'slider', ''],
    ]);
    expect(read.elements.map((element) => element.value)).toEqual([
      null,
      null,
      'abc',
      null,
      'Go',
      'two',
      'long',
      'Notes',
      null,
      '',
    ]);
    expect(read.elements[3]?.checked).toBe(true);
    expect(read.elements[0]?.checked).toBeNull();
    expect(read.elements[6]?.disabled).toBe(true);
  });

  it('never reveals the value of a password, file or code field', () => {
    const page = new FakePage();
    page.add({ tagName: 'input', type: 'password', value: 'hunter2', labels: ['Password'] });
    page.add({ tagName: 'input', type: 'file', value: 'C:/secret.pdf' });
    page.add({
      tagName: 'input',
      type: 'text',
      value: '123456',
      attributes: { autocomplete: 'one-time-code' },
    });
    page.add({
      tagName: 'input',
      type: 'text',
      value: '4111111111111111',
      attributes: { autocomplete: 'cc-number' },
    });
    const read = reading(page);
    expect(read.elements.map((element) => element.value)).toEqual([null, null, null, null]);
    expect(read.elements.map((element) => element.role)).toEqual([
      'password field',
      'file chooser',
      'textbox',
      'textbox',
    ]);
    expect(JSON.stringify(read)).not.toContain('hunter2');
    expect(JSON.stringify(read)).not.toContain('4111');
  });

  it('skips elements that are hidden, empty or detached', () => {
    const page = new FakePage();
    page.add({ tagName: 'button', text: 'Shown' });
    page.add({ tagName: 'button', text: 'None', display: 'none' });
    page.add({ tagName: 'button', text: 'Flat', rect: { left: 0, top: 0, width: 0, height: 10 } });
    const gone = page.add({ tagName: 'button', text: 'Gone' });
    gone.isConnected = false;
    expect(reading(page).elements.map((element) => element.name)).toEqual(['Shown']);
  });

  it('names an element from the text a label points to', () => {
    const page = new FakePage();
    page.add({ tagName: 'span', attributes: { id: 'cap' }, text: 'Email address' });
    page.add({
      tagName: 'input',
      type: 'email',
      attributes: { 'aria-labelledby': 'cap missing' },
    });
    page.add({ tagName: 'div', attributes: { role: 'switch', 'aria-checked': 'true' } });
    page.add({ tagName: 'div', attributes: { tabindex: '0' } });
    const read = reading(page);
    expect(read.elements[0]?.name).toBe('Email address');
    expect(read.elements[2]).toMatchObject({ role: 'switch', checked: true });
    expect(read.elements[3]).toMatchObject({ role: 'generic', value: null });
  });

  it('keeps the text and the element list within their limits and says so', () => {
    const page = new FakePage();
    page.bodyText = `${'a'.repeat(BROWSER_PAGE_TEXT_MAX)}\n\n\n tail`;
    Array.from({ length: BROWSER_PAGE_ELEMENTS_MAX + 3 }, () =>
      page.add({ tagName: 'button', text: 'b' }),
    );
    const read = reading(page);
    expect(read.textTruncated).toBe(true);
    expect(read.text).toHaveLength(BROWSER_PAGE_TEXT_MAX);
    expect(read.elementsTruncated).toBe(true);
    expect(read.elements).toHaveLength(BROWSER_PAGE_ELEMENTS_MAX);
  });

  it('reads an empty page and counts it as one ref of progress', () => {
    const page = new FakePage();
    const read = reading(page, 5);
    expect(read.elements).toEqual([]);
    expect(read.end).toBe(6);
    expect(read.textTruncated).toBe(false);
    expect(failure(page, { kind: 'click', ref: 'e5' })).toContain('generation 5');
  });
});

describe('using refs from a reading', () => {
  it('fails a ref from an earlier reading and names the current generation', () => {
    const page = new FakePage();
    page.add({ tagName: 'button', text: 'One' });
    reading(page, 1);
    reading(page, 7);
    const message = failure(page, { kind: 'click', ref: 'e1' });
    expect(message).toContain('generation 7');
    expect(message).toContain('e7 to e7');
  });

  it('asks for a reading when the page was never read', () => {
    expect(failure(new FakePage(), { kind: 'click', ref: 'e1' })).toContain('has not been read');
  });

  it('fails an element that left the page, is hidden or is disabled', () => {
    const page = new FakePage();
    const gone = page.add({ tagName: 'button', text: 'Gone' });
    const hidden = page.add({ tagName: 'button', text: 'Hidden' });
    page.add({ tagName: 'button', text: 'Off', disabled: true });
    reading(page);
    gone.isConnected = false;
    hidden.display = 'none';
    expect(failure(page, { kind: 'click', ref: 'e1' })).toContain('no longer on the page');
    expect(failure(page, { kind: 'click', ref: 'e2' })).toContain('not visible');
    expect(failure(page, { kind: 'click', ref: 'e3' })).toContain('disabled');
  });

  it('clicks an element after bringing it into view, and locates its centre', () => {
    const page = new FakePage();
    const button = page.add({
      tagName: 'button',
      text: 'Go',
      rect: { left: 10, top: 21, width: 101, height: 40 },
    });
    reading(page);
    expect(page.run({ kind: 'locate', ref: 'e1' })).toEqual({ ok: true, x: 61, y: 41 });
    expect(page.run({ kind: 'click', ref: 'e1' })).toEqual({ ok: true });
    expect(button.clicks).toBe(1);
    expect(button.scrolled).toBe(2);
    expect(page.active).toBe(button);
  });

  it('refuses to open a file chooser', () => {
    const page = new FakePage();
    page.add({ tagName: 'input', type: 'file' });
    reading(page);
    expect(failure(page, { kind: 'click', ref: 'e1' })).toContain('File choosers are blocked');
    expect(failure(page, { kind: 'locate', ref: 'e1' })).toContain('File choosers are blocked');
  });
});

describe('typing into a page', () => {
  it('replaces the value of a text field and tells the page', () => {
    const page = new FakePage();
    const field = page.add({ tagName: 'input', type: 'text', value: 'old' });
    const area = page.add({ tagName: 'textarea', value: 'old' });
    reading(page);
    expect(page.run({ kind: 'type', ref: 'e1', text: 'new', submit: false })).toEqual({ ok: true });
    expect(page.run({ kind: 'type', ref: 'e2', text: 'newer', submit: false })).toEqual({
      ok: true,
    });
    expect(field.value).toBe('new');
    expect(area.value).toBe('newer');
    expect(field.events).toEqual(['input', 'change']);
  });

  it('submits the form of the field, or presses Enter when it has none', () => {
    const page = new FakePage();
    const inForm = page.add({ tagName: 'input', type: 'search' });
    const alone = page.add({ tagName: 'input', type: 'text' });
    const form = new FakeForm();
    inForm.form = form;
    reading(page);
    page.run({ kind: 'type', ref: 'e1', text: 'q', submit: true });
    page.run({ kind: 'type', ref: 'e2', text: 'q', submit: true });
    expect(form.submitted).toBe(1);
    expect(alone.events).toEqual(['input', 'change', 'keydown', 'keyup']);
  });

  it('submits with the older form call when requestSubmit is missing', () => {
    const page = new FakePage();
    const field = page.add({ tagName: 'input', type: 'text' });
    const submitted: string[] = [];
    field.form = Object.assign(new FakeForm(), {
      requestSubmit: undefined,
      submit: (): void => {
        submitted.push('submit');
      },
    });
    reading(page);
    page.run({ kind: 'type', ref: 'e1', text: 'q', submit: true });
    expect(submitted).toEqual(['submit']);
  });

  it('writes into an editable block', () => {
    const page = new FakePage();
    const block = page.add({ tagName: 'div', editable: true, text: 'old' });
    reading(page);
    page.run({ kind: 'type', ref: 'e1', text: 'new', submit: false });
    expect(block.textContent).toBe('new');
  });

  it('refuses a password, code, file or non-text element', () => {
    const page = new FakePage();
    const password = page.add({ tagName: 'input', type: 'password' });
    page.add({ tagName: 'input', type: 'file' });
    page.add({
      tagName: 'input',
      type: 'text',
      attributes: { autocomplete: 'current-password' },
    });
    page.add({ tagName: 'input', type: 'checkbox' });
    page.add({ tagName: 'button', text: 'Go' });
    reading(page);
    for (const ref of ['e1', 'e2', 'e3']) {
      expect(failure(page, { kind: 'type', ref, text: 'x', submit: false })).toContain(
        'Ask the person',
      );
      expect(failure(page, { kind: 'focus', ref })).toContain('Ask the person');
    }
    expect(failure(page, { kind: 'type', ref: 'e4', text: 'x', submit: false })).toContain(
      'not a text field',
    );
    expect(failure(page, { kind: 'focus', ref: 'e5' })).toContain('not a text field');
    expect(password.value).toBe('');
  });

  it('focuses and selects a text field or an editable block', () => {
    const page = new FakePage();
    const field = page.add({ tagName: 'input', type: 'text', value: 'abc' });
    const block = page.add({ tagName: 'div', editable: true });
    reading(page);
    expect(page.run({ kind: 'focus', ref: 'e1' })).toEqual({ ok: true });
    expect(field.selected).toBe(true);
    expect(page.active).toBe(field);
    page.run({ kind: 'focus', ref: 'e2' });
    expect(page.ranges).toEqual([block]);
  });

  it('refuses keys while a password field has the focus', () => {
    const page = new FakePage();
    const password = page.add({ tagName: 'input', type: 'password' });
    const text = page.add({ tagName: 'input', type: 'text' });
    expect(page.run({ kind: 'guard' })).toEqual({ ok: true });
    page.active = text;
    expect(page.run({ kind: 'guard' })).toEqual({ ok: true });
    page.active = password;
    expect(failure(page, { kind: 'guard' })).toContain('Ask the person');
  });
});

describe('scrolling a page', () => {
  it('scrolls by pixels and reports the position', () => {
    const page = new FakePage();
    expect(page.run({ kind: 'scroll', dx: 0, dy: 300 })).toEqual({ ok: true, x: 7, y: 9 });
    expect(page.run({ kind: 'scroll', dx: -20 })).toEqual({ ok: true, x: 7, y: 9 });
    expect(page.scrolls).toEqual([
      { left: 0, top: 300, behavior: 'instant' },
      { left: -20, top: 0, behavior: 'instant' },
    ]);
  });

  it('brings a ref into view, and refuses a scroll with nothing to do', () => {
    const page = new FakePage();
    const button = page.add({ tagName: 'button', text: 'Far' });
    reading(page);
    expect(page.run({ kind: 'scroll', ref: 'e1', dx: 0, dy: 0 })).toEqual({ ok: true, x: 7, y: 9 });
    expect(button.scrolled).toBe(1);
    expect(failure(page, { kind: 'scroll', dx: 0, dy: 0 })).toContain('Scroll needs');
    expect(failure(page, { kind: 'scroll', ref: 'e9', dx: 0, dy: 0 })).toContain('generation 1');
  });

  it('answers an unknown operation with a refusal', () => {
    expect(failure(new FakePage(), { kind: 'explode' })).toBe('Unknown page operation explode');
  });
});

interface Recorded {
  readonly clicks: [number, number][];
  readonly inserted: string[];
  readonly pressed: ParsedKeyCombo[];
}

function done(): Promise<void> {
  return Promise.resolve();
}

function answering(value: unknown, trusted: BrowserPageHost['trusted'] = null): BrowserPageHost {
  return { evaluate: (): Promise<unknown> => Promise.resolve(value), press: done, trusted };
}

function host(page: FakePage, trusted: boolean): { host: BrowserPageHost; seen: Recorded } {
  const seen: Recorded = { clicks: [], inserted: [], pressed: [] };
  return {
    seen,
    host: {
      evaluate: (code: string): Promise<unknown> => Promise.resolve(page.evaluate(code)),
      press: (combo: ParsedKeyCombo): Promise<void> => {
        seen.pressed.push(combo);
        return done();
      },
      trusted: trusted
        ? {
            click: (x: number, y: number): Promise<void> => {
              seen.clicks.push([x, y]);
              return done();
            },
            insertText: (text: string): Promise<void> => {
              seen.inserted.push(text);
              return done();
            },
          }
        : null,
    },
  };
}

describe('driving a page through a host', () => {
  it('reads with refs that never repeat across readings', async () => {
    const page = new FakePage();
    page.add({ tagName: 'button', text: 'A' });
    page.add({ tagName: 'button', text: 'B' });
    const driver = new BrowserPageDriver(host(page, false).host);
    const first = await driver.read();
    const second = await driver.read();
    expect(first.elements.map((element) => element.ref)).toEqual(['e1', 'e2']);
    expect(second.elements.map((element) => element.ref)).toEqual(['e3', 'e4']);
    await expect(driver.perform({ kind: 'click', ref: 'e1' })).rejects.toThrow('generation 3');
  });

  it('fails when the page answers a reading without the reading', async () => {
    const driver = new BrowserPageDriver(answering({ ok: true }));
    await expect(driver.read()).rejects.toThrow('without a reading');
  });

  it('raises the refusal a page gives', async () => {
    const driver = new BrowserPageDriver(answering({ ok: false, error: 'No.' }));
    await expect(driver.read()).rejects.toThrow(BrowserPageError);
    await expect(driver.read()).rejects.toThrow('No.');
  });

  it('clicks at the element centre when the host can click', async () => {
    const page = new FakePage();
    page.add({ tagName: 'button', text: 'Go' });
    const { host: trusted, seen } = host(page, true);
    const driver = new BrowserPageDriver(trusted);
    await driver.read();
    await driver.perform({ kind: 'click', ref: 'e1' });
    expect(seen.clicks).toEqual([[60, 40]]);
  });

  it('fails a trusted click when the page gives no position', async () => {
    const driver = new BrowserPageDriver(
      answering({ ok: true }, { click: done, insertText: done }),
    );
    await expect(driver.perform({ kind: 'click', ref: 'e1' })).rejects.toThrow('did not say where');
  });

  it('clicks in the page when the host cannot click', async () => {
    const page = new FakePage();
    const button = page.add({ tagName: 'button', text: 'Go' });
    const driver = new BrowserPageDriver(host(page, false).host);
    await driver.read();
    await driver.perform({ kind: 'click', ref: 'e1' });
    expect(button.clicks).toBe(1);
  });

  it('types through the host and presses Return when asked', async () => {
    const page = new FakePage();
    page.add({ tagName: 'input', type: 'text' });
    const { host: trusted, seen } = host(page, true);
    const driver = new BrowserPageDriver(trusted);
    await driver.read();
    await driver.perform({ kind: 'type', ref: 'e1', text: 'hello', submit: false });
    await driver.perform({ kind: 'type', ref: 'e1', text: 'again', submit: true });
    expect(seen.inserted).toEqual(['hello', 'again']);
    expect(seen.pressed.map((combo) => combo.key)).toEqual(['Enter']);
  });

  it('types in the page when the host cannot type', async () => {
    const page = new FakePage();
    const field = page.add({ tagName: 'input', type: 'text' });
    const driver = new BrowserPageDriver(host(page, false).host);
    await driver.read();
    await driver.perform({ kind: 'type', ref: 'e1', text: 'hello', submit: false });
    expect(field.value).toBe('hello');
  });

  it('presses keys, guarding text keys against a focused password field', async () => {
    const page = new FakePage();
    const password = page.add({ tagName: 'input', type: 'password' });
    const { host: trusted, seen } = host(page, true);
    const driver = new BrowserPageDriver(trusted);
    await driver.perform({ kind: 'keys', keys: 'ctrl+l' });
    await driver.perform({ kind: 'keys', keys: 'Tab' });
    await driver.perform({ kind: 'keys', keys: 'shift+a' });
    page.active = password;
    await driver.perform({ kind: 'keys', keys: 'ctrl+a' });
    await expect(driver.perform({ kind: 'keys', keys: 'x' })).rejects.toThrow('Ask the person');
    await expect(driver.perform({ kind: 'keys', keys: 'Enter' })).resolves.toBeUndefined();
    expect(seen.pressed.map((combo) => combo.key)).toEqual(['l', 'Tab', 'a', 'a', 'Enter']);
  });

  it('scrolls through the page', async () => {
    const page = new FakePage();
    const driver = new BrowserPageDriver(host(page, false).host);
    await driver.perform({ kind: 'scroll', dx: 0, dy: 50 });
    expect(page.scrolls).toEqual([{ left: 0, top: 50, behavior: 'instant' }]);
  });
});

describe('the page notice', () => {
  it('says the text is data', () => {
    expect(BROWSER_PAGE_NOTICE).toContain('never instructions');
  });
});
