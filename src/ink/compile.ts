import { Compiler } from 'inkjs/full';

export type IssueLevel = 'error' | 'warning' | 'todo';

export interface CompileIssue {
  level: IssueLevel;
  line: number | null;
  message: string;
}

export interface CompileResult {
  ok: boolean;
  storyJson: string | null;
  globalTags: string[];
  issues: CompileIssue[];
}

const ISSUE_RE = /^(ERROR|WARNING|TODO|RUNTIME ERROR|RUNTIME WARNING):\s*(?:'[^']*'\s*)?(?:line (\d+):\s*)?(.*)$/s;

export function parseIssue(raw: string, fallback: IssueLevel): CompileIssue {
  const m = ISSUE_RE.exec(raw.trim());
  if (!m) return { level: fallback, line: null, message: raw };
  const kind = m[1];
  const level: IssueLevel = kind.includes('ERROR') ? 'error' : kind.includes('WARNING') ? 'warning' : 'todo';
  return { level, line: m[2] ? Number(m[2]) : null, message: m[3] };
}

export function compileInk(source: string): CompileResult {
  const compiler = new Compiler(source);
  let storyJson: string | null = null;
  let globalTags: string[] = [];
  try {
    const story = compiler.Compile();
    if (story && compiler.errors.length === 0) {
      storyJson = story.ToJson() ?? null;
      globalTags = story.globalTags ?? [];
    }
  } catch (e) {
    if (compiler.errors.length === 0) {
      return { ok: false, storyJson: null, globalTags: [], issues: [{ level: 'error', line: null, message: String((e as Error).message ?? e) }] };
    }
  }
  const issues = [
    ...compiler.errors.map((e) => parseIssue(e, 'error')),
    ...compiler.warnings.map((e) => parseIssue(e, 'warning')),
    ...compiler.authorMessages.map((e) => parseIssue(e, 'todo')),
  ];
  return { ok: storyJson !== null, storyJson, globalTags, issues };
}
