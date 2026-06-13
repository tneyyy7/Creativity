import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:5173';
const EMAIL = 'ebovsunovsky@gmail.com';
const PASS = 'Cektop241207!';
const OUT = new URL('./public/screens/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const shot = async (page, name, wait = 1500) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log('shot', name);
};

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('i18nextLng', 'en');
    localStorage.setItem('language', 'en');
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(4000);

  // Explore
  await page.getByText('Explore', { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(2500);

  // Scroll the explore feed to reveal a wall of real artwork
  await page.mouse.wheel(0, 700);
  await shot(page, '10-explore-art');
  await page.mouse.wheel(0, 700);
  await shot(page, '11-explore-art2');

  // Open a rich creator profile — click a "Follow"-card creator name.
  for (const name of ['Artur', 'Tasha', 'puppsia', 'Montik']) {
    const el = page.getByText(name, { exact: false }).first();
    if (await el.count()) {
      await el.click().catch(() => {});
      await page.waitForTimeout(2800);
      break;
    }
  }
  await shot(page, '12-creator-profile');
  await page.mouse.wheel(0, 600);
  await shot(page, '13-creator-gallery');

  // Click the first artwork image to open the post/lightbox.
  const img = page.locator('main img, article img').nth(2);
  if (await img.count()) {
    await img.click().catch(() => {});
    await shot(page, '14-post-detail');
  }

  await browser.close();
  console.log('DONE');
};

run().catch((e) => { console.error(e); process.exit(1); });
