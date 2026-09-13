import { describe, expect, test } from 'vitest';
import { helpText, parseArgs } from './args.js';

describe('parseArgs', () => {
  test('[parseArgs] 默认值', () => {
    const args = parseArgs([]);
    expect(args).toMatchObject({
      dir: '',
      profile: 'all',
      days: 120,
      port: 5178,
      host: '127.0.0.1',
      open: true,
      useGitignore: true,
      dev: false,
    });
  });

  test('[parseArgs] 位置参数与等号写法', () => {
    const args = parseArgs(['../repo', '--profile=web', '--days', '30', '--port=6000']);
    expect(args.dir).toBe('../repo');
    expect(args.profile).toBe('web');
    expect(args.days).toBe(30);
    expect(args.port).toBe(6000);
  });

  test('[parseArgs] 布尔开关支持取反', () => {
    expect(parseArgs(['--no-open']).open).toBe(false);
    expect(parseArgs(['--no-gitignore']).useGitignore).toBe(false);
    expect(parseArgs(['--open=false']).open).toBe(false);
  });

  test('[parseArgs] 多次 --exclude 累积', () => {
    expect(parseArgs(['--exclude', 'a/**', '--exclude=b/**']).exclude).toEqual(['a/**', 'b/**']);
  });

  test('[parseArgs] 空值应该报错而不是静默生效', () => {
    expect(() => parseArgs(['--host='])).toThrow(/--host requires a value/);
    expect(() => parseArgs(['--profile='])).toThrow(/--profile requires a value/);
    expect(() => parseArgs(['--exclude'])).toThrow(/--exclude requires a value/);
    expect(() => parseArgs(['--dump='])).toThrow(/--dump requires a value/);
  });

  test('[parseArgs] 非法数字应该报错', () => {
    expect(() => parseArgs(['--days', 'abc'])).toThrow(/--days requires a whole number/);
    expect(() => parseArgs(['--days', '1.5'])).toThrow(/--days requires a whole number/);
    expect(() => parseArgs(['--port', '-1'])).toThrow(/unknown option|-1/);
    expect(() => parseArgs(['--port', '70000'])).toThrow(/between 0 and 65535/);
  });

  test('[parseArgs] 可疑的监听地址应该被挡住', () => {
    expect(() => parseArgs(['--host', '127.0.0.1 & calc'])).toThrow(/--host must be an address or hostname/);
    expect(() => parseArgs(['--host', 'a b'])).toThrow(/--host must be an address or hostname/);
    // 正常写法都放行
    for (const host of ['127.0.0.1', 'localhost', '0.0.0.0', '::1', '[::1]', '192.168.1.20']) {
      expect(parseArgs(['--host', host]).host).toBe(host);
    }
  });

  test('[parseArgs] 未知选项、多余目录都要报错', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/unknown option: --nope/);
    expect(() => parseArgs(['a', 'b'])).toThrow(/only one directory argument/);
  });

  test('[parseArgs] --help 与 -v 走开关分支', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-v']).version).toBe(true);
  });
});

describe('helpText', () => {
  test('[helpText] 列出内置预设与所有选项', () => {
    const text = helpText();
    for (const flag of ['--profile', '--config', '--days', '--exclude', '--port', '--host', '--no-open', '--no-gitignore', '--dump', '--dev']) {
      expect(text).toContain(flag);
    }
    expect(text).toContain('all, web');
    expect(text).toContain('Usage');
    // 说明列对齐到同一列
    const rows = text.split('\n').filter((line) => line.startsWith('  --'));
    const columns = new Set(rows.map((line) => line.search(/\s{2,}\S/) + 2));
    expect(columns.size).toBe(1);
  });
});
