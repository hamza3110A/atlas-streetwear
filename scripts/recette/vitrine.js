/* Recette de la vitrine : chaque page publique sur cinq largeurs.
   On ne regarde pas une capture, on interroge le navigateur. */
const { chromium } = require('playwright-core');
const { demarrer, arreter } = require('./serveur');
const fs = require('node:fs');

const NAV = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const B = 'http://localhost:3000';

const LARGEURS = [
  [360, 780, 'téléphone étroit'],
  [390, 844, 'téléphone'],
  [768, 1024, 'tablette'],
  [1366, 768, 'portable'],
  [1856, 940, 'grand écran'],
];

const AUDIT = () => {
  const lum = (s) => {
    const m = s.match(/[\d.]+/g); if (!m) return null;
    const f = (x) => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; };
    return .2126 * f(+m[0]) + .7152 * f(+m[1]) + .0722 * f(+m[2]);
  };
  /* Le fond réel d'un texte n'est pas « la première couleur trouvée en
     remontant » : un calque à 80 % d'opacité laisse passer 20 % de ce qui
     est dessous. Ma première version sautait ces calques et comparait un
     texte BLANC au fond BLANC de la carte située derrière — 1,04:1
     annoncé pour une étiquette parfaitement lisible. On compose donc les
     couches, comme le navigateur. */
  const lire = (s) => {
    const m = s && s.match(/[\d.]+/g);
    if (!m || s === 'transparent') return null;
    return { r: +m[0], v: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 };
  };
  const poser = (dessus, dessous) => ({
    r: dessus.r * dessus.a + dessous.r * (1 - dessus.a),
    v: dessus.v * dessus.a + dessous.v * (1 - dessus.a),
    b: dessus.b * dessus.a + dessous.b * (1 - dessus.a),
    a: 1,
  });
  const fondDe = (el) => {
    const couches = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // photo : mesure au pixel ailleurs
      const c = lire(cs.backgroundColor);
      if (!c || c.a === 0) continue;
      couches.push(c);
      if (c.a >= .999) break;
    }
    let fond = { r: 255, v: 255, b: 255, a: 1 };
    for (let i = couches.length - 1; i >= 0; i--) fond = poser(couches[i], fond);
    return `rgb(${fond.r}, ${fond.v}, ${fond.b})`;
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const res = {
    debordement: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    contraste: [], cibles: [], rognes: [], imagesSansAlt: [], titres: [],
    imagesCassees: [], liensVides: [], fauxCliquables: [],
  };

  // --- contraste ---------------------------------------------------------
  document.querySelectorAll('body *').forEach((el) => {
    const t = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim()).join(' ');
    if (!t || !visible(el)) return;
    if (el.closest('[data-sur-photo]')) return;   // jugé au pixel, pas au calcul
    const cs = getComputedStyle(el);
    const fond = fondDe(el);
    if (!fond) return;
    const lc = lum(cs.color), lf = lum(fond);
    if (lc === null || lf === null) return;
    const c = (Math.max(lc, lf) + .05) / (Math.min(lc, lf) + .05);
    const px = parseFloat(cs.fontSize), gras = parseInt(cs.fontWeight, 10) >= 700;
    const seuil = (px >= 24 || (gras && px >= 18.66)) ? 3 : 4.5;
    if (c < seuil) res.contraste.push({ texte: t.slice(0, 40), cls: el.className.toString().slice(0, 28), px: Math.round(px), c: +c.toFixed(2), seuil });
  });

  // --- cibles tactiles ---------------------------------------------------
  document.querySelectorAll('a[href], button, input, select, textarea, [role=button], summary').forEach((el) => {
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // marge négative compensée : on mesure la boîte réelle
    if (r.width < 44 || r.height < 44) {
      res.cibles.push({ balise: el.tagName, cls: el.className.toString().slice(0, 28),
        texte: (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 30),
        l: Math.round(r.width), h: Math.round(r.height) });
    }
  });

  // --- texte rogné (overflow:hidden qui coupe en silence) ----------------
  document.querySelectorAll('body *').forEach((el) => {
    if (!visible(el)) return;
    const cs = getComputedStyle(el);
    if (cs.overflow === 'visible' && cs.overflowX === 'visible') return;
    /* Trois dépassements sont VOULUS, et les confondre avec un défaut
       finit par faire ignorer tout le rapport :
       .ruban      — le bandeau défilant, plus large que l'écran par nature ;
       .hors-ecran — un titre réservé aux lecteurs d'écran, réduit à 1 px ;
       .heros-titre— le titre masqué sur grand écran, incrusté dans l'image. */
    if (el.matches('.ruban, .ruban *, .hors-ecran, .heros-titre, .heros-titre *')) return;
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
      const t = (el.textContent || '').trim();
      if (t) res.rognes.push({ cls: el.className.toString().slice(0, 28), de: el.scrollWidth, a: el.clientWidth, texte: t.slice(0, 30) });
    }
  });

  // --- images ------------------------------------------------------------
  document.querySelectorAll('img').forEach((img) => {
    if (img.getAttribute('alt') === null) res.imagesSansAlt.push(img.src.split('/').pop());
    if (img.complete && img.naturalWidth === 0) res.imagesCassees.push(img.src);
  });

  // --- titres : pas de saut de niveau ------------------------------------
  let prec = 0;
  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
    if (!visible(h)) return;
    const n = +h.tagName[1];
    if (prec && n > prec + 1) res.titres.push({ saut: `h${prec} → h${n}`, texte: h.textContent.trim().slice(0, 34) });
    prec = n;
  });

  // --- liens sans destination utile --------------------------------------
  document.querySelectorAll('a').forEach((a) => {
    if (!visible(a)) return;
    const h = a.getAttribute('href');
    if (!h || h === '#' || h === 'javascript:void(0)') res.liensVides.push(a.textContent.trim().slice(0, 30));
    if (!a.textContent.trim() && !a.getAttribute('aria-label') && !a.querySelector('img[alt]:not([alt=""])')) {
      res.liensVides.push('(lien sans intitulé) ' + h);
    }
  });

  // --- « a l'air cliquable sans l'être » ---------------------------------
  document.querySelectorAll('body *').forEach((el) => {
    if (!visible(el)) return;
    if (el.closest('a, button, label, summary, [role=button], [onclick]')) return;
    if (getComputedStyle(el).cursor === 'pointer') {
      res.fauxCliquables.push({ balise: el.tagName, cls: el.className.toString().slice(0, 28) });
    }
  });

  return res;
};

const PAGES = [
  ['/', 'accueil'], ['/boutique', 'boutique'], ['/panier', 'panier'],
  ['/commande', 'commande'], ['/merci', 'merci'],
  ['/mentions-legales', 'mentions'], ['/conditions-de-vente', 'cgv'],
  ['/livraison-et-retours', 'livraison'], ['/contact', 'contact'],
  ['/page-qui-nexiste-pas', '404'],
];

(async () => {
  const srv = await demarrer();
  const nav = await chromium.launch({ executablePath: NAV, args: ['--no-sandbox'] });
  const rapport = [];
  try {
    // une fiche produit réelle
    const slugs = await (await fetch(B + '/api/produits')).json();
    const unProduit = slugs.produits && slugs.produits[0] ? '/produit?slug=' + slugs.produits[0].slug : null;
    if (unProduit) PAGES.splice(2, 0, [unProduit, 'fiche produit']);

    for (const [l, h, nomEcran] of LARGEURS) {
      const ctx = await nav.newContext({ viewport: { width: l, height: h }, isMobile: l < 700, hasTouch: l < 700, deviceScaleFactor: l < 700 ? 2 : 1 });
      /* Pays déjà choisi : sinon la porte recouvre chaque page et on
         mesurerait la mise en page du dialogue, pas celle du site. */
      await ctx.addCookies([{ name: 'marche', value: 'tn', domain: 'localhost', path: '/' }]);
      for (const [url, nomPage] of PAGES) {
        const page = await ctx.newPage();
        const console_ = [], reseau = [];
        page.on('console', (m) => {
          if (m.type() !== 'error') return;
          if (nomPage === '404' && /status of 404/.test(m.text())) return;
          console_.push(m.text().slice(0, 120));
        });
        page.on('pageerror', (e) => console_.push('JS: ' + String(e).slice(0, 120)));
        // La page 404 répond 404 : c'est la bonne réponse, pas une anomalie.
        page.on('response', (r) => {
          if (r.status() < 400) return;
          const u = r.url().replace(B, '');
          if (nomPage === '404' && u === url) return;
          reseau.push(r.status() + ' ' + u);
        });
        let code = 0;
        try { const r = await page.goto(B + url, { waitUntil: 'networkidle', timeout: 20000 }); code = r ? r.status() : 0; }
        catch (e) { console_.push('NAVIGATION: ' + String(e).slice(0, 100)); }
        await page.waitForTimeout(500);
        let a = {};
        try { a = await page.evaluate(AUDIT); } catch (e) { a = { erreurAudit: String(e).slice(0, 120) }; }
        rapport.push({ ecran: nomEcran, l, page: nomPage, url, code, console: console_, reseau, ...a });
        await page.close();
      }
      await ctx.close();
      process.stderr.write(`  ${nomEcran} (${l}px) fait\n`);
    }
  } finally {
    await nav.close();
    arreter(srv);
  }
  fs.writeFileSync(__dirname + '/vitrine.json', JSON.stringify(rapport, null, 1));
  console.log('écrit .recette/vitrine.json —', rapport.length, 'combinaisons page × écran');
})();
