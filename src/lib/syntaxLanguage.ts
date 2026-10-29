const languages: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  javascript: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  typescript: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  py: 'python',
  python: 'python',
  rs: 'rust',
  rust: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  css: 'css',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
  sql: 'sql',
  diff: 'diff',
  patch: 'diff',
};

export function codeLanguage(hint: string): string | undefined {
  const name = hint.toLowerCase();
  return Object.hasOwn(languages, name) ? languages[name] : undefined;
}

export function filenameLanguage(filename: string): string | undefined {
  return codeLanguage(filename.split('.').at(-1) ?? '');
}
