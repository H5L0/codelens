# codelens

A local dashboard for any git repository: commit history and lines of code.

English | [简体中文](./README.md)

## Quick start

```bash
npx codelens                 # analyze the current directory and open the browser
npx codelens ../my-repo      # analyze another repository
npx codelens --profile web   # split the calendar into frontend / backend
```

Or install it globally:

```bash
npm install -g codelens
codelens
```

No configuration is required. Data is generated on the fly at startup, served to your local browser only, and never written into the analyzed repository.

## The two views

### Change calendar

A week-based heatmap: the top bar of each cell is inserted lines, the bottom bar is deleted lines, and bar width uses a square-root scale. Hover a day to see that day's summary and commits; the header switch filters by group.

![Change calendar](docs/screenshots/en/calendar.png)

### Lines of code

A treemap where rectangle area is proportional to line count, color is the category, and shade is the directory depth. Click a rectangle to zoom into that directory and use the breadcrumb or Esc to go back; the switches control the counting mode and expansion depth, and the legend toggles categories.

![Lines of code](docs/screenshots/en/loc.png)

## Command line

```
codelens [directory] [options]

--profile <name|file>  Profile, see below; built in: all, web
--config <file>        Config file, defaults to <directory>/codelens.config.json
--days <days>          Calendar time span, 0 means full history (default 120)
--exclude <glob>       Extra paths to ignore, repeatable
--port <port>          Listen port, default 5178, tries the next ports when busy
--host <address>       Listen address, default 127.0.0.1
--no-open              Do not open the browser automatically
--no-gitignore         Ignore .gitignore; only built-in heavy directories are skipped
--dump <dir>           Write data.json and loc.json, then exit without starting a server
-h, --help             Show help
-v, --version          Show version
```

## Profiles

`--profile` decides how the repository is split. Two ways to use it:

1. Point it at a JSON file: `--profile ./my-profile.json`;
2. Or use a name under `profiles` in `codelens.config.json` (relocate it with `--config`): `--profile web`.

Two profiles are built in:

| Name | What it does |
| --- | --- |
| `all` | Default; no grouping, the whole repository is counted together |
| `web` | Common frontend/backend layout: `frontend/`, `web/`, `client/`, `ui/` and friends count as frontend, everything else as backend |

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

- `groups[].match`, `categories[].match` and `ignore` use globs relative to the repository root: `**` crosses directories, `*` does not, `?` matches one character, `{a,b}` matches either; a pattern without `/` matches files of that name at any depth, while `/foo` is anchored to the root.
- `groups[].id` must not be the reserved `all` and must be unique within a profile.
- `hue` and `sat` are HSL color components for group and category colors; they default to 214 and 50.
- `categories[].defaultOn: false` means the category starts switched off in the legend (of the built-in categories, "generated code", "docs" and "config" start off).

Without `categories`, six built-in ones are used: application code, tests, scripts, docs, config, generated code.

## Counting rules

- `.gitignore` is honored by default; when the directory is not a git repository, equivalent ignore rules are applied instead. `--no-gitignore` turns this off.
- Dependency and build directories such as `node_modules`, `dist`, `build`, `coverage`, `.venv`, `__pycache__` and `target` are always skipped.
- Binary files, files larger than 3MB and empty files are excluded; line counts are physical lines (a trailing newline does not count as an extra line).
- Calendar entries are grouped by the day of the commit time; "changed lines = insertions + deletions".

## Known limits

- The change calendar needs git: a repository without commits, or without git at all, leaves the calendar empty while the lines view still works.
- Line counts say nothing about code complexity.
- The treemap draws at most 6000 rectangles; the rest are not shown.

## Languages

The page follows your browser language. Simplified Chinese, English, Japanese and Korean are built in; other languages fall back to English. Append `?lang={langCode}` to the URL to override it for this session, for example `?lang=zh` or `?lang=ko`.

## Development

See [DEV.md](./DEV.md) for the development setup, project layout and release process.

## License

[MIT](./LICENSE)
