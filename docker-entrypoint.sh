#!/bin/sh
set -eu

if [ -n "${FLARESOLVERR_URL:-}" ]; then
  node <<'NODE'
const fs = require("fs");
const path = require("path");

const configDir = process.env.CONFIG_DIR || "/config";
const configFile = path.join(configDir, "config.json");
fs.mkdirSync(configDir, { recursive: true });

let config = {};
try {
  config = JSON.parse(fs.readFileSync(configFile, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

config.flaresolverrUrl = process.env.FLARESOLVERR_URL.trim();
fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");
NODE
fi

exec node server.js
