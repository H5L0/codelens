// @vitest-environment happy-dom
// 多语言：文案键、复数形式与内置名称解析。
import { describe, expect, test } from 'vitest';
import i18n, { labelOf } from './i18n.js';
import { en } from '../locales/en.js';
import { ja } from '../locales/ja.js';
import { ko } from '../locales/ko.js';
import { zh } from '../locales/zh.js';

const LOCALES = { zh, en, ja, ko };

/** 把嵌套文案摊平成 "a.b.c" 形式的键。 */
function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? flatten(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

/** 去掉复数后缀，只比较语义上的键。 */
function base(keys: string[]): string[] {
  return [...new Set(keys.map((key) => key.replace(/_(one|other)$/, '')))].sort();
}

describe('i18n', () => {
  test('各语言的文案键都应该与中文一一对应', () => {
    for (const [name, messages] of Object.entries(LOCALES)) {
      expect(base(flatten(messages)), name).toEqual(base(flatten(zh)));
    }
  });

  test('中文文案不应该再出现复数后缀以外的英文占位', async () => {
    await i18n.changeLanguage('zh');
    expect(i18n.t('view.calendar')).toBe('改动日历');
    expect(i18n.t('calendar.headDay', { date: '2026-01-05', commits: i18n.t('calendar.commitsCount', { count: 1 }) })).toBe(
      '2026-01-05 · 1 个提交',
    );
    expect(i18n.t('loc.legendValue', { lines: '10', count: 1 })).toBe('10 行 / 1 文件');
  });

  test('中文只有一个复数形式，任何数量都走 _other', async () => {
    await i18n.changeLanguage('zh');
    expect(i18n.t('calendar.commitsCount', { count: 1 })).toBe('1 个提交');
    expect(i18n.t('calendar.commitsCount', { count: 3 })).toBe('3 个提交');
    expect(i18n.t('loc.files', { count: 1 })).toBe('1 个文件');
  });

  test('英文按数量切换单复数，语言标签带地区时归一化到支持的语言', async () => {
    await i18n.changeLanguage('en-US');
    expect(i18n.resolvedLanguage).toBe('en');
    expect(i18n.t('calendar.commitsCount', { count: 1 })).toBe('1 commit');
    expect(i18n.t('calendar.commitsCount', { count: 3 })).toBe('3 commits');
    expect(i18n.t('loc.files', { count: 1 })).toBe('1 file');
  });

  test('中文地区标签应该归一化到 zh 并生效', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(i18n.resolvedLanguage).toBe('zh');
    expect(i18n.t('view.loc')).toBe('代码行数');
  });

  test('日语与韩语带地区标签时应该归一化并生效', async () => {
    await i18n.changeLanguage('ja-JP');
    expect(i18n.resolvedLanguage).toBe('ja');
    expect(i18n.t('view.calendar')).toBe('変更カレンダー');
    expect(i18n.t('category.app')).toBe('アプリケーションコード');
    expect(i18n.t('loc.files', { count: 3 })).toBe('3 ファイル');

    await i18n.changeLanguage('ko-KR');
    expect(i18n.resolvedLanguage).toBe('ko');
    expect(i18n.t('view.calendar')).toBe('변경 캘린더');
    expect(i18n.t('category.app')).toBe('애플리케이션 코드');
    expect(i18n.t('loc.files', { count: 3 })).toBe('파일 3개');
  });

  test('未内置的语言回落到英文', async () => {
    await i18n.changeLanguage('fr-FR');
    expect(i18n.resolvedLanguage).toBe('en');
    expect(i18n.t('view.loc')).toBe('Lines of code');
  });

  test('内置定义按 labelKey 翻译，用户自定义名称原样保留', async () => {
    await i18n.changeLanguage('en');
    const t = i18n.getFixedT('en');
    expect(labelOf({ label: '应用代码', labelKey: 'category.app' }, t)).toBe('Application code');
    expect(labelOf({ label: '我的模块' }, t)).toBe('我的模块');
    expect(labelOf({ label: 'My module' }, t)).toBe('My module');
  });

  test('缺少文案键时回退到内置的英文名称', async () => {
    const t = i18n.getFixedT('en');
    expect(labelOf({ label: 'Application code', labelKey: 'category.missing' }, t)).toBe('Application code');
  });
});
