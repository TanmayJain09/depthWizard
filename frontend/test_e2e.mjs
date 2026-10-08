import { chromium } from 'playwright';
import path from 'path';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`BROWSER ${msg.type().toUpperCase()}:`, msg.text());
    } else {
      console.log('BROWSER LOG:', msg.text());
    }
  });

  page.on('request', request => {
    const url = request.url();
    if (url.includes('127.0.0.1:8000') || url.includes('/api/v1/')) {
      console.log('NETWORK REQUEST:', request.method(), url);
    }
  });

  page.on('response', response => {
    const url = response.url();
    if (url.includes('127.0.0.1:8000') || url.includes('/api/v1/')) {
      console.log('NETWORK RESPONSE:', response.status(), url);
    }
  });

  try {
    await page.goto('http://localhost:5174');
    console.log('Page loaded');
    
    // Wait for the app to initialize
    await page.waitForTimeout(1000);

    // Disable mock mode if it's active
    const mockBadge = await page.$('.mock-badge, [title*="Mock"]');
    if (mockBadge) {
      console.log('Mock mode detected. We need to disable it in settings.');
      // Click settings
      await page.click('button:has(svg.lucide-settings)');
      await page.waitForTimeout(500);
      
      const isMockChecked = await page.$eval('input[type="checkbox"]', el => (el).checked).catch(() => false);
      if (isMockChecked) {
        await page.click('input[type="checkbox"]');
      }
      await page.fill('input[type="text"]', 'http://127.0.0.1:8000');
      await page.click('button:has-text("Save Settings")');
      await page.waitForTimeout(500);
    }

    // Find file input and upload
    console.log('Uploading file...');
    const fileInput = await page.$('input[type="file"].file-input');
    if (!fileInput) throw new Error('File input not found');
    
    await fileInput.setInputFiles(path.resolve('public/mock/dsm_relative.png'));
    
    // Wait for upload flow
    await page.waitForTimeout(500);
    
    // Check if pixel size input exists (since it's a PNG)
    const pixelInput = await page.$('input[type="number"]');
    if (pixelInput) {
      await pixelInput.fill('0.5');
    }

    console.log('Clicking Process Image...');
    await page.click('button:has-text("Process Image")');
    
    console.log('Waiting for job to complete (up to 30s)...');
    
    // We can wait for the canvas to appear or for the status to be done
    await page.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes('Export 3D Mesh') || text.includes('Error') || text.includes('Failed');
    }, { timeout: 30000 });
    
    console.log('Job finished. Checking results...');
    
    // Wait a bit to catch any delayed requests or errors
    await page.waitForTimeout(3000);
    
  } catch (err) {
    console.error('TEST ERROR:', err);
  } finally {
    await browser.close();
  }
})();
