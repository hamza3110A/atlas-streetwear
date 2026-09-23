'use strict';
/**
 * Refait les captures d'écran du guide du commerçant.
 *
 *   npm run captures            (le serveur doit tourner)
 *
 * Pourquoi un script et pas des captures faites à la main : le guide
 * montre l'administration. Le jour où l'administration change d'allure —
 * c'est arrivé au passage en thème clair — les captures montrent un
 * logiciel qui n'existe plus. Le commerçant cherche un bouton noir sur
 * une page devenue blanche et croit s'être trompé de page.
 *
 * Une seule commande les refait toutes, donc plus d'excuse.
 *
 * Ce script FERME la boutique pour photographier la page d'attente, puis
 * la rouvre dans un « finally » — y compris s'il plante en route. Une
 * recette qui laisse la boutique fermée coûte une journée de ventes.
 */
require('./charger-env')();
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const reglages = require('../src/lib/reglages');

function trouverNavigateur() {
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
  console.error('\n  Aucun navigateur trouvé. Indiquez-en un :  set CHROME_PATH=C:\\chemin\\vers\\chrome.exe\n');
  process.exit(2);
}

const BASE  = process.argv[2] || 'http://localhost:3000';
const EMAIL = process.argv[3] || process.env.ADMIN_EMAIL || 'hamza@atlas.tn';
const MDP   = process.argv[4] || process.env.ADMIN_MDP   || 'AtlasDemo2026';
const SORTIE = path.join(__dirname, '..', 'public', 'admin', 'img', 'guide');

/* Exactement les images que guide.html appelle — ni plus, ni moins.
   Une capture que personne n'affiche est un fichier que personne ne
   remplace le jour où elle devient fausse. */
const BUREAU = [
  ['connexion',    '/admin/connexion.html', false],
  ['produits',     '/admin/produits',       true],
  ['stock',        '/admin/stock',          true],
  ['commandes',    '/admin/commandes',      true],
  ['rayons',       '/admin/rayons',         true],
  ['promotions',   '/admin/promotions',     true],
  ['page-accueil', '/admin/accueil.html',   true],
  ['reglages',     '/admin/reglages',       true],
];

async function connecter(page) {
  await page.goto(BASE + '/admin/connexion.html', { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#mot_de_passe', MDP);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/admin(\/|$)/, { timeout: 10000 });
  await page.waitForTimeout(600);
}

/** Ouvre ou ferme la boutique PAR L'API, depuis une page déjà connectée :
 *  c'est le seul chemin que le serveur en cours d'exécution voit. */
async function basculer(page, ouverte) {
  const r = await page.evaluate(async (o) => {
    const rep = await fetch('/api/admin/boutique/ouverte', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ouverte: o }),
    });
    return { code: rep.status, corps: await rep.json().catch(() => ({})) };
  }, ouverte);
  if (r.code !== 200) throw new Error(`Bascule de la boutique refusée (HTTP ${r.code}).`);
  if (r.corps.boutique_ouverte !== ouverte) {
    throw new Error(`Le serveur dit « ${r.corps.boutique_ouverte} », on demandait « ${ouverte} ».`);
  }
}

async function photo(page, nom, largeurMax) {
  const fichier = path.join(SORTIE, nom + '.jpg');
  await page.screenshot({ path: fichier, type: 'jpeg', quality: 82 });
  const ko = Math.round(fs.statSync(fichier).size / 1024);
  console.log(`  ${nom.padEnd(18)} ${String(largeurMax).padStart(4)} px   ${ko} Ko`);
}

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const etatInitial = reglages.booleen('boutique_ouverte');
  let rendu = false;   // vrai dès que la boutique a été rétablie par l'API
  const nav = await chromium.launch({ executablePath: trouverNavigateur(), args: ['--no-sandbox'] });

  try {
    console.log('\n  Captures du guide\n');

    const bureau = await nav.newContext({ viewport: { width: 1280, height: 820 } });
    const p = await bureau.newPage();
    await connecter(p);
    for (const [nom, url] of BUREAU) {
      await p.goto(BASE + url, { waitUntil: 'networkidle' });
      await p.waitForTimeout(700);
      await photo(p, nom, 1280);
    }
    await bureau.close();

    const tel = await nav.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
    const m = await tel.newPage();
    await connecter(m);
    await m.goto(BASE + '/admin/commandes', { waitUntil: 'networkidle' });
    await m.waitForTimeout(700);
    await photo(m, 'mobile-commandes', 390);
    await tel.close();

    /* La page d'attente ne se photographie pas depuis un compte connecté :
       l'administrateur traverse le rideau et voit le vrai site. Il faut un
       navigateur vierge, et la boutique réellement fermée.

       On ferme par l'API, pas en écrivant dans la base.

       Écrire directement dans la base ne suffit PAS quand le serveur
       tourne : il garde les réglages en mémoire et ne les relit pas. La
       première version de ce script écrivait dans le fichier, prenait sa
       photo, et rangeait tranquillement une capture de la boutique
       OUVERTE sous le nom « boutique-fermee.jpg ». Personne ne l'aurait
       vu avant le commerçant. Passer par l'API, c'est emprunter le
       chemin qu'il emprunte lui-même depuis ses Réglages. */
    console.log('\n  Fermeture temporaire pour photographier la page d\'attente…');
    const admin = await nav.newContext({ viewport: { width: 1280, height: 820 } });
    const a = await admin.newPage();
    await connecter(a);
    await basculer(a, false);

    const visiteur = await nav.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
    const v = await visiteur.newPage();
    const rep = await v.goto(BASE + '/', { waitUntil: 'networkidle' });
    await v.waitForTimeout(700);

    /* On ne suppose pas : on vérifie que c'est bien la page d'attente. */
    const estAttente = await v.evaluate(() => !!document.querySelector('.fermee'));
    if (rep.status() !== 503 || !estAttente) {
      throw new Error(`La page d'attente n'a pas été servie (HTTP ${rep.status()}, `
        + `page d'attente ${estAttente ? 'présente' : 'absente'}). Capture non enregistrée.`);
    }
    await photo(v, 'boutique-fermee', 390);
    await visiteur.close();

    await basculer(a, etatInitial);
    await admin.close();
    rendu = true;

  } finally {
    if (!rendu) {
      /* Le navigateur est peut-être mort avant d'avoir pu rouvrir par
         l'API : on écrit alors dans la base et on le dit franchement,
         parce qu'il faudra redémarrer le serveur pour qu'il le voie. */
      reglages.definir('boutique_ouverte', etatInitial ? '1' : '0');
      console.error(`\n  [recette] interruption : « boutique_ouverte » remis à `
        + `« ${etatInitial ? 'ouverte' : 'fermée'} » DANS LA BASE.`);
      console.error('  Redémarrez le serveur pour qu\'il en tienne compte.\n');
    } else {
      console.log(`\n  [recette] boutique rétablie : ${etatInitial ? 'ouverte' : 'fermée'}\n`);
    }
    await nav.close();
  }

  /* Le guide ne doit jamais pointer vers une image absente : on relit son
     HTML et on compare à ce qui existe vraiment sur le disque. */
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin', 'guide.html'), 'utf8');
  const demandees = [...html.matchAll(/\/admin\/img\/guide\/([\w-]+\.jpg)/g)].map((m) => m[1]);
  const presentes = fs.readdirSync(SORTIE);
  const manquantes = demandees.filter((f) => !presentes.includes(f));
  const inutiles   = presentes.filter((f) => !demandees.includes(f));
  if (manquantes.length) { console.error('  MANQUANTES :', manquantes.join(', ')); process.exitCode = 1; }
  if (inutiles.length)   console.log('  Inutilisées (supprimables) :', inutiles.join(', '));
  if (!manquantes.length && !inutiles.length) console.log('  Le guide et les images sont d\'accord.\n');
})();
