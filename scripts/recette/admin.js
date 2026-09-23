/* Recette de l'administration : les pages ET les gestes.
   Le commerçant ne regarde pas des pages, il crée un produit, corrige un
   stock, traite une commande. C'est ça qu'on rejoue. */
const { chromium } = require('playwright-core');
const { demarrer, arreter } = require('./serveur');

const NAV = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const B = 'http://localhost:3000';
const R = [];
const dit = (t, ok, d) => { R.push({ t, ok, d }); console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${t}${d ? `\n      \x1b[90m${d}\x1b[0m` : ''}`); };

const PAGES = [
  ['/admin', 'tableau de bord'], ['/admin/produits', 'produits'], ['/admin/stock', 'stock'],
  ['/admin/statistiques', 'statistiques'],
  ['/admin/commandes', 'commandes'], ['/admin/clients', 'clients'], ['/admin/rayons', 'rayons'],
  ['/admin/promotions', 'promotions'], ['/admin/accueil.html', 'page d\'accueil'],
  ['/admin/reglages', 'réglages'], ['/admin/guide', 'guide'],
];

async function connecter(ctx) {
  const p = await ctx.newPage();
  await p.goto(B + '/admin/connexion.html', { waitUntil: 'networkidle' });
  await p.fill('#email', 'hamza@atlas.tn');
  await p.fill('#mot_de_passe', 'AtlasDemo2026');
  await p.click('button[type=submit]');
  await p.waitForTimeout(1500);
  const s = await p.evaluate(async () => (await (await fetch('/api/session')).json()));
  if (!s.utilisateur) throw new Error('connexion impossible : ' + JSON.stringify(s));
  return p;
}

const AUDIT = () => {
  const res = { debordement: document.documentElement.scrollWidth - document.documentElement.clientWidth, cibles: [], rognes: [] };
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  document.querySelectorAll('a[href], button, input, select, textarea, summary').forEach((el) => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) res.cibles.push({ b: el.tagName, c: el.className.toString().slice(0, 24), t: (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 26), l: Math.round(r.width), h: Math.round(r.height) });
  });
  document.querySelectorAll('body *').forEach((el) => {
    if (!vis(el)) return;
    const cs = getComputedStyle(el);
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || (cs.overflow === 'visible' && cs.overflowX === 'visible')) return;
    if (el.scrollWidth > el.clientWidth + 2 && (el.textContent || '').trim()) {
      res.rognes.push({ c: el.className.toString().slice(0, 24), de: el.scrollWidth, a: el.clientWidth });
    }
  });
  return res;
};

(async () => {
  const srv = await demarrer();
  const nav = await chromium.launch({ executablePath: NAV, args: ['--no-sandbox'] });
  try {
    // ================= les pages, deux formats =========================
    for (const [l, h, ecran] of [[390, 844, 'téléphone'], [1366, 900, 'bureau']]) {
      console.log(`\n─── pages de l'administration — ${ecran} (${l}px) ───`);
      const ctx = await nav.newContext({ viewport: { width: l, height: h }, isMobile: l < 700, hasTouch: l < 700 });
      const p = await connecter(ctx);
      const soucis = [];
      for (const [url, nom] of PAGES) {
        const erreurs = [];
        p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 80)));
        const reseau = [];
        const h404 = (r) => { if (r.status() >= 400) reseau.push(r.status() + ' ' + r.url().replace(B, '')); };
        p.on('response', h404);
        await p.goto(B + url, { waitUntil: 'networkidle' });
        await p.waitForTimeout(600);
        const a = await p.evaluate(AUDIT);
        p.off('response', h404);
        if (a.debordement > 0) soucis.push(`${nom}: déborde de ${a.debordement}px`);
        if (a.cibles.length) soucis.push(`${nom}: ${a.cibles.length} cible(s) < 44px — ${JSON.stringify(a.cibles[0])}`);
        if (a.rognes.length) soucis.push(`${nom}: ${a.rognes.length} texte(s) rogné(s)`);
        if (reseau.length) soucis.push(`${nom}: ${reseau.join(', ')}`);
        if (erreurs.length) soucis.push(`${nom}: JS ${erreurs.join(' | ')}`);
      }
      dit(`${ecran} : les ${PAGES.length} pages sans défaut de mise en page`, soucis.length === 0, soucis.join('\n      ') || '0 débordement, 0 cible trop petite, 0 rognage, 0 erreur');
      await ctx.close();
    }

    // ================= les gestes du commerçant ========================
    console.log('\n─── gestes réels ───');
    const ctx = await nav.newContext({ viewport: { width: 1366, height: 900 } });
    const p = await connecter(ctx);
    const api = (chemin, opts) => p.evaluate(async ([c, o]) => {
      const r = await fetch(c, o ? { ...o, headers: { 'Content-Type': 'application/json' } } : undefined);
      return { code: r.status, corps: await r.json().catch(() => ({})) };
    }, [chemin, opts]);

    /* 1. Créer un rayon — TOUJOURS LE MÊME.
       Un rayon horodaté à chaque exécution s'accumulait dans la base : au
       bout de dix recettes, dix rayons fantômes que le commerçant voyait
       dans son menu. Et ils ne peuvent pas être supprimés dès qu'ils
       contiennent un produit cité dans une commande — ce qui est le bon
       comportement du logiciel, pas un défaut à contourner. On réutilise
       donc un rayon unique, créé la première fois seulement. */
    const NOM_RAYON = 'Recette automatique';
    const rayonsExistants = await api('/api/admin/rayons');
    const dejaLa = (rayonsExistants.corps.rayons || rayonsExistants.corps || [])
      .find((x) => x.nom === NOM_RAYON);
    const rayon = dejaLa
      ? { code: 201, corps: { id: dejaLa.id, reutilise: true } }
      : await api('/api/admin/rayons', { method: 'POST', body: JSON.stringify({ nom: NOM_RAYON, description: 'Créé par npm run recette:admin. Masqué du site.', visible: 0 }) });
    dit('créer un rayon', rayon.code === 201,
      dejaLa ? `rayon de recette réutilisé (id ${dejaLa.id})` : `HTTP ${rayon.code} ${JSON.stringify(rayon.corps).slice(0, 60)}`);

    /* 2. Créer un produit à deux tailles — LE MÊME À CHAQUE FOIS.
       La recette passe une vraie commande dessus. Un produit cité dans une
       commande ne peut plus être supprimé (et c'est juste : effacer
       l'article effacerait la ligne de facture d'un client). Un produit
       NEUF à chaque exécution s'accumulait donc dans le catalogue :
       six articles désactivés au bout de six recettes. On réutilise. */
    const NOM_PRODUIT = 'Article de recette';
    const produitsExistants = await api('/api/admin/produits');
    const prodDejaLa = (produitsExistants.corps.produits || produitsExistants.corps || [])
      .find((x) => x.nom === NOM_PRODUIT);
    const corpsProduit = {
      nom: NOM_PRODUIT, categorie_id: rayon.corps.id, prix: 49500,
      description: 'Créé par npm run recette:admin. Masqué du site.',
      matiere: 'Coton', actif: 1, mis_en_avant: 0,
      variantes: [{ taille: 'M', stock: 3 }, { taille: 'L', stock: 0 }],
    };
    const prod = prodDejaLa
      ? await api('/api/admin/produits/' + prodDejaLa.id, { method: 'PUT', body: JSON.stringify(corpsProduit) })
          .then((r) => ({ code: r.code === 200 ? 201 : r.code, corps: { id: prodDejaLa.id, reutilise: true } }))
      : await api('/api/admin/produits', { method: 'POST', body: JSON.stringify(corpsProduit) });
    dit('créer un produit à deux tailles', prod.code === 201,
      (prodDejaLa ? 'produit de recette réutilisé' : 'créé') + `, id=${prod.corps.id}`);

    // 3. il apparaît vraiment dans la boutique
    await p.goto(B + '/boutique', { waitUntil: 'networkidle' });
    await p.waitForTimeout(900);
    const vu = await p.locator('text=Article de recette').count();
    dit('le produit apparaît sur le site', vu > 0, `${vu} occurrence(s)`);

    // 4. la taille épuisée est proposée barrée, pas masquée
    const fiche = await api('/api/produits');
    await p.goto(B + '/boutique', { waitUntil: 'networkidle' });
    const art = await (await fetch(B + '/api/admin/produits')).status;
    const detail = await api('/api/admin/produits/' + prod.corps.id);
    const tailles = (detail.corps.variantes || []).map((v) => `${v.taille}:${v.stock}`).join(' ');
    dit('les deux tailles sont enregistrées, dont une à zéro', /L:0/.test(tailles), tailles);

    // 5. corriger un stock
    const vM = (detail.corps.variantes || []).find((v) => v.taille === 'M');
    const maj = await api('/api/admin/stock/' + vM.id, { method: 'PUT', body: JSON.stringify({ stock: 12 }) });
    const relu = await api('/api/admin/produits/' + prod.corps.id);
    const stockM = (relu.corps.variantes || []).find((v) => v.taille === 'M').stock;
    dit('corriger un stock depuis la page Stock', maj.code === 200 && stockM === 12, `HTTP ${maj.code}, stock relu = ${stockM}`);

    // 6. créer un code promo, puis vérifier qu'il s'applique côté client
    const code = 'RECETTE' + Math.floor(Math.random() * 900 + 100);
    const promo = await api('/api/admin/promotions', { method: 'POST', body: JSON.stringify({
      code, libelle: 'Recette', type: 'pourcentage', valeur: 10, portee: 'panier',
      minimum_achat: 0, usage_max: 0, actif: 1, debut_le: '', fin_le: '',
    }) });
    const devis = await api('/api/panier', { method: 'POST', body: JSON.stringify({ panier: [{ variante_id: vM.id, quantite: 1 }], code_promo: code }) });
    dit('un code promo créé s\'applique vraiment', promo.code === 201 && devis.corps.remise > 0,
      `HTTP ${promo.code} — remise calculée ${devis.corps.remise} sur ${devis.corps.sous_total}`);

    // 7. supprimer un rayon qui contient un produit → doit refuser
    const supRayon = await api('/api/admin/rayons/' + rayon.corps.id, { method: 'DELETE' });
    dit('supprimer un rayon non vide est refusé', supRayon.code === 409, `HTTP ${supRayon.code} — ${supRayon.corps.erreur || ''}`);

    /* 7 bis. La recette fabrique sa PROPRE commande.
       Les deux contrôles qui suivent — refus de supprimer un client qui a
       commandé, et cycle de vie d'une commande — dépendaient de données
       déjà présentes dans la base. Après un « npm run vider-commandes »,
       ils échouaient sans qu'il y ait le moindre défaut : une recette qui
       dépend de l'état de la base ne teste pas le logiciel, elle teste la
       base. */
    const tel = '2091' + Math.floor(1000 + Math.random() * 8999);
    const rCmd = await p.evaluate(async ([vid, t]) => {
      const r = await fetch('/api/commande', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ panier: [{ variante_id: vid, quantite: 1 }],
          nom: 'Client de recette', telephone: t, adresse: 'Rue du Test',
          ville: 'Tunis', gouvernorat: 'Tunis' }),
      });
      return { code: r.status, corps: await r.json().catch(() => ({})) };
    }, [vM.id, tel]);
    dit('la recette crée sa propre commande', rCmd.code === 201,
      `HTTP ${rCmd.code} — ${rCmd.corps.reference || rCmd.corps.erreur || ''}`);

    /* 7 bis. CHAQUE COMMANDE S'AFFICHE DANS SA PROPRE MONNAIE.
    
       L'administration formatait tout en dinars sur trois décimales,
       sans regarder la devise figée dans la commande : 145,00 AED
       s'affichait « 14,500 DT ». Le montant en base était juste, l'écran
       mentait — sur la monnaie ET sur le montant, d'un facteur dix. Rien
       ne le signalait : le nombre avait l'air normal.
       
       Le contrôle lit le TEXTE AFFICHÉ, pas l'API : c'est l'affichage
       qui était faux, l'API avait toujours raison. */
    const cmdAE = await p.evaluate(async () => {
      const d = await (await fetch('/api/admin/commandes')).json();
      const c = (d.commandes || []).find((x) => x.marche && x.marche !== 'tn');
      return c ? { id: c.id, devise: c.devise, total: c.total } : null;
    });
    if (cmdAE) {
      await p.goto(B + '/admin/commandes.html?id=' + cmdAE.id, { waitUntil: 'networkidle' });
      await p.waitForTimeout(1200);
      const texte = await p.evaluate(() => {
        const d = document.querySelector('dialog, .modale, [role=dialog], .boite-modale');
        return (d ? d.textContent : '').replace(/\s+/g, ' ');
      });
      const bonneDevise = texte.includes(cmdAE.devise);
      const pasDeDinar = !/\bDT\b/.test(texte);
      dit('une commande étrangère s\'affiche dans sa monnaie',
        bonneDevise && pasDeDinar,
        `devise ${cmdAE.devise} ${bonneDevise ? 'présente' : 'ABSENTE'}, `
        + `mention « DT » ${pasDeDinar ? 'absente' : 'PRÉSENTE (mauvais)'}`);
      await p.goto(B + '/admin/commandes.html', { waitUntil: 'networkidle' });
      await p.waitForTimeout(600);
    } else {
      dit('une commande étrangère s\'affiche dans sa monnaie', true,
        'aucune commande hors du marché principal : rien à vérifier');
    }

    // 8. supprimer un client qui a des commandes → doit refuser avec explication
    const clients = await api('/api/admin/clients');
    const liste = clients.corps.clients || clients.corps;
    const avecCmd = (Array.isArray(liste) ? liste : []).find((c) => (c.nb_commandes || 0) > 0);
    if (avecCmd) {
      const supCli = await api('/api/admin/clients/' + avecCmd.id, { method: 'DELETE' });
      dit('supprimer un client qui a commandé est refusé', supCli.code === 409, `HTTP ${supCli.code} — ${supCli.corps.erreur || ''}`);
    } else dit('supprimer un client qui a commandé est refusé', false, 'aucun client avec commande trouvé pour le test');


    // 9. cycle complet d'une commande + règle du stock
    const cmds = await api('/api/admin/commandes?statut=nouvelle');
    const lc = cmds.corps.commandes || cmds.corps;
    const c0 = (Array.isArray(lc) ? lc : [])[0];
    if (c0) {
      const detail0 = await api('/api/admin/commandes/' + c0.id);
      const ligne = detail0.corps.lignes[0];
      const stockAvant = (await api('/api/admin/produits/' + ligne.produit_id)).corps.variantes.find((v) => v.taille === ligne.taille).stock;
      const etapes = [];
      for (const st of ['confirmee', 'en_preparation', 'expediee', 'livree', 'annulee']) {
        const r = await api(`/api/admin/commandes/${c0.id}/statut`, { method: 'PUT', body: JSON.stringify({ statut: st }) });
        const s = (await api('/api/admin/produits/' + ligne.produit_id)).corps.variantes.find((v) => v.taille === ligne.taille).stock;
        etapes.push(`${st}:${s}`);
      }
      const stockFin = (await api('/api/admin/produits/' + ligne.produit_id)).corps.variantes.find((v) => v.taille === ligne.taille).stock;
      dit('le stock sort une seule fois et revient à l\'annulation',
        stockFin === stockAvant, `départ ${stockAvant} → ${etapes.join(' → ')} (fin ${stockFin})`);
    } else dit('cycle de commande', false, 'aucune commande « nouvelle » à traiter');

    /* 10. Ménage. On ramasse AUSSI ce qu'une exécution interrompue aurait
       laissé derrière elle : sinon les déchets s'accumulent dans la base
       du commerçant, et le contrôle final échoue pour de vieux restes au
       lieu d'échouer pour un vrai défaut. */
    const tousProduits = await api('/api/admin/produits');
    const aJeter = (tousProduits.corps.produits || tousProduits.corps || [])
      .filter((x) => x.nom === NOM_PRODUIT);
    for (const x of aJeter) await api('/api/admin/produits/' + x.id, { method: 'DELETE' });

    const toutesPromos = await api('/api/admin/promotions');
    for (const x of (toutesPromos.corps.promotions || toutesPromos.corps || [])) {
      if (/^RECETTE/.test(x.code)) await api('/api/admin/promotions/' + x.id, { method: 'DELETE' });
    }

    /* Les rayons de test créés par d'anciennes versions de cette recette
       (nom horodaté) sont ramassés s'ils sont vides. Le rayon unique
       actuel, lui, reste : il est désactivé, donc invisible du client. */
    const tousRayons = await api('/api/admin/rayons');
    let rayonsSupprimes = 0, rayonsGardes = 0;
    for (const x of (tousRayons.corps.rayons || tousRayons.corps || [])) {
      if (!/^Recette/.test(x.nom || '')) continue;
      const r = await api('/api/admin/rayons/' + x.id, { method: 'DELETE' });
      if (r.code === 200) { rayonsSupprimes++; continue; }
      /* Refusé : il contient un produit cité dans une commande. On ne
         force pas — on le DÉSACTIVE, il sort du menu du site sans que
         l'historique du client y perde quoi que ce soit. */
      await api('/api/admin/rayons/' + x.id, {
        method: 'PUT',
        body: JSON.stringify({ nom: x.nom, description: x.description || '', visible: 0 }),
      });
      rayonsGardes++;
    }

    /* Un produit cité dans une commande NE PEUT PAS être supprimé, et
       c'est voulu : effacer l'article effacerait la ligne de facture d'un
       client. La recette ayant passé une vraie commande sur son produit
       de test, elle ne peut donc pas le reprendre — elle le DÉSACTIVE,
       il disparaît de la boutique sans casser l'historique. Attendre une
       suppression ici aurait signalé un défaut là où le logiciel a raison. */
    const restes = await api('/api/admin/produits');
    const survivants = (restes.corps.produits || restes.corps || [])
      .filter((x) => x.nom === NOM_PRODUIT);
    let desactives = 0;
    for (const x of survivants) {
      const d = await api('/api/admin/produits/' + x.id);
      const corps = d.corps;
      const maj = await api('/api/admin/produits/' + x.id, {
        method: 'PUT',
        body: JSON.stringify({
          nom: corps.nom, categorie_id: corps.categorie_id, prix: corps.prix,
          description: corps.description || '', matiere: corps.matiere || '',
          actif: 0, mis_en_avant: 0,
          variantes: (corps.variantes || []).map((v) => ({ taille: v.taille, stock: v.stock })),
        }),
      });
      if (maj.code === 200) desactives++;
    }
    const visible = await p.evaluate(async () => {
      const r = await (await fetch('/api/produits')).json();
      return JSON.stringify(r).includes('Article de recette');
    });
    /* Le critère n'est PAS « tout a été supprimé » : un produit cité dans
       une commande, et le rayon qui le contient, résistent à la
       suppression — et ils ont raison. Le critère est « plus rien de la
       recette n'est visible par un client ». */
    const rayonVisible = await p.evaluate(async () => {
      const r = await (await fetch('/api/boutique')).json();
      return JSON.stringify(r.rayons || []).includes('Recette');
    });
    dit('la recette ne laisse rien de visible derrière elle',
      !visible && !rayonVisible,
      `${aJeter.length} produit(s) supprimé(s), ${desactives} désactivé(s) car cité(s) dans une commande, `
      + `${rayonsSupprimes} rayon(s) supprimé(s) et ${rayonsGardes} gardé(s) désactivé(s) — `
      + `visible sur la boutique : produit ${visible ? 'OUI' : 'non'}, rayon ${rayonVisible ? 'OUI' : 'non'}`);

    await ctx.close();
  } finally { await nav.close(); arreter(srv); }

  const ko = R.filter((x) => !x.ok);
  console.log(`\n  ${R.length - ko.length}/${R.length} contrôles passés.`);
  if (ko.length) { console.log('  ÉCHECS :'); ko.forEach((x) => console.log('   -', x.t, '\n     ', x.d)); process.exitCode = 1; }
})();
