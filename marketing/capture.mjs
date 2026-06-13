import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:5173';
const EMAIL = 'ebovsunovsky@gmail.com';
const PASS = 'Cektop241207!';
const OUT = new URL('./public/screens/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const VW = 1440, VH = 900;

const shot = async (page, name) => {
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log('shot', name);
};

const clickTab = async (page, label) => {
  // Sidebar nav buttons carry the label text. Click the first visible match.
  const el = page.getByText(label, { exact: true }).first();
  try {
    await el.click({ timeout: 4000 });
  } catch {
    console.log('!! could not click', label);
  }
  await page.waitForTimeout(1600);
};

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    locale: 'en-US',
    deviceScaleFactor: 2,
  });
  // Force the app into English before any script runs.
  await ctx.addInitScript(() => {
    localStorage.setItem('i18nextLng', 'en');
    localStorage.setItem('language', 'en');
  });
  const page = await ctx.newPage();

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // If we're on signup (confirm-password present), switch to login.
  const pwInputs = await page.locator('input[type="password"]').count();
  if (pwInputs > 1) {
    await page.getByText(/sign in|log in/i).first().click().catch(() => {});
    await page.waitForTimeout(600);
  }

  // Login
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(4000);
  await page.waitForLoadState('networkidle').catch(() => {});

  await shot(page, '01-feed');

  await clickTab(page, 'Explore');
  await shot(page, '02-explore');

  await clickTab(page, 'Gallery');
  await shot(page, '03-gallery');

  await clickTab(page, 'Ranks');
  await shot(page, '04-ranks');

  await clickTab(page, 'Productivity');
  await shot(page, '05-productivity');

  await clickTab(page, 'Creativity Pro');
  await shot(page, '06-pro');

  // Profile (often an avatar/profile button — try label then fallback)
  await clickTab(page, 'Profile');
  await shot(page, '07-profile');

  await browser.close();
  console.log('DONE');
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
