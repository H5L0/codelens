# codelens

[![npm](https://img.shields.io/npm/v/@h5l0/codelens.svg)](https://www.npmjs.com/package/@h5l0/codelens)
[![CI](https://github.com/H5L0/codelens/actions/workflows/ci.yml/badge.svg)](https://github.com/H5L0/codelens/actions/workflows/ci.yml)
[![Publish](https://github.com/H5L0/codelens/actions/workflows/publish.yml/badge.svg)](https://github.com/H5L0/codelens/actions/workflows/publish.yml)

把任意 git 仓库的改动历史与代码行数，做成一个本地看板。

[English](./README.md) | 简体中文

## 快速开始

```bash
npx @h5l0/codelens                 # 统计当前目录并在浏览器打开
npx @h5l0/codelens ../my-repo      # 统计指定仓库
npx @h5l0/codelens --profile web   # 按前后端拆分改动日历
```

也可以全局安装：

```bash
npm install -g @h5l0/codelens
codelens
```

无需配置。启动时生成数据，默认不写入硬盘。

## 两个视图

### 改动日历

按周排布的改动热力图：每格是一天，显示当天新增与删除的行数。可以按分组过滤，也可以平移时间窗口看其他周。

![改动日历](docs/screenshots/zh/calendar.png)

### 代码行数

树形图：方块面积表示行数，颜色表示分类，深浅表示目录层级。点方块进入该目录，右侧开关控制统计规则与展开层级。

![代码行数](docs/screenshots/zh/loc.png)

## 命令行参数

```
codelens [目录] [选项]

--profile <名称|文件>  预设，见下节，内置 all、web
--config <文件>        配置，默认 <目录>/codelens.config.json
--days <天数>          日历时间跨度，0 表示全部历史（默认 0）
--exclude <glob>       额外忽略的路径，可重复
--port <端口>          监听端口，默认 5178，被占用时向后尝试
--host <地址>          监听地址，默认 127.0.0.1。监听其他地址时，页面对同网段可见
--no-open              不自动打开浏览器
--no-gitignore         不按 .gitignore 过滤，只跳过内置的依赖与构建目录
--dump <目录>          只写出 data.json 与 loc.json 后退出，不启动服务
--dev                  开发模式，用 Vite 托管前端源码并热更新
-h, --help             显示帮助
-v, --version          显示版本
```

## 预设（profile）

预设用于控制统计的划分方式。改动日历按**分组**（`groups`）给提交上色。行数视图按**分类**（`categories`）给文件上色。

`--profile` 后面可以写文件，也可以写预设名：

```bash
codelens --profile ./my-profile.json   # 用这个文件当预设
codelens --profile web                 # 用配置里的 web 预设
```

codelens 自带两个预设：

| 名称    | 页面上显示为   | 作用                                                             |
| ------- | -------------- | ---------------------------------------------------------------- |
| `all`   | 全部           | 默认预设，不分组，统计整个仓库。                                 |
| `web`   | 前后端         | `frontend/`、`web/`、`client/`、`ui/` 算前端。其余目录算后端。   |

### 配置

配置用于控制程序默认行为，可包含一组预设。
默认加载工作区根目录的配置文件：`codelens.config.json`，用 `--config` 可以指定别的文件。

```jsonc
{
  "profiles": [
    {
      "id": "modules",
      "label": "按模块",                          // 显示在启动日志里
      "groups": [                                 // 改动日历的分组配色，取第一个命中的
        { "id": "core", "label": "核心", "hue": 214, "sat": 58, "match": ["src/core/**"] },
        { "id": "web", "label": "界面", "hue": 152, "sat": 46, "match": ["src/web/**"] },
        { "id": "rest", "label": "其余", "hue": 32, "sat": 62, "match": ["**"] }
      ],
      "categories": [                             // 行数视图的分类配色与图例
        { "id": "core", "label": "核心代码", "hue": 214, "sat": 58, "match": ["src/core/**"] },
        { "id": "test", "label": "测试", "hue": 152, "sat": 46, "defaultOn": false, "match": ["**/*.test.ts"] },
        { "id": "app", "label": "其他代码", "hue": 220, "sat": 20 }
      ],
      "ignore": ["data/**", "**/*.snap"]          // 额外跳过的路径
    },
  ]
}
```

| 字段                                            | 作用                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `profiles[*].id`                                | 预设名，`--profile` 指定名称。同一份配置里不能重复。             |
| `profiles[*].label`                             | 启动日志里显示的预设名。不写时用各分组名拼出来。                  |
| `profiles[*].{groups/categories}[*].id`         | 标识。同一份列表里不能重复，也不能叫 `all`。                      |
| `profiles[*].{groups/categories}[*].label`      | 页面上显示的名字。你写的名字会原样显示。                          |
| `profiles[*].{groups/categories}[*].match`      | 路径 glob。文件命中哪一条，就归入那一项。分组必填，分类可以省略。 |
| `profiles[*].{groups/categories}[*].hue`、`sat` | 这一项的颜色，用 HSL 表示。默认 214 和 50。                       |
| `profiles[*].categories[*].defaultOn`           | 设为 `false` 时，这个分类在图例里默认关闭。读者可以自己打开。     |
| `profiles[*].ignore`                            | 额外跳过的路径。它会和 `--exclude` 合并。                         |

说明：

- glob 的路径相对仓库根目录。`**` 跨目录。`*` 和 `?` 只在单段里匹配。`{a,b}` 表示任选一个。
- 不含 `/` 的模式匹配任意层级的同名项。`/foo` 从仓库根算起。`foo/` 表示目录及其全部内容。
- 配置里可以写 `//`、`/* */` 注释和尾随逗号。
- 不写 `categories` 时，codelens 用内置的六类。它们是应用代码、测试、脚本、文档、配置、生成代码。其中「文档」「配置」「生成代码」默认关闭。
- 配置里没有的预设名会回退到内置预设。两边都没有就报错。

## 统计规则

- 默认按仓库的 `.gitignore` 过滤。目录不是 git 仓库时，codelens 改用等价的忽略规则。`--no-gitignore` 可以关掉这个过滤。
- codelens 始终跳过 `node_modules`、`dist`、`build`、`coverage`、`.venv`、`__pycache__`、`target` 这类依赖和构建目录。
- `--exclude` 和配置里的 `ignore` 对两个视图都生效。被排除的目录不统计行数，也不出现在改动日历里。
- 二进制文件、超过 3MB 的文件、空文件都不统计。读不出的文件会被跳过，数量写在启动日志里。行数按物理行数算，文件末尾的换行不算一行。
- 改动日历按提交时间（committer date）把提交放到当天。`--days` 用的是同一个时间。改动行数是新增行数加删除行数。
- 合并提交、空提交、只改权限的提交、只改二进制的提交都没有行数。它们仍然出现在提交列表里，也计入提交数。
- 在仓库的子目录里运行时，两个视图只统计这个子目录，路径也相对它计算。

## 已知限制

- 改动日历依赖 git：没有提交或没有 git 时日历为空，行数视图仍可用。
- 树形图一次最多绘制 6000 个方块，超出部分不显示。
- 行数不代表代码复杂度。

## 多语言

页面语言跟随浏览器，内置简体中文、English、日本語、한국어，默认英文。地址后加 `?lang={langCode}` 可临时覆盖，例如 `?lang=en`。

## 开发

开发环境、项目结构与发布流程见 [DEV.md](./DEV.md)。

## 许可

[MIT](./LICENSE)
