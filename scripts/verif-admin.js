'use strict';
/**
 * Recette de l'administration dans un vrai navigateur : on se connecte,
 * on parcourt les écrans, on modifie un stock, on change le statut d'une
 * commande et on VÉRIFIE que le stock a bougé du bon nombre d'unités —
 * puis qu'il ne rebouge pas si l'on confirme deux fois.
 *
 *   node scripts/verif-admin.js [base] [email] [motdepasse]
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

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


const BASE = process.argv[2] || 'http://localhost:3000';
const EMAIL = process.argv[3] || 'hamza@atlas.tn';
const MDP = process.argv[4] || 'AtlasDemo2026';
const SORTIE = path.join(__dirname, '..', 'captures');
fs.mkdirSync(SORTIE, { recursive: true });

(async () => {
  const nav = await chromium.launch({ executablePath: trouverNavigateur(), args: ['--no-sandbox'] });
  const resultats = [];
  const erreurs = [];

  for (const [nom, viewport] of Object.entries({
    mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    bureau: { width: 1440, height: 900 },
  })) {
    const ctx = await nav.newContext({ viewport, locale: 'fr-FR' });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(`[${nom}] ${m.text()}`); });
    page.on('pageerror', (e) => erreurs.push(`[${nom}] ${e.message}`));

    await page.goto(BASE + '/admin/connexion.html', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(SORTIE, `admin-${nom}-connexion.png`) });
    await page.fill('#email', EMAIL);
    await page.fill('#mot_de_passe', MDP);
    await page.click('[data-valider]');
    await page.waitForURL(/admin\/index/, { timeout: 15000 });
    await page.waitForTimeout(900);
    resultats.push({ appareil: nom, controle: 'connexion', ok: true });

    for (const [etiquette, url] of [
      ['tableau-de-bord', '/admin/index.html'],
      ['produits', '/admin/produits.html'],
      ['stock', '/admin/stock.html'],
      ['commandes', '/admin/commandes.html'],
      ['reglages', '/admin/reglages.html'],
      ['rayons', '/admin/rayons.html'],
      ['clients', '/admin/clients.html'],
      ['promotions', '/admin/promotions.html'],
      ['page-accueil', '/admin/accueil.html'],
    ]) {
      await page.goto(BASE + url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      const debordement = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      resultats.push({ appareil: nom, page: etiquette, debordement_px: debordement });
      await page.screenshot({ path: path.join(SORTIE, `admin-${nom}-${etiquette}.png`) });
    }

    const petites = await page.evaluate(() => {
      const t = [];
      document.querySelectorAll('a, button, input, select').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.width < 44 || r.height < 44) t.push({ balise: el.tagName, classe: el.className, l: Math.round(r.width), h: Math.round(r.height), texte: (el.textContent || '').trim().slice(0, 24) });
      });
      return t;
    });
    resultats.push({ appareil: nom, controle: 'cibles < 44px', nombre: petites.length, details: petites.slice(0, 6) });

    await ctx.close();
  }

  // ---------------------- stock : saisie directe dans la ligne ----------
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erreurs.push('[stock] ' + e.message));
  await page.goto(BASE + '/admin/connexion.html', { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL); await page.fill('#mot_de_passe', MDP);
  await page.click('[data-valider]'); await page.waitForURL(/admin\/index/);

  await page.goto(BASE + '/admin/stock.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const premier = page.locator('[data-variante]').first();
  const varianteId = await premier.getAttribute('data-variante');
  const avant = parseInt(await premier.inputValue(), 10);
  await premier.fill(String(avant + 25));
  await premier.press('Enter');
  await page.waitForTimeout(700);
  const apres = await page.evaluate(async (id) => {
    const l = await (await fetch('/api/admin/stock')).json();
    return l.find((x) => x.variante_id === Number(id)).stock;
  }, varianteId);
  resultats.push({ controle: 'saisie stock', variante: Number(varianteId), avant, attendu: avant + 25, obtenu: apres, ok: apres === avant + 25 });
  await page.screenshot({ path: path.join(SORTIE, 'admin-stock-saisie.png') });

  // -------- commande : le stock ne doit sortir QU'UNE FOIS ---------------
  const cmd = await page.evaluate(async () => {
    const d = await (await fetch('/api/admin/commandes?statut=nouvelle')).json();
    if (!d.commandes.length) return null;
    const c = await (await fetch('/api/admin/commandes/' + d.commandes[0].id)).json();
    return { id: c.id, reference: c.reference, lignes: c.lignes.map((l) => ({ v: l.variante_id, q: l.quantite })) };
  });

  if (cmd) {
    const lire = async (vid) => page.evaluate(async (id) => {
      const l = await (await fetch('/api/admin/stock')).json();
      const t = l.find((x) => x.variante_id === Number(id));
      return t ? t.stock : null;
    }, vid);

    const v = cmd.lignes[0];
    const stock0 = await lire(v.v);
    const majStatut = (s) => page.evaluate(async ({ id, statut }) => {
      const r = await fetch(`/api/admin/commandes/${id}/statut`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut }),
      });
      return r.json();
    }, { id: cmd.id, statut: s });

    const r1 = await majStatut('confirmee');
    const stock1 = await lire(v.v);
    const r2 = await majStatut('en_preparation');   // 2e passage au-delà de « nouvelle »
    const stock2 = await lire(v.v);
    const r3 = await majStatut('annulee');
    const stock3 = await lire(v.v);

    resultats.push({
      controle: 'règle du stock',
      commande: cmd.reference, quantite_commandee: v.q,
      stock_initial: stock0,
      apres_confirmation: stock1, effet_1: r1.stock,
      apres_preparation: stock2, effet_2: r2.stock,
      apres_annulation: stock3, effet_3: r3.stock,
      sort_une_seule_fois: stock1 === stock0 - v.q && stock2 === stock1,
      revient_a_l_annulation: stock3 === stock0,
    });
  }

  // --------------- boutique fermée : 503 pour le visiteur ---------------
  /* On note l'état AVANT de le changer, et on le rétablit dans un finally.
     Sans ce filet, une interruption entre la fermeture et la réouverture
     — trente lignes plus bas — laissait la boutique fermée sans que
     personne ne comprenne pourquoi. C'est arrivé. */
  const etatInitial = await page.evaluate(async () =>
    (await (await fetch('/api/admin/reglages')).json()).valeurs.boutique_ouverte === '1');

  const definirOuverture = (ouverte) => page.evaluate(async (o) => {
    await fetch('/api/admin/boutique/ouverte', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ouverte: o }),
    });
  }, ouverte);

  try {
  await definirOuverture(false);

  const anonyme = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pageAnon = await anonyme.newPage();
  const rep = await pageAnon.goto(BASE + '/', { waitUntil: 'networkidle' });
  await pageAnon.waitForTimeout(500);
  await pageAnon.screenshot({ path: path.join(SORTIE, 'boutique-fermee.png') });
  const refus = await pageAnon.evaluate(async () => {
    const r = await fetch('/api/commande', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panier: [{ variante_id: 1, quantite: 1 }], nom: 'X', telephone: '20000000', adresse: 'a', ville: 'b', gouvernorat: 'Tunis' }),
    });
    return r.status;
  });
  resultats.push({
    controle: 'boutique fermée',
    code_page_visiteur: rep.status(),
    commande_refusee_avec: refus,
    correct: rep.status() === 503 && refus === 503,
  });

  // L'administrateur, lui, traverse le rideau.
  const repAdmin = await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  resultats.push({ controle: 'admin traverse le rideau', code: repAdmin.status(), voit_le_vrai_site: repAdmin.status() === 200 });

  await anonyme.close();
  } finally {
    // Quoi qu'il arrive au-dessus — échec, exception, Ctrl+C — la boutique
    // repart dans l'état où on l'a trouvée.
    await definirOuverture(etatInitial);
    console.error(`  [recette] boutique rétablie : ${etatInitial ? 'ouverte' : 'fermée'}`);
  }
  await ctx.close();
  await nav.close();
  console.log(JSON.stringify({ resultats, erreurs_console: erreurs }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
