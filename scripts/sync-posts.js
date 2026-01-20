#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, "../src/content/blog");
const EXTERNAL_POSTS_FILE = join(__dirname, "external-posts.json");

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function getExistingUrls() {
  if (!existsSync(CONTENT_DIR)) {
    mkdirSync(CONTENT_DIR, { recursive: true });
    return new Set();
  }
  const files = readdirSync(CONTENT_DIR);
  const urls = new Set();
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const content = readFileSync(join(CONTENT_DIR, file), "utf-8");
    const urlMatch = content.match(/^url:\s*(.+)$/m);
    if (urlMatch) {
      urls.add(urlMatch[1].trim());
    }
  }
  return urls;
}

async function fetchPage(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (res.status === 429) {
        const wait = (i + 1) * 5000;
        console.log(`  Rate limited, waiting ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function fetchMuxPosts() {
  console.log("Fetching Mux posts...");
  let html;
  try {
    html = await fetchPage("https://mux.com/team/matthew-mcclure");
  } catch (err) {
    console.log(`  Could not fetch Mux author page: ${err.message}`);
    return [];
  }
  const $ = cheerio.load(html);

  const posts = [];
  const seenUrls = new Set();

  $('a[href^="/blog/"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href === "/blog" || href === "/blog/") return;

    const url = `https://mux.com${href}`;
    if (seenUrls.has(url)) return;
    seenUrls.add(url);

    posts.push({ url, href });
  });

  const fullPosts = [];
  for (const post of posts) {
    try {
      console.log(`  Fetching ${post.href}...`);
      const postHtml = await fetchPage(post.url);
      const $post = cheerio.load(postHtml);

      const title = $post("h1").first().text().trim();
      const dateText =
        $post("time").attr("datetime") ||
        $post('p:contains("Published on")')
          .text()
          .match(/(\w+ \d+, \d{4})/)?.[1];

      const description =
        $post('meta[name="description"]').attr("content") ||
        $post("main p").first().text().trim().slice(0, 200);

      if (title && dateText) {
        const date = new Date(dateText);
        if (!Number.isNaN(date.getTime())) {
          fullPosts.push({
            title,
            date: date.toISOString().split("T")[0],
            description: description || undefined,
            url: post.url,
            source: "mux.com",
          });
        }
      }

      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`  Error fetching ${post.url}: ${err.message}`);
    }
  }

  return fullPosts;
}

async function fetchDemuxedPosts() {
  console.log("Fetching Demuxed posts...");
  let html;
  try {
    html = await fetchPage("https://demuxed.com/posts");
  } catch (err) {
    console.log(`  Could not fetch Demuxed posts: ${err.message}`);
    return [];
  }
  const $ = cheerio.load(html);

  const posts = [];
  const seenUrls = new Set();

  $('a[href^="/posts/"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href === "/posts" || href === "/posts/") return;

    const url = `https://demuxed.com${href}`;
    if (seenUrls.has(url)) return;
    seenUrls.add(url);

    posts.push({ url, href });
  });

  const fullPosts = [];
  for (const post of posts) {
    try {
      console.log(`  Fetching ${post.href}...`);
      const postHtml = await fetchPage(post.url);
      const $post = cheerio.load(postHtml);

      const pageText = postHtml.toLowerCase();
      if (
        !pageText.includes("matt mcclure") &&
        !pageText.includes("matthew mcclure") &&
        !pageText.includes("@matt_mcclure")
      ) {
        continue;
      }

      const title = $post("h1").first().text().trim();
      const dateText =
        $post("time").attr("datetime") || $post("time").text().trim();

      const description =
        $post('meta[name="description"]').attr("content") ||
        $post("article p").first().text().trim().slice(0, 200);

      if (title && dateText) {
        const date = new Date(dateText);
        if (!Number.isNaN(date.getTime())) {
          fullPosts.push({
            title,
            date: date.toISOString().split("T")[0],
            description: description || undefined,
            url: post.url,
            source: "demuxed.com",
          });
        }
      }

      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`  Error fetching ${post.url}: ${err.message}`);
    }
  }

  return fullPosts;
}

function loadExternalPosts() {
  if (!existsSync(EXTERNAL_POSTS_FILE)) {
    return [];
  }
  const content = readFileSync(EXTERNAL_POSTS_FILE, "utf-8");
  return JSON.parse(content);
}

function generateMarkdown(post) {
  const lines = ["---"];
  lines.push(`title: "${post.title.replace(/"/g, '\\"')}"`);
  if (post.description) {
    const desc = post.description.replace(/"/g, '\\"').replace(/\n/g, " ");
    lines.push(`description: "${desc}"`);
  }
  lines.push(`date: ${post.date}`);
  lines.push(`url: ${post.url}`);
  lines.push(`source: ${post.source}`);
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

function writePost(post, existingUrls) {
  if (existingUrls.has(post.url)) {
    return false;
  }

  const slug = slugify(post.title);
  const filename = `${slug}.md`;
  let filepath = join(CONTENT_DIR, filename);

  let counter = 1;
  while (existsSync(filepath)) {
    filepath = join(CONTENT_DIR, `${slug}-${counter}.md`);
    counter++;
  }

  const content = generateMarkdown(post);
  writeFileSync(filepath, content);
  console.log(`Created: ${filepath.split("/").pop()}`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const skipFetch = args.includes("--skip-fetch");

  console.log("Syncing external posts to mmcc.io\n");

  if (!existsSync(CONTENT_DIR)) {
    mkdirSync(CONTENT_DIR, { recursive: true });
  }

  const existingUrls = getExistingUrls();
  console.log(`Found ${existingUrls.size} existing external posts\n`);

  let added = 0;

  // Load external posts from JSON
  const externalPosts = loadExternalPosts();
  if (externalPosts.length > 0) {
    console.log(
      `Loading ${externalPosts.length} posts from external-posts.json...`,
    );
    for (const post of externalPosts) {
      if (writePost(post, existingUrls)) {
        existingUrls.add(post.url);
        added++;
      }
    }
    console.log("");
  }

  // Fetch new posts from web (unless skipped)
  if (!skipFetch) {
    try {
      const muxPosts = await fetchMuxPosts();
      console.log(`Found ${muxPosts.length} Mux posts online\n`);
      for (const post of muxPosts) {
        if (writePost(post, existingUrls)) {
          existingUrls.add(post.url);
          added++;
        }
      }
    } catch (err) {
      console.error(`Error fetching Mux posts: ${err.message}\n`);
    }

    try {
      const demuxedPosts = await fetchDemuxedPosts();
      console.log(`Found ${demuxedPosts.length} Demuxed posts online\n`);
      for (const post of demuxedPosts) {
        if (writePost(post, existingUrls)) {
          existingUrls.add(post.url);
          added++;
        }
      }
    } catch (err) {
      console.error(`Error fetching Demuxed posts: ${err.message}\n`);
    }
  }

  console.log(`\nAdded ${added} new posts. Done!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
