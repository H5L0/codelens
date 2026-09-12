# codelens

A local dashboard for any git repository: commit history and lines of code.

English | [简体中文](./README.md)

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

No configuration is required. Data is generated on the fly at startup, served to your local browser only, and never written into the analyzed repository.

## The two views

### Change calendar

A week-based heatmap: the top bar of each cell is inserted lines, the bottom bar is deleted lines, and bar width uses a square-root scale. Hover a day to see that day's summary and commits, and click it to pin the day (click again to unpin); you can also Tab into the calendar and move between days with the arrow keys. The header switch filters by group, and both the stats cards and the commit list then follow that group. The calendar shows as many weeks as the window fits and never scrolls sideways, sitting flush right with today at the far right; when a repository has been quiet for more than 28 days the right edge stops at the last commit instead. Days before the first commit and after the last one stay in the grid with a paler background. The top row shows the visible date range on the left and the inserted/deleted line legend on the right; the strip along the bottom (it appears only once the history is longer than one screen) has one cell per week, coloured grey to green by that week's inserted lines — the frame sits in the middle and you drag the strip itself to pan (drag right for older weeks), with a fixed opacity gradient at both ends. Stat cards read "Total" on the range and show both the daily average and the peak in their note.

![Change calendar](docs/screenshots/en/calendar.png)

### Lines of code

A treemap where rectangle area is proportional to line count, color is the category, and shade is the directory depth. Click a rectangle to zoom into that directory and use the breadcrumb or Esc to go back; directories you can zoom into in the current view are reachable with Tab and Enter. The switches control the counting mode and expansion depth, and the legend toggles categories.

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

- `groups[].match`, `categories[].match` and `ignore` use globs relative to the repository root: `**` crosses directories, `*` does not, `?` matches one character, `{a,b}` matches either; a pattern without `/` matches items of that name at any depth, `/foo` is anchored to the root, and `foo/` means the directory and everything inside it.
- The config file may contain `//` and `/* */` comments and trailing commas.
- `groups[].id` must not be the reserved `all` and must be unique within a profile.
- `hue` and `sat` are HSL color components for group and category colors; they default to 214 and 50.
- `categories[].defaultOn: false` means the category starts switched off in the legend (of the built-in categories, "generated code", "docs" and "config" start off).

Without `categories`, six built-in ones are used: application code, tests, scripts, docs, config, generated code.

A profile name the config file does not define falls back to the built-in profile: a repository shipping a `codelens.config.json` with only custom profiles still supports `codelens --profile all` and `--profile web`. Only a name missing from both places is an error.

## Counting rules

- `.gitignore` is honored by default; when the directory is not a git repository, equivalent ignore rules are applied instead. `--no-gitignore` turns this off.
- Dependency and build directories such as `node_modules`, `dist`, `build`, `coverage`, `.venv`, `__pycache__` and `target` are always skipped.
- `--exclude` and the config's `ignore` apply to both views: excluded directories are neither counted nor attributed in the change calendar.
- Binary files, files larger than 3MB and empty files are excluded; a file that cannot be read is skipped and reported as a count in the startup log. Line counts are physical lines (a trailing newline does not count as an extra line).
- Calendar entries are grouped by the day of the commit time (committer date), matching how `--days` filters. "Changed lines = insertions + deletions".
- Merge commits, empty commits and commits that only change file modes or binaries have no line counts, but they still appear in the commit list and count as commits.
- When you run it on a subdirectory of a repository, both views count that subdirectory only and resolve paths relative to it.

## Known limits

- The change calendar needs git: a repository without commits, or without git at all, leaves the calendar empty while the lines view still works.
- Line counts say nothing about code complexity.
- The treemap draws at most 6000 rectangles; the rest are not shown.
- The calendar is padded to whole weeks, so a window that does not start or end on a week boundary shows a few extra days without data (with a paler background).

## Languages

The page follows your browser language. Simplified Chinese, English, Japanese and Korean are built in; other languages fall back to English. Append `?lang={langCode}` to the URL to override it for this session, for example `?lang=zh` or `?lang=ko`.

## Development

See [DEV.md](./DEV.md) for the development setup, project layout and release process.

## License

[MIT](./LICENSE)
