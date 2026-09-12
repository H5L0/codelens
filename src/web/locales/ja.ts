// ---------------------------------------------------------------------------
// UI copy (Japanese)
// Mirrors zh.ts key by key; keys with {{count}} use i18next plurals.
// Japanese has a single plural form, so _one is kept only to match the
// structure of the other locales; i18next always picks _other here.
// ---------------------------------------------------------------------------
import type { Messages } from './zh.js';

export const ja: Messages = {
  view: {
    calendar: '変更カレンダー',
    loc: 'コード行数',
    all: 'すべて',
  },
  app: {
    titleCalendar: 'コード変更カレンダー',
    range_one: '{{min}} ~ {{max}} · コミットのある日 {{count}} 日',
    range_other: '{{min}} ~ {{max}} · コミットのある日 {{count}} 日',
  },
  calendar: {
    add: '追加行（上段）',
    del: '削除行（下段）',
    scale: 'バーの幅 = 行数の規模、平方根スケール、ピーク {{max}} 行/日',
    contextRange: '期間の集計',
    contextDay: '{{date}} の当日',
    statCommits: '{{prefix}}コミット',
    statCommitsAll: 'コミット',
    statLines: '{{prefix}}変更行',
    statLinesAll: '変更行',
    avgCommits: '1日平均 {{value}} 回',
    avgLines: '1日平均 {{value}} 行',
    headNone: '期間内にコミットはありません',
    headDay: '{{date}} · {{commits}}',
    commitsCount_one: '{{count}} 件のコミット',
    commitsCount_other: '{{count}} 件のコミット',
    commitsNone: 'コミットなし',
    empty: 'この日のコミットはありません。',
    months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    weekdays: ['月', '', '水', '', '金', '', '日'],
    loadError: '変更データを読み込めません（{{error}}）。<code>codelens</code> で起動したページから開いてください。データはサーバーと同時に生成されます。',
  },
  loc: {
    summary: '現在の絞り込み <b>{{lines}}</b><total>/{{total}}</total> 行 · <b>{{files}}</b><total>/{{allFiles}}</total> ファイル · リポジトリ全体の <b>{{percent}}</b>',
    blank: '空行を除く',
    blankTitle: '空行を除いて集計する',
    depthLabel: '表示階層',
    depthTitle: '各ディレクトリを既定で何階層まで展開するか',
    levels_one: '{{count}} 階層',
    levels_other: '{{count}} 階層',
    hint: 'ブロックをクリックするとそのディレクトリに拡大します。パンくずで戻れます',
    zoomTo: '{{path}} に拡大',
    crumbsMeta: '{{lines}} 行 · 絞り込み全体の {{percent}}%',
    statusMeta: '{{lines}} 行 · {{percent}}%',
    statusMeta_scope: '{{lines}} 行 · {{percent}}% · {{scope}}',
    files_one: '{{count}} ファイル',
    files_other: '{{count}} ファイル',
    legendOn: 'クリックでこの分類を除外',
    legendOff: 'クリックでこの分類を含める',
    legendValue_one: '{{lines}} 行 / {{count}} ファイル',
    legendValue_other: '{{lines}} 行 / {{count}} ファイル',
    empty: '現在のスイッチの組み合わせでは集計できるテキストファイルがありません。',
    loadError: '行数データを読み込めません（{{error}}）。<code>codelens</code> で起動したページから開いてください。データはサーバーと同時に生成されます。',
  },
  category: {
    test: 'テスト',
    generated: '生成コード',
    script: 'スクリプト',
    doc: 'ドキュメント',
    config: '設定',
    app: 'アプリケーションコード',
  },
  profile: {
    all: 'すべて',
    web: 'フロントエンド / バックエンド',
    frontend: 'フロントエンド',
    backend: 'バックエンド',
  },
};
