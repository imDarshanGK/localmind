import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  
  console.log("Navigating...");
  await page.goto('http://localhost:3000');
  
  console.log("Typing...");
  await page.fill('textarea', 'Write a long story about artificial intelligence in the future');
  
  console.log("Sending...");
  await page.click('button:has-text("Send")');
  
  console.log("Waiting for Stop button...");
  await page.waitForSelector('button:has-text("Stop")', { timeout: 5000 });
  
  console.log("Waiting 1 second to let stream start...");
  await page.waitForTimeout(1000);
  
  console.log("Clicking Stop...");
  await page.click('button:has-text("Stop")');
  
  console.log("Waiting 2 seconds to see result...");
  await page.waitForTimeout(2000);
  
  console.log("Checking page content...");
  const content = await page.textContent('.bg-gray-800.text-gray-100'); // assistant message
  console.log("Assistant Message:", content);
  
  await browser.close();
})();
