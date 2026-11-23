// Shared helpers for tests/app.test.js and tests/checklist.js.
const http = require("http"), fs = require("fs"), path = require("path");

const ROOT = path.join(__dirname, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".txt": "text/plain" };

// A tiny static web server for a folder (the app, or the live version from origin/main).
function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
      const f = path.join(dir, p === "/" ? "index.html" : p);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-cache" });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, "127.0.0.1", () => { srv.url = `http://127.0.0.1:${srv.address().port}/`; res(srv); });
  });
}

const LS_KEY = "trening-za-decu-v1";
const day = n => new Date(Date.now() - n * 864e5).toISOString();

// A realistic child's data: history, own exercise, settings, an unfinished workout.
function seedData(n = 12) {
  const ex = ["cucanj", "sklekovi-stolica", "plank", "most", "avion", "medvedje-puzanje", "bicikl"];
  return {
    sessions: Array.from({ length: n }, (_, k) => ({ id: "s" + k, date: day(n * 2 - k * 2), place: k % 3 ? "in" : "out", min: 25 + (k % 7),
      items: ex.slice(0, 4 + (k % 3)).map((e, i) => ({ ex: e, sets: [{ v: e === "plank" || e === "avion" ? 30 : 10 + (k % 4) }, { v: e === "plank" || e === "avion" ? 30 : 10 }, { v: 10 }] })) })),
    deleted: [],
    plan: { place: "in", warmed: true, started: day(0), items: [
      { ex: "cucanj", sets: [{ v: 12, done: true }, { v: 12, done: false }, { v: 12, done: false }] },
      { ex: "plank", sets: [{ v: 30, done: false }, { v: 30, done: false }, { v: 30, done: false }] },
      { ex: "c1", sets: [{ v: 10, done: false }, { v: 10, done: false }, { v: 10, done: false }] }] },
    settings: { count: 7, mute: true, restSet: 45, restEx: 30, backupAt: Date.now(), backupN: n, installSeen: true, restoreAsked: true },
    custom: [{ id: "c1", name: "Kolut napred", cat: "noge", type: "reps", amount: 10, place: "in", jump: false, desc: "", updated: 1 }],
    updated: 1,
  };
}

// A page with collected errors and outside requests. opts.seed: data to load (false = empty app).
async function open(browser, base, opts = {}) {
  const { seed = seedData(), sw = "block", hash = "", google = null, ...ctxOpts } = opts;
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: sw }, ctxOpts));
  if (google) await fakeGoogle(ctx, google);
  const p = await ctx.newPage(); p.errs = []; p.ext = [];
  p.on("pageerror", e => p.errs.push(e.message));
  p.on("console", m => { if (m.type() === "error") p.errs.push(m.text()); });
  p.on("request", r => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith("data:") && !u.startsWith("blob:")) p.ext.push(u); });
  await p.goto(base + "index.html");
  await p.evaluate(([k, s]) => { localStorage.clear(); if (s) localStorage.setItem(k, JSON.stringify(s)); }, [LS_KEY, seed || null]);
  await p.goto(base + "index.html" + (hash || "#danas")); await p.reload(); await p.waitForTimeout(350);
  return { ctx, p };
}

// Fake Google sign-in and Drive, shared by all pages that use the same `store` object.
async function fakeGoogle(ctx, store) {
  await ctx.addInitScript(() => {
    window.google = { accounts: { oauth2: {
      initTokenClient: o => ({ requestAccessToken: (opts) => setTimeout(() => (window.__googleFails && opts && opts.prompt === "none")
        ? o.error_callback({ type: "popup_failed_to_open" }) : o.callback({ access_token: "tok", expires_in: 3600 }), 10) }),
      hasGrantedAllScopes: () => true, revoke() {} } } };
  });
  await ctx.route("https://www.googleapis.com/**", async route => {
    const req = route.request(), u = new URL(req.url()), m = req.method(), q = u.searchParams.get("q") || "", pth = u.pathname;
    const json = o => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (pth.endsWith("/about")) return json({ user: { emailAddress: "roditelj@example.com" } });
    if (pth === "/drive/v3/files" && m === "GET") return json({ files: q.includes("folder") ? (store.folder ? [{ id: store.folder }] : []) : (store.file ? [{ id: store.file, modifiedTime: new Date().toISOString() }] : []) });
    if (pth === "/drive/v3/files" && m === "POST") { store.folder = "F1"; return json({ id: "F1" }); }
    if (pth === "/drive/v3/files/F1") return json({ id: "F1", trashed: false });
    if (pth === "/drive/v3/files/B1") return route.fulfill({ status: 200, contentType: "application/json", body: store.content });
    if (pth.startsWith("/upload/drive/v3/files")) {
      const parts = req.postData().split(/--trening\w+/);
      store.content = parts[2].split("\r\n\r\n").slice(1).join("\r\n\r\n").trim(); store.file = "B1"; store.uploads = (store.uploads || 0) + 1;
      return json({ id: "B1", modifiedTime: new Date().toISOString() });
    }
    return route.fulfill({ status: 404, body: "{}" });
  });
}

// Simple test runner: named checks, PASS / FAIL lines, a summary, and a non-zero exit on failure.
function runner(title) {
  const res = [];
  const check = (ok, name, detail = "") => { res.push({ ok: !!ok, name }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? "  - " + detail : ""}`); return !!ok; };
  const section = name => console.log(`\n== ${name}`);
  const done = () => { const f = res.filter(r => !r.ok); console.log(`\n${title}: ${res.length - f.length} passed, ${f.length} failed`); return f.length; };
  return { check, section, done };
}

// Tap through JavaScript: for buttons that pulse on purpose (Playwright waits for movement to stop)
const press = (p, sel) => p.$eval(sel, el => el.click());

module.exports = { press, ROOT, serve, open, seedData, fakeGoogle, runner, LS_KEY, day };
