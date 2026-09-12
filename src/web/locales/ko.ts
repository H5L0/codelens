// ---------------------------------------------------------------------------
// UI copy (Korean)
// Mirrors zh.ts key by key; keys with {{count}} use i18next plurals.
// Korean has a single plural form, so _one is kept only to match the
// structure of the other locales; i18next always picks _other here.
// ---------------------------------------------------------------------------
import type { Messages } from './zh.js';

export const ko: Messages = {
  view: {
    calendar: '변경 캘린더',
    loc: '코드 줄 수',
    all: '전체',
  },
  app: {
    titleCalendar: '코드 변경 캘린더',
    range_one: '{{min}} ~ {{max}} · 커밋이 있는 날 {{count}}일',
    range_other: '{{min}} ~ {{max}} · 커밋이 있는 날 {{count}}일',
  },
  calendar: {
    add: '추가된 줄（위）',
    del: '삭제된 줄（아래）',
    scale: '막대 너비 = 줄 수 규모, 제곱근 스케일, 최대 {{max}} 줄/일',
    contextRange: '기간 요약',
    contextDay: '{{date}} 당일',
    statCommits: '{{prefix}}커밋',
    statCommitsAll: '커밋',
    statLines: '{{prefix}}변경 줄',
    statLinesAll: '변경 줄',
    avgCommits: '일평균 {{value}}회',
    avgLines: '일평균 {{value}}줄',
    headNone: '기간 내 커밋이 없습니다',
    headDay: '{{date}} · {{commits}}',
    commitsCount_one: '커밋 {{count}}개',
    commitsCount_other: '커밋 {{count}}개',
    commitsNone: '커밋 없음',
    empty: '이 날에는 커밋이 없습니다.',
    months: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
    weekdays: ['월', '', '수', '', '금', '', '일'],
    loadError: '변경 데이터를 읽을 수 없습니다({{error}}). <code>codelens</code>로 연 페이지에서 접속해 주세요. 데이터는 서버와 함께 생성됩니다.',
  },
  loc: {
    summary: '현재 필터 <b>{{lines}}</b><total>/{{total}}</total>줄 · <b>{{files}}</b><total>/{{allFiles}}</total>개 파일 · 저장소 전체의 <b>{{percent}}</b>',
    blank: '빈 줄 제외',
    blankTitle: '빈 줄을 제외하고 집계',
    depthLabel: '표시 깊이',
    depthTitle: '각 디렉터리를 기본으로 몇 단계까지 펼칠지',
    levels_one: '{{count}}단계',
    levels_other: '{{count}}단계',
    hint: '블록을 클릭하면 해당 디렉터리로 확대됩니다. 이동 경로로 돌아갈 수 있습니다',
    zoomTo: '{{path}}(으)로 확대',
    crumbsMeta: '{{lines}}줄 · 필터 전체의 {{percent}}%',
    statusMeta: '{{lines}}줄 · {{percent}}%',
    statusMeta_scope: '{{lines}}줄 · {{percent}}% · {{scope}}',
    files_one: '파일 {{count}}개',
    files_other: '파일 {{count}}개',
    legendOn: '클릭하면 이 분류를 제외합니다',
    legendOff: '클릭하면 이 분류를 포함합니다',
    legendValue_one: '{{lines}}줄 / 파일 {{count}}개',
    legendValue_other: '{{lines}}줄 / 파일 {{count}}개',
    empty: '현재 스위치 조합에서는 집계할 텍스트 파일이 없습니다.',
    loadError: '줄 수 데이터를 읽을 수 없습니다({{error}}). <code>codelens</code>로 연 페이지에서 접속해 주세요. 데이터는 서버와 함께 생성됩니다.',
  },
  category: {
    test: '테스트',
    generated: '생성된 코드',
    script: '스크립트',
    doc: '문서',
    config: '설정',
    app: '애플리케이션 코드',
  },
  profile: {
    all: '전체',
    web: '프런트엔드 / 백엔드',
    frontend: '프런트엔드',
    backend: '백엔드',
  },
};
