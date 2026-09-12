# codelens

把任意 git 仓库的改动历史与代码行数，做成一个本地看板。

[English](./README.en.md) | 简体中文

## 快速开始

```bash
npx codelens                 # 统计当前目录并在浏览器打开
npx codelens ../my-repo      # 统计指定仓库
npx codelens --profile web   # 按前后端拆分改动日历
```

也可以全局安装后随时使用：

```bash
npm install -g codelens
codelens
```

无需任何配置即可运行。统计数据在启动时现场生成，只提供给本机浏览器，不写入被统计的仓库。

## 两个视图

### 改动日历

按周排布的热力格，每格上条为新增行、下条为删除行，条宽是行数的平方根刻度。鼠标移到某天即可查看当天的统计与提交列表，顶部开关可按分组过滤。

![改动日历](docs/screenshots/zh/calendar.png)

### 代码行数

面积树形图，方块面积正比于行数，颜色代表分类，颜色深浅代表目录层级。点击方块放大到该目录，面包屑或 Esc 返回；右侧开关可切换统计口径与展开层级，图例可切换类别是否计入。

![代码行数](docs/screenshots/zh/loc.png)

## 命令行参数

```
codelens [目录] [选项]

--profile <名称|文件>  配置档，见下一节，内置 all、web
--config <文件>        配置文件，默认 <目录>/codelens.config.json
--days <天数>          改动日历的时间跨度，0 表示全部历史（默认 120）
--exclude <glob>       额外忽略的路径，可重复
--port <端口>          监听端口，默认 5178，被占用时向后尝试
--host <地址>          监听地址，默认 127.0.0.1
--no-open              不自动打开浏览器
--no-gitignore         不按 .gitignore 过滤，只跳过内置的重目录
--dump <目录>          只写出 data.json 与 loc.json 后退出，不启动服务
-h, --help             显示帮助
-v, --version          显示版本
```

## 配置档

`--profile` 决定用什么维度切分这个仓库，两种用法：

1. 指向一个 json 文件：`--profile ./my-profile.json`；
2. 取 `codelens.config.json`（可用 `--config` 换位置）里 `profiles` 下的名字：`--profile web`。

内置两档：

| 名称 | 作用 |
| --- | --- |
| `all` | 默认档，不做任何分组，整个仓库一起统计 |
| `web` | 常见前后端目录：`frontend/`、`web/`、`client/`、`ui/` 等算前端，其余算后端 |

### 配置文件格式

```jsonc
{
  "profiles": {
    "modules": {
      "label": "按模块",
      // 改动日历的分组：命中的文件算进该组，按数组顺序取第一个命中的。
      // 最后一个用 ["**"] 兜底，就能得到「A / 其余」这种两分效果。
      "groups": [
        { "id": "core", "label": "核心", "hue": 214, "sat": 58, "match": ["src/core/**"] },
        { "id": "web", "label": "界面", "hue": 152, "sat": 46, "match": ["src/web/**"] },
        { "id": "other", "label": "其他", "hue": 32, "sat": 62, "match": ["**"] }
      ],
      // 行数视图的分类：决定图例与配色，省略 match 的那一项是兜底类。
      "categories": [
        { "id": "core", "label": "核心代码", "hue": 214, "sat": 58, "match": ["src/core/**"] },
        { "id": "test", "label": "测试", "hue": 152, "sat": 46, "defaultOn": false, "match": ["**/*.test.ts"] },
        { "id": "app", "label": "其他代码", "hue": 220, "sat": 20 }
      ],
      // 在 .gitignore 之外额外忽略的路径
      "ignore": ["data/**", "**/*.snap"]
    }
  }
}
```

字段说明：

- `groups[].match`、`categories[].match`、`ignore` 都使用仓库相对路径的 glob：`**` 跨目录，`*` 不跨目录，`?` 匹配单个字符，`{a,b}` 择一；不含 `/` 的模式匹配任意层级的同名文件，`/foo` 表示从仓库根起算。
- `groups[].id` 不能是保留的 `all`，同一档里不能重复。
- `hue`、`sat` 为 HSL 颜色分量，用于分组色与分类色，缺省分别为 214、50。
- `categories[].defaultOn` 为 `false` 表示该分类在页面图例里默认关闭（内置分类中「生成代码」「文档」「配置」默认关闭）。

不写 `categories` 时使用内置的六类：应用代码、测试、脚本、文档、配置、生成代码。

## 统计口径

- 默认完全遵守仓库的 `.gitignore`；目录不是 git 仓库时改用等价的忽略规则自行过滤。`--no-gitignore` 可关闭该过滤。
- 任何情况下都跳过 `node_modules`、`dist`、`build`、`coverage`、`.venv`、`__pycache__`、`target` 等依赖与构建目录。
- 二进制文件、超过 3MB 的文件、空文件不计入；行数为物理行数（文件末尾换行不计一行）。
- 改动日历的日期按提交时间归入所在天；「改动行数 = 新增 + 删除」。

## 已知边界

- 改动日历依赖 git，仓库没有提交或缺少 git 时日历为空，行数视图仍可用。
- 行数视图按文本文件的行数统计，无法反映代码复杂度。
- 树形图一次最多绘制 6000 个方块，超出的部分不显示。

## 多语言

页面语言跟随浏览器，目前内置简体中文、English、日本語、한국어，其余语言回落到英文。地址后加 `?lang={langCode}` 可临时覆盖，例如 `?lang=en`、`?lang=ja`。

## 开发

开发环境、项目结构与发布流程见 [DEV.md](./DEV.md)。

## 许可

[MIT](./LICENSE)
