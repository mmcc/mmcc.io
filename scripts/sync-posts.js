#!/usr/bin/env node

/**
 * Sync external posts from mux.com and demuxed.com
 * Uses Puppeteer to bypass Vercel bot protection
 *
 * Usage:
 *   npm run sync              # Fetch from web and sync
 *   npm run sync -- --dry-run # Show what would be synced without writing
 */

import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, '../src/content/blog');
const EXTERNAL_POSTS_FILE = join(__dirname, 'external-posts.json');

const AUTHOR_URL = 'https://mux.com/team/matthew-mcclure';
const DEMUXED_POSTS_URL = 'https://demuxed.com/posts';

// Find Chrome executable
function findChrome() {
  const paths = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    process.env.CHROME_PATH,
  ].filter(Boolean);

  for (const p of paths) {
    try {
      execSync(`test -x "${p}"`, { stdio: 'ignore' });
      return p;
    } catch {}
  }

  // Try which
  try {
    return execSync('which google-chrome || which chromium', {
      encoding: 'utf-8',
    }).trim();
  } catch {
    return null;
  }
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
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
    if (!file.endsWith('.md')) continue;
    const content = readFileSync(join(CONTENT_DIR, file), 'utf-8');
    const urlMatch = content.match(/^url:\s*(.+)$/m);
    if (urlMatch) {
      urls.add(urlMatch[1].trim());
    }
  }
  return urls;
}

function parseDate(dateStr) {
  const cleaned = dateStr.trim();
  const date = new Date(cleaned);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }
  return null;
}

async function fetchMuxPosts(browser) {
  console.log(`Fetching Mux posts from ${AUTHOR_URL}...`);

  const page = await browser.newPage();
  await page.goto(AUTHOR_URL, { waitUntil: 'networkidle2', timeout: 30000 });

  // Wait for content to load
  await page.waitForSelector('a[href*="/blog/"]', { timeout: 10000 });

  const posts = await page.evaluate(() => {
    const results = [];
    const seenUrls = new Set();

    document.querySelectorAll('a[href*="/blog/"]').forEach((link) => {
      const href = link.getAttribute('href');
      if (
        !href ||
        href.includes('/category/') ||
        href === '/blog' ||
        href === '/blog/'
      ) {
        return;
      }

      const url = href.startsWith('http') ? href : `https://mux.com${href}`;
      if (seenUrls.has(url)) return;
      seenUrls.add(url);

      const text = link.innerText;
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      let title = null;
      let date = null;

      for (const line of lines) {
        // Look for date
        const dateMatch = line.match(/([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
        if (dateMatch && !date) {
          date = dateMatch[1];
        }

        // Title is usually a longer line that's not metadata
        if (
          !title &&
          !line.match(/^(PUBLISHED|BY\s|.*MIN READ|.*AGO\))/i) &&
          line.length > 15
        ) {
          title = line;
        }
      }

      if (title && date) {
        results.push({ title, date, url });
      }
    });

    return results;
  });

  await page.close();

  // Parse dates and normalize URLs
  const normalizedPosts = posts
    .map((p) => ({
      title: p.title,
      date: parseDate(p.date),
      url: p.url.replace('https://www.mux.com', 'https://mux.com'),
      source: 'mux.com',
    }))
    .filter((p) => p.date);

  console.log(`  Found ${normalizedPosts.length} posts`);
  return normalizedPosts;
}

async function fetchDemuxedPosts(browser) {
  console.log(`Fetching Demuxed posts from ${DEMUXED_POSTS_URL}...`);

  const page = await browser.newPage();
  await page.goto(DEMUXED_POSTS_URL, {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });

  const posts = await page.evaluate(() => {
    const results = [];
    const seenUrls = new Set();

    // Find all post entries
    document.querySelectorAll('a[href*="/posts/"]').forEach((link) => {
      const href = link.getAttribute('href');
      if (!href || href === '/posts' || href === '/posts/') return;

      const url = href.startsWith('http') ? href : `https://demuxed.com${href}`;
      if (seenUrls.has(url)) return;

      // Check parent for author
      const parent = link.closest('li, article, div');
      if (!parent) return;

      const parentText = parent.innerText.toLowerCase();
      if (!parentText.includes('matthew mcclure')) return;

      seenUrls.add(url);

      // Get date from time element
      const timeEl = parent.querySelector('time');
      const dateStr =
        timeEl?.getAttribute('datetime') || timeEl?.innerText || '';

      // Get slug for title
      const slug = href.split('/').pop();

      results.push({ url, dateStr, slug });
    });

    return results;
  });

  await page.close();

  // Process posts
  const normalizedPosts = posts
    .map((p) => {
      const date = parseDate(p.dateStr);
      if (!date) return null;

      let title;
      if (p.slug.includes('newsletter')) {
        const match = p.slug.match(/(\d{4})-(\d{2})-newsletter/);
        if (match) {
          const [, year, month] = match;
          const monthName = new Date(`${year}-${month}-01`).toLocaleString(
            'en',
            { month: 'long' },
          );
          title = `Demuxed Newsletter - ${monthName} ${year}`;
        }
      }

      if (!title) {
        title = p.slug
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }

      return {
        title,
        date,
        url: p.url,
        source: 'demuxed.com',
      };
    })
    .filter(Boolean);

  console.log(`  Found ${normalizedPosts.length} posts`);
  return normalizedPosts;
}

function generateMarkdown(post) {
  const lines = ['---'];
  lines.push(`title: "${post.title.replace(/"/g, '\\"')}"`);
  lines.push(`date: ${post.date}`);
  lines.push(`url: ${post.url}`);
  lines.push(`source: ${post.source}`);
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

function writePost(post, existingUrls) {
  if (existingUrls.has(post.url)) {
    return false;
  }

  const slug = slugify(post.title);
  let filepath = join(CONTENT_DIR, `${slug}.md`);

  let counter = 1;
  while (existsSync(filepath)) {
    filepath = join(CONTENT_DIR, `${slug}-${counter}.md`);
    counter++;
  }

  writeFileSync(filepath, generateMarkdown(post));
  console.log(`  Created: ${filepath.split('/').pop()}`);
  return true;
}

function saveExternalPosts(posts) {
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  writeFileSync(EXTERNAL_POSTS_FILE, `${JSON.stringify(posts, null, 2)}\n`);
  console.log(`\nSaved ${posts.length} posts to external-posts.json`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('Syncing external posts to mmcc.io\n');

  const chromePath = findChrome();
  if (!chromePath) {
    console.error(
      'Could not find Chrome. Set CHROME_PATH or install Chrome/Chromium.',
    );
    process.exit(1);
  }
  console.log(`Using Chrome: ${chromePath}\n`);

  if (!existsSync(CONTENT_DIR)) {
    mkdirSync(CONTENT_DIR, { recursive: true });
  }

  const existingUrls = getExistingUrls();
  console.log(`Found ${existingUrls.size} existing external posts\n`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const allPosts = [];

  try {
    const muxPosts = await fetchMuxPosts(browser);
    allPosts.push(...muxPosts);
  } catch (err) {
    console.error(`Error fetching Mux posts: ${err.message}`);
  }

  try {
    const demuxedPosts = await fetchDemuxedPosts(browser);
    allPosts.push(...demuxedPosts);
  } catch (err) {
    console.error(`Error fetching Demuxed posts: ${err.message}`);
  }

  await browser.close();

  if (allPosts.length === 0) {
    console.log('\nNo posts fetched. Check for errors above.');
    process.exit(1);
  }

  if (!dryRun) {
    saveExternalPosts(allPosts);
  }

  console.log('\nWriting new posts...');
  let added = 0;

  if (dryRun) {
    const newPosts = allPosts.filter((p) => !existingUrls.has(p.url));
    console.log(`Would add ${newPosts.length} new posts:`);
    for (const post of newPosts) {
      console.log(`  - ${post.title} (${post.source})`);
    }
    added = newPosts.length;
  } else {
    for (const post of allPosts) {
      if (writePost(post, existingUrls)) {
        existingUrls.add(post.url);
        added++;
      }
    }
  }

  console.log(`\n${dryRun ? 'Would add' : 'Added'} ${added} new posts. Done!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
