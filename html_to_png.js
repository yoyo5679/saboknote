const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const targetDirs = [
    '/Users/hong-eunseong/Documents/안티그래비티/saboksnote/cardnews',
    '/Users/hong-eunseong/Documents/안티그래비티/saboksnote/honeydata/카드뉴스/files'
];

async function main() {
    console.log('Starting HTML to PNG conversion for Instagram...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    for (const dir of targetDirs) {
        if (!fs.existsSync(dir)) {
            console.log(`Directory not found: ${dir}`);
            continue;
        }
        
        console.log(`Scanning directory: ${dir}`);
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

        for (const file of files) {
            const htmlPath = path.join(dir, file);
            const baseName = path.basename(file, '.html');
            const outputDir = path.join(dir, baseName);
            
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            console.log(`Processing file: ${file}...`);
            const page = await browser.newPage();
            
            // Set deviceScaleFactor to 2.25 so a 480x600 element is rendered as 1080x1350.
            await page.setViewport({
                width: 600,
                height: 800,
                deviceScaleFactor: 2.25
            });

            await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

            // Ensure web fonts are completely loaded
            await page.evaluateHandle('document.fonts.ready');
            // Give extra time for any CSS entrance animations to settle
            await new Promise(r => setTimeout(r, 1000));

            const cardElement = await page.$('.card');
            if (!cardElement) {
                console.log(`  No .card element found in ${file}. Skipping.`);
                await page.close();
                continue;
            }

            // Hide UI elements that shouldn't be captured (if they overlay or interfere)
            await page.evaluate(() => {
                const nav = document.querySelector('.nav');
                if (nav) nav.style.display = 'none';
                const ctr = document.querySelector('.ctr');
                if (ctr) ctr.style.display = 'none';
                // Also ensure the body padding/margin doesn't mess up the card screenshot
                document.body.style.margin = '0';
                document.body.style.padding = '0';
            });

            const slidesCount = await page.evaluate(() => document.querySelectorAll('.slide').length);
            console.log(`  Found ${slidesCount} slides.`);

            for (let i = 0; i < slidesCount; i++) {
                // Activate only the current slide
                await page.evaluate((idx) => {
                    const slides = document.querySelectorAll('.slide');
                    slides.forEach((s, j) => {
                        if (j === idx) s.classList.add('on');
                        else s.classList.remove('on');
                    });
                }, i);

                // Wait for any CSS transitions (e.g. fade-in/out) to finish
                await new Promise(r => setTimeout(r, 400));

                const slideNum = (i + 1).toString().padStart(2, '0');
                const shotPath = path.join(outputDir, `slide_${slideNum}.png`);
                
                await cardElement.screenshot({ path: shotPath });
                console.log(`  -> Saved ${shotPath}`);
            }

            await page.close();
        }
    }

    await browser.close();
    console.log('✅ Conversion completed.');
}

main().catch(err => {
    console.error('Error during conversion:', err);
    process.exit(1);
});
