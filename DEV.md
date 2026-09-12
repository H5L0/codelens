# DEV.md

面向开发者的内部说明：项目结构、实现要点与发布流程。用户使用与配置说明见 [README.md](./README.md)。

## 目录结构

```
src/
├── cli/          命令行：参数解析、本地托管、Vite 开发服务器（输出统一英文）
├── core/         与界面无关的核心：gitignore 与 glob 匹配、文件枚举、行数统计、git 历史、配置档
└── web/          React 界面：两个视图、树形图布局、分段开关与开关组件
    ├── locales/  页面文案，四份文件键一一对应
    └── lib/      多语言、目录树、树形图布局、日历排布、颜色对比度等纯逻辑
```

依赖方向为 `core <- cli` 与 `core(类型) <- web`，`core` 不引用 React，也不引用 CLI。
前端产物打包进 npm 包，运行时没有任何第三方依赖；`react` 等只在构建期使用。

`buildCalendar` 与 `buildLoc` 是异步的：前者流式读 `git log` 的输出，后者用有限的并发读文件，CLI 入口 `await` 它们。

## 数据流

CLI 启动时一次性生成两份数据，通过本地 http 服务提供给页面，页面不做任何计算以外的后端请求：

- `/api/data.json`：改动日历，见 `CalendarData`；
- `/api/loc.json`：行数清单，见 `LocData`。

两份数据的类型定义在 `src/core/types.ts`，CLI 生成、浏览器读取，两侧共用。页面上的开关（剔除空行、显示层级、分类开关）只影响渲染，不改变数据。

## 本地开发

```bash
npm install
npm run dev -- <目录>     # Vite 开发服务器 + 数据接口，前端改动即时生效
npm run build            # 构建前端到 dist/web，编译 CLI 到 dist/cli
npm test                 # vitest 单元与集成测试
npm run typecheck
```

`npm run dev` 会把 `--dev` 之后跟随的参数交给 CLI 解析，例如：

```bash
npm run dev -- ../some-repo --profile web
```

开发模式下 Vite 复用 `src/cli/server.ts` 里的 API 中间件，因此 `/api/data.json` 与正式运行一致；`vite.config.ts` 的 `root` 指向 `src/web`，构建产物输出到 `dist/web`。

## 实现要点

### 文件枚举（`core/scan.ts`）

优先走 `git ls-files --cached --others --exclude-standard`，即完全遵守 `.gitignore`（含 `.git/info/exclude` 与全局忽略），只统计版本控制覆盖到的文件。目录不是仓库或没有 git 时退回递归遍历，用 `core/gitignore.ts` 自行实现同样的忽略语义。任何模式下都跳过内置的重目录（`node_modules`、`dist`、`build`、`coverage`、`.venv`、`__pycache__`、`target` 等），且只把 `SKIP_DIRS` 用在目录段上：叫 `build` 的文件不会被误伤。

枚举时顺手取回文件大小（`ScanResult.entries`），行数统计不再重复 `stat`；索引里残留的已删除文件在这一步剔除。`createPathFilter` 把忽略 glob 编译成「路径本身或任一父目录命中就排除」的判定，因此 `--exclude mydata`、`--exclude mydata/`、`/mydata` 都能一次排除整个目录，改动日历也用同一套判定，两个视图的分母才对得上。

所有 git 调用都带 `GIT_SAFE_CONFIG`（`-c core.fsmonitor=false -c log.showSignature=false`）：扫描别人给的、带 `.git/config` 的目录时，不会被配置里的 `core.fsmonitor` 或 `gpg.program` 带出一次外部程序执行。

### glob 匹配（`core/glob.ts`）

自实现的最小 glob，避免引入运行时依赖：独立的 `**` 段跨目录，`*` 不跨目录，`?` 匹配单个字符，`{a,b}` 择一（嵌套与多组组合展开，超过 256 种就整体按字面量处理）；不含 `/` 的模式匹配任意层级的同名项，`/foo` 从基准目录起算，`foo/` 表示目录及其内容。

匹配按路径分段做记忆化递推，段内用双指针加单星号回溯，不使用回溯正则：`**a` 反复出现这类恶意模式（可能来自被扫描仓库自带的配置或 `.gitignore`）不会让进程卡住。

### 行数统计（`core/loc.ts`）

按扩展名与内容（空字节）双重判断跳过二进制文件，跳过超过 3MB 的文件与空文件；行数为物理行数（文件末尾换行不计一行），同时记录去掉纯空白行后的非空行数。分类按配置顺序取第一个命中项，无 `match` 的分类作兜底。

读取用 8 路并发（再高也超不过 node 的文件线程池），单个文件读失败只计入 `skipped.unreadable` 并跳过，不让整次统计失败；统计整体失败时 CLI 退回 `emptyLoc`，日历视图仍可打开。

### 改动日历（`core/calendar.ts`）

用 `git log --numstat` 流式读指定时间范围内的提交（spawn + readline，历史很大时不会撞上 `maxBuffer`），按 committer date 归入所在天，与 `--since` 的过滤口径一致；再按文件的路径 glob 拆到各分组，没有命中任何分组的文件只计入 `all`。在子目录里运行时给 `git log` 加 `--relative`，路径与统计范围都和行数视图对齐。

提交数的口径是「统计卡的提交数 = 提交列表里的条数」：任一文件行都算改过（含二进制与仅改权限），合并提交、空提交没有文件行也计入 `all`。柱宽刻度用平方根，避免大改动压扁小改动。目录不是 git 仓库或读取失败时返回空日历，保证行数视图仍可打开。

### 本地托管（`cli/server.ts`）

用 node 内置 http 提供静态页面与两份数据接口，中间件形式组装，API 中间件同时供 Vite 开发服务器复用。静态资源做站点根目录逃逸检查；数据禁用缓存，因为每次启动重新生成。端口被占用时向后尝试，默认最多 10 次；`port` 为 0 时取系统分配的真实端口，否则打印出来的地址打不开。

畸形 URL（`/%`、`/%zz` 之类）解析路径时失败只该影响那一个请求，静态中间件回 400 而不是抛未捕获异常把进程带走。`--host` 是空串或含可疑字符时在参数解析阶段就报错；监听非回环地址时启动日志会提示页面对同网段可见。

### 前端（`web/`）

树形图只绘制可视区域内的方块，单次上限 6000 个（先按最小像素过滤，再计入配额，避免碎块把配额吃光）；缩放动画最多同时保留 3 个舞台，快速连点不会无限堆积。展开动画的起点是被点击方块的位置与大小（`translate` + `scale`，`transform-origin` 取左上角），每个舞台只播一次，尺寸变化或切回本视图都只重排、不重放，动画结束会清掉行内样式。目录树与布局的计算与 React 分离，放在 `web/lib/` 下便于单测。日历不横向滚动（`web/lib/calendar.ts`）：窗口结束日取今天，但仓库荒了 28 天以上就停在最后一次提交；一屏铺几周由容器宽度算出来（`fitCells` 按格子宽与间距折算），数据不够铺满时窗口就是数据本身，月份行与网格一起靠右。第一次提交之前与最后一次提交之后的格子底色更白。顶部一行左边是这段窗口对应的日期范围（两端补出来的整周收进数据范围内），右边是新增行与删除行的图例；底部是一条自绘的拖动条（`stripWindow`，提交多到一屏放不下时才出现）：一格一周，按那一周的新增行数从灰到绿上色，包裹框固定在条中间、始终框住当前显示的几周，鼠标拖格子条就能平移窗口（往右拖看更早的周），也可以聚焦后用方向键；条比数据长出来的那几格留空，两端固定一段透明度渐变，不按外面还有没有提交来变。月份标签落在窗口第一天与之后每个月的 1 号（一列只放一个标签，窗口第一天和当月 1 号撞一起时留 1 号那个）。统计卡在区间口径下标题带「累计」，悬浮或钉住某天时换成当日口径，备注里紧跟日均给出峰值（提交数取 `maxCommits`、改动行取 `maxVal`）。两个视图常驻 DOM，切换只改变 `hidden`。

方块上的文字色由 `web/lib/color.ts` 按 WCAG 相对亮度挑选（必要时微调背景亮度），保证 10.5px 的小字也达到 4.5:1；调色板里的正文、辅助文字与强调色同样按 4.5:1 挑过，增删色偏亮、白底约 4:1 且落在日历格底上仍有 3:1，滑轨等非文字控件按 3:1，`color.test.ts` 会守住这些阈值。图例顺序按未筛选前的总行数固定，切换分类开关或统计口径都不会挪位置。悬浮可放大的目录时，面包屑尾部会灰色预告它的相对路径，换一级视图后这份悬浮信息会清空。日历格子是网格里的按钮，方向键移动、点一下钉住当天；拖动条是带 `role="slider"` 的可聚焦控件，方向键挪一周、翻页键挪一屏、Home / End 到两头；树形图里可直接放大的目录可聚焦、回车放大，其余方块用 `aria-label` 读出数值。数据加载失败时两个视图都只显示错误与重试按钮，不会渲染一份 0/0 的假看板。

## 多语言

命令行输出固定英文，不做多语言。页面用 i18next：

- `i18next` + `react-i18next` 负责运行时，`i18next-browser-languagedetector` 负责探测语言，顺序是 URL 上的 `?lang=` 再 `navigator.languages`，`fallbackLng` 为英文；探测结果不写 localStorage 与 cookie，避免在用户机器上留痕。这几个包都是 `devDependencies`，构建时打进 `dist/web`，发布出去的包依旧没有运行时依赖。
- 内置 简体中文（zh）、English（en）、日本語（ja）、한국어（ko），语言标签带地区时（`ja-JP`）靠 `nonExplicitSupportedLngs` 归一化到基础语言。
- 文案在 `src/web/locales/`，`Messages` 取自 `zh.ts`，其余语言用它约束，少键或多键都会编译失败；`i18n.test.ts` 另外校验各语言去掉复数后缀后的键集合与中文一致。
- 复数用 i18next 的 `_one` / `_other` 后缀并按 `count` 取值。中日韩都只有一个复数形式，i18next 只会取 `_other`，`_one` 是为了和英文结构对齐、让类型检查能过。
- 内置分类与内置分组的 `label` 是英文（CLI 直接使用），另带 `labelKey` 随数据下发；页面用 `useLabel` 按当前语言翻译，用户配置里的 `label` 原样显示。加语言时补一份 `locales/<lang>.ts` 并把它加进 `resources` 与 `supportedLngs` 即可。
- README 的截图按语言分目录放在 `docs/screenshots/<lang>/`，中文与英文各自引用自己那份。截图是手工用 `?lang=` 打开页面截的，改界面后需要重新截。

## 测试

`vitest`，测试与源码同级放置（`src/**/*.test.ts(x)`），覆盖 glob 与 gitignore 匹配、枚举与行数统计、日历解析、配置校验（含 jsonc 解析与内置档回退）、参数解析与本地托管、目录树与树形图布局、颜色对比度、日历排布（周换算与拖动条窗口），以及页面装配。涉及 git 的用例在临时目录里现场建仓库，各用例用独立临时目录，不共享状态，`--sequence.shuffle` 下也能跑。

## 发布

发布到公共 npm，包名为 `@h5l0/codelens`（个人作用域；不带作用域的 `codelens` 会被 npm 以「与 code-lens 过于相似」拒绝；作用域包默认私有，所以 `publishConfig.access` 固定为 `public`）。`prepublishOnly` 会依次跑 `typecheck`、`test` 与 `build`，任一失败都发不出去；CI（`.github/workflows/ci.yml`）在 node 20 与 22、ubuntu 与 windows 上跑同一套命令。

```bash
npm version patch        # 或 minor / major
npm publish
```

注意：

- 包名或作用域变更后需确认 `package.json` 的 `name` 与 `bin` 一致；
- `.vscode/`、`dist/` 等不入库，`dist` 由发布前构建生成；`files` 决定进 tarball 的内容（含 `docs/screenshots`，npm 页面上的 README 截图要靠它），可用 `npm pack --dry-run` 预览；
- README 的截图是界面改动后手工重截的，改样式记得更新，见「多语言」一节。
