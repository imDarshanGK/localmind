import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_URL = process.env.APP_URL || "http://localhost:3000";

const OUT_DIR = path.resolve(__dirname, "../../../screenshots");

async function captureScreenshots() {
  console.log("==========================================");
  console.log("  LocalMind Automated Screenshot Capture  ");
  console.log("==========================================");
  console.log(`Application URL: ${APP_URL}`);
  console.log(`Output Directory: ${OUT_DIR}`);

  if (!fs.existsSync(OUT_DIR)) {
    console.log(`Creating output directory: ${OUT_DIR}`);
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log("\nLaunching headless Chromium browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  try {
    console.log(`Navigating to ${APP_URL}...`);
    await page.goto(APP_URL, { waitUntil: "networkidle" });

    await page.waitForTimeout(1000);

    // 1. 
    console.log("Capturing 1-main-chat.png...");
    await page.screenshot({ path: path.join(OUT_DIR, "1-main-chat.png") });

    // 2. 
    console.log("Opening Docs Panel...");
    const docsBtn = page.locator('[data-testid="btn-docs"]');
    await docsBtn.click();
    await page.waitForSelector('[data-testid="upload-panel"]', { state: "visible", timeout: 5000 });
    await page.waitForTimeout(300);
    console.log("Capturing 2-docs-panel.png...");
    await page.screenshot({ path: path.join(OUT_DIR, "2-docs-panel.png") });

    // 3. 
    console.log("Opening Plugins Panel...");
    const pluginsBtn = page.locator('[data-testid="btn-plugins"]');
    await pluginsBtn.click();
    await page.waitForSelector('[data-testid="plugins-panel"]', { state: "visible", timeout: 5000 });
    await page.waitForTimeout(300);
    console.log("Capturing 3-plugins-panel.png...");
    await page.screenshot({ path: path.join(OUT_DIR, "3-plugins-panel.png") });

    // 4. 
    console.log("Opening Settings Panel...");
    const settingsBtn = page.locator('[data-testid="btn-settings"]');
    await settingsBtn.click();
    await page.waitForSelector('[data-testid="settings-panel"]', { state: "visible", timeout: 5000 });
    await page.waitForTimeout(300);
    console.log("Capturing 4-settings-panel.png...");
    await page.screenshot({ path: path.join(OUT_DIR, "4-settings-panel.png") });

    console.log("\nSuccess! All key UI states captured successfully.");
  } catch (err) {
    console.error("\nError capturing screenshots:", err.message);
    console.error("Please make sure the LocalMind server is running at", APP_URL);
    process.exit(1);
  } finally {
    await browser.close();
    console.log("Browser closed. Finished.");
  }
}

captureScreenshots();
