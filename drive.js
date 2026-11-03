// Google Drive backup and sync, adapted from the Gitara app (src/drive.js).
// Google Identity Services + Drive REST API v3, straight from the browser. Uses only the drive.file
// scope: the app can see only the files it created itself. There is no client secret.
//
// Difference from Gitara: workouts from several devices are MERGED, not overwritten. Every backup
// first reads the copy on Drive, adds any workouts from the other device (index.html: mergeData),
// then uploads everything. Deleted workouts stay deleted on all devices (S.deleted).
(function () {
  // Client ID of the "Trening za decu" Google Cloud project. Empty = Drive section stays hidden.
  const CLIENT_ID = '';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const GIS_URL = 'https://accounts.google.com/gsi/client';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const FOLDER_NAME = 'Trening za decu';
  const BACKUP_NAME = 'trening-za-decu-kopija.json';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const KEY = 'trening-za-decu-drive';
  const BACKUP_DELAY = 4000; // ms after a change

  class DriveError extends Error { constructor(message, code = '') { super(message); this.code = code; } }

  // ---------------- state (kept on this device only, not part of the backup) ----------------
  const st = { connected: false, email: '', folderId: '', backupId: '', lastBackup: 0, token: '', tokenExp: 0,
    needsReconnect: false, busy: false, pending: false, lastError: '' };
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ connected: st.connected, email: st.email, folderId: st.folderId,
        backupId: st.backupId, lastBackup: st.lastBackup, pending: st.pending, token: st.token, tokenExp: st.tokenExp }));
    } catch (_) {}
  }
  function load() { try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {} }
  function emit() { try { window.onDriveChange && window.onDriveChange(); } catch (_) {} }

  // ---------------- Google Identity Services ----------------
  let gisPromise = null;
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (navigator.onLine === false) return Promise.reject(new DriveError('Nema internet veze. Poveži se na internet i pokušaj ponovo.', 'offline'));
    if (!gisPromise) {
      gisPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = GIS_URL; s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { gisPromise = null; s.remove(); reject(new DriveError('Google prijava trenutno ne može da se učita. Proveri internet vezu.', 'offline')); };
        document.head.appendChild(s);
      });
    }
    return gisPromise;
  }
  let tokenClient = null, pendingToken = null;
  function getTokenClient() {
    if (tokenClient) return tokenClient;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPE,
      callback: (resp) => {
        const p = pendingToken; pendingToken = null; if (!p) return;
        if (resp.error) {
          const denied = resp.error === 'access_denied';
          return p.reject(new DriveError(denied ? 'Pristup Google Drive-u nije odobren.' : 'Google prijava nije uspela. Pokušaj ponovo.', denied ? 'denied' : 'auth'));
        }
        if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE)) return p.reject(new DriveError('Nisi dozvolio pristup Google Drive-u. Poveži ponovo i označi dozvolu za Drive.', 'denied'));
        p.resolve(resp);
      },
      error_callback: (err) => {
        const p = pendingToken; pendingToken = null; if (!p) return;
        if (err && err.type === 'popup_closed') p.reject(new DriveError('Prijava je otkazana.', 'cancelled'));
        else if (err && err.type === 'popup_failed_to_open') p.reject(new DriveError('Prozor za Google prijavu nije mogao da se otvori. Dozvoli iskačuće prozore i pokušaj ponovo.', 'popup'));
        else p.reject(new DriveError('Google prijava nije uspela. Pokušaj ponovo.', 'auth'));
      },
    });
    return tokenClient;
  }
  async function requestToken({ interactive }) {
    await loadGis();
    const client = getTokenClient();
    if (pendingToken) pendingToken.reject(new DriveError('Prijava je otkazana.', 'cancelled'));
    const resp = await new Promise((resolve, reject) => {
      pendingToken = { resolve, reject };
      const opts = { prompt: interactive ? (st.email ? '' : 'select_account') : 'none' };
      if (st.email) opts.login_hint = st.email;
      try { client.requestAccessToken(opts); } catch (_) { pendingToken = null; reject(new DriveError('Google prijava nije uspela. Pokušaj ponovo.', 'auth')); }
    });
    st.token = resp.access_token;
    st.tokenExp = Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 60000;
    st.needsReconnect = false;
    persist(); emit();
    return st.token;
  }
  async function getToken() {
    if (st.token && Date.now() < st.tokenExp) return st.token;
    try { return await requestToken({ interactive: false }); }
    catch (e) {
      if (e.code === 'offline') throw e;
      st.token = ''; st.needsReconnect = true; persist(); emit();
      throw new DriveError('Veza sa Google Drive-om je istekla. Dodirni „Ponovo poveži“.', 'reconnect');
    }
  }

  // ---------------- Drive REST ----------------
  async function api(url, opts = {}, retry = true) {
    if (navigator.onLine === false) throw new DriveError('Nema internet veze.', 'offline');
    const token = await getToken();
    let res;
    try { res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } }); }
    catch (_) { throw new DriveError('Nema veze sa Google Drive-om. Proveri internet vezu.', 'offline'); }
    if (res.status === 401 && retry) { st.token = ''; st.tokenExp = 0; return api(url, opts, false); }
    if (!res.ok) {
      let msg = '';
      try { const j = await res.json(); msg = (j.error && (j.error.message || '')) + ' ' + JSON.stringify((j.error && j.error.errors) || ''); } catch (_) {}
      if (res.status === 401) { st.needsReconnect = true; emit(); throw new DriveError('Veza sa Google Drive-om je istekla. Dodirni „Ponovo poveži“.', 'reconnect'); }
      if (res.status === 403 && /rate|quota|limit/i.test(msg)) throw new DriveError('Google Drive je privremeno ograničio pristup. Pokušaću ponovo kasnije.', 'rate');
      if (res.status === 403 && /storage|space/i.test(msg)) throw new DriveError('Na Google Drive-u nema dovoljno prostora.', 'storage');
      if (res.status === 403) throw new DriveError('Google Drive je odbio pristup. Prekini vezu i poveži Drive ponovo.', 'denied');
      if (res.status === 404) throw new DriveError('Fajl nije pronađen na Google Drive-u.', 'notfound');
      if (res.status >= 500) throw new DriveError('Google Drive trenutno ne radi. Pokušaću ponovo kasnije.', 'server');
      throw new DriveError('Greška na Google Drive-u.', 'http');
    }
    return res;
  }
  async function findFiles(query) {
    const url = `${API}/files?spaces=drive&pageSize=10&orderBy=modifiedTime desc&fields=${encodeURIComponent('files(id,name,modifiedTime)')}&q=${encodeURIComponent(query)}`;
    return (await (await api(url)).json()).files || [];
  }
  async function ensureFolder() {
    if (st.folderId) {
      try { const f = await (await api(`${API}/files/${st.folderId}?fields=id,trashed`)).json(); if (!f.trashed) return st.folderId; }
      catch (e) { if (e.code !== 'notfound') throw e; }
    }
    const found = await findFiles(`name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`);
    if (found.length) st.folderId = found[0].id;
    else {
      const res = await api(`${API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }) });
      st.folderId = (await res.json()).id;
    }
    st.backupId = ''; persist();
    return st.folderId;
  }
  async function findBackup() {
    const folder = await ensureFolder();
    const files = await findFiles(`name='${BACKUP_NAME}' and '${folder}' in parents and trashed=false`);
    st.backupId = files.length ? files[0].id : '';
    return files[0] || null;
  }
  async function uploadFile({ id, blob, parents }) {
    const meta = { name: BACKUP_NAME, mimeType: 'application/json' };
    if (!id && parents) meta.parents = parents;
    const boundary = 'trening' + Math.random().toString(36).slice(2);
    const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n`, blob, `\r\n--${boundary}--`]);
    const url = id ? `${UPLOAD}/files/${id}?uploadType=multipart&fields=id,modifiedTime` : `${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`;
    return (await api(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })).json();
  }

  // ---------------- sync: pull from Drive, merge, push ----------------
  async function syncNow() {
    if (!st.connected) throw new DriveError('Google Drive nije povezan.', 'notconnected');
    st.busy = true; emit();
    try {
      const folder = await ensureFolder();
      const f = await findBackup();
      let added = 0;
      if (f) {
        let data = null;
        try { data = await (await api(`${API}/files/${f.id}?alt=media`)).json(); } catch (e) { if (e instanceof DriveError) throw e; }
        if (data && data.app === 'trening-za-decu') { added = mergeData(data); if (added) saveLocal(); }
      }
      const blob = new Blob([JSON.stringify(backupData())], { type: 'application/json' });
      let r;
      try { r = await uploadFile({ id: st.backupId, blob, parents: [folder] }); }
      catch (e) { if (e.code !== 'notfound') throw e; st.backupId = ''; r = await uploadFile({ blob, parents: [folder] }); }
      st.backupId = r.id;
      st.lastBackup = Date.parse(r.modifiedTime) || Date.now();
      st.pending = false; st.lastError = '';
      persist();
      if (added) { try { render(); } catch (_) {} toast(`Sa Google Drive-a dodato treninga: ${added}`); }
      return added;
    } finally { st.busy = false; emit(); }
  }

  // ---------------- connect / disconnect ----------------
  async function connect() {
    if (navigator.onLine === false) throw new DriveError('Nema internet veze. Poveži se na internet i pokušaj ponovo.', 'offline');
    await requestToken({ interactive: true });
    const about = await (await api(`${API}/about?fields=user(emailAddress)`)).json();
    st.email = (about.user && about.user.emailAddress) || '';
    st.connected = true; st.needsReconnect = false;
    persist(); emit();
    await syncNow();
  }
  async function reconnect() { await requestToken({ interactive: true }); await syncNow(); }
  function disconnect() {
    const t = st.token;
    Object.assign(st, { connected: false, email: '', folderId: '', backupId: '', lastBackup: 0, token: '', tokenExp: 0, needsReconnect: false, pending: false, lastError: '' });
    clearTimeout(timer);
    try { localStorage.removeItem(KEY); } catch (_) {}
    emit();
    if (t && window.google && google.accounts && google.accounts.oauth2) { try { google.accounts.oauth2.revoke(t, () => {}); } catch (_) {} }
  }

  // ---------------- automatic backup after changes ----------------
  let timer = 0, retryDelay = 30000;
  function schedule(delay = BACKUP_DELAY) {
    if (!st.connected) return;
    if (!st.pending) { st.pending = true; persist(); emit(); }
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }
  async function run() {
    if (!st.connected || !st.pending) return;
    if (navigator.onLine === false) { st.lastError = 'Čeka internet vezu…'; emit(); return; }
    if (st.busy) { schedule(2000); return; }
    try { await syncNow(); retryDelay = 30000; }
    catch (e) {
      st.lastError = e instanceof DriveError ? e.message : 'Rezervna kopija nije uspela.';
      emit();
      if (e.code === 'reconnect' || e.code === 'denied' || e.code === 'storage') return; // waits for the user
      clearTimeout(timer); timer = setTimeout(run, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15 * 60000);
    }
  }

  // ---------------- start ----------------
  load();
  window.addEventListener('online', () => { if (st.pending) schedule(1500); });
  window.Drive = {
    available: !!CLIENT_ID,
    state: () => ({ ...st }),
    changed: () => schedule(),
    connect, reconnect, disconnect, syncNow, DriveError,
  };
  if (CLIENT_ID && st.connected) {
    // on opening: bring in workouts from the other device, but only with a still-valid sign-in (no pop-up)
    if (st.pending) schedule(3000);
    else if (st.token && Date.now() < st.tokenExp && navigator.onLine !== false) setTimeout(() => { syncNow().catch(() => {}); }, 2500);
  }
  emit();
})();
