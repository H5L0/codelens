// ---------------------------------------------------------------------------
// 页面文案（简体中文）
// 与 en.ts 结构一一对应，改这里时记得同步补英文。
// 复数键与英文保持同样的 _one/_other 结构；中文只有一个复数形式，
// i18next 实际只会取 _other，_one 是为结构对齐而保留的。
// ---------------------------------------------------------------------------

export const zh = {
  view: {
    calendar: '改动日历',
    loc: '代码行数',
    all: '全部',
  },
  app: {
    titleCalendar: '代码改动日历',
    range_one: '{{min}} ~ {{max}} · {{count}} 天有提交',
    range_other: '{{min}} ~ {{max}} · {{count}} 天有提交',
  },
  calendar: {
    add: '新增行（上条）',
    del: '删除行（下条）',
    scale: '条宽 = 行数量级，平方根刻度，峰值 {{max}} 行/天',
    contextRange: '区间汇总',
    contextDay: '{{date}} 当日',
    statCommits: '{{prefix}}提交',
    statCommitsAll: '提交',
    statLines: '{{prefix}}改动行',
    statLinesAll: '改动行',
    avgCommits: '日均 {{value}} 次',
    avgLines: '日均 {{value}} 行',
    headNone: '区间内没有提交',
    headDay: '{{date}} · {{commits}}',
    commitsCount_one: '{{count}} 个提交',
    commitsCount_other: '{{count}} 个提交',
    commitsNone: '无提交',
    empty: '当日没有提交记录。',
    months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    weekdays: ['一', '', '三', '', '五', '', '日'],
    loadError: '无法读取改动数据（{{error}}）。请通过 <code>codelens</code> 启动页面后访问，数据由它随服务一起生成。',
  },
  loc: {
    summary: '当前筛选 <b>{{lines}}</b><total>/{{total}}</total> 行 · <b>{{files}}</b><total>/{{allFiles}}</total> 个文件 · 覆盖全仓库 <b>{{percent}}</b>',
    blank: '剔除空行',
    blankTitle: '按非空行统计，忽略空白行',
    depthLabel: '显示层级',
    depthTitle: '每个目录默认展开到第几层',
    levels_one: '{{count}} 层',
    levels_other: '{{count}} 层',
    hint: '点击方块放大到该目录并铺满画面，面包屑可返回',
    zoomTo: '放大到 {{path}}',
    crumbsMeta: '{{lines}} 行 · 占筛选总量 {{percent}}%',
    statusMeta: '{{lines}} 行 · 占 {{percent}}%',
    statusMeta_scope: '{{lines}} 行 · 占 {{percent}}% · {{scope}}',
    files_one: '{{count}} 个文件',
    files_other: '{{count}} 个文件',
    legendOn: '点击排除该类别',
    legendOff: '点击纳入该类别',
    legendValue_one: '{{lines}} 行 / {{count}} 文件',
    legendValue_other: '{{lines}} 行 / {{count}} 文件',
    empty: '当前开关组合下没有可统计的文本文件。',
    loadError: '无法读取行数数据（{{error}}）。请通过 <code>codelens</code> 启动页面后访问，数据由它随服务一起生成。',
  },
  category: {
    test: '测试',
    generated: '生成代码',
    script: '脚本',
    doc: '文档',
    config: '配置',
    app: '应用代码',
  },
  profile: {
    all: '全部',
    web: '前后端',
    frontend: '前端',
    backend: '后端',
  },
};

export type Messages = typeof zh;
