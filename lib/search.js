"use strict";

const RE = Object.freeze({
  numericImdbId: /^\d{5,12}$/,
  nonDigits: /\D+/g,
  imdbId: /^tt\d{5,12}$/i,
  imdbToken: /^\{ImdbId:(tt\d{5,12})\}$/i,
  rawImdbQuery: /^(?:tt)?\d{5,12}$/i,
  colonSpacing: /\s*:\s*/g,
  seasonEpisode: /\bSeason\s*(\d{1,2})\s*(?:Episode|Ep|E)\s*(\d{1,3})\b/gi,
  seasonOnly: /\bSeason\s*(\d{1,2})\b/gi,
  compactSeasonEpisode: /\bS\s*(\d{1,2})\s*E\s*(\d{1,3})\b/gi,
  compactSeasonOnly: /\bS\s*(\d{1,2})\b/gi,
  whitespace: /\s+/g,
  tvToken: /\bS\d{2}(?:E\d{2,3})?\b/i
});

function createSearchHelpers({ getConfig, log }) {
function padNumberText(value, width) {
  const n = String(value || "").replace(RE.nonDigits, "");
  if (!n) return "";
  return n.padStart(width, "0");
}

function buildTvToken(params) {
  const season = padNumberText(params.get("season"), 2);
  const ep = padNumberText(params.get("ep") || params.get("episode"), 2);

  if (season && ep) {
    return `S${season}E${ep}`;
  }

  if (season) {
    return `S${season}`;
  }

  return "";
}

function normalizeImdbId(value) {
  let id = String(value || "").trim();

  // Accept IMDb IDs with or without the "tt" prefix.
  if (RE.numericImdbId.test(id)) {
    id = `tt${id}`;
  }

  if (!RE.imdbId.test(id)) {
    throw new Error("Invalid IMDb ID");
  }

  return id.toLowerCase();
}

function normalizeSearchQueryText(q) {
  return String(q || "")
    // Sonarr/Prowlarr can send "Title : S02". EXT searches work better without the colon.
    .replace(RE.colonSpacing, " ")
    // "Season 2 Episode 4" / "Season 2 Ep 4" / "Season 2 E4" -> "S02E04"
    .replace(RE.seasonEpisode, (_, s, e) => {
      return `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`;
    })
    // "Season 2" -> "S02"
    .replace(RE.seasonOnly, (_, s) => {
      return `S${String(s).padStart(2, "0")}`;
    })
    // "S 2 E 4" / "S2E4" / "S02E4" -> "S02E04"
    .replace(RE.compactSeasonEpisode, (_, s, e) => {
      return `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`;
    })
    // "S 2" / "S2" -> "S02"
    .replace(RE.compactSeasonOnly, (_, s) => {
      return `S${String(s).padStart(2, "0")}`;
    })
    .replace(RE.whitespace, " ")
    .trim();
}

function queryHasTvToken(q) {
  return RE.tvToken.test(String(q || ""));
}

function buildSearchQuery(params) {
  let q = params.get("q") || params.get("search") || "";

  const currentConfig = getConfig();
  if (!q) {
    q = currentConfig.warmQuery || "warm";
  }

  const normalizeTv = currentConfig.stripSeasonFromSearch !== false;
  q = normalizeTv ? normalizeSearchQueryText(q) : String(q).replace(RE.whitespace, " ").trim();

  const tvToken = buildTvToken(params);

  // Prowlarr tvsearch may pass season/ep separately instead of embedding them in q.
  // Keep the season/episode token and normalize it into: "Title S02" or "Title S02E04".
  if (tvToken && !queryHasTvToken(q)) {
    const combined = `${q} ${tvToken}`.replace(RE.whitespace, " ").trim();
    q = normalizeTv ? normalizeSearchQueryText(combined) : combined;
  }

  if (!q) {
    q = currentConfig.warmQuery || "warm";
  }

  log("[query]", "built", JSON.stringify({
    t: params.get("t") || "",
    q,
    season: params.get("season") || "",
    ep: params.get("ep") || params.get("episode") || ""
  }));

  return q;
}

function resolveSearchInputs(params) {
  let imdbId = params.get("imdbid") || params.get("imdb_id") || "";
  let q = String(params.get("q") || params.get("search") || "").trim();

  // Prowlarr can send IMDb IDs either as a raw q value or as {ImdbId:tt...}.
  const tokenMatch = q.match(RE.imdbToken);
  if (tokenMatch) {
    imdbId = imdbId || tokenMatch[1];
    q = "";
  } else if (RE.rawImdbQuery.test(q)) {
    imdbId = q;
    q = "";
  }

  if (imdbId) {
    imdbId = normalizeImdbId(imdbId);
  }

  // Preserve the legacy warm search only when neither criterion was supplied.
  const searchQuery = q
    ? buildSearchQuery(params)
    : (imdbId ? "" : buildSearchQuery(params));

  return { imdbId, searchQuery };
}

function mergeSearchResults(...resultSets) {
  const seen = new Set();
  const merged = [];

  for (const items of resultSets) {
    for (const item of items || []) {
      const key = String(item.id || item.relPath || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}

  return {
    padNumberText,
    buildTvToken,
    normalizeImdbId,
    normalizeSearchQueryText,
    queryHasTvToken,
    buildSearchQuery,
    resolveSearchInputs,
    mergeSearchResults
  };
}

module.exports = { createSearchHelpers };
