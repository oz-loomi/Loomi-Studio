import puppeteer from 'puppeteer';
import sharp from 'sharp';

export async function renderCampaignScreenshotFromHtml(params: {
  html: string;
  filename?: string;
}): Promise<{ image: Buffer; contentType: string; filename: string }> {
  const { html, filename = 'campaign-screenshot.png' } = params;

  if (!html.trim()) {
    throw new Error('Preview HTML is empty');
  }

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 10000, deviceScaleFactor: 2 });
    await page.setContent(html, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: 15000,
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
