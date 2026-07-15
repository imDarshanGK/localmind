import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const OUT_DIR = path.resolve(__dirname, "../../../demo_videos");

async function captureJapaneseUi() {
  console.log("==========================================");
  console.log("  LocalMind: Japanese UI Demo Capture     ");
  console.log("==========================================");
  console.log(`Application URL: ${APP_URL}`);
  console.log(`Output Directory: ${OUT_DIR}`);

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: "ja-JP",
  });
  const page = await context.newPage();

  try {
    console.log(`Navigating to ${APP_URL}...`);
    await page.goto(APP_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // 1. Open the Settings Panel.
    console.log("Opening Settings Panel...");
    const settingsBtn = page.locator('[data-testid="btn-settings"]');
    await settingsBtn.click();
    await page.waitForSelector('[data-testid="settings-panel"]', {
      state: "visible",
      timeout: 5000,
    });
    await page.waitForTimeout(300);
    console.log("Capturing 1-japanese-settings-default-en.png...");
    await page.screenshot({
      path: path.join(OUT_DIR, "1-japanese-settings-default-en.png"),
    });

    // 2. Switch default language to 日本語
    console.log("Switching default language to 日本語 ...");
    const langDropdown = page.locator('#lang-dropdown');
    await langDropdown.selectOption("ja");
    await page.waitForTimeout(400);
    console.log("Capturing 2-japanese-settings-selected.png...");
    await page.screenshot({
      path: path.join(OUT_DIR, "2-japanese-settings-selected.png"),
    });

    // 3. Save the settings.
    console.log("Saving settings...");
    const saveBtn = page.locator('[data-testid="btn-settings-save"]');
    await saveBtn.click();
    await page.waitForTimeout(500);

    // 4. Open the chat UI in Japanese.
    console.log("Closing settings, opening chat...");
    await settingsBtn.click(); // close settings
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(OUT_DIR, "3-japanese-chat-after-save.png"),
    });

    // 5. Capture sidebar (sidebar.jsx also has 日本語 option).
    console.log("Capturing sidebar with Japanese locale...");
    await page.screenshot({
      path: path.join(OUT_DIR, "4-sidebar-with-ja-option.png"),
      fullPage: false,
      clip: { x: 0, y: 0, width: 256, height: 720 },
    });

    console.log("\nSuccess! Japanese UI demo screenshots captured.");
  } catch (err) {
    console.error("\nError capturing screenshots:", err.message);
    console.error("Please make sure the LocalMind server is running at", APP_URL);
    process.exit(1);
  } finally {
    await browser.close();
    console.log("Browser closed. Finished.");
  }
}

captureJapaneseUi();
