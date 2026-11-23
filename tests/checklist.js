// Release checklist (see CHECKLIST.md). Run before every merge to main:
//   git fetch origin main && node tests/checklist.js
//   node tests/checklist.js --skip-suite   skip item 3 (when tests/app.test.js already ran, e.g. in CI)
//   node tests/checklist.js --drawings-changed   allow existing pictures to change on purpose (item 9)
// Compares with origin/main (the live app). Prints PASS / FAIL per item, ends with "OK to merge" or
// "DO NOT MERGE", and exits with 1 if anything failed.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), os = require("os");
const { execSync, spawnSync } = require("child_process");
const { ROOT, serve, open, seedData, LS_KEY } = require("./lib");
const { PNG } = (() => { try { return require("pngjs"); } catch (_) { return {}; } })();

const SKIP_SUITE = process.argv.includes("--skip-suite"), DRAWINGS = process.argv.includes("--drawings-changed");
const results = [];
const item = (n, name, ok, detail = "") => { results.push({ n, ok }); console.log(`${ok === null ? "SKIP" : ok ? "PASS" : "FAIL"}  ${n}. ${name}${detail ? "  - " + detail : ""}`); };
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

(async () => {
  const srv = await serve(ROOT), NEW = srv.url;
  let OLD = null, oldSrv = null, oldDir = null;
  try {
    oldDir = fs.mkdtempSync(path.join(os.tmpdir(), "trening-za-decu-main-"));
    execSync(`git -C "${ROOT}" archive origin/main | tar -x -C "${oldDir}"`, { stdio: "pipe" });
    oldSrv = await serve(oldDir); OLD = oldSrv.url;
  } catch (e) { console.log("note: origin/main not available (run: git fetch origin main); items 4, 8 and 9 can't compare"); }
  const b = await chromium.launch();

  // 1. Loads cleanly: every tab, panel and workout screen, phone and laptop, light and dark
  { const errs = [];
    for (const [w, h, mob] of [[375, 667, true], [1366, 768, false]]) for (const cs of ["light", "dark"]) {
      const { ctx, p } = await open(b, NEW, { viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, colorScheme: cs });
      await p.evaluate(async () => {
        const wait = () => new Promise(r => setTimeout(r, 60));
        for (const t of ["danas", "vezbe", "istorija"]) { tab = t; render(false); await wait(); }
        for (const sh of [{ type: "place" }, { type: "share" }, { type: "pick", q: "" }, { type: "newex", name: "", cat: "noge", kind: "reps", place: "in", jump: "no" }, { type: "detail", id: "plank" }]) { sheet = sh; render(); await wait(); }
        sheet = null; tab = "danas"; focus = { i: 0 }; howOpen = true; render(false); await wait();
        startRest("set"); rest.end = Date.now() + 5000; render(); await wait(); rest = null; render();
        startWarm(); await wait(); warm = null; startWarm("cool"); await wait(); warm = null; render(false);
      });
      errs.push(...p.errs); await ctx.close();
    }
    item(1, "Loads cleanly (no console errors on any screen, phone and laptop, light and dark)", !errs.length, errs.slice(0, 3).join(" | ")); }

  // 2. Pictures: still when collapsed, moving only while a description is open, still everywhere else
  { const bad = [];
    const { ctx, p } = await open(b, NEW, { viewport: { width: 390, height: 844 } });
    const ids = await p.evaluate(() => EX.map(e => e.id));
    for (const id of ids) for (const openDesc of [false, true]) {
      await p.evaluate(([id, o]) => { S.plan = { place: "out", warmed: true, items: [buildItem(id)] }; focus = { i: 0 }; selSet = null; howOpen = o; rest = null; render(false); }, [id, openDesc]);
      await p.waitForFunction(() => !!document.querySelector(".fpic svg"), null, { timeout: 5000 });
      await p.waitForTimeout(80);
      const el = await p.$(".fpic"); const a = await el.screenshot(); await p.waitForTimeout(450); const c = await el.screenshot();
      const moving = !a.equals(c), anim = await p.evaluate(() => document.querySelector(".fpic [data-ill]").dataset.ill.includes("/anim/"));
      if (openDesc ? (!moving || !anim) : (moving || anim)) bad.push(`${id}${openDesc ? " (open)" : ""}`);
    }
    await p.evaluate(() => { focus = null; startWarm(); }); await p.waitForTimeout(150);
    if (await p.evaluate(() => document.querySelector(".fpic [data-ill]").dataset.ill.includes("/anim/"))) bad.push("warm-up moves");
    await p.evaluate(() => { warm = null; tab = "vezbe"; render(false); });
    if (await p.evaluate(() => document.querySelectorAll('[data-ill*="/anim/"]').length)) bad.push("lists move");
    await ctx.close();
    const rm = await open(b, NEW, { reducedMotion: "reduce" });
    await rm.p.evaluate(() => { S.plan = { place: "in", warmed: true, items: [buildItem("cucanj")] }; focus = { i: 0 }; howOpen = true; render(false); });
    if (await rm.p.evaluate(() => document.querySelector(".fpic [data-ill]").dataset.ill.includes("/anim/"))) bad.push("reduce motion still moves");
    await rm.ctx.close();
    item(2, `Pictures (${ids.length} exercises: still when collapsed, moving when open, still elsewhere, reduce motion)`, !bad.length, bad.join(", ")); }

  // 3. Existing features: the full feature suite
  if (SKIP_SUITE) item(3, "Existing features (tests/app.test.js)", null, "skipped (--skip-suite)");
  else { const r = spawnSync(process.execPath, [path.join(__dirname, "app.test.js")], { encoding: "utf8", env: process.env });
    const sum = (r.stdout.match(/App tests: .*/) || ["no summary"])[0];
    item(3, "Existing features (tests/app.test.js)", r.status === 0, sum + (r.status ? " | " + (r.stdout.match(/^FAIL.*$/gm) || []).slice(0, 3).join(" | ") : "")); }

  // 4. Saved data untouched: the same data, loaded by the live version and by this one, is stored exactly the same
  if (!OLD) item(4, "Saved data untouched", false, "origin/main not available");
  else { const seed = seedData(40), out = [];
    for (const base of [OLD, NEW]) {
      const { ctx, p } = await open(b, base, { seed });
      await p.evaluate(async () => { for (const t of ["istorija", "vezbe", "danas"]) { tab = t; render(false); await new Promise(r => setTimeout(r, 80)); } });
      await p.waitForTimeout(500);
      out.push(await p.evaluate(k => localStorage.getItem(k), LS_KEY)); await ctx.close();
    }
    const same = out[0] === out[1] && out[1] === JSON.stringify(seed);
    item(4, "Saved data untouched (history, settings, own exercises, unfinished workout: no reset, no migration)", same, same ? "" : "stored data differs"); }

  // 5. Offline and no new network calls
  { const { ctx, p } = await open(b, NEW, { sw: "allow" });
    await p.evaluate(async () => { for (const t of ["vezbe", "istorija", "danas"]) { tab = t; render(false); await new Promise(r => setTimeout(r, 80)); } focus = { i: 0 }; howOpen = true; render(false); });
    await p.waitForTimeout(2500);
    const shell = (read("sw.js").match(/const SHELL = \[([\s\S]*?)\];/) || [, ""])[1].match(/"([^"]+)"/g).map(x => x.slice(1, -1));
    const cached = await p.evaluate(async list => { const c = await caches.open((await caches.keys())[0]); const miss = []; for (const f of list) if (!(await c.match(f))) miss.push(f); return miss; }, shell);
    await ctx.setOffline(true); await p.goto(NEW + "index.html?offline=1"); await p.waitForTimeout(500);
    const offline = await p.isVisible(".nav");
    await p.evaluate(() => { S.plan = { place: "in", warmed: true, items: [buildItem("most")] }; focus = { i: 0 }; howOpen = true; render(false); }); await p.waitForTimeout(400);
    const animOffline = await p.evaluate(() => !!document.querySelector('.fpic [data-ill*="/anim/"] svg animate'));
    const ext = p.ext.filter(u => !u.startsWith(NEW));
    await ctx.close();
    item(5, "Offline, no new network calls (own files only; works and animates offline)", offline && animOffline && !cached.length && !ext.length,
      [!offline && "doesn't open offline", !animOffline && "no animation offline", cached.length && "not cached: " + cached.slice(0, 3).join(", "), ext.length && "outside requests: " + ext.slice(0, 2).join(" ")].filter(Boolean).join("; ")); }

  // 6. Layout: no sideways scrolling, main button reachable, on phones, tablets, laptop and desktop, light and dark
  { const bad = [];
    const sizes = [["phone 320", 320, 568, true], ["phone 375", 375, 667, true], ["phone 430", 430, 932, true], ["tablet 768", 768, 1024, true], ["tablet 1180", 1180, 820, true], ["laptop 1366", 1366, 768, false], ["desktop 1920", 1920, 1080, false]];
    for (const [name, w, h, touch] of sizes) for (const cs of ["light", "dark"]) {
      const { ctx, p } = await open(b, NEW, { viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, colorScheme: cs });
      const r = await p.evaluate(async () => { const out = [];
        const ov = () => document.documentElement.scrollWidth > innerWidth + 1;
        for (const t of ["danas", "vezbe", "istorija"]) { tab = t; render(false); await new Promise(r => setTimeout(r, 50)); if (ov()) out.push(t); }
        tab = "danas"; focus = { i: 0 }; howOpen = true; render(false); await new Promise(r => setTimeout(r, 80));
        const c = document.getElementById("ctaBox").getBoundingClientRect();
        if (ov()) out.push("exercise screen"); if (c.bottom > innerHeight + 1) out.push("main button off screen");
        return out; });
      if (r.length) bad.push(`${name} ${cs}: ${r.join(", ")}`); await ctx.close();
    }
    item(6, "Layout (phones 320/375/430, tablets, laptop, desktop; light and dark)", !bad.length, bad.join("; ")); }

  // 7. Performance: 450 workouts on a 4x slower CPU
  { const { ctx, p } = await open(b, NEW, { seed: Object.assign(seedData(450), { plan: null }) });
    const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const t = code => p.evaluate(async c => { const t0 = performance.now(); new Function(c)(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return Math.round(performance.now() - t0); }, code);
    await t('tab="istorija"; render(false);'); await t('tab="danas"; render(false);');
    const hist = Math.min(await t('tab="istorija"; render(false);'), await t('tab="istorija"; render(false);'));
    await p.evaluate(() => { S.plan = { place: "in", warmed: true, items: [buildItem("cucanj"), buildItem("plank")] }; tab = "danas"; focus = { i: 0 }; howOpen = false; render(false); });
    await p.waitForTimeout(300);
    const expand = Math.min(await t('howOpen=true; render();'), (await t('howOpen=false; render();'), await t('howOpen=true; render();')));
    const danas = await t('focus=null; tab="danas"; render(false);');
    await ctx.close();
    item(7, "Performance (450 workouts, 4x slower CPU)", hist < 150 && expand < 60 && danas < 100, `History ${hist} ms (<150), open description ${expand} ms (<60), Danas ${danas} ms (<100)`); }

  // 8. The update reaches phones: when app files change, cache and version numbers go up, and every cached file exists
  { const shell = (read("sw.js").match(/const SHELL = \[([\s\S]*?)\];/) || [, ""])[1].match(/"([^"]+)"/g).map(x => x.slice(1, -1));
    const missing = shell.filter(f => f !== "./" && !fs.existsSync(path.join(ROOT, f)));
    let detail = "", ok = !missing.length;
    if (missing.length) detail = "listed but missing: " + missing.join(", ");
    if (oldDir) {
      const appFiles = ["index.html", "sw.js", "drive.js", "qr.js", "manifest.webmanifest", ...shell.filter(f => f !== "./")];
      const changed = [...new Set(appFiles)].filter(f => { const a = path.join(ROOT, f), o = path.join(oldDir, f); return !fs.existsSync(o) || !fs.readFileSync(a).equals(fs.readFileSync(o)); });
      const num = (txt, re) => { const m = txt.match(re); return m ? m.slice(1).map(Number) : null; };
      const cNew = num(read("sw.js"), /trening-za-decu-v(\d+)/), cOld = num(fs.readFileSync(path.join(oldDir, "sw.js"), "utf8"), /trening-za-decu-v(\d+)/);
      const vNew = num(read("index.html"), /APP_VERSION = "(\d+)\.(\d+)"/), vOld = num(fs.readFileSync(path.join(oldDir, "index.html"), "utf8"), /APP_VERSION = "(\d+)\.(\d+)"/);
      const vUp = vNew && vOld && (vNew[0] > vOld[0] || (vNew[0] === vOld[0] && vNew[1] > vOld[1]));
      if (changed.length && !(cNew[0] > cOld[0] && vUp)) { ok = false; detail = `app files changed (${changed.length}) but cache/version not raised: run python3 tools/release.py`; }
      else detail = detail || (changed.length ? `cache v${cOld} → v${cNew}, version ${vOld.join(".")} → ${vNew.join(".")}` : "no app files changed");
    }
    item(8, "Update reaches phones (offline-cache version raised, every cached file exists)", ok, detail); }

  // 9. Existing pictures unchanged (new pictures may be added)
  if (!oldDir) item(9, "Existing pictures unchanged", false, "origin/main not available");
  else { const changed = [];
    for (const dir of ["images", "images/anim"]) for (const f of fs.readdirSync(path.join(oldDir, dir)).filter(x => x.endsWith(".svg"))) {
      const a = path.join(ROOT, dir, f), o = path.join(oldDir, dir, f);
      if (!fs.existsSync(a) || !fs.readFileSync(a).equals(fs.readFileSync(o))) changed.push(`${dir}/${f}`);
    }
    item(9, "Existing pictures unchanged (byte for byte; new ones may be added)", !changed.length || DRAWINGS,
      changed.length ? `${changed.length} changed${DRAWINGS ? " (allowed with --drawings-changed)" : ": " + changed.slice(0, 4).join(", ")}` : ""); }

  await b.close(); srv.close(); if (oldSrv) oldSrv.close();
  const failed = results.filter(r => r.ok === false).length, skipped = results.filter(r => r.ok === null).length;
  console.log(`\n${results.length - failed - skipped} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ""}: ${failed ? "DO NOT MERGE" : "OK to merge"}`);
  process.exit(failed ? 1 : 0);
})();
