import { parseDate } from './calendar.js';

/** 千分位数字格式化。 */
export const formatNumber = (n: number): string => n.toLocaleString();

/** 同一个语言的 Intl 实例复用：网格每次重绘都会格式化几十个日期。 */
const localDates = new Map<string, Intl.DateTimeFormat>();

/** 把 ISO 日期（YYYY-MM-DD）按当前语言写成本地惯用写法；数据与属性仍然用 ISO 文本。 */
export function formatLocalDate(text: string, language: string): string {
  if (!text) {
    return '';
  }
  let formatter = localDates.get(language);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(language, { dateStyle: 'medium' });
    localDates.set(language, formatter);
  }
  return formatter.format(parseDate(text));
}
