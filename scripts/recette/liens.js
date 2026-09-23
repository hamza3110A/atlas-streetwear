/* Tous les liens internes du site, toutes les routes, tous les en-têtes.
   Un lien mort ne se voit pas depuis le bureau du développeur : il se voit
   le jour où un client clique dessus. */
const { chromium } = require('playwright-core');
const { demarrer, arreter } = require('./serveur');

const NAV = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const B = 'http://localhost:3000';
const R = [];
const dit = (t, ok, d) => { R.push({ t, ok, d }); console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${t}${d ? `\n      \x1b[90m${d}\x1b[0m` : ''}`); };

(async () => {
  const srv = await demarrer();
  const nav = await chromium.launch({ executablePath: NAV, args: ['--no-sandbox'] });
  try {
    // --- 1. récolter tous les liens internes de toutes les pages ---------
    console.log('\n─── liens internes ───');
    const p = await nav.newPage({ viewport: { width: 1366, height: 900 } });
    const aVisiter = ['/', '/boutique', '/panier', '/commande', '/merci',
      '/mentions-legales', '/conditions-de-vente', '/livraison-et-retours', '/contact'];
    const liens = new Set();
    for (const u of aVisiter) {
      await p.goto(B + u, { waitUntil: 'networkidle' });
      await p.waitForTimeout(500);
      (await p.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')))).forEach((h) => {
        if (!h || h.startsWith('http') || h.startsWith('mailto:') || h.startsWith('tel:') || h.startsWith('#')) return;
        liens.add(h.split('#')[0]);
      });
    }
    await p.close();

    const morts = [];
    for (const l of [...liens].sort()) {
      const r = await fetch(B + l, { redirect: 'manual' });
      if (r.status >= 400) morts.push(`${r.status} ${l}`);
    }
    dit(`${liens.size} liens internes distincts, tous vivants`, morts.length === 0, morts.join(' | ') || 'aucun lien mort');

    // --- 2. codes de réponse attendus -----------------------------------
    console.log('\n─── réponses du serveur ───');
    const attendus = [
      ['/', 200], ['/boutique', 200], ['/panier', 200], ['/commande', 200], ['/merci', 200],
      ['/mentions-legales', 200], ['/conditions-de-vente', 200], ['/livraison-et-retours', 200],
      ['/contact', 200], ['/robots.txt', 200], ['/favicon.png', 200],
      ['/api/boutique', 200], ['/api/produits', 200],
      ['/nimporte-quoi', 404], ['/api/nimporte-quoi', 404],
      ['/admin', 302], ['/admin/produits', 302], ['/api/admin/produits', 401],
      ['/.env', 404], ['/data/boutique.db', 404], ['/src/server.js', 404],
      ['/package.json', 404],
    ];
    const faux = [];
    for (const [u, c] of attendus) {
      const r = await fetch(B + u, { redirect: 'manual' });
      if (r.status !== c) faux.push(`${u} → ${r.status} (attendu ${c})`);
    }
    dit(`${attendus.length} routes répondent comme prévu`, faux.length === 0, faux.join(' | ') || 'toutes conformes');

    // --- 3. en-têtes ------------------------------------------------------
    console.log('\n─── en-têtes ───');
    const h = (await fetch(B + '/')).headers;
    const secu = {
      'x-content-type-options': 'nosniff',
      'x-frame-options': null, 'referrer-policy': null, 'content-security-policy': null,
    };
    const manquants = Object.keys(secu).filter((k) => !h.get(k));
    dit('en-têtes de sécurité présents', manquants.length === 0, manquants.join(', ') || Object.keys(secu).join(', '));

    const caches = [
      ['/', 'no-cache'], ['/css/atlas.css', 'max-age=0'], ['/js/atlas.js', 'max-age=0'],
      ['/img/hero-desktop-2.jpg', 'max-age=86400'], ['/fonts/montserrat-400.woff2', 'immutable'],
    ];
    const mauvais = [];
    for (const [u, attendu] of caches) {
      const c = (await fetch(B + u)).headers.get('cache-control') || '';
      if (!c.includes(attendu)) mauvais.push(`${u} → « ${c} » (attendu ${attendu})`);
    }
    dit('politique de cache cohérente', mauvais.length === 0, mauvais.join(' | ') || caches.map((x) => x[0]).join(', '));

    // --- 4. la CSP autorise-t-elle vraiment ce que la page charge ? -------
    const p2 = await nav.newPage({ viewport: { width: 1366, height: 900 } });
    const bloques = [];
    p2.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) bloques.push(m.text().slice(0, 110)); });
    for (const u of ['/', '/boutique', '/panier', '/commande']) {
      await p2.goto(B + u, { waitUntil: 'networkidle' });
      await p2.waitForTimeout(500);
    }
    // les polices se chargent-elles réellement ? (mesure : largeur du texte)
    await p2.goto(B + '/', { waitUntil: 'networkidle' });
    const polices = await p2.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`);
    });
    await p2.close();
    dit('aucune ressource bloquée par la CSP', bloques.length === 0, bloques.join(' | ') || 'aucune');
    dit('les polices sont réellement chargées', polices.every((f) => f.endsWith('loaded')) && polices.length > 0, polices.join(', '));

    // --- 5. boutique fermée ----------------------------------------------
    console.log('\n─── rideau « boutique fermée » ───');
    const admin = await nav.newPage({ viewport: { width: 1366, height: 900 } });
    await admin.goto(B + '/admin/connexion.html', { waitUntil: 'networkidle' });
    await admin.fill('#email', 'hamza@atlas.tn');
    await admin.fill('#mot_de_passe', 'AtlasDemo2026');
    await admin.click('button[type=submit]');
    /* « /admin/connexion.html » contient « /admin/ » : attendre cette
       expression, c'est ne rien attendre du tout. On demande la session. */
    await admin.waitForTimeout(1500);
    const session = await admin.evaluate(async () => {
      const r = await fetch('/api/session');
      return { code: r.status, corps: await r.json().catch(() => ({})) };
    });
    dit('connexion à l\'administration', !!(session.corps && session.corps.utilisateur),
      session.corps && session.corps.utilisateur ? session.corps.utilisateur.email
        : `HTTP ${session.code} — ${JSON.stringify(session.corps).slice(0, 90)} (url : ${admin.url()})`);
    const bascule = (o) => admin.evaluate(async (v) => (await fetch('/api/admin/boutique/ouverte', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ouverte: v }),
    })).status, o);

    let rendu = false;
    try {
      const codeBascule = await bascule(false);
      dit('l\'interrupteur de fermeture répond', codeBascule === 200, `HTTP ${codeBascule}`);
      await new Promise((r) => setTimeout(r, 400));
      const visiteur = await nav.newContext();
      await visiteur.addCookies([{ name: 'marche', value: 'tn', domain: 'localhost', path: '/' }]);
      const v = await visiteur.newPage();
      const rep = await v.goto(B + '/', { waitUntil: 'networkidle' });
      dit('page d\'attente servie en 503, jamais 200', rep.status() === 503, `HTTP ${rep.status()}`);
      const cmd = await v.evaluate(async () => (await fetch('/api/commande', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ panier: [{ variante_id: 1, quantite: 1 }], nom: 'X', telephone: '20112233', adresse: 'X', ville: 'X', gouvernorat: 'X' }),
      })).status);
      dit('commande refusée côté serveur quand c\'est fermé', cmd === 503, `HTTP ${cmd}`);
      const robots = await (await fetch(B + '/robots.txt')).text();
      dit('robots.txt interdit tout site fermé', robots.includes('Disallow: /\n'), robots.trim().replace(/\n/g, ' | '));
      const rAdmin = await admin.goto(B + '/', { waitUntil: 'networkidle' });
      dit('l\'administrateur connecté traverse le rideau', rAdmin.status() === 200, `HTTP ${rAdmin.status()}`);
      await visiteur.close();
      await bascule(true);
      rendu = true;
    } finally {
      if (!rendu) { await bascule(true).catch(() => {}); console.error('  [recette] réouverture de secours'); }
    }
    const apres = await (await fetch(B + '/')).status;
    dit('boutique rouverte à la fin de la recette', apres === 200, `HTTP ${apres}`);
    await admin.close();
  } finally { await nav.close(); arreter(srv); }

  const ko = R.filter((x) => !x.ok);
  console.log(`\n  ${R.length - ko.length}/${R.length} contrôles passés.`);
  if (ko.length) { console.log('  ÉCHECS :'); ko.forEach((x) => console.log('   -', x.t, '—', x.d)); process.exitCode = 1; }
})();
