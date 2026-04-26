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
    // Heroku වලදී Chrome තියෙන තැන සහ අවහිරතා මගහැරීමට args භාවිතා කරයි
    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'google-chrome-stable'
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });

    try {
        const page = await browser.newPage();
        // Browser එකක් වගේ පෙනී සිටීමට User Agent එකක් දාමු
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Cloudflare Challenge එකට වෙලාව ලබා දීම
        await new Promise(r => setTimeout(r, 6000));

        // Page එකේ Cookies ලබා ගැනීම
        const cookies = await page.cookies();
        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        // Video එකේ direct link එක හෝ download button එකේ link එක සෙවීම
        const directUrl = await page.evaluate(() => {
            const videoTag = document.querySelector('video');
            if (videoTag && videoTag.src) return videoTag.src;
            
            const sourceTag = document.querySelector('source');
            if (sourceTag && sourceTag.src) return sourceTag.src;
            
            return null;
        });

        const userAgent = await page.evaluate(() => navigator.userAgent);

        await browser.close();
        return { directUrl, cookieString, userAgent };

    } catch (e) {
        await browser.close();
        throw e;
    }
}

app.get('/', (req, res) => {
    res.send('Kwik Downloader API is Running!');
});

app.get('/download', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL parameter is missing' });

    try {
        const data = await getKwikDirectData(url);

        if (!data.directUrl) {
            return res.status(500).json({ error: 'Could not extract direct link. Cloudflare block or invalid link.' });
        }

        // Direct link එකෙන් file එක stream කිරීම
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

        // Headers set කිරීම (Download එකක් විදිහට පෙන්වීමට)
        res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }
        res.setHeader('Content-Disposition', `attachment; filename="Kwik_Download.mp4"`);

        response.data.pipe(res);

    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
