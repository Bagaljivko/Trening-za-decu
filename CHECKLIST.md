# Release checklist

Every change goes through this before it is merged into `main` (which is what GitHub Pages serves to the
phones, tablets and computers). If any item fails, fix it and run the whole checklist again. If something
can't be fixed safely, don't merge: stop and explain what's wrong.

Run it with one command (needs Playwright with Chromium, and an up-to-date `origin/main` to compare with):

```bash
git fetch origin main
```

```bash
node tests/checklist.js
```

It prints PASS / FAIL for each item and ends with "OK to merge" or "DO NOT MERGE".
GitHub runs it on every push and pull request too (`.github/workflows/tests.yml`).

| # | Item | What "pass" means |
|---|------|-------------------|
| 1 | **Loads cleanly** | No console errors on any tab, panel, the exercise screen, rest alert, warm-up or cool-down; phone and laptop; light and dark. |
| 2 | **Pictures** | Every exercise picture is still when its description is collapsed, moves while it is open, and is still everywhere else (warm-up, cool-down, lists). "Reduce motion" keeps everything still. |
| 3 | **Existing features** | The feature suite (`tests/app.test.js`) passes: workout rules, a full workout with rest alert and timers, cool-down, records, harder versions, Undo, long history, settings and sharing, backup file, Google Drive backup and restore (fake Google), native feel, keyboard and laptop layout, offline and weak signal. |
| 4 | **Saved data untouched** | The same saved data loaded by the live version and by the new one is stored exactly the same: no reset, no migration, no lost workouts. |
| 5 | **Offline, no new network calls** | The app only loads its own files, every listed file is in the offline cache, and it opens and animates with no internet. |
| 6 | **Layout** | No sideways scrolling and the main button on screen: phones 320/375/430 px, tablets, laptop and desktop, light and dark. |
| 7 | **Performance** | With 450 workouts on a 4x slower CPU: History under 150 ms, opening a description under 60 ms, Danas under 100 ms. |
| 8 | **Update reaches phones** | When app files change, the offline-cache version (`trening-za-decu-vNN` in `sw.js`) and `APP_VERSION` are raised (`python3 tools/release.py`), and every cached file exists. |
| 9 | **Existing pictures unchanged** | Pictures in `images/` are byte-identical to `main`; new ones may be added. Run with `--drawings-changed` only when a drawing is meant to change. |

After merging: check that the "pages build and deployment" run on GitHub succeeded, then report the
checklist results (one line per item).

Things the automated checklist can't judge, so look at them on screenshots before merging: new screens or
drawings look right, Serbian text fits, nothing looks off in light or dark mode.
