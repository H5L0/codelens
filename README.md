# codelens

[![npm](https://img.shields.io/npm/v/@h5l0/codelens.svg)](https://www.npmjs.com/package/@h5l0/codelens)
[![CI](https://github.com/H5L0/codelens/actions/workflows/ci.yml/badge.svg)](https://github.com/H5L0/codelens/actions/workflows/ci.yml)
[![Publish](https://github.com/H5L0/codelens/actions/workflows/publish.yml/badge.svg)](https://github.com/H5L0/codelens/actions/workflows/publish.yml)

A local dashboard for a git repository: the change history and the lines of code.

English | [简体中文](./README.zh.md)

## Quick start

```bash
npx @h5l0/codelens                 # analyze the current directory and open the browser
npx @h5l0/codelens ../my-repo      # analyze another repository
npx @h5l0/codelens --profile web   # split the calendar into frontend / backend
```

Or install it globally:

```bash
npm install -g @h5l0/codelens
codelens
```

No configuration is needed. The tool collects the data at startup and serves it to the local browser only. It does not write to the analyzed repository.

## The two views

### Change calendar

A weekly heat map of the changes: each cell is one day and shows the lines added and removed. You can filter by group, or move the time window to see other weeks.

![Change calendar](docs/screenshots/en/calendar.png)

### Lines of code

A treemap: each rectangle's area is its line count, its color is the category, and its shade is the directory depth. Click a rectangle to open that directory, or use the switches to set the counting mode and the depth.

![Lines of code](docs/screenshots/en/loc.png)

## Command line

```
codelens [directory] [options]

--profile <name|file>  Profile, see below; built in: all, web
--config <file>        Config file, defaults to <directory>/codelens.config.json
--days <days>          Calendar time span, 0 means full history (default 120)
--exclude <glob>       Extra paths to ignore, repeatable
--port <port>          Listen port, default 5178, tries the next ports when busy
--host <address>       Listen address, default 127.0.0.1; other addresses expose the page to your network
--no-open              Do not open the browser automatically
--no-gitignore         Ignore .gitignore; only built-in heavy directories are skipped
--dump <dir>           Write data.json and loc.json, then exit without starting a server
--dev                  Dev mode with Vite hot reload
-h, --help             Show help
-v, --version          Show version
```

## Profiles

`--profile` sets how the tool splits the repository:

1. Point it at a JSON file: `--profile ./my-profile.json`;
2. Or use a name under `profiles` in `codelens.config.json`. Use `--config` to move that file: `--profile web`.

Two profiles are built in:

| Name | What it does |
| --- | --- |
| `all` | Default; no groups, the tool counts the whole repository together |
| `web` | `frontend/`, `web/`, `client/`, `ui/` and similar directories count as frontend, everything else as backend |

### Config file format

```jsonc
{
  "profiles": {
    "modules": {
      "label": "By module",
      // Calendar groups: a file goes to the first group whose patterns match.
      // End the list with ["**"] to get an "A / everything else" split.
      "groups": [
        { "id": "core", "label": "Core", "hue": 214, "sat": 58, "match": ["src/core/**"] },
        { "id": "web", "label": "UI", "hue": 152, "sat": 46, "match": ["src/web/**"] },
        { "id": "other", "label": "Other", "hue": 32, "sat": 62, "match": ["**"] }
      ],
      // Line-count categories: drive the legend and colors; the entry without a match is the fallback.
      "categories": [
        { "id": "core", "label": "Core code", "hue": 214, "sat": 58, "match": ["src/core/**"] },
        { "id": "test", "label": "Tests", "hue": 152, "sat": 46, "defaultOn": false, "match": ["**/*.test.ts"] },
        { "id": "app", "label": "Other code", "hue": 220, "sat": 20 }
      ],
      // Extra paths to ignore on top of .gitignore
      "ignore": ["data/**", "**/*.snap"]
    }
  }
}
```

Field notes:

- `groups[].match`, `categories[].match` and `ignore` use globs relative to the repository root: `**` crosses directories, `*` does not, `?` matches one character, and `{a,b}` matches either. A pattern without `/` matches items of that name at any depth. `/foo` is anchored to the root. `foo/` means the directory and everything inside it.
- The config file accepts `//` and `/* */` comments and trailing commas.
- `groups[].id` must not be `all`, and it must be unique in one profile.
- `hue` and `sat` are HSL color components for the group and category colors. The defaults are 214 and 50.
- `categories[].defaultOn: false` means the category is off in the legend by default. Of the built-in categories, "generated code", "docs" and "config" are off by default.

Without `categories`, the tool uses six built-in categories: application code, tests, scripts, docs, config and generated code.

A profile name that the config file does not define falls back to the built-in profile. A repository with a `codelens.config.json` that defines only custom profiles still supports `codelens --profile all` and `--profile web`. A name that is missing from both places is an error.

## Counting rules

- The tool honors `.gitignore` by default. If the directory is not a git repository, the tool applies equivalent ignore rules instead. `--no-gitignore` turns this off.
- The tool always skips dependency and build directories, such as `node_modules`, `dist`, `build`, `coverage`, `.venv`, `__pycache__` and `target`.
- `--exclude` and the config's `ignore` apply to both views. The tool does not count excluded directories, and the calendar does not show them.
- The tool skips binary files, files larger than 3MB and empty files. If the tool cannot read a file, it skips that file and reports the count in the startup log. Line counts are physical lines; the newline at the end of a file does not count as one more line.
- The calendar puts each commit in the day of its commit time (committer date). This matches the `--days` filter. "Changed lines" means insertions plus deletions.
- Merge commits, empty commits and commits that only change file modes or binaries have no line counts. They still appear in the commit list and count as commits.
- If you run the tool on a subdirectory of a repository, both views count that subdirectory only and resolve paths relative to it.

## Known limits

- The change calendar needs git. A repository without commits, or without git, leaves the calendar empty. The lines view still works.
- Line counts say nothing about code complexity.
- The treemap draws at most 6000 rectangles. The rest are not shown.
- The calendar is padded to whole weeks. A window that does not start or end on a week boundary shows a few extra days without data, with a paler background.

## Languages

The page follows the browser language. Simplified Chinese, English, Japanese and Korean are built in. Other languages fall back to English. Append `?lang={langCode}` to the URL to override the language, for example `?lang=zh` or `?lang=ko`.

## Development

See [DEV.md](./DEV.md) for the development setup, the project layout and the release process.

## License

[MIT](./LICENSE)
