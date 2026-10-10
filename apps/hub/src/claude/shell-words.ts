export interface ShellScan {
  readonly commands: readonly (readonly string[])[];
  readonly unsafe: string | null;
}

const UNQUOTED_UNSAFE = new Set(['$', '`', '<', '>', '(', ')', '{', '}', '\\']);

const QUOTED_UNSAFE = new Set(['$', '`', '\\']);

const UNSAFE_REASON = 'uses redirection, substitution, grouping or background execution';

const UNCLOSED_REASON = 'has an unclosed quote';

type Quote = '"' | "'";

class Scanner {
  private readonly commands: string[][] = [];
  private words: string[] = [];
  private word = '';
  private quote: Quote | null = null;
  private unsafe: string | null = null;

  constructor(private readonly text: string) {}

  scan(): ShellScan {
    let index = 0;
    while (index < this.text.length) {
      index = this.quote === null ? this.unquoted(index) : this.quoted(index);
    }
    this.endCommand();
    return { commands: this.commands, unsafe: this.quote === null ? this.unsafe : UNCLOSED_REASON };
  }

  private endWord(): void {
    if (this.word !== '') {
      this.words.push(this.word);
      this.word = '';
    }
  }

  private endCommand(): void {
    this.endWord();
    if (this.words.length > 0) {
      this.commands.push(this.words);
      this.words = [];
    }
  }

  private quoted(index: number): number {
    const character = this.text.charAt(index);
    if (character === this.quote) {
      this.quote = null;
    } else if (this.quote === '"' && QUOTED_UNSAFE.has(character)) {
      this.unsafe = UNSAFE_REASON;
    } else {
      this.word += character;
    }
    return index + 1;
  }

  private operator(character: string, index: number): number {
    const doubled = this.text.charAt(index + 1) === character;
    if (character === '&' && !doubled) {
      this.unsafe = UNSAFE_REASON;
    }
    this.endCommand();
    return doubled ? index + 2 : index + 1;
  }

  private unquoted(index: number): number {
    const character = this.text.charAt(index);
    if (character === '"' || character === "'") {
      this.quote = character;
    } else if (character === '|' || character === '&') {
      return this.operator(character, index);
    } else if (character === '\n' || character === ';') {
      this.endCommand();
    } else if (/\s/.test(character)) {
      this.endWord();
    } else if (UNQUOTED_UNSAFE.has(character)) {
      this.unsafe = UNSAFE_REASON;
    } else {
      this.word += character;
    }
    return index + 1;
  }
}

export function scanShell(text: string): ShellScan {
  return new Scanner(text).scan();
}
