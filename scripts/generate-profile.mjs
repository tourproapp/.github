#!/usr/bin/env node
/**
 * Regenerates the Projects table in profile/README.md.
 *
 * Lists the org's public repos (excluding forks, archived repos, and this
 * profile repo) and rewrites the table between the projects:start and
 * projects:end markers. profile/projects.json holds an "include" list that
 * forces a repo into the table (e.g. a fork that is our own project) and
 * "overrides" for custom description cells; otherwise the repo's GitHub
 * description is used.
 *
 * Run locally with: node scripts/generate-profile.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ORG = "tourproapp";
const PROFILE_REPO = ".github";
const START = "<!-- projects:start -->";
const END = "<!-- projects:end -->";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const readmePath = join(repoRoot, "profile", "README.md");
const overridesPath = join(repoRoot, "profile", "projects.json");

async function listPublicRepos() {
  const headers = { "User-Agent": `${ORG}-profile-readme` };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const repos = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://api.github.com/orgs/${ORG}/repos?type=public&per_page=100&page=${page}`,
      { headers }
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    repos.push(...batch);
    if (batch.length < 100) return repos;
  }
}

function loadConfig() {
  try {
    const parsed = JSON.parse(readFileSync(overridesPath, "utf8"));
    return { include: parsed.include ?? [], overrides: parsed.overrides ?? {} };
  } catch {
    return { include: [], overrides: {} };
  }
}

const { include, overrides } = loadConfig();
const included = new Set(include);

const repos = (await listPublicRepos())
  .filter((r) => !r.archived && r.name !== PROFILE_REPO && (!r.fork || included.has(r.name)))
  .sort((a, b) => a.name.localeCompare(b.name));
const rows = repos.map((r) => {
  const desc = (overrides[r.name] ?? r.description ?? "").replace(/\|/g, "\\|");
  return `| [${r.name}](${r.html_url}) | ${desc} |`;
});

const table = [START, "| Repo | What it is |", "| --- | --- |", ...rows, END].join("\n");

const readme = readFileSync(readmePath, "utf8");
const pattern = new RegExp(`${START}[\\s\\S]*?${END}`);
if (!pattern.test(readme)) {
  throw new Error(`Markers ${START} / ${END} not found in ${readmePath}`);
}

const updated = readme.replace(pattern, table);
if (updated === readme) {
  console.log("profile/README.md already up to date");
} else {
  writeFileSync(readmePath, updated);
  console.log("profile/README.md updated");
}
