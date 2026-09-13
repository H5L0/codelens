# DEV.md

面向维护者的开发说明：项目结构、设计要点、测试与发布。用户使用与配置说明见 [README.md](./README.md)。

## 目录结构

```
src/
├── cli/          命令行：参数解析、本地托管、Vite 开发服务器（输出统一英文）
├── core/         与界面无关的核心：gitignore 与 glob 匹配、文件枚举、行数统计、git 历史、配置档
└── web/          React 界面：两个视图、树形图布局、分段开关与开关组件
    ├── locales/  页面文案，四份文件键一一对应
    └── lib/      多语言、目录树、树形图布局、日历排布、颜色对比度等纯逻辑
```

- `cli` 与 `web` 都依赖 `core`：`cli` 用它产出数据，`web` 只用到它的类型；`core` 不引用 React，也不引用 CLI。
- 前端产物打包进 npm 包，包内没有运行时依赖，`react` 等只在构建期使用。
- `buildCalendar` 与 `buildLoc` 都是异步的：前者流式读 `git log`，后者以有限并发读文件，大仓库也不会把内存打满。

## 数据流

CLI 启动时一次性生成两份数据，经本地 http 服务交给页面，页面不再请求后端：改动日历是 `/api/data.json`，行数清单是 `/api/loc.json`。类型定义在 `src/core/types.ts`，两侧共用。

页面上的开关（剔除空行、显示层级、分类开关）只影响渲染，不改数据。

## 本地开发

```bash
npm install
npm run dev -- <目录>     # Vite 开发服务器 + 数据接口，前端改动即时生效
npm run build            # 构建前端到 dist/web，编译 CLI 到 dist/cli
npm test                 # vitest 单元与集成测试
npm run typecheck
```

`--dev` 之后的参数照常交给 CLI 解析，例如 `npm run dev -- ../some-repo --profile web`。开发模式下 Vite 复用 `src/cli/server.ts` 的 API 中间件，接口逻辑只写一份，行为与正式运行一致。

## 设计要点

两个视图互相独立：任一侧的数据构建失败只让该侧为空（空日历或空清单），另一侧照常打开；页面自己的数据加载失败则显示错误与重试，不渲染空看板。

### 扫描与忽略（`core/scan.ts`）

- 文件列表优先交给 `git ls-files`，忽略规则也由 git 解释（含 `.git/info/exclude` 与全局忽略）；没有 git 时退回自带遍历，语义保持一致。
- 忽略 glob 与内置的依赖、构建目录跳过编译成同一个判定，两个视图共用，统计范围天然一致；判定只按目录段做，叫 `build` 的文件不受影响。
- 扫描时顺手取回文件大小，行数统计不再重复 `stat`。
- 所有 git 调用都带 `GIT_SAFE_CONFIG`（关掉 `core.fsmonitor` 与签名校验），不会执行被扫描仓库配置里的程序。

### glob 匹配（`core/glob.ts`）

自实现的最小 glob，不引入运行时依赖：`**` 跨目录，`*` 不跨目录，`?` 匹配单个字符，`{a,b}` 择一；不含 `/` 的模式匹配任意层级，`/foo` 从基准目录起算，`foo/` 表示目录及其内容。匹配不用回溯正则，`**a` 反复出现这类病态模式不会卡住进程。

### 行数统计（`core/loc.ts`）

- 按扩展名与文件内容里的空字节双重判断跳过二进制文件，另跳过超过 3MB 的文件与空文件。
- 物理行数与剔除空白行后的非空行数都会记录，页面的「剔除空行」开关只是换一个数来显示。
- 单个文件读失败只计入 `skipped.unreadable`，不影响整次统计。

### 改动日历（`core/calendar.ts`）

- 用 `git log --numstat` 流式读取提交，按 committer date 归入所在天；在子目录里运行时加 `--relative`，路径与统计范围都和行数视图对齐。
- 提交数在统计卡与提交列表里始终同数：`git log` 里的每条提交都计入，没有文件行的合并提交与空提交也算。

### 本地托管（`cli/server.ts`）

- 用 node 内置 http 提供静态页面与两份数据接口；API 中间件同时供 Vite 开发服务器复用。
- 静态资源做站点根目录逃逸检查；数据禁用缓存，因为每次启动都会重新生成。
- 端口被占用时自动向后尝试；单个请求出错只影响它自己，不抛未捕获异常。

### 前端（`web/`）

- 两个视图常驻 DOM，切换只是改 `hidden`。
- 树形图只绘制可视区域内的方块，单次上限 6000 个；布局等纯计算放在 `web/lib/`，与 React 分离，便于单测。
- 改动日历不横向滚动：结束日取今天，超过 28 天没有提交就停在最后一次提交；一屏铺几周由容器宽度算出，放不下的周靠底部拖动条平移。
- 图例顺序与控件位置不随筛选变化，切换开关时布局不跳动。
- 文字与背景的对比度按 WCAG 达到 4.5:1，非文字控件 3:1，阈值由 `color.test.ts` 守住。
- 日历格子、拖动条与树形图方块都要能用键盘走到，焦点与按键有固定约定。

## 多语言

- 页面文案都走 i18next，四份语言文件的键一一对应：`Messages` 类型取自 `zh.ts`，缺键或多余键都编译不过，`i18n.test.ts` 再校验一遍；新增文案必须四语齐全。
- 语言跟随浏览器，`?lang=` 可覆盖，不写 localStorage 与 cookie。
- 内置分类与分组的名字随数据下发 `label`（英文，CLI 使用）与 `labelKey`（页面翻译）；用户配置里的 `label` 原样显示。
- 复数统一用 `_one` / `_other` 后缀；中日韩只会用到 `_other`，`_one` 是为了和英文结构对齐。
- 加语言：补一份 `locales/<lang>.ts`，再加进 `resources` 与 `supportedLngs`。
- README 截图按语言分目录放在 `docs/screenshots/<lang>/`，改界面后手工重截。

## 测试

`vitest`，测试与源码同级放置（`src/**/*.test.ts(x)`）。涉及 git 的用例在临时目录里现场建仓库，用例之间互不影响。

## 发布

包名 `@h5l0/codelens`，推送 `vX.Y.Z` 标签触发发布：`.github/workflows/publish.yml` 跑 `typecheck`、`test`、`build`，校验标签与 `package.json` 的版本一致后，用 `npm stage publish` 暂存到 npm，等维护者在包页面批准后生效。如果该版本已在 npm 上则跳过。

```bash
npm version patch        # 或 minor / major，会改版本并自动提交、打 vX.Y.Z 标签
git push --follow-tags origin main
```

- `package.json` 的 `name` 与 `bin` 保持一致；
- `files` 决定进 tarball 的内容（含 `docs/screenshots`），可用 `npm pack --dry-run` 预览。
