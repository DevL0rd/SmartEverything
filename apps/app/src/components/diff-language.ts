const EXTENSIONS: Readonly<Record<string, string>> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  html: 'markup',
  htm: 'markup',
  css: 'css',
  md: 'markdown',
  mdx: 'markdown',
  py: 'python',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  yaml: 'yaml',
  yml: 'yaml',
};
const BASENAMES: Readonly<Record<string, string>> = {
  '.bashrc': 'bash',
  '.zshrc': 'bash',
  '.bash_profile': 'bash',
};
export function diffLanguage(path: string, firstLine: string): string | null {
  const name = path.split(/[\\/]/).at(-1)?.toLowerCase() ?? '';
  const known = BASENAMES[name] ?? EXTENSIONS[name.split('.').at(-1) ?? ''];
  if (known !== undefined) return known;
  if (/^#!.*\bpython(?:3)?\b/.test(firstLine)) return 'python';
  if (/^#!.*\b(?:bash|sh|zsh)\b/.test(firstLine)) return 'bash';
  if (/^#!.*\bnode\b/.test(firstLine)) return 'javascript';
  return null;
}
