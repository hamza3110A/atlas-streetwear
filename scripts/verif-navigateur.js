'use strict';
/**
 * Vérification dans un vrai navigateur : on clique, on commande, on
 * regarde ce que voit un visiteur non connecté. Ce script n'est PAS
 * nécessaire au fonctionnement de la boutique ; il sert au développement
 * et à la recette avant livraison.
 *
 *   node scripts/verif-navigateur.js [http://localhost:3000]
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const BASE = process.argv[2] || 'http://localhost:3000';

/* La porte du pays s'ouvre au PREMIER passage, quand deux pays sont
   servis, et son voile intercepte tous les clics. Depuis l'ouverture des
   Émirats, cette recette ne pouvait plus cliquer sur rien : elle
   échouait sur le burger, sans rapport avec la mise en page.
   On pose donc le cookie du marché AVANT la première page — exactement
   ce que fait un visiteur qui a déjà répondu. Le parcours de la porte
   elle-même se vérifie dans scripts/recette. */
function cookieMarche(base, code) {
  const u = new URL(base);
  return [{ name: 'marche', value: code, domain: u.hostname, path: '/' }];
}

const SORTIE = path.join(__dirname, '..', 'captures');
fs.mkdirSync(SORTIE, { recursive: true });

/** Le navigateur de test : Linux en conteneur, ailleurs on cherche celui
 *  du système. Sans ce garde-fou, l'échec est un ENOENT illisible sur un
 *  chemin Linux qui n'existe évidemment pas sous Windows. */
function trouverNavigateur() {
  const fs = require('node:fs');
  const candidats = [
    process.env.CHROME_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe' : null,
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/chromium', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const c of candidats) { try { if (fs.existsSync(c)) return c; } catch { /* suivant */ } }
  console.error('\n  Aucun navigateur trouvé pour la vérification automatique.');
  console.error('  Indiquez-en un :  set CHROME_PATH=C:\\chemin\\vers\\chrome.exe');
  console.error('  (ces scripts servent à la recette ; la boutique elle-même n\'en a pas besoin)\n');
  process.exit(2);
}

const EXE = trouverNavigateur();

const APPAREILS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  bureau: { width: 1440, height: 900, deviceScaleFactor: 1 },
};

(async () => {
  const navigateur = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const resultats = [];
  const erreursConsole = [];

  for (const [nom, viewport] of Object.entries(APPAREILS)) {
    const contexte = await navigateur.newContext({ viewport, locale: 'fr-FR', storageState: { cookies: cookieMarche(BASE, 'tn'), origins: [] } });
    const page = await contexte.newPage();
    page.on('console', (m) => { if (m.type() === 'error') erreursConsole.push(`[${nom}] ${m.text()}`); });
    page.on('pageerror', (e) => erreursConsole.push(`[${nom}] ${e.message}`));

    const pages = [
      ['accueil', '/'],
      ['boutique', '/boutique'],
      ['produit', '/produit/tee-shirt-sommet'],
      ['panier', '/panier'],
      ['commande', '/commande'],
      ['mentions', '/mentions-legales'],
    ];

    for (const [etiquette, chemin] of pages) {
      await page.goto(BASE + chemin, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      // Défilement horizontal : le corps de page ne doit JAMAIS déborder.
      const mesure = await page.evaluate(() => {
        const L = document.documentElement.clientWidth;
        // Le débordement de page ne suffit pas : body a overflow-x: hidden,
        // donc un texte trop large est ROGNÉ au lieu de faire défiler. On
        // cherche aussi les éléments qui dépassent le cadre en silence.
        const rognes = [];
        document.querySelectorAll('h1, h2, h3, p, span, a, button, td, li').forEach((el) => {
          if (el.children.length) return;
          const r = el.getBoundingClientRect();
          if (r.width === 0) return;
          // Le tiroir fermé est volontairement hors cadre à gauche : ce
          // n'est pas un rognage. On ne regarde donc que le bord droit,
          // et on ignore les conteneurs qui défilent par eux-mêmes.
          if (r.right > L + 1) {
            if (el.closest('.tiroir, .voile, .table-boite, .barre-filtres, .ruban')) return;
            rognes.push({ texte: (el.textContent || '').trim().slice(0, 28), droite: Math.round(r.right), cadre: L });
          }
        });
        return {
          debordement: document.documentElement.scrollWidth - L,
          rognes: rognes.slice(0, 5),
        };
      });
      resultats.push({ appareil: nom, page: etiquette, debordement_px: mesure.debordement,
        ...(mesure.rognes.length ? { textes_rognes: mesure.rognes } : {}) });
      await page.screenshot({ path: path.join(SORTIE, `${nom}-${etiquette}.png`), fullPage: false });
    }

    // --- cibles tactiles trop petites -----------------------------------
    await page.goto(BASE + '/produit/tee-shirt-sommet', { waitUntil: 'networkidle' });
    const petites = await page.evaluate(() => {
      const trop = [];
      document.querySelectorAll('a, button, input, select, [role="button"]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;              // masqué
        if (r.width < 44 || r.height < 44) {
          trop.push({ balise: el.tagName, classe: el.className, l: Math.round(r.width), h: Math.round(r.height),
            texte: (el.textContent || '').trim().slice(0, 30) });
        }
      });
      return trop;
    });
    resultats.push({ appareil: nom, controle: 'cibles < 44px', nombre: petites.length, details: petites.slice(0, 8) });

    await contexte.close();
  }

  // ------------------------------------------------------- menu mobile
  const ctx = await navigateur.newContext({ viewport: APPAREILS.mobile, locale: 'fr-FR', storageState: { cookies: cookieMarche(BASE, 'tn'), origins: [] } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/boutique', { waitUntil: 'networkidle' });
  await page.click('.burger');
  await page.waitForTimeout(400);
  const ouvert = await page.evaluate(() => document.querySelector('.tiroir').classList.contains('ouvert'));
  await page.screenshot({ path: path.join(SORTIE, 'mobile-menu.png') });
  // On referme par le bouton ☰ devenu ✕ : c'est le geste réel de
  // l'utilisateur, et c'est lui qui échouait quand le tiroir recouvrait
  // l'en-tête.
  await page.click('.burger');
  await page.waitForTimeout(400);
  const fermeParBouton = await page.evaluate(() => !document.querySelector('.tiroir').classList.contains('ouvert'));
  // Puis par le voile, en tapant la bande visible à droite du tiroir.
  await page.click('.burger');
  await page.waitForTimeout(300);
  const boite = await page.evaluate(() => {
    const t = document.querySelector('.tiroir').getBoundingClientRect();
    return { x: Math.round(t.right + (window.innerWidth - t.right) / 2), y: 300 };
  });
  await page.mouse.click(boite.x, boite.y);
  await page.waitForTimeout(400);
  const fermeParVoile = await page.evaluate(() => !document.querySelector('.tiroir').classList.contains('ouvert'));
  resultats.push({ controle: 'menu ☰', ouvre: ouvert, ferme_par_bouton: fermeParBouton, ferme_par_voile: fermeParVoile });

  // ------------------------------------------ parcours de commande réel
  await page.goto(BASE + '/produit/tee-shirt-sommet', { waitUntil: 'networkidle' });
  await page.click('.taille:not([disabled])');
  await page.click('[data-ajouter]');
  await page.waitForTimeout(300);
  await page.goto(BASE + '/panier', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const totalPanier = await page.textContent('[data-total]');
  await page.screenshot({ path: path.join(SORTIE, 'mobile-panier-rempli.png'), fullPage: true });

  await page.goto(BASE + '/commande', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.fill('#nom', 'Client Test');
  await page.fill('#telephone', '20123456');
  await page.fill('#adresse', '12 rue des Oliviers, imm. B, 3e étage');
  await page.selectOption('#gouvernorat', 'Tunis');
  await page.fill('#ville', 'La Marsa');
  await page.screenshot({ path: path.join(SORTIE, 'mobile-commande.png'), fullPage: true });
  await page.click('[data-valider]');
  await page.waitForURL(/\/merci/, { timeout: 15000 });
  await page.waitForTimeout(500);
  const reference = await page.textContent('[data-reference]');
  const totalPaye = await page.textContent('[data-total]');
  await page.screenshot({ path: path.join(SORTIE, 'mobile-merci.png'), fullPage: true });
  resultats.push({ controle: 'commande réelle', reference: reference.trim(), total_panier: totalPanier.trim(), total_page_merci: totalPaye.trim() });

  await ctx.close();
  await navigateur.close();

  console.log(JSON.stringify({ resultats, erreurs_console: erreursConsole }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
