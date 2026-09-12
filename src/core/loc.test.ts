import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { buildLoc, categorize } from './loc.js';
import { DEFAULT_CATEGORIES } from './profile.js';
import { listFiles } from './scan.js';
import type { Profile } from './types.js';

const dir = mkdtempSync(join(tmpdir(), 'codelens-loc-'));
const PROFILE: Profile = { name: 'all', label: '全部', groups: [], categories: DEFAULT_CATEGORIES, ignore: [] };

const write = (rel: string, content: string): void => {
  const abs = join(dir, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
};
const lines = (n: number, blank = 0): string =>
  `${Array.from({ length: n }, () => 'x').join('\n')}${'\n\n'.repeat(blank)}`;

write('src/app.ts', 'a\nb\n\nc\n');
write('src/empty.ts', '');
write('src/blob.txt', 'x\0y\n');
write('scripts/tool.ts', lines(1));
write('docs/manual.md', lines(2));
write('frontend/ui.tsx', lines(1));
write('.gitignore', 'generated/\n');
write('generated/skip.ts', 'x\n');
execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('categorize', () => {
  const cases: Array<[string, string]> = [
    ['src/modules/a.ts', 'app'],
    ['src/modules/a.test.ts', 'test'],
    ['src/modules/a.spec.tsx', 'test'],
    ['src/__tests__/a.ts', 'test'],
    ['tests/integration/a.ts', 'test'],
    ['scripts/gen.ts', 'script'],
    ['doc/架构.md', 'doc'],
    ['docs/x/y.md', 'doc'],
    ['README.md', 'doc'],
    ['package.json', 'config'],
    ['frontend/tsconfig.app.json', 'config'],
    ['.env.local', 'config'],
    ['.github/workflows/ci.yml', 'config'],
    ['dockerfile', 'config'],
    ['data/prisma/schema.prisma', 'config'],
    ['src/generated/prisma/index.js', 'generated'],
    ['pnpm-lock.yaml', 'generated'],
    ['src/a.ts.map', 'generated'],
    ['src/config.schema.json', 'generated'],
    ['src/vite.config.ts', 'config'],
    ['data/templates/a.template.json', 'app'],
  ];

  test.each(cases)('[categorize] %s 应该归入 %s', (path, expected) => {
    expect(categorize(path, DEFAULT_CATEGORIES)).toBe(expected);
  });

  test('[categorize] 前面的分类优先，兜底类最后生效', () => {
    expect(categorize('scripts/a.test.ts', DEFAULT_CATEGORIES)).toBe('test');
    expect(categorize('unknown/path.bin', DEFAULT_CATEGORIES)).toBe('app');
  });

  test('[categorize] 自定义分类应该覆盖默认规则', () => {
    const custom = [
      { id: 'translation', label: '翻译模块', hue: 1, sat: 1, match: ['src/modules/translation/**'] },
      { id: 'other', label: '其他', hue: 2, sat: 2 },
    ];
    expect(categorize('src/modules/translation/a.ts', custom)).toBe('translation');
    expect(categorize('src/modules/audit/a.ts', custom)).toBe('other');
  });
});

describe('buildLoc', () => {
  const { data, scan } = buildLoc(dir, PROFILE, { useGitignore: false });

  test('[buildLoc] 应该统计每个文件的物理行与非空行', () => {
    expect(data.files.find((file) => file.path === 'src/app.ts')).toEqual({
      path: 'src/app.ts',
      lines: 4,
      nonBlank: 3,
      cat: 'app',
    });
  });

  test('[buildLoc] 空文件不计入', () => {
    expect(data.files.some((file) => file.path === 'src/empty.ts')).toBe(false);
  });

  test('[buildLoc] 含空字节的文件按二进制跳过', () => {
    expect(data.files.some((file) => file.path === 'src/blob.txt')).toBe(false);
    expect(data.skipped.binary).toBe(1);
  });

  test('[buildLoc] 汇总应该等于逐文件之和', () => {
    const lines = data.files.reduce((sum, file) => sum + file.lines, 0);
    expect(data.totals.lines).toBe(lines);
    expect(data.totals.files).toBe(data.files.length);
    expect(data.totals.nonBlank).toBe(data.files.reduce((sum, file) => sum + file.nonBlank, 0));
  });

  test('[buildLoc] 关闭 gitignore 过滤时应该统计隐藏目录之外的全部文件', () => {
    expect(data.files.map((file) => file.path)).toContain('generated/skip.ts');
    expect(scan.mode).toBe('walk');
  });

  test('[buildLoc] 应该带出分类定义与配置档名', () => {
    expect(data.categories.map((cat) => cat.id)).toContain('app');
    expect(data.profile).toBe('all');
    expect(data.root).toBe(dir.split(/[\\/]/).filter(Boolean).pop());
  });
});

describe('listFiles', () => {
  test('[listFiles] 有 git 时应该用索引并遵守 .gitignore', () => {
    const { files, mode } = listFiles({ root: dir, ignore: [], useGitignore: true });
    expect(mode).toBe('git');
    expect(files).toContain('src/app.ts');
    expect(files).toContain('src/blob.txt');
    expect(files).not.toContain('generated/skip.ts');
    expect(files).toEqual([...files].sort());
  });

  test('[listFiles] 额外的忽略规则应该同时生效', () => {
    const { files } = listFiles({ root: dir, ignore: ['src/**'], useGitignore: true });
    expect(files).not.toContain('src/app.ts');
    expect(files).toContain('scripts/tool.ts');
  });

  test('[listFiles] 目录不是仓库时应该退回遍历并仍然遵守 .gitignore', () => {
    const plain = mkdtempSync(join(tmpdir(), 'codelens-plain-'));
    mkdirSync(join(plain, 'src'), { recursive: true });
    mkdirSync(join(plain, 'node_modules', 'x'), { recursive: true });
    mkdirSync(join(plain, '.hidden'), { recursive: true });
    writeFileSync(join(plain, 'src', 'a.ts'), 'x\n');
    writeFileSync(join(plain, 'src', 'a.log'), 'x\n');
    writeFileSync(join(plain, 'node_modules', 'x', 'index.js'), 'x\n');
    writeFileSync(join(plain, '.hidden', 'b.ts'), 'x\n');
    writeFileSync(join(plain, '.gitignore'), '*.log\n.hidden/\n');
    try {
      const { files, mode } = listFiles({ root: plain, ignore: [], useGitignore: true });
      expect(mode).toBe('walk');
      expect(files).toEqual(['.gitignore', 'src/a.ts']);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  test('[listFiles] 关闭 gitignore 时应该跳过隐藏目录', () => {
    const plain = mkdtempSync(join(tmpdir(), 'codelens-nodot-'));
    mkdirSync(join(plain, '.hidden'), { recursive: true });
    mkdirSync(join(plain, '.github'), { recursive: true });
    writeFileSync(join(plain, '.hidden', 'a.ts'), 'x\n');
    writeFileSync(join(plain, '.github', 'ci.yml'), 'x\n');
    writeFileSync(join(plain, 'a.ts'), 'x\n');
    try {
      const { files } = listFiles({ root: plain, ignore: [], useGitignore: false });
      expect(files).toEqual(['.github/ci.yml', 'a.ts']);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  test('[listFiles] 索引中已删除的文件应该被剔除', () => {
    const repo = mkdtempSync(join(tmpdir(), 'codelens-gone-'));
    const run = (args: string[]): void => {
      execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    };
    run(['init', '-q']);
    run(['config', 'user.email', 'test@example.com']);
    run(['config', 'user.name', 'codelens']);
    writeFileSync(join(repo, 'kept.ts'), 'x\n');
    writeFileSync(join(repo, 'gone.ts'), 'x\n');
    run(['add', '-A']);
    run(['commit', '-q', '-m', 'init']);
    rmSync(join(repo, 'gone.ts'));
    try {
      const { files } = listFiles({ root: repo, ignore: [], useGitignore: true });
      expect(files).toEqual(['kept.ts']);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
