import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const text = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("development site has objective accessibility and brand gates", async () => {
  const html = await text("index.html");
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<a class="skip-link"/);
  assert.match(html, /<main id="main">/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /site\/assets\/owncloud-logo\.svg/);
  assert.match(html, /Deploy ownCloud <small>by Kiteworks<\/small>/);
  assert.match(html, /noindex,nofollow/);
});

test("every critical public fact is present without JavaScript", async () => {
  const html = await text("index.html");
  for (const fact of [
    "Deploy ownCloud by Kiteworks", "maximum 20 users", "Collabora is the only office integration",
    "NFSv4.2", "No warranties", "Limitation of liability", "Community Preview"
  ]) assert.ok(html.includes(fact), fact);
});

test("LLM discovery file is supplemental and policy complete", async () => {
  const llms = await text("llms.txt");
  const robots = await text("robots.txt");
  assert.match(llms, /Supplemental, non-standard/);
  for (const section of ["Deployment constraints", "EULA", "Support and maturity", "Documentation"]) {
    assert.match(llms, new RegExp(`## ${section}`));
  }
  assert.match(robots, /User-agent: OAI-SearchBot/);
  assert.match(robots, /User-agent: GPTBot/);
});

test("production accessibility bar is explicit", async () => {
  const roadmap = await text("docs/LAUNCH_GATES.md");
  const readme = await text("README.md");
  assert.match(readme + roadmap, /access|brand|runtime/i);
});
