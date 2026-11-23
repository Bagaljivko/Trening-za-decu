# Trening za decu

A bodyweight training app for a 10-year-old: a PWA served by GitHub Pages from `main`. The whole app is
`index.html` plus `sw.js` (offline), `drive.js` (Google Drive backup), `qr.js` (share QR code),
generated pictures in `images/` and launch screens in `icons/splash/`.

## Before every merge to main
Run the release checklist in `CHECKLIST.md` and only merge if every item passes:

```bash
git fetch origin main
```

```bash
node tests/checklist.js
```

If an item fails, fix it and run the checklist again. If it can't be fixed safely, don't merge; stop and
explain what's wrong. After merging, confirm the GitHub Pages deployment succeeded and report the checklist
results (one line per item).

## House rules
- Never change or lose saved data (workouts, settings, own exercises, an unfinished workout). No resets,
  no migrations without a safety copy.
- When app files change, run `python3 tools/release.py` (raises `APP_VERSION` and the offline-cache
  version and refreshes the cached file list).
- Pictures are generated: edit `tools/make_images.py`, run `python3 tools/make_images.py`. Existing pictures
  must stay byte-identical unless a drawing is meant to change. Launch screens: `python3 tools/make_splash.py`.
- The app's text is Serbian (Latin script); code and comments are English.
- New screens: check phones (320/375/430 px), a tablet, a laptop and a desktop, in light and dark.
- Add tests for new features to `tests/app.test.js`.
