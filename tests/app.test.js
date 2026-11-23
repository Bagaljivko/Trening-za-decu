// Feature tests for Trening za decu. Run: node tests/app.test.js   (needs Playwright with Chromium)
// Every part runs on its own, so one failure doesn't hide the others. Exits with 1 if anything failed.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), os = require("os");
const { ROOT, serve, open, seedData, runner, LS_KEY, day, press } = require("./lib");
const { check, section, done } = runner("App tests");

(async () => {
  const srv = await serve(ROOT), U = srv.url;
  const b = await chromium.launch();
  const part = async (name, fn) => { section(name); try { await fn(); } catch (e) { check(false, `${name}: finished without crashing`, e.message.split("\n")[0]); } };
  const plainSeed = () => Object.assign(seedData(), { plan: null });
  const allErrs = [], allExt = [];
  const track = p => { allErrs.push(p.errs); allExt.push(p.ext); return p; };

  await part("Workout rules", async () => {
    const { ctx, p } = await open(b, U); track(p);
    const bad = await p.evaluate(() => { const out = [];
      for (const place of ["in", "out"]) for (let c = 6; c <= 8; c++) { S.settings.count = c; for (let k = 0; k < 200; k++) { generate(place);
        const ex = S.plan.items.map(it => exById(it.ex)), j = ex.filter(e => e.jump).length, cats = new Set(ex.map(e => e.cat));
        if (ex.length !== c) out.push(`${place}: ${ex.length} exercises instead of ${c}`);
        if (place === "in" && (j > 1 || ex.some(e => e.place !== "in"))) out.push("inside: only quiet exercises, at most one jump");
        if (place === "out" && (j < 2 || j > 4)) out.push("outside: 2 to 4 jumps or runs");
        for (const need of ["ruke", "stomak", "ravnoteza"]) if (!cats.has(need)) out.push(`${place}: no ${need}`);
        for (const it of S.plan.items) { const e = exById(it.ex), v = it.sets[0].v; if (e.type === "sec" ? v > 60 : v > 15) out.push("over the limit: " + e.id); } } }
      return [...new Set(out)]; });
    check(!bad.length, "1,200 generated workouts follow all rules (6-8 exercises, groups, jumps, 15 reps / 60 s)", bad.join("; "));
    await ctx.close();
  });

  await part("A workout on a phone", async () => {
    const { ctx, p } = await open(b, U, { seed: plainSeed() }); track(p);
    await p.evaluate(() => { S.settings.mute = false; saveLocal(); window.__beeps = 0; const ob = beep; beep = (...a) => { window.__beeps++; return ob(...a); }; });
    await p.tap("text=Napravi trening"); await p.tap('.sheet button.place[data-g="in"]'); await p.waitForTimeout(200);
    check(/≈ \d+ min/.test(await p.textContent(".est")), "workout list shows an estimated length");
    await p.tap("text=Počni trening"); await p.waitForTimeout(250);
    check(await p.isVisible("text=Zagrevanje"), "warm-up opens before the first exercise");
    await p.tap('[data-act="warmnext"]'); check((await p.textContent(".cnt")).trim() === "2/5", "warm-up: next move");
    await p.tap("text=Preskoči zagrevanje"); await p.waitForTimeout(200);
    check(await p.isVisible(".fname"), "skipping the warm-up opens the first exercise");
    check((await p.textContent(".hint")).includes("Tapni naziv ili sliku za opis"), "phone wording: Tapni naziv ili sliku za opis");
    // tapping the picture works like tapping the name
    await p.tap(".fpic"); await p.waitForTimeout(250);
    check(await p.isVisible(".how") && await p.evaluate(() => !!document.querySelector('.fpic [data-ill*="/anim/"] svg')), "tapping the picture opens the description and starts the animation");
    await p.tap(".fpic"); await p.waitForTimeout(250);
    check(!(await p.isVisible(".how")) && await p.evaluate(() => !document.querySelector('.fpic [data-ill*="/anim/"]')), "tapping it again closes the description and stops the animation");
    // a one-finger swipe across the picture still changes exercise (and doesn't open the description)
    { const box = await (await p.$(".fpic")).boundingBox(), cdp = await ctx.newCDPSession(p), y = box.y + box.height / 2;
      const i0 = await p.evaluate(() => focus.i);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width - 20, y }] });
      for (let k = 1; k <= 10; k++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + box.width - 20 - k * 25, y }] }); await p.waitForTimeout(16); }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await p.waitForTimeout(300);
      check(await p.evaluate(i => focus.i === i + 1 && !howOpen, i0), "swiping across the picture moves to the next exercise, description stays closed");
      await p.evaluate(() => { focus.i = 0; selSet = null; render(false); }); }
    await p.tap(".fname"); await p.waitForTimeout(250);
    check(await p.isVisible(".how") && await p.evaluate(() => !!document.querySelector('.fpic [data-ill*="/anim/"]')), "tapping the name opens the description and the moving picture");
    // reps exercise: +1, complete a set, rest
    await p.evaluate(() => { S.plan.items.unshift(buildItem("cucanj")); S.plan.items.splice(1, 0, buildItem("plank")); focus = { i: 0 }; selSet = null; howOpen = false; render(false); });
    const v0 = await p.evaluate(() => +S.plan.items[0].sets[0].v);
    await p.tap('[data-act="nudge"][data-d="1"]');
    check(await p.evaluate(v => +S.plan.items[0].sets[0].v === v + 1, v0), "+1 raises the number");
    await p.tap('[data-act="complete"]'); await p.waitForTimeout(250);
    check(await p.evaluate(() => rest && rest.kind === "set" && rest.total === S.settings.restSet * 1000), "finishing a set starts the rest timer (setting: rest between sets)");
    check(!(await p.isVisible(".ralert")), "no full-screen alert while plenty of rest is left");
    await p.evaluate(() => { rest.end = Date.now() + 6000; }); await p.waitForTimeout(500);
    check(await p.isVisible(".ralert") && /^[1-6]$/.test((await p.textContent("#alertT")).trim()), "last 10 seconds: full-screen countdown");
    check((await p.textContent(".ra-next")).includes("Čučanj") && (await p.textContent(".ra-next")).includes("Serija 2"), "the alert shows what comes next (exercise, set)");
    await p.tap('.ralert [data-act="rest30"]'); await p.waitForTimeout(250);
    check(!(await p.isVisible(".ralert")), "+30 s on the alert gives more rest and closes it");
    await p.evaluate(() => { rest.end = Date.now() - 1; }); await p.waitForTimeout(400);
    check(await p.isVisible("text=Odmor je gotov!") && (await p.textContent("#alertT")).trim() === "Kreni!", "rest over: \"Kreni!\" stays on screen");
    const b0 = await p.evaluate(() => __beeps); await p.waitForTimeout(3300);
    check(await p.evaluate(b => __beeps > b, b0), "keeps beeping until tapped (every 3 s)");
    await press(p, '.ralert [data-act="alertgo"]'); await p.waitForTimeout(200);
    check(!(await p.isVisible(".ralert")) && await p.evaluate(() => !rest), "\"Kreni!\" closes the alert, back to the set");
    // skip during rest
    await p.tap('[data-act="complete"]'); await p.waitForTimeout(200);
    await p.tap('[data-act="restskip"]'); await p.waitForTimeout(150);
    check(await p.evaluate(() => !rest), "\"Preskoči\" during rest goes straight to the next set");
    // timed exercise: 3-2-1, real time on "Gotovo ranije", per-side doubled
    await p.evaluate(() => { focus = { i: 1 }; selSet = null; rest = null; render(false); });
    await p.tap('[data-act="hold"]'); await p.waitForTimeout(250);
    check(await p.isVisible("text=Spremi se!"), "timed exercise: 3-2-1 countdown first");
    await p.waitForTimeout(3300); check(await p.isVisible("#holdT"), "then the timer starts");
    await p.waitForTimeout(2100); await p.tap('[data-act="holdstop"]'); await p.waitForTimeout(150);
    const secs = await p.evaluate(() => S.plan.items[1].sets[0].v);
    check(secs >= 2 && secs <= 3, `"Gotovo ranije" saves the real time (${secs} s)`);
    await p.evaluate(() => { rest.end = Date.now() - 1; }); await p.waitForTimeout(400);
    await press(p, '.ralert [data-act="alertgo"]'); await p.waitForTimeout(200);
    check(await p.evaluate(() => !!hold && hold.start > Date.now() - 500), "\"Kreni!\" before a timed set starts its 3-2-1 right away");
    await p.evaluate(() => { hold = null; S.plan.items.unshift(buildItem("bocni-plank")); focus = { i: 0 }; selSet = null; render(false); });
    await p.tap('[data-act="hold"]'); check(await p.evaluate(() => hold.sides === 2 && hold.total === 2 * hold.side), "per-side timed exercise runs once per side");
    await p.evaluate(() => { hold = null; render(); });
    await ctx.close();
  });

  await part("Finishing: cool-down, records, celebration", async () => {
    const { ctx, p } = await open(b, U, { seed: plainSeed() }); track(p);
    await p.evaluate(() => { S.plan = { place: "in", warmed: true, items: [buildItem("cucanj"), buildItem("most")] }; S.plan.items[0].sets.forEach(x => x.v = 14);
      S.plan.items.forEach(it => it.sets.forEach(x => x.done = true)); persistPlan(); render(); });
    check(await p.isVisible("text=Istezanje (2 min)") && await p.isVisible("text=Završi bez istezanja"), "all sets done: \"Istezanje (2 min)\" and \"Završi bez istezanja\"");
    await p.tap('[data-act="cool"]'); await p.waitForTimeout(250);
    check(await p.isVisible(".grp >> text=Istezanje") && (await p.textContent(".cnt")).trim() === "1/5", "cool-down: 5 stretches in the guided player");
    check(!(await p.evaluate(() => document.querySelector('.fpic [data-ill]').dataset.ill.includes("/anim/"))), "cool-down pictures are still (no motion outside an open description)");
    await p.tap("text=Preskoči istezanje"); await p.waitForTimeout(400);
    check(await p.isVisible("text=Bravo!"), "after the stretch the celebration screen opens");
    const party = await p.textContent(".party");
    check(party.includes("Novi rekordi") && party.includes("Čučanj"), "a beaten best is listed as a new record");
    check(await p.evaluate(() => S.sessions.length === 13 && !S.plan && S.sessions.at(-1).items.length === 2), "the workout is saved in history");
    await p.tap("text=Super!"); await p.waitForTimeout(200);
    // finish without stretching
    await p.evaluate(() => { S.plan = { place: "in", warmed: true, items: [buildItem("plank")] }; S.plan.items[0].sets.forEach(x => x.done = true); persistPlan(); focus = { i: 0 }; render(false); });
    await p.tap("text=Završi bez istezanja"); await p.waitForTimeout(300);
    check(await p.isVisible("text=Bravo!") && await p.evaluate(() => S.sessions.length === 14), "\"Završi bez istezanja\" finishes straight away");
    await ctx.close();
  });

  await part("Harder versions and medals", async () => {
    const s = plainSeed(); s.sessions.push(...[5, 4].map(d => ({ id: "h" + d, date: day(d), place: "in", items: [{ ex: "sklekovi-zid", sets: [{ v: 15 }, { v: 15 }, { v: 15 }] }] })));
    const { ctx, p } = await open(b, U, { seed: s }); track(p);
    await p.evaluate(() => { S.plan = { place: "in", warmed: true, items: [buildItem("sklekovi-zid")] }; persistPlan(); focus = { i: 0 }; render(false); });
    check(await p.isVisible(".harder"), "an exercise at the limit twice suggests the harder version");
    await p.tap(".harder button"); check(await p.evaluate(() => S.plan.items[0].ex === "sklekovi-stolica"), "\"Probaj\" swaps in the harder version");
    const zid = await p.evaluate(() => { let n = 0; for (let k = 0; k < 200; k++) { generate("in"); if (S.plan.items.some(i => i.ex === "sklekovi-zid")) n++; } return n; });
    check(zid === 0, "new workouts use the harder version automatically");
    await p.evaluate(() => { S.plan = null; focus = null; tab = "istorija"; render(false); });
    check(await p.isVisible("text=Medalje") && await p.isVisible("text=Za roditelje"), "History shows medals and the parents' summary");
    await ctx.close();
  });

  await part("Undo instead of pop-ups", async () => {
    const { ctx, p } = await open(b, U); track(p);
    let dialogs = 0; p.on("dialog", d => { dialogs++; d.dismiss(); });
    await p.tap('.nav button[data-tab="istorija"]'); await p.waitForTimeout(200);
    await p.tap("details.sess >> nth=0"); await p.waitForTimeout(150);
    const n0 = await p.evaluate(() => S.sessions.length);
    await p.tap("text=Obriši ovaj trening"); await p.waitForTimeout(200);
    check(await p.evaluate(n => S.sessions.length === n - 1, n0) && await p.isVisible("#undoBar"), "deleting a workout happens at once, with a \"Poništi\" bar");
    await p.tap("#undoBar [data-undo]"); await p.waitForTimeout(200);
    check(await p.evaluate(n => S.sessions.length === n && !S.deleted.length, n0), "\"Poništi\" brings it back");
    await p.tap("details.sess >> nth=0"); await p.tap("text=Obriši ovaj trening"); await p.waitForTimeout(7400);
    check(await p.evaluate(n => S.sessions.length === n - 1 && S.deleted.length === 1 && !document.getElementById("undoBar"), n0), "after 7 s the deletion is final (remembered so other devices drop it too)");
    await p.tap('.nav button[data-tab="danas"]'); await p.waitForTimeout(150);
    await p.tap("text=Odbaci"); check(await p.evaluate(() => !S.plan), "\"Odbaci\" discards today's workout");
    await p.tap("#undoBar [data-undo]"); await p.waitForTimeout(150);
    check(await p.evaluate(() => S.plan && S.plan.items[0].sets[0].done), "... and Undo restores it with its ticked set");
    await p.tap('[data-act="regen"]'); await p.waitForTimeout(150);
    check(await p.isVisible("#undoBar"), "reshuffling after ticking a set offers Undo");
    await p.tap("#undoBar [data-undo]"); await p.waitForTimeout(150);
    check(await p.evaluate(() => S.plan.items[0].ex === "cucanj" && S.plan.items[0].sets[0].done), "Undo restores the previous workout");
    await p.evaluate(() => { focus = { i: 1 }; render(false); });
    await p.tap('[data-act="removefocus"]'); await p.waitForTimeout(150);
    check(await p.evaluate(() => S.plan.items.length === 2), "removing an exercise from today happens at once");
    await p.tap("#undoBar [data-undo]"); await p.waitForTimeout(150);
    check(await p.evaluate(() => S.plan.items.length === 3 && S.plan.items[1].ex === "plank"), "... and Undo puts it back");
    await p.evaluate(() => { focus = null; tab = "vezbe"; render(false); });
    await p.tap('.row[data-id="c1"]'); await p.tap("text=Obriši vežbu"); await p.waitForTimeout(150);
    check(await p.evaluate(() => S.custom[0].deleted === true), "deleting an own exercise happens at once");
    await p.tap("#undoBar [data-undo]"); await p.waitForTimeout(150);
    check(await p.evaluate(() => !S.custom[0].deleted), "... and Undo restores it");
    check(dialogs === 0, "no browser pop-up dialogs anywhere");
    await ctx.close();
  });

  await part("Long history", async () => {
    const s = seedData(450); s.plan = null;
    const { ctx, p } = await open(b, U, { seed: s, hash: "#istorija" }); track(p);
    check(await p.evaluate(() => document.querySelectorAll("details.sess").length === 40), "History shows the latest 40 workouts");
    check(await p.isVisible("text=Prikaži starije (410)"), "\"Prikaži starije\" for the rest");
    await p.tap("text=Prikaži starije (410)"); await p.waitForTimeout(200);
    check(await p.evaluate(() => document.querySelectorAll("details.sess").length === 140), "... which shows 100 more");
    check(await p.evaluate(() => !document.querySelector("details.sess ul")), "a workout's exercise lines are built only when it is opened");
    await p.tap("details.sess >> nth=0"); await p.waitForTimeout(150);
    check(await p.evaluate(() => document.querySelector("details.sess ul li") !== null), "opening a workout shows its exercises");
    check(await p.evaluate(() => sessionTitle(S.sessions.at(-1)) === "Trening 450" && sessionTitle(S.sessions[0]) === "Trening 1"), "workouts are numbered by date");
    await ctx.close();
  });

  await part("Settings, sharing and backup file", async () => {
    const { ctx, p } = await open(b, U, { hash: "#istorija" }); track(p);
    await p.tap('.chip[data-k="restSet"][data-g="60"]'); check(await p.evaluate(() => S.settings.restSet === 60), "rest setting chips work");
    const ver = await p.evaluate(() => APP_VERSION);
    check(await p.isVisible(`text=Aplikacija, verzija ${ver}`), `version ${ver} shown`);
    await p.tap('[data-act="shareapp"]'); await p.waitForTimeout(200);
    check(await p.isVisible(".qr-box svg") && (await p.textContent(".qr-url")).startsWith(U), "\"Podeli\" shows a QR code and the app link");
    await p.tap('.sheet-h [data-act="close"]');
    const [dl] = await Promise.all([p.waitForEvent("download"), p.tap("text=Sačuvaj rezervnu kopiju")]);
    const file = path.join(os.tmpdir(), "trening-kopija-test.json"); await dl.saveAs(file);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    check(data.app === "trening-za-decu" && data.sessions.length === 12 && data.custom.length === 1 && data.plan, "backup file has workouts, own exercises, settings and the unfinished workout");
    await ctx.close();
    const e = await open(b, U, { seed: { settings: { restoreAsked: true, installSeen: true } }, hash: "#istorija" }); track(e.p);
    await e.p.setInputFiles("#restore", file); await e.p.waitForTimeout(400);
    check(await e.p.evaluate(() => S.sessions.length === 12 && S.custom.length === 1), "\"Vrati iz kopije\" restores it on an empty app");
    await e.ctx.close();
  });

  await part("Google Drive backup (fake Google)", async () => {
    const store = {};
    const ph = await open(b, U, { seed: false, google: store }); track(ph.p);
    check(await ph.p.isVisible("text=Već si koristio aplikaciju? Vrati sve sa Google Drive-a"), "empty app: offers to restore from Google Drive");
    await ph.p.tap('[data-act="drvrestoreno"]');
    await ph.p.tap('.nav button[data-tab="istorija"]'); await ph.p.tap("text=Poveži Google Drive"); await ph.p.waitForTimeout(900);
    check(await ph.p.isVisible("text=roditelj@example.com"), "connects to Google Drive from settings");
    await ph.p.evaluate(() => { for (const ex of ["cucanj", "plank"]) { S.plan = { place: "in", warmed: true, cooled: true, items: [buildItem(ex)] }; S.plan.items[0].sets.forEach(x => x.done = true); finish(); party = null; }
      S.settings.restSet = 45; S.settings.count = 8; S.custom.push({ id: "c7", name: "Kolut", cat: "noge", type: "reps", amount: 10, place: "in", jump: false, desc: "", updated: Date.now() });
      S.plan = { place: "out", warmed: true, items: [buildItem("sprint")] }; S.plan.items[0].sets[0].done = true; persistPlan(); persistSettings(); render(); });
    await ph.p.waitForTimeout(5500);
    const d = JSON.parse(store.content || "{}");
    check(d.sessions?.length === 2 && d.custom?.length === 1 && d.settings?.restSet === 45 && d.plan?.items?.[0]?.ex === "sprint", "automatic backup has everything (workouts, own exercise, settings, unfinished workout)");
    await ph.p.evaluate(async () => { localStorage.clear(); });
    await ph.p.reload(); await ph.p.waitForTimeout(500);
    check(await ph.p.isVisible("text=Već si koristio aplikaciju? Vrati sve sa Google Drive-a"), "after clearing data: offers to restore");
    await ph.p.tap('[data-act="drvrestore"]'); await ph.p.waitForTimeout(1200);
    check(await ph.p.evaluate(() => S.sessions.length === 2 && S.custom.length === 1 && S.settings.restSet === 45 && S.settings.count === 8 && S.plan?.items[0].ex === "sprint"), "one tap restores everything");
    const tb = await open(b, U, { seed: Object.assign(plainSeed(), { sessions: [], custom: [] }), google: store, hash: "#istorija" }); track(tb.p);
    await tb.p.evaluate(() => { S.plan = { place: "in", warmed: true, cooled: true, items: [buildItem("most")] }; S.plan.items[0].sets.forEach(x => x.done = true); finish(); party = null; S.settings.restSet = 30; saveLocal(); tab = "istorija"; render(false); });
    await tb.p.tap("text=Poveži Google Drive"); await tb.p.waitForTimeout(1200);
    check(await tb.p.evaluate(() => S.sessions.length === 3 && S.settings.restSet === 30), "a second device with its own workouts merges, keeps its own settings");
    // delete on the tablet (with the undo window), then the phone drops it too
    await tb.p.evaluate(() => { const id = S.sessions.find(s => s.items[0].ex === "most").id; tab = "istorija"; render(false); openSess.add(id); render(false); });
    await tb.p.tap("text=Obriši ovaj trening"); await tb.p.waitForTimeout(7300 + 4800);
    await ph.p.tap('.nav button[data-tab="istorija"]'); await ph.p.tap("text=Sinhronizuj sad"); await ph.p.waitForTimeout(900);
    check(await ph.p.evaluate(() => S.sessions.length === 2 && JSON.parse(localStorage.getItem("trening-za-decu-v1")).sessions.length === 2), "a deleted workout stays deleted on the other device");
    await ph.p.tap('[data-act="drvoff"]'); await ph.p.waitForTimeout(150);
    check(await ph.p.isVisible(".sheet >> text=Prekinuti vezu sa Google Drive-om?"), "disconnecting asks in an app-style panel");
    await ph.p.tap('[data-act="confirmyes"]'); await ph.p.waitForTimeout(200);
    check(await ph.p.isVisible("text=Poveži Google Drive"), "... and disconnects");
    await ph.ctx.close(); await tb.ctx.close();
  });

  await part("Native app feel", async () => {
    const { ctx, p } = await open(b, U); track(p);
    const r = await p.evaluate(() => {
      const row = document.querySelector(".row") || document.body;
      const cm = new MouseEvent("contextmenu", { cancelable: true, bubbles: true }); row.dispatchEvent(cm);
      const t = (id, x) => new Touch({ identifier: id, target: row, clientX: x, clientY: 300 });
      const two = new TouchEvent("touchmove", { touches: [t(1, 100), t(2, 200)], cancelable: true, bubbles: true }); row.dispatchEvent(two);
      const one = new TouchEvent("touchmove", { touches: [t(1, 100)], cancelable: true, bubbles: true }); row.dispatchEvent(one);
      const g = new Event("gesturestart", { cancelable: true }); document.dispatchEvent(g);
      const w = new WheelEvent("wheel", { ctrlKey: true, deltaY: -50, cancelable: true, bubbles: true }); document.body.dispatchEvent(w);
      return { cm: cm.defaultPrevented, two: two.defaultPrevented, one: one.defaultPrevented, g: g.defaultPrevented, w: w.defaultPrevented,
        sel: getComputedStyle(document.querySelector("h1")).userSelect, os: getComputedStyle(document.documentElement).overscrollBehaviorY, ta: getComputedStyle(document.body).touchAction }; });
    check(r.cm && r.sel === "none", "no long-press menus, text not selectable");
    check(r.two && !r.one && r.g && r.w && r.ta === "pan-x pan-y", "no zooming (two fingers, pinch, trackpad); one-finger scrolling untouched");
    check(r.os === "none", "no pull-to-refresh or bounce");
    await p.tap("text=Promeni mesto"); await p.waitForTimeout(150); await p.goBack(); await p.waitForTimeout(250);
    check(!(await p.isVisible(".sheet")) && p.url().startsWith(U), "back button closes a panel, stays in the app");
    await p.tap("text=Nastavi trening"); await p.waitForTimeout(250); await p.goBack(); await p.waitForTimeout(250);
    check(await p.isVisible("text=Nastavi trening"), "back button leaves the exercise screen");
    await ctx.close();
  });

  await part("Computers: keyboard, mouse, laptop layout", async () => {
    const { ctx, p } = await open(b, U, { viewport: { width: 1366, height: 768 }, isMobile: false, hasTouch: false, seed: plainSeed() }); track(p);
    check(await p.isVisible(".wide-only .place"), "laptop: \"Unutra / Napolju\" shown right on the home screen");
    await p.click('.wide-only .place[data-g="out"]'); await p.waitForTimeout(200);
    check(await p.evaluate(() => document.querySelector(".col-b").getBoundingClientRect().left > document.querySelector(".col-a").getBoundingClientRect().right - 1), "laptop: two columns");
    await p.evaluate(() => { S.plan.warmed = true; persistPlan(); }); await p.click("text=Počni trening"); await p.waitForTimeout(200);
    check((await p.textContent(".hint")).includes("Klikni naziv ili sliku"), "mouse wording: Klikni naziv ili sliku za opis");
    await p.click(".fpic"); await p.waitForTimeout(200);
    check(await p.evaluate(() => howOpen) && await p.isVisible(".how"), "clicking the picture opens the description");
    await p.focus(".fpic"); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
    check(await p.evaluate(() => !howOpen), "Enter on the picture closes it again (keyboard)");
    await p.keyboard.press("ArrowRight"); await p.waitForTimeout(100); check(await p.evaluate(() => focus.i === 1), "→ moves to the next exercise");
    await p.keyboard.press("Escape"); await p.waitForTimeout(150); check(await p.evaluate(() => !focus), "Esc leaves the exercise screen");
    await ctx.close();
  });

  await part("Offline and weak signal", async () => {
    const { ctx, p } = await open(b, U, { sw: "allow" }); track(p);
    await p.waitForTimeout(2500);
    check(await p.evaluate(async () => !!(await navigator.serviceWorker.ready).active), "offline copy installed");
    await ctx.setOffline(true); await p.goto(U + "index.html?offline=1"); await p.waitForTimeout(500);
    check(await p.isVisible(".nav"), "works with no internet");
    await ctx.setOffline(false);
    await ctx.route(/\/index\.html\?slow=1$/, async r => { await new Promise(x => setTimeout(x, 10000)); r.continue().catch(() => {}); });
    const t0 = Date.now(); await p.goto(U + "index.html?slow=1", { timeout: 20000 }); const dt = (Date.now() - t0) / 1000;
    check(dt < 5 && await p.isVisible(".nav"), `weak signal: opens from the saved copy in ${dt.toFixed(1)} s (page took 10 s)`);
    await ctx.close();
  });

  section("Overall");
  check(!allErrs.flat().length, "no console errors or page errors", allErrs.flat().join(" | "));
  const outside = allExt.flat().filter(u => !u.includes("googleapis.com") && !u.includes("accounts.google.com"));
  check(!outside.length, "no requests to other sites (Google only in the Drive test)", outside.join(" "));
  await b.close(); srv.close();
  process.exit(done() ? 1 : 0);
})();
