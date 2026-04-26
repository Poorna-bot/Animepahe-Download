import express from 'express';
import axios from 'axios';
import cors from 'cors';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

async function getKwikDirectData(url) {
    const browser = await puppeteer.launch({
        headless: "new",
        // Heroku වලදී Chrome සොයා ගැනීමට ඇති ක්‍රම කිහිපයම මෙහි ඇතුලත් කර ඇත
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'google-chrome-stable' || '/app/.apt/usr/bin/google-chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log(`Bypassing: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Cloudflare challenge එකට කාලය ලබා දීම
        await new Promise(r => setTimeout(r, 8000));

        const cookies = await page.cookies();
        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        const directUrl = await page.evaluate(() => {
            return document.querySelector('video')?.src || document.querySelector('source')?.src || null;
        });

        const userAgent = await page.evaluate(() => navigator.userAgent);

        await browser.close();
        return { directUrl, cookieString, userAgent };

    } catch (e) {
        if (browser) await browser.close();
        throw e;
    }
}

app.get('/', (req, res) => res.send('Kwik Downloader API Status: Online 🚀'));

app.get('/download', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL missing' });

    try {
        const data = await getKwikDirectData(url);
        if (!data.directUrl) throw new Error('Could not find video source');

        const response = await axios({
            method: 'GET',
            url: data.directUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': data.userAgent,
                'Referer': 'https://kwik.cx/',
                'Cookie': data.cookieString
            }
        });

        res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="Kwik_Video.mp4"`);
        response.data.pipe(res);

    } catch (error) {
        console.error("API Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
