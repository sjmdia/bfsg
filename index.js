import express from 'express';
import puppeteer from 'puppeteer';
import { readFile } from 'fs/promises';
import cors from 'cors';

const app = express();
app.use(cors());

app.get('/scan', async (req, res) => {
  const url = req.query.url;
  if (!url || !url.startsWith('http')) {
    return res.status(400).send('❌ Ungültige URL');
  }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

    const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
    await page.evaluate(axeSource);

    const axeResults = await page.evaluate(async () => {
      return await axe.run(document, {
        runOnly: ['wcag2a', 'wcag2aa'],
      });
    });

    const result = await page.evaluate(() => {
      const hasSkipLink = !!document.querySelector('a[href^=\"#\"]');
      const tabbable = [...document.querySelectorAll('a, button, input, select, textarea')].filter(el => el.offsetParent !== null);
      const headings = [...document.querySelectorAll('h1, h2, h3')];
      const hasAria = document.querySelectorAll('[aria-label], [role]').length > 0;

      return {
        hasSkipLink,
        tabbableCount: tabbable.length,
        headingsCount: headings.length,
        hasAria
      };
    });

    let output = `🔍 Ergebnis für ${url}\n`;
    output += result.hasSkipLink ? '✅ Skip-Link gefunden\n' : '❌ Kein Skip-Link vorhanden\n';
    output += result.headingsCount > 0 ? `✅ Überschriftenstruktur vorhanden (${result.headingsCount})\n` : '❌ Keine Überschriften gefunden\n';
    output += `✅ Fokusierbare Elemente: ${result.tabbableCount}\n`;
    output += result.hasAria ? '✅ ARIA-Rollen vorhanden\n' : '❌ Keine ARIA-Rollen gefunden\n';

    output += "\n🧪 WCAG-Analyse (axe-core):\n";
    if (axeResults.violations.length > 0) {
      axeResults.violations.forEach(v => {
        output += `❌ ${v.id}: ${v.help}\n`;
        v.nodes.forEach(n => output += `  → ${n.html}\n`);
      });
    } else {
      output += "✅ Keine WCAG A/AA-Verstöße gefunden.\n";
    }

    res.send(output);
  } catch (err) {
    res.status(500).send('❌ Fehler beim Prüfen: ' + err.message);
  } finally {
    await browser.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API läuft auf Port ${PORT}`));
