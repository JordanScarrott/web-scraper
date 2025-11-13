const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// --- Configuration ---
const START_URL =
    "https://googlechromeai2025.devpost.com/submissions/search?utf8=%E2%9C%93&filter%5Bwhich+category+are+you+submitting+to%3F%5D%5B%5D=chrome+extension";
const OUTPUT_DIR = path.join(__dirname, "projects");

// --- Selectors ---
const GALLERY_ITEM_SELECTOR = "div.gallery-item a.link-to-software";
const NEXT_PAGE_SELECTOR = 'a[rel="next"]';
const DETAIL_CONTENT_SELECTOR = "#app-details-left";
const DETAIL_TITLE_SELECTOR = "h1"; // Relative to the content selector

/**
 * Sanitizes a string to be used as a valid filename.
 * Removes characters that are problematic in Windows, macOS, and Linux filenames.
 * @param {string} title - The project title to sanitize.
 * @returns {string} - A filesystem-safe filename.
 */
function sanitizeTitle(title) {
    if (!title) {
        return `project-${Date.now()}`;
    }
    // Remove problematic characters and trim whitespace
    return title
        .replace(/[<>:"/\\|?*]+/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 150); // Truncate to avoid overly long filenames
}

/**
 * Main scraping function.
 */
async function main() {
    // 1. Create output directory if it doesn't exist
    try {
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
            console.log(`Created output directory: ${OUTPUT_DIR}`);
        }
    } catch (err) {
        console.error(`Error creating directory: ${err.message}`);
        return;
    }

    // 2. Launch browser
    console.log("Launching browser...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    });
    const page = await context.newPage();

    let currentPageUrl = START_URL;
    let pageCount = 1;

    try {
        // 3. Start pagination loop
        while (currentPageUrl) {
            console.log(`\n--- Scraping Page ${pageCount} ---`);
            console.log(`URL: ${currentPageUrl}`);

            if (pageCount === 1) {
                await page.goto(currentPageUrl, {
                    waitUntil: "domcontentloaded",
                });
            }

            // 4. Find all project links on the current page
            await page.waitForSelector(GALLERY_ITEM_SELECTOR, {
                timeout: 10000,
            });
            const projectLocators = page.locator(GALLERY_ITEM_SELECTOR);

            // Get all links first to avoid navigation issues
            const projectLinks = await projectLocators.evaluateAll((list) =>
                list.map((el) => el.href)
            );

            console.log(`Found ${projectLinks.length} projects on this page.`);

            // 5. Iterate through each project link
            for (let i = 0; i < projectLinks.length; i++) {
                const link = projectLinks[i];
                let projectPage;
                try {
                    // Open project in a new tab for stability
                    projectPage = await context.newPage();
                    await projectPage.goto(link, {
                        waitUntil: "domcontentloaded",
                    });

                    // 6. Extract data from the detail page
                    const contentLocator = projectPage.locator(
                        DETAIL_CONTENT_SELECTOR
                    );
                    // await contentLocator.waitFor({
                    // state: "visible",
                    // timeout: 10000,
                    // });

                    // Get title
                    const title = await contentLocator
                        .locator(DETAIL_TITLE_SELECTOR)
                        .textContent();
                    const sanitized = sanitizeTitle(title);

                    // Get all text content
                    const allContent = await contentLocator.textContent();

                    // 7. Save content to file
                    const fileName = `${sanitized}.txt`;
                    const filePath = path.join(OUTPUT_DIR, fileName);

                    fs.writeFileSync(
                        filePath,
                        allContent || "No content found."
                    );
                    console.log(
                        `(${i + 1}/${projectLinks.length}) Saved: ${fileName}`
                    );
                } catch (err) {
                    console.error(
                        `Error scraping project at ${link}: ${err.message}`
                    );
                } finally {
                    if (projectPage) {
                        await projectPage.close(); // Close the project tab
                    }
                }
            }

            // 8. Find and click the "Next" button
            const nextButton = page.locator(NEXT_PAGE_SELECTOR);
            if (await nextButton.isVisible()) {
                console.log("Navigating to next page...");
                await nextButton.click();
                await page.waitForLoadState("domcontentloaded"); // Wait for new page to load
                currentPageUrl = page.url(); // Get new URL for the loop
                pageCount++;
            } else {
                console.log('No "Next" button found. Scraping complete.');
                currentPageUrl = null; // Exit the loop
            }
        }
    } catch (error) {
        console.error(`An error occurred: ${error.message}`);
    } finally {
        // 9. Close browser
        await browser.close();
        console.log("\nBrowser closed. Script finished.");
    }
}

// Run the scraper
main();
