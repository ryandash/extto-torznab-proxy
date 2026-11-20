"use strict";

function createSettingsHtml(getState) {
  return function settingsHtml(message = "") {
    const {
      config, getCurrentWarmSeconds, getCurrentWarmState, lastWarm, htmlEscape,
      sessionReady, currentWarm, fsBusy, getWarmBadgeText, searchCache,
      magnetCache, lastUsed, getWarmAgeView, getLastWarmRunView, normalizeBaseUrl
    } = getState();

  const c = config;

  const publicUrlValue = c.publicUrl || "";
  const apiKey = c.apiKey || "";
  const currentWarmSeconds = getCurrentWarmSeconds();
  const currentWarmState = getCurrentWarmState();
  const lastWarmAgeSeconds = lastWarm && lastWarm.ok && lastWarm.at
    ? Math.max(0, Math.floor((Date.now() - new Date(lastWarm.at).getTime()) / 1000))
    : null;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>EXT Torznab Proxy</title>
  <style>
    :root {
      --bg: #0f172a;
      --bg-soft: #111827;
      --card: rgba(31, 41, 55, 0.92);
      --card-2: rgba(17, 24, 39, 0.88);
      --border: rgba(148, 163, 184, 0.22);
      --border-strong: rgba(148, 163, 184, 0.38);
      --text: #e5e7eb;
      --muted: #9ca3af;
      --muted-2: #6b7280;
      --primary: #3b82f6;
      --primary-2: #60a5fa;
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
      --input: #0b1220;
      --shadow: 0 24px 80px rgba(0,0,0,.34);
      --radius: 18px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(59,130,246,.20), transparent 34rem),
        radial-gradient(circle at top right, rgba(34,197,94,.13), transparent 32rem),
        linear-gradient(180deg, #0b1020 0%, var(--bg) 52%, #080d19 100%);
    }

    a { color: var(--primary-2); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .page {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
      padding: 28px 0 48px;
    }

    .hero {
      display: grid;
      grid-template-columns: 1.2fr .8fr;
      gap: 18px;
      align-items: stretch;
      margin-bottom: 18px;
    }

    .title-card, .quick-card, .section {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
    }

    .title-card {
      padding: 26px;
      position: relative;
      overflow: hidden;
    }

    .title-card:after {
      content: "";
      position: absolute;
      inset: auto -80px -110px auto;
      width: 260px;
      height: 260px;
      border-radius: 999px;
      background: rgba(59,130,246,.18);
      filter: blur(8px);
    }

    h1 {
      margin: 0;
      font-size: clamp(30px, 4vw, 46px);
      letter-spacing: -0.04em;
      line-height: 1;
    }

    .subtitle {
      margin: 14px 0 0;
      max-width: 720px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.55;
    }

    .badge-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 18px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 7px 10px;
      border: 1px solid var(--border);
      background: rgba(15,23,42,.62);
      color: var(--muted);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--success);
      box-shadow: 0 0 0 4px rgba(34,197,94,.12);
    }

    .dot.off { background: var(--muted-2); box-shadow: none; }
    .dot.warn { background: var(--warning); box-shadow: 0 0 0 4px rgba(245,158,11,.13); }

    .quick-card {
      padding: 20px;
    }

    .quick-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    .quick-title h2, .section h2 {
      margin: 0;
      font-size: 18px;
      letter-spacing: -0.02em;
    }

    .copy-grid {
      display: grid;
      gap: 10px;
    }

    .copy-line {
      display: grid;
      grid-template-columns: 92px 1fr auto;
      gap: 10px;
      align-items: center;
      padding: 10px;
      border-radius: 12px;
      background: rgba(15,23,42,.62);
      border: 1px solid rgba(148,163,184,.14);
    }

    .copy-label {
      color: var(--muted);
      font-weight: 700;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }

    code {
      display: inline-block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      background: #030712;
      color: #dbeafe;
      border: 1px solid rgba(96,165,250,.18);
      padding: 7px 9px;
      border-radius: 9px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 0 14px;
      border: 0;
      border-radius: 12px;
      background: var(--primary);
      color: white;
      font-weight: 800;
      cursor: pointer;
      text-decoration: none;
      box-shadow: 0 8px 18px rgba(59,130,246,.24);
    }

    .btn:hover { background: #2563eb; text-decoration: none; }
    .btn.secondary {
      background: rgba(148,163,184,.14);
      color: var(--text);
      box-shadow: none;
      border: 1px solid var(--border);
    }
    .btn.secondary:hover { background: rgba(148,163,184,.22); }

    .btn.ghost {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted);
      box-shadow: none;
    }

    .btn.small {
      min-height: 32px;
      padding: 0 10px;
      border-radius: 10px;
      font-size: 12px;
    }

    .msg {
      margin: 0 0 18px;
      padding: 13px 15px;
      border-radius: 14px;
      border: 1px solid rgba(34,197,94,.35);
      background: rgba(34,197,94,.12);
      color: #bbf7d0;
      font-weight: 700;
    }

    .status-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      margin: 18px 0;
    }

    .stat {
      padding: 14px;
      background: rgba(17,24,39,.72);
      border: 1px solid rgba(148,163,184,.16);
      border-radius: 14px;
    }

    .stat span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .04em;
    }

    .stat strong {
      display: block;
      margin-top: 7px;
      font-size: 18px;
      letter-spacing: -0.02em;
    }

    form {
      display: grid;
      gap: 18px;
    }

    .section {
      padding: 20px;
    }

    .section-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
    }

    .section-desc {
      margin: 6px 0 0;
      color: var(--muted);
      line-height: 1.5;
      font-size: 13px;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .field {
      display: grid;
      gap: 7px;
    }

    label {
      color: #f3f4f6;
      font-size: 13px;
      font-weight: 800;
    }

    .hint {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }

    input[type=text],
    input[type=number],
    input[type=password],
    select {
      width: 100%;
      min-height: 42px;
      border-radius: 12px;
      border: 1px solid var(--border-strong);
      background: var(--input);
      color: var(--text);
      padding: 10px 12px;
      outline: none;
      font: inherit;
    }

    select {
      cursor: pointer;
      appearance: none;
      background-image:
        linear-gradient(45deg, transparent 50%, var(--muted) 50%),
        linear-gradient(135deg, var(--muted) 50%, transparent 50%);
      background-position:
        calc(100% - 18px) 18px,
        calc(100% - 12px) 18px;
      background-size: 6px 6px, 6px 6px;
      background-repeat: no-repeat;
      padding-right: 36px;
    }

    input:focus,
    select:focus {
      border-color: rgba(96,165,250,.85);
      box-shadow: 0 0 0 4px rgba(59,130,246,.14);
    }

    .api-key-row {
      display: grid;
      grid-template-columns: 1fr 46px 46px;
      gap: 8px;
      align-items: center;
    }

    .api-key-row input {
      min-width: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      letter-spacing: .01em;
    }

    .icon-btn {
      width: 46px;
      min-height: 42px;
      border: 1px solid var(--border-strong);
      border-radius: 12px;
      background: rgba(148,163,184,.14);
      color: var(--text);
      font-size: 20px;
      font-weight: 900;
      cursor: pointer;
      line-height: 1;
    }

    .icon-btn:hover {
      background: rgba(148,163,184,.24);
    }

    .icon-btn.danger {
      background: rgba(239,68,68,.88);
      border-color: rgba(239,68,68,.95);
      color: white;
    }

    .icon-btn.danger:hover {
      background: rgba(220,38,38,.98);
    }

    .confirm-overlay {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(2, 6, 23, .72);
      backdrop-filter: blur(8px);
    }

    .confirm-overlay[hidden] {
      display: none;
    }

    .confirm-box {
      width: min(560px, 100%);
      border: 1px solid var(--border-strong);
      border-radius: 18px;
      background: #111827;
      box-shadow: var(--shadow);
      padding: 20px;
    }

    .confirm-box h3 {
      margin: 0 0 10px;
      font-size: 20px;
      letter-spacing: -0.02em;
    }

    .confirm-box p {
      margin: 0;
      color: var(--muted);
      line-height: 1.55;
      font-size: 14px;
    }

    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 18px;
    }

    .check-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 14px;
    }

    .check {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 13px;
      border: 1px solid rgba(148,163,184,.18);
      background: rgba(15,23,42,.55);
      border-radius: 14px;
    }

    .check input { margin-top: 2px; transform: scale(1.15); }
    .check label { display: block; }
    .check small { display: block; color: var(--muted); margin-top: 4px; line-height: 1.45; }

    .actions {
      position: sticky;
      bottom: 0;
      z-index: 5;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-end;
      padding: 14px 0 0;
      background: linear-gradient(180deg, transparent, rgba(15,23,42,.92) 24%);
      backdrop-filter: blur(8px);
    }

    .footer-note {
      margin-top: 14px;
      color: var(--muted-2);
      font-size: 12px;
      text-align: center;
    }

    .refresh-box {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 38px;
      padding: 0 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: rgba(15,23,42,.62);
      color: var(--muted);
      font-size: 13px;
      font-weight: 800;
    }

    .refresh-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      white-space: nowrap;
    }

    .refresh-toggle input {
      transform: scale(1.08);
    }

    .refresh-input {
      width: 72px !important;
      min-height: 30px !important;
      padding: 5px 8px !important;
      border-radius: 9px !important;
      text-align: center;
    }

    .refresh-unit {
      color: var(--muted-2);
      font-size: 12px;
      font-weight: 800;
    }

    .toast {
      margin-top: 12px;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid rgba(96,165,250,.30);
      background: rgba(59,130,246,.12);
      color: #bfdbfe;
      font-size: 13px;
      font-weight: 800;
      line-height: 1.45;
    }

    .toast.ok {
      border-color: rgba(34,197,94,.35);
      background: rgba(34,197,94,.12);
      color: #bbf7d0;
    }

    .toast.err {
      border-color: rgba(239,68,68,.35);
      background: rgba(239,68,68,.12);
      color: #fecaca;
    }

    @media (max-width: 900px) {
      .hero, .grid, .status-grid, .check-row { grid-template-columns: 1fr; }
      .copy-line { grid-template-columns: 1fr; }
      .actions { justify-content: stretch; }
      .actions .btn { flex: 1; }
      .refresh-box { width: 100%; justify-content: space-between; }
      .api-key-row { grid-template-columns: 1fr 42px 42px; }
      .icon-btn { width: 42px; }
    }
  </style>
</head>
<body>
<div class="page">
  <div class="hero">
    <div class="title-card">
      <h1>EXT Torznab Proxy</h1>
      <p class="subtitle" data-i18n="subtitle">A self-hosted Torznab gateway for EXT results with FlareSolverr session handling, warm checks, cache and magnet resolving.</p>
      <div class="badge-row">
        <span class="badge"><span id="sessionDot" class="dot ${sessionReady ? "" : "off"}"></span><span id="sessionStatus">Session: ${sessionReady ? "Ready" : "Cold"}</span></span>
        <span class="badge"><span id="warmDot" class="dot ${currentWarm ? "warn" : (config.warmEnabled ? "" : "off")}"></span><span id="warmStatus">Warm: ${htmlEscape(getWarmBadgeText())}</span></span>
        <span class="badge"><span id="fsDot" class="dot ${fsBusy ? "warn" : ""}"></span><span id="fsStatus">FlareSolverr: ${fsBusy ? "Busy" : "Idle"}</span></span>
      </div>
    </div>

    <div class="quick-card">
      <div class="quick-title">
        <h2 data-i18n="prowlarrInfo">Prowlarr Generic Torznab</h2>
        <a class="btn small secondary" href="/api?t=caps" target="_blank" data-i18n="caps">Caps</a>
      </div>
      <div class="copy-grid">
        <div class="copy-line">
          <div class="copy-label" data-i18n="quickUrl">URL</div>
          <code id="torznabUrl">${htmlEscape(publicUrlValue)}</code>
          <button type="button" class="btn small ghost" data-copy="torznabUrl" data-i18n="copy">Copy</button>
        </div>
        <div class="copy-line">
          <div class="copy-label" data-i18n="quickApiPath">API Path</div>
          <code id="apiPath">/api</code>
          <button type="button" class="btn small ghost" data-copy="apiPath" data-i18n="copy">Copy</button>
        </div>
        <div class="copy-line">
          <div class="copy-label" data-i18n="quickApiKey">API Key</div>
          <code id="apiKey">${htmlEscape(apiKey)}</code>
          <button type="button" class="btn small ghost" data-copy="apiKey" data-i18n="copy">Copy</button>
        </div>
      </div>
    </div>
  </div>

  ${message ? `<p class="msg">${htmlEscape(message)}</p>` : ""}

  <div class="status-grid">
    <div class="stat"><span data-i18n="searchCache">Search Cache</span><strong id="searchCacheVal">${searchCache.size}</strong></div>
    <div class="stat"><span data-i18n="magnetCache">Magnet Cache</span><strong id="magnetCacheVal">${magnetCache.size}</strong></div>
    <div class="stat"><span data-i18n="idleSeconds">Idle Seconds</span><strong id="idleSecondsVal">${Math.floor((Date.now() - lastUsed) / 1000)}</strong></div>
    <div class="stat"><span data-i18n="warmAge">Warm Age</span><strong id="warmAgeVal">${htmlEscape(getWarmAgeView())}</strong></div>
    <div class="stat"><span data-i18n="lastWarmRun">Last Warm / Challenge</span><strong id="lastWarmRunVal">${htmlEscape(getLastWarmRunView())}</strong></div>
  </div>

  <form method="post" action="/settings">
    <div class="section">
      <div class="section-head">
        <div>
          <h2 data-i18n="siteAndFs">Site and FlareSolverr</h2>
          <p class="section-desc" data-i18n="siteAndFsDesc">Main site URL, FlareSolverr endpoint, session name and API identity.</p>
        </div>
      </div>

      <div class="grid">
        <div class="field">
          <label data-i18n="baseUrl">Base URL</label>
          <select name="baseUrl">
            <option value="https://extranet.torrentbay.st" ${normalizeBaseUrl(c.baseUrl) === "https://extranet.torrentbay.st" ? "selected" : ""}>https://extranet.torrentbay.st</option>
            <option value="https://ext.to" ${normalizeBaseUrl(c.baseUrl) === "https://ext.to" ? "selected" : ""}>https://ext.to</option>
          </select>
          <div class="hint" data-i18n="baseUrlHint">Target EXT site domain used internally by the proxy.</div>
        </div>

        <div class="field">
          <label data-i18n="publicUrl">Public URL</label>
          <input type="text" name="publicUrl" placeholder="http://192.168.2.1:8998" value="${htmlEscape(c.publicUrl)}">
          <div class="hint" data-i18n="publicUrlHint">Address Prowlarr can reach. Leave empty to use browser origin on this page.</div>
        </div>

        <div class="field">
          <label data-i18n="flaresolverrUrl">FlareSolverr URL</label>
          <input type="text" name="flaresolverrUrl" value="${htmlEscape(c.flaresolverrUrl)}">
          <div class="hint" data-i18n="fsHint">Usually http://flaresolverr:8191/v1 when both containers share a Docker network.</div>
        </div>

        <div class="field">
          <label data-i18n="sessionName">Session Name</label>
          <input type="text" name="sessionName" value="${htmlEscape(c.sessionName)}">
          <div class="hint" data-i18n="sessionNameHint">Persistent FlareSolverr browser session name.</div>
        </div>

        <div class="field">
          <label data-i18n="apiKeyLabel">API Key</label>
          <div class="api-key-row">
            <input id="apiKeyInput" type="text" name="apiKey" value="${htmlEscape(c.apiKey)}" autocomplete="off" spellcheck="false">
            <button class="icon-btn" type="button" onclick="copyApiKeyFromInput(this)" title="Copy API Key" data-i18n-title="copyApiKey" aria-label="Copy API Key">⧉</button>
            <button class="icon-btn danger" type="button" onclick="regenerateApiKey(this)" title="Generate new API Key" data-i18n-title="generateApiKey" aria-label="Generate new API Key">↻</button>
          </div>
          <div class="hint" data-i18n="apiKeyHint">Used by Prowlarr Generic Torznab.</div>
        </div>

        <div class="field">
          <label data-i18n="requestTimeout">Request Timeout Ms</label>
          <input type="number" name="requestTimeoutMs" value="${htmlEscape(c.requestTimeoutMs)}">
          <div class="hint" data-i18n="requestTimeoutHint">Must be higher than Cloudflare challenge duration.</div>
        </div>
      </div>

      <div class="check-row">
        <div class="check">
          <input id="withAdult" type="checkbox" name="withAdult" ${c.withAdult ? "checked" : ""}>
          <div>
            <label for="withAdult" data-i18n="withAdult">Include adult results</label>
            <small data-i18n="withAdultHint">Adds with_adult=1 to browse requests.</small>
          </div>
        </div>
        <div class="check">
          <input id="stripSeason" type="checkbox" name="stripSeasonFromSearch" ${c.stripSeasonFromSearch ? "checked" : ""}>
          <div>
            <label for="stripSeason" data-i18n="stripSeason">Normalize season/episode tokens</label>
            <small data-i18n="stripSeasonHint">Normalizes Season 2 / S2 / S02E4 style searches into S02 or S02E04.</small>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <div>
          <h2 data-i18n="warmCache">Warm and Cache</h2>
          <p class="section-desc" data-i18n="warmCacheDesc">Keeps the Cloudflare session warm and limits repeated site requests.</p>
        </div>
      </div>

      <div class="grid">
        <div class="field">
          <label data-i18n="warmQuery">Warm Query</label>
          <input type="text" name="warmQuery" value="${htmlEscape(c.warmQuery)}">
        </div>

        <div class="field">
          <label data-i18n="warmInterval">Warm Interval Minutes</label>
          <input type="number" name="warmIntervalMinutes" value="${htmlEscape(c.warmIntervalMinutes)}">
        </div>

        <div class="field">
          <label data-i18n="coldThreshold">Cold Threshold Seconds</label>
          <input type="number" name="coldThresholdSeconds" value="${htmlEscape(c.coldThresholdSeconds)}">
        </div>

        <div class="field">
          <label data-i18n="searchTtl">Search TTL Seconds</label>
          <input type="number" name="searchTtlSeconds" value="${htmlEscape(c.searchTtlSeconds)}">
        </div>

        <div class="field">
          <label data-i18n="magnetTtl">Magnet TTL Minutes</label>
          <input type="number" name="magnetTtlMinutes" value="${htmlEscape(c.magnetTtlMinutes)}">
        </div>

        <div class="field">
          <label data-i18n="idleTimeout">Idle Timeout Minutes</label>
          <input type="number" name="idleTimeoutMinutes" value="${htmlEscape(c.idleTimeoutMinutes)}">
        </div>

        <div class="field">
          <label data-i18n="maxSearch">Max Search Cache Items</label>
          <input type="number" name="maxSearchCacheItems" value="${htmlEscape(c.maxSearchCacheItems)}">
        </div>

        <div class="field">
          <label data-i18n="maxMagnet">Max Magnet Cache Items</label>
          <input type="number" name="maxMagnetCacheItems" value="${htmlEscape(c.maxMagnetCacheItems)}">
        </div>
      </div>

      <div class="check-row">
        <div class="check">
          <input id="warmEnabled" type="checkbox" name="warmEnabled" ${c.warmEnabled ? "checked" : ""}>
          <div>
            <label for="warmEnabled" data-i18n="warmEnabled">Enable internal warm timer</label>
            <small data-i18n="warmEnabledHint">The container periodically calls /warm by itself. No external cron is required for this container.</small>
          </div>
        </div>
      </div>
    </div>

    <div class="actions">
      <div class="refresh-box">
        <label class="refresh-toggle">
          <input id="autoRefreshEnabled" type="checkbox">
          <span data-i18n="autoRefresh">Auto refresh</span>
        </label>
        <input id="autoRefreshSeconds" class="refresh-input" type="number" min="3" max="3600" value="10">
        <span class="refresh-unit" data-i18n="secondsShort">sec</span>
      </div>

      <button class="btn secondary" type="button" id="manualWarmBtn" onclick="manualWarmAction(this)" data-i18n="manualWarm">Manual Warm</button>
      <button class="btn secondary" type="button" id="clearCacheBtn" onclick="clearCacheAction(this)" data-i18n="clearCache">Clear Cache</button>
      <button class="btn secondary" type="button" id="sessionResetBtn" onclick="sessionResetAction(this)" data-i18n="sessionReset">Session Reset</button>
      <button class="btn" type="submit" data-i18n="save">Save Settings</button>
    </div>

    <div id="actionToast" class="toast" hidden></div>
  </form>

  <p class="footer-note" data-i18n="footer">EXT Torznab Proxy runs locally. Keep this page inside your trusted network.</p>
</div>

<div id="apiKeyConfirmOverlay" class="confirm-overlay" hidden>
  <div class="confirm-box" role="dialog" aria-modal="true" aria-labelledby="apiKeyConfirmTitle">
    <h3 id="apiKeyConfirmTitle" data-i18n="apiKeyRotateTitle">Generate new API key?</h3>
    <p data-i18n="apiKeyRotateConfirm">A new API key will be written immediately. You must update the API Key field in Prowlarr after this change. Continue?</p>
    <div class="confirm-actions">
      <button class="btn secondary" type="button" id="apiKeyConfirmCancel" data-i18n="cancel">Cancel</button>
      <button class="btn" type="button" id="apiKeyConfirmOk" data-i18n="ok">OK</button>
    </div>
  </div>
</div>

<script>
(function () {
  var tr = {
    subtitle: "FlareSolverr oturumu, sıcak tutma, cache ve magnet çözme desteği olan EXT için bağımsız Torznab geçidi.",
    session: "Oturum",
    warm: "Warm",
    ready: "Hazır",
    cold: "Soğuk",
    on: "Açık",
    off: "Kapalı",
    busy: "Meşgul",
    idle: "Boşta",
    runningState: "ÇALIŞIYOR",
    challengeState: "CHALLENGE",
    warmState: "WARM",
    coldChallengeState: "COLD/CHALLENGE",
    errorState: "HATA",
    prowlarrInfo: "Prowlarr Generic Torznab Bilgileri",
    caps: "Caps",
    copy: "Kopyala",
    quickUrl: "URL",
    quickApiPath: "API Yolu",
    quickApiKey: "API Anahtarı",
    searchCache: "Arama Önbelleği",
    magnetCache: "Magnet Önbelleği",
    idleSeconds: "Boşta Süresi",
    warmAge: "Warm Süresi",
    lastWarmRun: "Son Warm / Challenge",
    lastWarm: "Son Warm",
    siteAndFs: "Site ve FlareSolverr",
    siteAndFsDesc: "Ana site adresi, FlareSolverr bağlantısı, session adı ve API kimliği.",
    baseUrl: "Site Adresi",
    baseUrlHint: "Proxy'nin içeride kullandığı hedef EXT site adresi.",
    publicUrl: "Dış Erişim Adresi",
    publicUrlHint: "Prowlarr'ın erişeceği adres. Boş bırakılırsa bu sayfanın adresi gösterilir.",
    fsHint: "İki container aynı Docker ağındaysa genelde http://flaresolverr:8191/v1 olur.",
    sessionName: "Oturum Adı",
    sessionNameHint: "Kalıcı FlareSolverr tarayıcı oturumu adı.",
    flaresolverrUrl: "FlareSolverr Adresi",
    apiKeyLabel: "API Anahtarı",
    apiKeyHint: "Prowlarr Generic Torznab tarafından kullanılır.",
    copyApiKey: "API anahtarını kopyala",
    generateApiKey: "Yeni API anahtarı üret",
    apiKeyCopied: "API anahtarı kopyalandı",
    apiKeyCopyFailed: "API anahtarı kopyalanamadı",
    apiKeyGenerated: "Yeni API anahtarı oluşturuldu, ayar dosyasına yazıldı ve panoya kopyalandı. Prowlarr içindeki API Key alanını da bu yeni anahtarla güncellemeyi unutmayın.",
    apiKeyRotateTitle: "Yeni API anahtarı oluşturulsun mu?",
    apiKeyRotateConfirm: "Yeni API anahtarı hemen ayar dosyasına yazılacak. Bu işlemden sonra Prowlarr içindeki API Key alanını da yeni anahtarla güncellemeniz gerekir. Devam edilsin mi?",
    ok: "Tamam",
    cancel: "İptal",
    requestTimeout: "İstek Zaman Aşımı (ms)",
    requestTimeoutHint: "Cloudflare challenge süresinden yüksek olmalı.",
    withAdult: "Adult sonuçları dahil et",
    withAdultHint: "Browse isteklerine with_adult=1 ekler.",
    stripSeason: "Sezon/bölüm kalıplarını düzelt",
    stripSeasonHint: "Season 2 / S2 / S02E4 gibi aramaları S02 veya S02E04 biçimine çevirir.",
    warmCache: "Warm ve Önbellek",
    warmCacheDesc: "Cloudflare oturumunu sıcak tutar ve tekrar eden site isteklerini azaltır.",
    warmQuery: "Warm Arama Kelimesi",
    warmInterval: "Warm Aralığı (dakika)",
    coldThreshold: "Cold Eşiği (saniye)",
    searchTtl: "Arama Önbellek Süresi (saniye)",
    magnetTtl: "Magnet Önbellek Süresi (dakika)",
    idleTimeout: "Boşta Oturum Kapatma (dakika)",
    maxSearch: "Maksimum Arama Önbellek Adedi",
    maxMagnet: "Maksimum Magnet Önbellek Adedi",
    warmEnabled: "Dahili warm zamanlayıcısını aç",
    warmEnabledHint: "Container belirli aralıklarla kendi içinde /warm çağırır. Bu container için harici cron gerekmez.",
    manualWarm: "Manuel Warm",
    clearCache: "Önbelleği Temizle",
    autoRefresh: "Otomatik yenile",
    secondsShort: "sn",
    running: "Çalışıyor...",
    warmOk: "Warm tamamlandı",
    cacheClearOk: "Önbellek temizlendi",
    sessionReset: "Session Reset",
    sessionResetOk: "Session sıfırlandı",
    actionFailed: "İşlem başarısız",
    save: "Ayarları Kaydet",
    footer: "EXT Torznab Proxy yerel ağda çalışır. Bu sayfayı güvenilir ağ içinde tutun."
  };

  var en = {
    subtitle: "A self-hosted Torznab gateway for EXT results with FlareSolverr session handling, warm checks, cache and magnet resolving.",
    session: "Session",
    warm: "Warm",
    ready: "Ready",
    cold: "Cold",
    on: "On",
    off: "Off",
    busy: "Busy",
    idle: "Idle",
    runningState: "RUNNING",
    challengeState: "CHALLENGE",
    warmState: "WARM",
    coldChallengeState: "COLD/CHALLENGE",
    errorState: "ERROR",
    prowlarrInfo: "Prowlarr Generic Torznab",
    caps: "Caps",
    copy: "Copy",
    quickUrl: "URL",
    quickApiPath: "API Path",
    quickApiKey: "API Key",
    searchCache: "Search Cache",
    magnetCache: "Magnet Cache",
    idleSeconds: "Idle Seconds",
    warmAge: "Warm Age",
    lastWarmRun: "Last Warm / Challenge",
    lastWarm: "Last Warm",
    siteAndFs: "Site and FlareSolverr",
    siteAndFsDesc: "Main site URL, FlareSolverr endpoint, session name and API identity.",
    baseUrl: "Base URL",
    baseUrlHint: "Target EXT site domain used internally by the proxy.",
    publicUrl: "Public URL",
    publicUrlHint: "Address Prowlarr can reach. Leave empty to use browser origin on this page.",
    fsHint: "Usually http://flaresolverr:8191/v1 when both containers share a Docker network.",
    sessionName: "Session Name",
    sessionNameHint: "Persistent FlareSolverr browser session name.",
    flaresolverrUrl: "FlareSolverr URL",
    apiKeyLabel: "API Key",
    apiKeyHint: "Used by Prowlarr Generic Torznab.",
    copyApiKey: "Copy API key",
    generateApiKey: "Generate new API key",
    apiKeyCopied: "API key copied",
    apiKeyCopyFailed: "API key copy failed",
    apiKeyGenerated: "New API key was generated, saved to the config file, and copied to the clipboard. Do not forget to update the API Key field in Prowlarr too.",
    apiKeyRotateTitle: "Generate a new API key?",
    apiKeyRotateConfirm: "A new API key will be written to the config file immediately. After this change, you must update the API Key field in Prowlarr with the new key. Continue?",
    ok: "OK",
    cancel: "Cancel",
    requestTimeout: "Request Timeout (ms)",
    requestTimeoutHint: "Must be higher than Cloudflare challenge duration.",
    withAdult: "Include adult results",
    withAdultHint: "Adds with_adult=1 to browse requests.",
    stripSeason: "Normalize season/episode tokens",
    stripSeasonHint: "Normalizes Season 2 / S2 / S02E4 style searches into S02 or S02E04.",
    warmCache: "Warm and Cache",
    warmCacheDesc: "Keeps the Cloudflare session warm and limits repeated site requests.",
    warmQuery: "Warm Query",
    warmInterval: "Warm Interval (minutes)",
    coldThreshold: "Cold Threshold (seconds)",
    searchTtl: "Search TTL (seconds)",
    magnetTtl: "Magnet TTL (minutes)",
    idleTimeout: "Idle Timeout (minutes)",
    maxSearch: "Max Search Cache Items",
    maxMagnet: "Max Magnet Cache Items",
    warmEnabled: "Enable internal warm timer",
    warmEnabledHint: "The container periodically calls /warm by itself. No external cron is required for this container.",
    manualWarm: "Manual Warm",
    clearCache: "Clear Cache",
    autoRefresh: "Auto refresh",
    secondsShort: "sec",
    running: "Running...",
    warmOk: "Warm completed",
    cacheClearOk: "Cache cleared",
    sessionReset: "Session Reset",
    sessionResetOk: "Session reset completed",
    actionFailed: "Action failed",
    save: "Save Settings",
    footer: "EXT Torznab Proxy runs locally. Keep this page inside your trusted network."
  };

  if (window.location.search.indexOf("saved=1") >= 0) {
    window.history.replaceState(null, "", "/");
  }

  var lang = (navigator.language || navigator.userLanguage || "en").toLowerCase();
  var dict = lang.indexOf("tr") === 0 ? tr : en;

  document.documentElement.lang = lang.indexOf("tr") === 0 ? "tr" : "en";

  var initialStatus = {
    sessionReady: ${sessionReady ? "true" : "false"},
    fsBusy: ${fsBusy ? "true" : "false"},
    warmEnabled: ${config.warmEnabled ? "true" : "false"},
    currentWarmSeconds: ${currentWarmSeconds === null ? "null" : String(currentWarmSeconds)},
    currentWarmState: ${JSON.stringify(currentWarmState)},
    warmAgeSeconds: ${lastWarmAgeSeconds === null ? "null" : String(lastWarmAgeSeconds)},
    lastWarmDurationSeconds: ${lastWarm ? Number(lastWarm.durationSeconds || 0) : "null"},
    lastWarmDurationMs: ${lastWarm ? Number(lastWarm.durationMs || 0) : "null"},
    lastWarmState: ${JSON.stringify(lastWarm ? lastWarm.state : null)}
  };

  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    var key = el.getAttribute("data-i18n");
    el.textContent = dict[key] || en[key] || el.textContent;
  });

  document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
    var key = el.getAttribute("data-i18n-title");
    el.title = dict[key] || en[key] || el.title;
    el.setAttribute("aria-label", el.title);
  });

  function stateText(state) {
    if (state === "WARM") return dict.warmState || "WARM";
    if (state === "COLD_OR_CHALLENGE") return dict.coldChallengeState || "COLD/CHALLENGE";
    if (state === "ERROR") return dict.errorState || "ERROR";
    if (state === "RUNNING") return dict.runningState || "RUNNING";
    if (state === "CHALLENGE") return dict.challengeState || "CHALLENGE";
    return state || "—";
  }

  function durationText(seconds, ms) {
    seconds = Number(seconds || 0);
    ms = Number(ms || 0);
    if (seconds < 1 && ms > 0) return ms + "ms";
    return seconds + "s";
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function applyInitialStatus() {
    setText("sessionStatus", (dict.session || "Session") + ": " + (initialStatus.sessionReady ? (dict.ready || "Ready") : (dict.cold || "Cold")));

    if (initialStatus.currentWarmSeconds !== null) {
      var warmRunState = initialStatus.currentWarmState === "CHALLENGE" ? (dict.challengeState || "CHALLENGE") : (dict.runningState || "RUNNING");
      setText("warmStatus", (dict.warm || "Warm") + ": " + warmRunState + " " + initialStatus.currentWarmSeconds + "s");
    } else {
      setText("warmStatus", (dict.warm || "Warm") + ": " + (initialStatus.warmEnabled ? (dict.on || "On") : (dict.off || "Off")));
    }

    setText("fsStatus", "FlareSolverr: " + (initialStatus.fsBusy ? (dict.busy || "Busy") : (dict.idle || "Idle")));

    if (initialStatus.currentWarmSeconds !== null) {
      var currentStateText = initialStatus.currentWarmState === "CHALLENGE" ? (dict.challengeState || "CHALLENGE") : (dict.runningState || "RUNNING");
      setText("warmAgeVal", initialStatus.currentWarmSeconds + "s " + currentStateText);
      setText("lastWarmRunVal", initialStatus.currentWarmSeconds + "s " + currentStateText);
    } else {
      setText("warmAgeVal", initialStatus.warmAgeSeconds === null ? "—" : initialStatus.warmAgeSeconds + "s " + (dict.warmState || "WARM"));
      setText("lastWarmRunVal", initialStatus.lastWarmState ? durationText(initialStatus.lastWarmDurationSeconds, initialStatus.lastWarmDurationMs) + " " + stateText(initialStatus.lastWarmState) : "—");
    }
  }

  applyInitialStatus();

  var torznabUrl = document.getElementById("torznabUrl");
  if (torznabUrl && !torznabUrl.textContent.trim()) {
    torznabUrl.textContent = window.location.origin;
  }

  function fallbackCopyText(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();

    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (_) {
      ok = false;
    }

    document.body.removeChild(ta);
    return ok;
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {}
    }

    return fallbackCopyText(text);
  }

  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      var id = btn.getAttribute("data-copy");
      var el = document.getElementById(id);
      if (!el) return;

      var text = el.textContent.trim();
      var oldText = btn.textContent;

      var ok = await copyText(text);

      if (ok) {
        btn.textContent = lang.indexOf("tr") === 0 ? "Kopyalandı" : "Copied";
      } else {
        btn.textContent = lang.indexOf("tr") === 0 ? "Kopyalanamadı" : "Failed";
      }

      setTimeout(function () {
        btn.textContent = oldText;
      }, 1200);
    });
  });

  var toast = document.getElementById("actionToast");

  function showToast(text, kind) {
    if (!toast) return;
    toast.hidden = false;
    toast.className = "toast " + (kind || "");
    toast.textContent = text;
  }

  function setBusy(btn, busy) {
    if (!btn) return;
    if (busy) {
      btn.dataset.oldText = btn.textContent;
      btn.textContent = dict.running || "Running...";
      btn.disabled = true;
      btn.style.opacity = ".72";
      btn.style.cursor = "wait";
    } else {
      btn.textContent = btn.dataset.oldText || btn.textContent;
      btn.disabled = false;
      btn.style.opacity = "";
      btn.style.cursor = "";
    }
  }

  async function callJson(url, options) {
    options = options || {};
    options.cache = "no-store";
    var r = await fetch(url, options);
    var text = await r.text();
    var json = null;
    try { json = JSON.parse(text); } catch (_) {}
    if (!r.ok) {
      throw new Error((json && (json.error || json.message)) || text || ("HTTP " + r.status));
    }
    return json || { ok: true, text: text };
  }

  function showApiKeyConfirm() {
    var overlay = document.getElementById("apiKeyConfirmOverlay");
    var okBtn = document.getElementById("apiKeyConfirmOk");
    var cancelBtn = document.getElementById("apiKeyConfirmCancel");

    if (!overlay || !okBtn || !cancelBtn) {
      return Promise.resolve(window.confirm(dict.apiKeyRotateConfirm || "Generate new API key?"));
    }

    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    overlay.hidden = false;
    okBtn.focus();

    return new Promise(function (resolve) {
      function close(value) {
        overlay.hidden = true;
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        overlay.removeEventListener("click", onOverlay);
        document.removeEventListener("keydown", onKey);
        armRefresh();
        resolve(value);
      }

      function onOk() { close(true); }
      function onCancel() { close(false); }
      function onOverlay(e) { if (e.target === overlay) close(false); }
      function onKey(e) { if (e.key === "Escape") close(false); }

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      overlay.addEventListener("click", onOverlay);
      document.addEventListener("keydown", onKey);
    });
  }

  window.copyApiKeyFromInput = async function () {
    var input = document.getElementById("apiKeyInput");
    if (!input) return;

    var ok = await copyText(input.value.trim());

    if (ok) {
      showToast(dict.apiKeyCopied || "API key copied", "ok");
    } else {
      showToast(dict.apiKeyCopyFailed || "API key copy failed", "err");
    }
  };

  window.regenerateApiKey = async function (btn) {
    var input = document.getElementById("apiKeyInput");
    if (!input) return;

    var confirmed = await showApiKeyConfirm();
    if (!confirmed) return;

    try {
      setBusy(btn, true);
      showToast(dict.running || "Running...", "");

      var j = await callJson("/api-key/regenerate", { method: "POST" });
      if (!j || !j.apiKey) throw new Error("No API key returned");

      input.value = j.apiKey;
      var quickApiKey = document.getElementById("apiKey");
      if (quickApiKey) quickApiKey.textContent = j.apiKey;

      var ok = await copyText(j.apiKey);

      if (ok) {
        showToast(dict.apiKeyGenerated || "New API key generated and copied.", "ok");
      } else {
        showToast((dict.apiKeyGenerated || "New API key generated.") + " " + (dict.apiKeyCopyFailed || "Copy failed."), "err");
      }
    } catch (e) {
      showToast((dict.actionFailed || "Action failed") + ": " + e.message, "err");
    } finally {
      setBusy(btn, false);
    }
  };

  window.manualWarmAction = async function (btn) {
    try {
      setBusy(btn, true);
      showToast((dict.running || "Running...") + " /warm", "");

      var j = await callJson("/warm");

      showToast((dict.warmOk || "Warm completed") + ": " + (j.durationSeconds || 0) + "s " + (j.state || ""), "ok");

      setTimeout(function () {
        window.location.reload();
      }, 900);
    } catch (e) {
      showToast((dict.actionFailed || "Action failed") + ": " + e.message, "err");
    } finally {
      setBusy(btn, false);
    }
  };

  window.clearCacheAction = async function (btn) {
    try {
      setBusy(btn, true);
      showToast((dict.running || "Running...") + " /cache/clear", "");

      var j = await callJson("/cache/clear");

      showToast((dict.cacheClearOk || "Cache cleared") + ": search=" + (j.clearedSearches || 0) + ", magnet=" + (j.clearedMagnets || 0), "ok");

      setTimeout(function () {
        window.location.reload();
      }, 900);
    } catch (e) {
      showToast((dict.actionFailed || "Action failed") + ": " + e.message, "err");
    } finally {
      setBusy(btn, false);
    }
  };

  // Manual Warm and Clear Cache actions are attached inline with onclick
  // to keep them reliable even after page refresh / browser cache quirks.

  window.sessionResetAction = async function (btn) {
    try {
      setBusy(btn, true);
      showToast((dict.running || "Running...") + " /session/reset", "");

      var j = await callJson("/session/reset");

      showToast((dict.sessionResetOk || "Session reset completed"), "ok");

      setTimeout(function () {
        window.location.reload();
      }, 900);
    } catch (e) {
      showToast((dict.actionFailed || "Action failed") + ": " + e.message, "err");
    } finally {
      setBusy(btn, false);
    }
  };

  var refreshEnabled = document.getElementById("autoRefreshEnabled");
  var refreshSeconds = document.getElementById("autoRefreshSeconds");
  var refreshTimer = null;

  function getRefreshSeconds() {
    var n = parseInt(refreshSeconds && refreshSeconds.value ? refreshSeconds.value : "10", 10);
    if (!isFinite(n) || n < 3) n = 3;
    if (n > 3600) n = 3600;
    return n;
  }

  function saveRefreshPrefs() {
    try {
      localStorage.setItem("extto:autoRefresh", refreshEnabled && refreshEnabled.checked ? "1" : "0");
      localStorage.setItem("extto:autoRefreshSeconds", String(getRefreshSeconds()));
    } catch (_) {}
  }

  function armRefresh() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    saveRefreshPrefs();

    if (!refreshEnabled || !refreshEnabled.checked) return;

    refreshTimer = setTimeout(function () {
      window.location.reload();
    }, getRefreshSeconds() * 1000);
  }

  try {
    var savedEnabled = localStorage.getItem("extto:autoRefresh");
    var savedSeconds = localStorage.getItem("extto:autoRefreshSeconds");

    if (refreshSeconds && savedSeconds) {
      refreshSeconds.value = savedSeconds;
    }

    if (refreshEnabled) {
      refreshEnabled.checked = savedEnabled === "1";
    }
  } catch (_) {}

  if (refreshEnabled) {
    refreshEnabled.addEventListener("change", armRefresh);
  }

  if (refreshSeconds) {
    refreshSeconds.addEventListener("change", armRefresh);
    refreshSeconds.addEventListener("input", function () {
      saveRefreshPrefs();
    });
  }

  armRefresh();
})();
</script>
</body>
</html>`;

  };
}

module.exports = { createSettingsHtml };
