// ---------------------------------------------------------------------------
// 多语言
// i18next + react-i18next，语言探测用官方的浏览器探测器：
// 默认跟随浏览器语言（navigator.languages），URL 上的 ?lang=zh|en 可临时覆盖。
// 内置分类与分组的名字随数据一起下发 labelKey，用 useLabel 在这里翻译。
// ---------------------------------------------------------------------------
import i18n from 'i18next';
import type { TFunction } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { useCallback } from 'react';
import { initReactI18next, useTranslation } from 'react-i18next';
import type { Labeled } from '../../core/types.js';
import { en } from '../locales/en.js';
import { ja } from '../locales/ja.js';
import { ko } from '../locales/ko.js';
import { zh } from '../locales/zh.js';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zh },
      en: { translation: en },
      ja: { translation: ja },
      ko: { translation: ko },
    },
    supportedLngs: ['zh', 'en', 'ja', 'ko'],
    nonExplicitSupportedLngs: true,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: {
      order: ['querystring', 'navigator'],
      lookupQuerystring: 'lang',
      // 不写 localStorage / cookie：语言始终跟着浏览器，避免在用户机器上留痕
      caches: [],
    },
  });

export default i18n;

/** 内置定义用文案键翻译，用户配置的 label 原样返回。 */
export function labelOf(def: Labeled, t: TFunction): string {
  return def.labelKey ? t(def.labelKey, { defaultValue: def.label ?? def.labelKey }) : (def.label ?? '');
}

export function useLabel(): (def: Labeled) => string {
  const { t } = useTranslation();
  return useCallback((def: Labeled) => labelOf(def, t), [t]);
}
