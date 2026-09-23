/* Parcours d'achat complet, sur téléphone ET sur bureau.
   On ne vérifie pas des pages : on achète. */
const { chromium } = require('playwright-core');
const { demarrer, arreter } = require('./serveur');

const NAV = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const B = 'http://localhost:3000';
const R = [];
const dit = (t, ok, d) => { R.push({ t, ok, d }); console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${t}${d ? `\n      \x1b[90m${d}\x1b[0m` : ''}`); };

async function parcours(nav, l, h, ecran) {
  console.log(`\n─── ${ecran} (${l}px) ───`);
  const ctx = await nav.newContext({ viewport: { width: l, height: h }, isMobile: l < 700, hasTouch: l < 700 });
  /* Le visiteur a déjà répondu à la question « où livrons-nous ? ».
  
     Sans ce cookie, la porte du pays s'ouvre sur la première page et
     intercepte tous les clics : la recette tournait en boucle sur
     « le fond du dialogue intercepte le pointeur » jusqu'au délai
     d'attente. Ce n'est pas un défaut de la porte — c'est exactement ce
     qu'elle doit faire à quelqu'un qui n'a pas encore choisi. La porte
     elle-même est éprouvée par son propre contrôle, plus bas. */
  await ctx.addCookies([{ name: 'marche', value: 'tn', domain: 'localhost', path: '/' }]);
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(String(e).slice(0, 90)));
  /* La recette envoie exprès un téléphone invalide : le 400 qui suit est
     la bonne réponse du serveur, pas un défaut. On ne retient que ce qui
     n'était pas provoqué. */
  let attendu400 = false;
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (attendu400 && /status of 400/.test(t)) return;
    erreurs.push(t.slice(0, 90));
  });

  // 1. accueil → boutique
  await p.goto(B + '/', { waitUntil: 'networkidle' });
  await p.goto(B + '/boutique', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  const cartes = await p.locator('.carte-produit, [class*=carte]').count();
  dit(`${ecran} : le catalogue s'affiche`, cartes > 0, `${cartes} carte(s)`);

  // 2. fiche produit
  const lien = p.locator('a.carte-lien, .grille-produits a').first();
  await lien.click();
  await p.waitForURL(/produit/, { timeout: 10000 });
  await p.waitForTimeout(800);
  const nom = (await p.locator('[data-nom]').textContent() || '').trim();
  dit(`${ecran} : la fiche produit se charge`, !!nom, nom);

  // 3. ajouter au panier sans choisir de taille → doit refuser
  await p.locator('[data-ajouter]').click();
  await p.waitForTimeout(400);
  const refus = await p.locator('[data-erreur-taille]').isVisible();
  dit(`${ecran} : ajout sans taille refusé`, refus, refus ? 'message affiché' : 'AUCUN message');

  // 4. choisir une taille disponible et ajouter
  const tailles = p.locator('[data-tailles] button:not([disabled])');
  const n = await tailles.count();
  await tailles.first().click();
  await p.locator('[data-ajouter]').click();
  await p.waitForTimeout(700);
  const pastille = (await p.locator('.panier-pastille').first().textContent() || '').replace(/\D+/g, '');
  dit(`${ecran} : article ajouté au panier`, pastille === '1', `${n} taille(s) dispo, pastille « ${pastille} »`);

  // 5. une taille épuisée reste visible et barrée
  const epuisees = await p.locator('[data-tailles] button[disabled]').count();
  const barree = epuisees ? await p.locator('[data-tailles] button[disabled]').first().evaluate(
    (el) => getComputedStyle(el).textDecorationLine) : 'aucune';
  dit(`${ecran} : taille épuisée visible et barrée`, epuisees === 0 || barree.includes('line-through'),
    epuisees ? `${epuisees} épuisée(s), décoration « ${barree} »` : 'aucune taille épuisée sur cet article');

  // 6. panier : total recalculé
  await p.goto(B + '/panier', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  const sousTotal = (await p.locator('[data-sous-total]').textContent() || '').trim();
  dit(`${ecran} : le panier affiche un sous-total`, /\d/.test(sousTotal), sousTotal);

  // 7. code promo invalide
  await p.fill('#promo', 'NIMPORTEQUOI');
  await p.locator('[data-form-promo] button').click();
  await p.waitForTimeout(800);
  const alerte = (await p.locator('[data-avertissements]').textContent() || '').trim();
  dit(`${ecran} : code promo invalide signalé`, alerte.length > 0, alerte.slice(0, 70) || 'AUCUN message');

  // 8. commande : téléphone invalide refusé
  await p.goto(B + '/commande', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.fill('#nom', 'Recette Automatique');
  attendu400 = true;
  await p.fill('#telephone', '12');
  await p.fill('#adresse', 'Rue de la Recette');
  await p.selectOption('#gouvernorat', { index: 1 });
  await p.fill('#ville', 'Tunis');
  await p.locator('[data-valider]').click();
  await p.waitForTimeout(900);
  const err = (await p.locator('[data-alerte]').textContent() || '').trim();
  dit(`${ecran} : téléphone invalide refusé`, err.length > 0 && !p.url().includes('/merci'), err.slice(0, 70) || 'AUCUN message');

  // 9. commande valide → page merci
  attendu400 = false;
  await p.fill('#telephone', '20123456');
  await p.locator('[data-valider]').click();
  await p.waitForURL(/merci/, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(900);
  const surMerci = p.url().includes('/merci');
  const ref = surMerci ? (await p.locator('body').textContent()).match(/ATL-\d{6}-\d{4}/) : null;
  dit(`${ecran} : commande enregistrée`, surMerci && !!ref, ref ? ref[0] : p.url());

  // 10. le panier est vidé après la commande
  await p.goto(B + '/panier', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  const vide = await p.locator('[data-vide]').isVisible();
  dit(`${ecran} : panier vidé après la commande`, vide, vide ? '« Panier vide » affiché' : 'le panier contient encore des articles');

  dit(`${ecran} : aucune erreur JavaScript`, erreurs.length === 0, erreurs.join(' | ') || 'aucune');
  await ctx.close();
  return ref ? ref[0] : null;
}

(async () => {
  const srv = await demarrer();
  const nav = await chromium.launch({ executablePath: NAV, args: ['--no-sandbox'] });
  try {
    /* AVANT TOUT LE RESTE : ces deux contrôles interrogent la route de
       commande, qui est limitée à huit appels par heure et par appareil.
       Placés après les parcours, ils recevaient 429 au lieu de la
       réponse qu'ils mesurent. */
    console.log('\n─── le numéro de téléphone suit le pays ───');
    /* ---- LE NUMÉRO DE TÉLÉPHONE SUIT LE PAYS -----------------------
       Le site n'acceptait que les numéros tunisiens à huit chiffres : un
       client émirati ne pouvait pas commander du tout, sur une boutique
       qui lui affichait pourtant des prix en dirhams.

       Les deux contrôles se font avec un ARTICLE INEXISTANT, exprès.
       Un panier vide, lui, était rejeté par le schéma AVANT d'arriver au
       téléphone : les deux numéros recevaient « Votre panier est vide »
       et le contrôle ne mesurait rien. Avec un identifiant d'article
       valide en forme mais introuvable, le schéma passe, le téléphone
       est vérifié — un numéro correct donne alors « aucun article
       disponible » (409), un numéro du mauvais pays donne « numéro
       invalide » (400). On distingue les deux sans créer la moindre
       commande — et sans consommer le quota de huit commandes
       par heure, qui avait fait échouer ce contrôle quand il vivait dans
       la recette de sécurité — puis, une deuxième fois, quand il vivait
       plus bas dans CE fichier : les parcours par taille d'écran avaient
       déjà passé leurs commandes. Un contrôle sensible à un quota doit
       s'exécuter AVANT ceux qui le consomment. */
    {
      const b = await (await fetch(B + '/api/boutique')).json();
      const mk = b.marche || {};
      const ex = mk.exemples || {};
      const regions = mk.regions || [];
      if (ex.telephone && regions.length) {
        const envoi = async (tel) => {
          const r = await fetch(B + '/api/commande', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              panier: [{ variante_id: 999999, quantite: 1 }],
              nom: 'Recette Tel', telephone: tel, email: '',
              adresse: 'Rue', ville: 'Ville', gouvernorat: regions[0],
              code_postal: '', note_client: '', code_promo: '',
            }),
          });
          let d = null; try { d = await r.json(); } catch { /* non JSON */ }
          return { statut: r.status, erreur: (d && d.erreur) || '' };
        };

        const bon = await envoi(ex.telephone);
        dit('le numéro d\'exemple du pays passe la validation',
          bon.statut !== 400 || !/num[ée]ro/i.test(bon.erreur),
          `« ${ex.telephone} » en ${mk.nom} → ${bon.statut} ${bon.erreur.slice(0, 40)}`);

        const etranger = mk.code === 'tn' ? '501234567' : '20123456';
        const mauvais = await envoi(etranger);
        dit('un numéro d\'un autre pays est refusé',
          mauvais.statut === 400 && /invalide/i.test(mauvais.erreur),
          `« ${etranger} » → ${mauvais.statut} ${mauvais.erreur.slice(0, 44)}`);
      } else {
        dit('le numéro d\'exemple du pays passe la validation', true, 'pays sans exemple défini');
        dit('un numéro d\'un autre pays est refusé', true, 'sans objet');
      }
    }


    await parcours(nav, 390, 844, 'téléphone');
    await parcours(nav, 1366, 768, 'bureau');

    // --- le serveur recalcule-t-il vraiment ? -----------------------------
    console.log('\n─── le prix vient-il du serveur ou du navigateur ? ───');
    const prods = await (await fetch(B + '/api/produits')).json();
    const liste = prods.produits || prods.items || prods.resultats || prods;
    const fiche = await (await fetch(B + '/api/produit/' + liste[0].slug)).json();
    const art = fiche.produit || fiche;
    const v = art.variantes.find((x) => x.stock > 0);
    const envoyer = (extra) => fetch(B + '/api/commande', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        panier: [{ variante_id: v.id, quantite: 1 }],
        nom: 'Attaque Prix', telephone: '2099' + Math.floor(1000 + Math.random() * 8999),
        adresse: 'Rue du Test', ville: 'Tunis', gouvernorat: 'Tunis',
        ...extra,
      }),
    });

    const vrai = art.prix;
    const r1 = await envoyer({ total: 1, sous_total: 1 });
    const c1 = await r1.json();
    dit('un total falsifié à 1 millime est ignoré',
      r1.status === 201 && c1.total >= vrai,
      `HTTP ${r1.status} — le serveur a retenu ${c1.total} millimes, prix réel ${vrai} (envoyé : 1)`);

    // et un prix glissé DANS la ligne de panier ?
    const r2 = await fetch(B + '/api/commande', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        panier: [{ variante_id: v.id, quantite: 1, prix: 1, prix_unitaire: 1 }],
        nom: 'Attaque Ligne', telephone: '2098' + Math.floor(1000 + Math.random() * 8999),
        adresse: 'Rue du Test', ville: 'Tunis', gouvernorat: 'Tunis',
      }),
    });
    const c2 = await r2.json();
    dit('un prix glissé dans la ligne de panier est ignoré',
      r2.status === 201 && c2.total >= vrai,
      `HTTP ${r2.status} — le serveur a retenu ${c2.total} millimes`);

    // une quantité négative ?
    const r3 = await fetch(B + '/api/commande', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        panier: [{ variante_id: v.id, quantite: -5 }],
        nom: 'Attaque Quantite', telephone: '2097' + Math.floor(1000 + Math.random() * 8999),
        adresse: 'Rue du Test', ville: 'Tunis', gouvernorat: 'Tunis',
      }),
    });
    const c3 = await r3.json();
    dit('une quantité négative ne crédite pas le client',
      r3.status >= 400 || (c3.total >= 0),
      `HTTP ${r3.status} — ${c3.total !== undefined ? 'total ' + c3.total : c3.erreur}`);

    /* ---- LA PORTE DU PAYS, éprouvée pour elle-même ------------------
       Les autres contrôles arrivent avec un pays déjà choisi. Celui-ci
       part d'un navigateur neuf, comme un vrai premier visiteur : la
       porte doit s'ouvrir, un clic doit la refermer en posant le choix,
       et une seconde visite ne doit plus rien demander. */
    const marches = await (await fetch(B + '/api/boutique')).json();
    if ((marches.marches || []).length > 1) {
      const neuf = await nav.newContext({ viewport: { width: 390, height: 844 } });
      const pn = await neuf.newPage();
      await pn.goto(B + '/', { waitUntil: 'networkidle' });
      await pn.waitForTimeout(500);
      const ouverte = !!(await pn.$('.porte-pays'));
      dit('la porte du pays s\'ouvre au premier visiteur', ouverte,
        ouverte ? 'dialogue affiché' : 'aucun dialogue');

      if (ouverte) {
        const choix = marches.marches[marches.marches.length - 1].code;
        await pn.click(`[data-porte-choix="${choix}"]`);
        await pn.waitForTimeout(1600);
        const ck = (await neuf.cookies()).find((c) => c.name === 'marche');
        dit('le choix du pays est enregistré et la porte se referme',
          !!ck && ck.value === choix && !(await pn.$('.porte-pays')),
          `cookie « ${ck ? ck.value : 'aucun'} », dialogue ${await pn.$('.porte-pays') ? 'encore là' : 'refermé'}`);

        await pn.goto(B + '/boutique', { waitUntil: 'networkidle' });
        await pn.waitForTimeout(400);
        dit('la porte ne se repose pas à la visite suivante',
          !(await pn.$('.porte-pays')), 'deuxième page : aucun dialogue');
      } else {
        dit('le choix du pays est enregistré et la porte se referme', true, 'sans objet');
        dit('la porte ne se repose pas à la visite suivante', true, 'sans objet');
      }
      await neuf.close();
    } else {
      dit('la porte du pays s\'ouvre au premier visiteur', true, 'un seul pays ouvert : pas de question à poser');
      dit('le choix du pays est enregistré et la porte se referme', true, 'sans objet');
      dit('la porte ne se repose pas à la visite suivante', true, 'sans objet');
    }
  } finally { await nav.close(); arreter(srv); }
  const ko = R.filter((x) => !x.ok);
  console.log(`\n  ${R.length - ko.length}/${R.length} contrôles passés.`);
  if (ko.length) { console.log('  ÉCHECS :'); ko.forEach((x) => console.log('   -', x.t, '—', x.d)); process.exitCode = 1; }
})();
