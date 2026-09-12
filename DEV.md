# DEV.md

面向开发者的内部说明：项目结构、实现要点与发布流程。用户使用与配置说明见 [README.md](./README.md)。

## 目录结构

```
src/
├── cli/          命令行：参数解析、本地托管、Vite 开发服务器
├── core/         与界面无关的核心：gitignore 与 glob 匹配、文件枚举、行数统计、git 历史、配置档
└── web/          React 界面：两个视图、树形图布局、分段开关与开关组件
```

依赖方向为 `core <- cli` 与 `core(类型) <- web`，`core` 不引用 React，也不引用 CLI。
前端产物打包进 npm 包，运行时没有任何第三方依赖；`react` 等只在构建期使用。

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

优先走 `git ls-files --cached --others --exclude-standard`，即完全遵守 `.gitignore`（含 `.git/info/exclude` 与全局忽略），只统计版本控制覆盖到的文件。目录不是仓库或没有 git 时退回递归遍历，用 `core/gitignore.ts` 自行实现同样的忽略语义。任何模式下都跳过内置的重目录（`node_modules`、`dist`、`build`、`coverage`、`.venv`、`__pycache__`、`target` 等）。

### glob 匹配（`core/glob.ts`）

自实现的最小 glob，避免引入运行时依赖：`**` 跨目录，`*` 不跨目录，`?` 匹配单个字符，`{a,b}` 择一；不含 `/` 的模式匹配任意层级的同名文件，`/foo` 从仓库根起算。

### 行数统计（`core/loc.ts`）

按扩展名与内容（空字节）双重判断跳过二进制文件，跳过超过 3MB 的文件与空文件；行数为物理行数（文件末尾换行不计一行），同时记录去掉纯空白行后的非空行数。分类按配置顺序取第一个命中项，无 `match` 的分类作兜底。

### 改动日历（`core/calendar.ts`）

用 `git log --numstat` 取指定时间范围内的提交，按提交时间归入所在天，再按文件的路径 glob 拆到各分组；没有命中任何分组的文件只计入 `all`。柱宽刻度用平方根，避免大改动压扁小改动。目录不是 git 仓库或读取失败时返回空日历，保证行数视图仍可打开。

### 本地托管（`cli/server.ts`）

用 node 内置 http 提供静态页面与两份数据接口，中间件形式组装，API 中间件同时供 Vite 开发服务器复用。静态资源做站点根目录逃逸检查；数据禁用缓存，因为每次启动重新生成。端口被占用时向后尝试，默认最多 10 次。

### 前端（`web/`）

树形图只绘制可视区域内的方块，单次上限 6000 个；目录树与布局的计算与 React 分离，放在 `web/lib/` 下便于单测。两个视图常驻 DOM，切换只改变 `hidden`。

## 测试

`vitest`，测试与源码同级放置（`src/**/*.test.ts(x)`），覆盖 glob 与 gitignore 匹配、枚举与行数统计、日历解析、配置校验、目录树与树形图布局，以及页面装配。涉及 git 的用例在临时目录里现场建仓库。

## 发布

发布到公共 npm，包名为 `codelens`（不带作用域），`prepublishOnly` 会自动执行构建。

```bash
npm version patch        # 或 minor / major
npm publish
```

注意：

- 包名或作用域变更后需确认 `package.json` 的 `name` 与 `bin` 一致；
- `.vscode/`、`dist/` 等不入库，`dist` 由发布前构建生成；`files` 决定进 tarball 的内容，可用 `npm pack --dry-run` 预览；
- 发布前跑一遍 `npm test` 与 `npm run typecheck`。
