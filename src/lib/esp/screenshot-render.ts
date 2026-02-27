import puppeteerCore, { type Browser } from 'puppeteer-core';
import sharp from 'sharp';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Launch a headless Chromium browser.
 *
 * In production (serverless / VPS without Chrome), uses @sparticuz/chromium
 * which bundles a lightweight Chromium binary.
 * In development, uses the locally-installed Chromium from the `puppeteer` package.
 */
async function launchBrowser(): Promise<Browser> {
  if (IS_PRODUCTION) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    }) as Promise<Browser>;
  }

  // Development: use full puppeteer's bundled Chromium
  const puppeteer = (await import('puppeteer')).default;
  return puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  }) as unknown as Promise<Browser>;
}

export async function renderCampaignScreenshotFromHtml(params: {
  html: string;
  filename?: string;
}): Promise<{ image: Buffer; contentType: string; filename: string }> {
  const { html, filename = 'campaign-screenshot.png' } = params;

  if (!html.trim()) {
    throw new Error('Preview HTML is empty');
  }

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
    await page.setContent(html, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: 15000,
    });

    // Prevent vh/percentage-based layouts from stretching; measure true content height
    await page.evaluate(() => {
      document.documentElement.style.height = 'auto';
      document.body.style.height = 'auto';
      document.body.style.overflow = 'visible';
    });

    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const imgs = Array.from(document.querySelectorAll('img'));
        if (imgs.length === 0) {
          resolve();
          return;
        }
        let loaded = 0;
        const check = () => {
          if (++loaded >= imgs.length) resolve();
        };
        imgs.forEach((img) => {
          if (img.complete) check();
          else {
            img.addEventListener('load', check);
            img.addEventListener('error', check);
          }
        });
        setTimeout(resolve, 3000);
      });
    });

    await new Promise((r) => setTimeout(r, 300));

    // Resize viewport to match actual content height before capturing
    const contentHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    await page.setViewport({
      width: 1280,
      height: contentHeight,
      deviceScaleFactor: 2,
    });

    const rawScreenshot = await page.screenshot({
      type: 'png',
      fullPage: true,
    });

    await browser.close();
    browser = null;

    const imgBuffer = Buffer.from(rawScreenshot);
    const { data: rawPixels, info } = await sharp(imgBuffer)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const WHITE_THRESHOLD = 250;

    let lastContentRow = height - 1;
    for (let y = height - 1; y >= 0; y--) {
      let rowHasContent = false;
      for (let x = 0; x < width; x += 4) {
        const offset = (y * width + x) * channels;
        const r = rawPixels[offset];
        const g = rawPixels[offset + 1];
        const b = rawPixels[offset + 2];
        if (r < WHITE_THRESHOLD || g < WHITE_THRESHOLD || b < WHITE_THRESHOLD) {
          rowHasContent = true;
          break;
        }
      }
      if (rowHasContent) {
        lastContentRow = y;
        break;
      }
    }

    const cropHeight = Math.min(lastContentRow + 33, height);
    const trimmed = await sharp(imgBuffer)
      .extract({ left: 0, top: 0, width, height: cropHeight })
      .toBuffer();

    return {
      image: trimmed,
      contentType: 'image/png',
      filename,
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore close errors
      }
    }
  }
}
