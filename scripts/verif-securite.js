'use strict';
/**
 * Recette de sécurité. Chaque contrôle est une ATTAQUE, pas une
 * vérification de politesse : on essaie vraiment de faire payer 1 DT un
 * hoodie à 189 DT, on essaie vraiment d'énumérer les comptes.
 *
 *   node scripts/verif-securite.js [base] [email] [motdepasse]
 */
const BASE = process.argv[2] || 'http://localhost:3000';
const EMAIL = process.argv[3] || 'hamza@atlas.tn';
const MDP = process.argv[4] || 'AtlasDemo2026';

const resultats = [];
function noter(nom, reussi, detail) {
  resultats.push({ controle: nom, verdict: reussi ? 'OK' : 'ÉCHEC', detail });
}

async function json(chemin, options) {
  const r = await fetch(BASE + chemin, options);
  let d = null;
  try { d = await r.json(); } catch { /* réponse non JSON */ }
  return { statut: r.status, entetes: r.headers, corps: d };
}

async function poster(chemin, corps, entetes) {
  return json(chemin, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, entetes || {}),
    body: JSON.stringify(corps),
  });
}

(async () => {
  // --- de quoi travailler -------------------------------------------
  const produits = (await json('/api/produits')).corps;
  const cible = produits.find((p) => p.tailles.some((t) => t.stock > 0));
  const detail = (await json('/api/produit/' + cible.slug)).corps;
  const variante = detail.variantes.find((v) => v.stock > 0);
  const vraiPrix = detail.prix;

  // === 1. PRIX TRAFIQUÉ =============================================
  // Le navigateur annonce un prix ridicule et un total ridicule.
  const trafic = await poster('/api/commande', {
    panier: [{ variante_id: variante.id, quantite: 1, prix: 1000, prix_unitaire: 1000 }],
    total: 1000, sous_total: 1000, frais_livraison: 0, remise: 500000,
    nom: 'Attaque Prix', telephone: '20999001',
    adresse: 'Essai', ville: 'Tunis', gouvernorat: 'Tunis',
  });
  const facture = trafic.corps && trafic.corps.total;
  noter('prix trafiqué dans le panier',
    trafic.statut === 201 && facture > vraiPrix,
    `prix réel ${vraiPrix} millimes, client annonce 1000, serveur facture ${facture}`);

  // === 2. QUANTITÉ SUPÉRIEURE AU STOCK ==============================
  // a) au-delà du plafond du schéma : refus net, message en français
  const absurde = await poster('/api/panier', { panier: [{ variante_id: variante.id, quantite: 999 }] });
  noter('quantité absurde refusée par le schéma',
    absurde.statut === 400 && /quantit|exemplaire/i.test(absurde.corps.erreur || ''),
    `${absurde.statut} — « ${absurde.corps && absurde.corps.erreur} »`);

  // b) dans le plafond mais au-dessus du stock réel : ramenée au stock
  const trop = await poster('/api/panier', {
    panier: [{ variante_id: variante.id, quantite: 20 }],
  });
  noter('quantité supérieure au stock ramenée au stock',
    (trop.corps.lignes || []).every((l) => l.quantite <= l.stock),
    `demandé 20, stock ${variante.stock}, retenu ${trop.corps.lignes[0] ? trop.corps.lignes[0].quantite : 0}`);

  // === 3. CODE PROMO INVENTÉ ========================================
  const promo = await poster('/api/panier', {
    panier: [{ variante_id: variante.id, quantite: 1 }],
    code_promo: 'CODE-QUI-NEXISTE-PAS',
  });
  noter('code promo inventé', promo.corps.remise === 0, `remise appliquée : ${promo.corps.remise}`);

  // === 4. REMISE SUPÉRIEURE AU PANIER ===============================
  noter('total jamais négatif', promo.corps.total >= 0, `total ${promo.corps.total}`);

  // === 5. ÉNUMÉRATION DES COMPTES PAR LE TEMPS ======================
  // Un compte inexistant doit répondre AUSSI LENTEMENT qu'un compte réel
  // avec un mauvais mot de passe. Sinon, on lit la liste des comptes au
  // chronomètre. On mesure trois fois et on compare les médianes.
  const mesurer = async (email) => {
    const t = [];
    for (let i = 0; i < 3; i += 1) {
      const d = Date.now();
      await poster('/api/connexion', { email, mot_de_passe: 'mauvais-mot-de-passe' },
        { 'X-Essai': String(Math.random()) });
      t.push(Date.now() - d);
    }
    return t.sort((a, b) => a - b)[1];
  };
  const tInconnu = await mesurer('personne-nexiste-pas-' + Date.now() + '@exemple.tn');
  const tConnu = await mesurer(EMAIL);
  const ecart = Math.abs(tConnu - tInconnu);
  noter('énumération des comptes par le temps',
    ecart < Math.max(60, tConnu * 0.4),
    `compte connu ${tConnu} ms, inconnu ${tInconnu} ms, écart ${ecart} ms`);

  // === 6. MESSAGE D'ERREUR IDENTIQUE ================================
  const a = await poster('/api/connexion', { email: 'inexistant@exemple.tn', mot_de_passe: 'x' });
  const b = await poster('/api/connexion', { email: EMAIL, mot_de_passe: 'x' });
  noter('message de connexion identique',
    (a.corps.erreur === b.corps.erreur) || a.statut === 429,
    `« ${a.corps.erreur} » / « ${b.corps.erreur} »`);

  // === 7. LIMITATION DE DÉBIT SUR LA CONNEXION ======================
  let bloque = false;
  for (let i = 0; i < 8; i += 1) {
    const r = await poster('/api/connexion', { email: 'cible-limite@exemple.tn', mot_de_passe: 'x' });
    if (r.statut === 429) { bloque = true; break; }
  }
  noter('limitation de débit sur la connexion', bloque, bloque ? 'bloqué avant la 9e tentative' : 'jamais bloqué');

  // === 8. API D'ADMINISTRATION SANS SESSION =========================
  const sans = await json('/api/admin/produits');
  noter('API admin sans session', sans.statut === 401, `répond ${sans.statut}`);
  const sansStock = await json('/api/admin/stock/1', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stock: 9999 }),
  });
  noter('écriture admin sans session', sansStock.statut === 401, `répond ${sansStock.statut}`);

  // === 9. RÉGLAGE INCONNU INJECTÉ ===================================
  const cookie = await (async () => {
    const r = await fetch(BASE + '/api/connexion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, mot_de_passe: MDP }),
    });
    return (r.headers.get('set-cookie') || '').split(';')[0];
  })();
  if (cookie) {
    const inject = await json('/api/admin/reglages', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ cle_inventee_par_lattaquant: 'oui', nom_boutique: 'ATLAS STREETWEAR' }),
    });
    noter('réglage inconnu rejeté',
      !inject.corps.enregistres.includes('cle_inventee_par_lattaquant'),
      'clés acceptées : ' + inject.corps.enregistres.join(', '));

    // === 10. RÉVOCATION DE SESSION ==================================
    const avant = await json('/api/session', { headers: { Cookie: cookie } });
    await fetch(BASE + '/api/deconnexion', { method: 'POST', headers: { Cookie: cookie } });
    const apres = await json('/api/session', { headers: { Cookie: cookie } });
    noter('session révocable immédiatement',
      avant.corps.connecte === true && apres.corps.connecte === false,
      'avant : connecté, après déconnexion : ' + (apres.corps.connecte ? 'toujours connecté' : 'déconnecté'));
  }

  // === 11. TRAVERSÉE DE CHEMIN SUR LES MÉDIAS =======================
  const traversee = await fetch(BASE + '/media/..%2f..%2f.env');
  const traversee2 = await fetch(BASE + '/.env');
  const traversee3 = await fetch(BASE + '/data/boutique.db');
  noter('fichiers sensibles inaccessibles',
    traversee.status >= 400 && traversee2.status >= 400 && traversee3.status >= 400,
    `/media/../.env → ${traversee.status}, /.env → ${traversee2.status}, /data/boutique.db → ${traversee3.status}`);

  // === 12. EN-TÊTES DE SÉCURITÉ =====================================
  const acc = await fetch(BASE + '/');
  const attendus = ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy'];
  const manquants = attendus.filter((h) => !acc.headers.get(h));
  noter('en-têtes de sécurité', manquants.length === 0, manquants.length ? 'manquants : ' + manquants.join(', ') : 'tous présents');

  // === 13. CACHE DES SCRIPTS D'ADMINISTRATION =======================
  const cacheAdmin = await fetch(BASE + '/admin/js/admin.js');
  const cc = cacheAdmin.headers.get('cache-control') || '';
  noter('scripts d\'admin non mis en cache', cc.includes('no-store'), `Cache-Control: ${cc || 'absent'}`);

  // === 14. LES MARCHÉS ==============================================
  // Trois attaques, toutes fondées sur la même idée : le pays est un
  // choix du visiteur, donc c'est une entrée utilisateur comme une
  // autre. Un cookie se forge en trois secondes dans un navigateur.
  const boutique = (await json('/api/boutique')).corps;
  const ouverts = (boutique.marches || []).map((m) => m.code);
  const tousCodes = ['tn', 'ae'];
  const fermes = tousCodes.filter((c) => !ouverts.includes(c));

  // 14a. un marché FERMÉ ne s'ouvre pas avec un cookie.
  if (fermes.length) {
    const force = (await json('/api/boutique', { headers: { Cookie: `marche=${fermes[0]}` } })).corps;
    noter('marché fermé forcé par cookie',
      force.marche && force.marche.code !== fermes[0],
      `cookie « ${fermes[0]} » → le serveur sert « ${force.marche && force.marche.code} »`);

    const poste = await poster('/api/marche', { marche: fermes[0] });
    noter('marché fermé demandé par l\'API', poste.statut === 400,
      `POST /api/marche ${fermes[0]} → ${poste.statut}`);
  } else {
    noter('marché fermé forcé par cookie', true, 'tous les marchés sont ouverts : rien à forcer');
    noter('marché fermé demandé par l\'API', true, 'sans objet');
  }

  // 14b. un code de marché inventé ne casse rien et ne passe pas.
  const invente = (await json('/api/boutique', { headers: { Cookie: 'marche=../../etc/passwd' } })).corps;
  noter('code de marché inventé',
    invente.marche && tousCodes.includes(invente.marche.code),
    `→ « ${invente.marche && invente.marche.code} » (repli sur le marché par défaut)`);

  // 14c. LE PRIX SUIT LE MARCHÉ, pas le navigateur.
  // On demande un devis dans chaque marché ouvert pour la même variante
  // et on vérifie que le serveur ne rend jamais le prix de l'autre.
  if (ouverts.length > 1) {
    const parMarche = {};
    for (const code of ouverts) {
      const prods = (await json('/api/produits', { headers: { Cookie: `marche=${code}` } })).corps;
      for (const p of prods) {
        const det = (await json('/api/produit/' + p.slug, { headers: { Cookie: `marche=${code}` } })).corps;
        const v = (det.variantes || []).find((x) => x.stock > 0);
        if (v) { parMarche[code] = { variante: v.id, prix: det.prix, slug: p.slug }; break; }
      }
    }
    const codes = Object.keys(parMarche);
    if (codes.length > 1) {
      const [a, b] = codes;
      // on commande dans le marché A en annonçant le prix du marché B
      const devis = await json('/api/panier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `marche=${a}` },
        body: JSON.stringify({
          panier: [{ variante_id: parMarche[a].variante, quantite: 1, prix: parMarche[b].prix }],
        }),
      });
      const retenu = devis.corps && devis.corps.lignes[0] && devis.corps.lignes[0].prix_unitaire;
      noter('prix d\'un autre marché annoncé par le navigateur',
        retenu === parMarche[a].prix,
        `annoncé ${parMarche[b].prix}, retenu ${retenu} (attendu ${parMarche[a].prix})`);
      noter('devise du devis imposée par le serveur',
        devis.corps && devis.corps.devise && devis.corps.marche === a,
        `marché ${devis.corps && devis.corps.marche}, devise ${devis.corps && devis.corps.devise}`);
    } else {
      noter('prix d\'un autre marché annoncé par le navigateur', true, 'un seul marché a du stock : rien à comparer');
      noter('devise du devis imposée par le serveur', true, 'sans objet');
    }
  } else {
    noter('prix d\'un autre marché annoncé par le navigateur', true, 'un seul marché ouvert');
    noter('devise du devis imposée par le serveur', true, 'un seul marché ouvert');
  }

  // 14d. LA RÉGION DE LIVRAISON DOIT EXISTER DANS LE PAYS SERVI.
  // Une liste déroulante est une commodité, pas une garantie : elle se
  // modifie en trois secondes. Une commande portant « Sousse » comme
  // émirat partirait chez un transporteur incapable de la livrer.
  {
    const m = (await json('/api/boutique')).corps.marche;
    const regions = (m && m.regions) || [];
    const etrangere = regions.includes('Sousse') ? 'Charjah' : 'Sousse';
    const prodsR = (await json('/api/produits')).corps;
    let vid = null;
    for (const p of prodsR) {
      const det = (await json('/api/produit/' + p.slug)).corps;
      const v = (det.variantes || []).find((x) => x.stock > 0);
      if (v) { vid = v.id; break; }
    }
    if (vid) {
      const r = await poster('/api/commande', {
        panier: [{ variante_id: vid, quantite: 1 }],
        nom: 'Recette', telephone: '50000111', email: '', adresse: 'Rue',
        ville: 'Ville', gouvernorat: etrangere, code_postal: '', note_client: '', code_promo: '',
      });
      noter('région de livraison d\'un autre pays', r.statut === 400,
        `« ${etrangere} » en ${m.nom} → ${r.statut}`);
    } else {
      noter('région de livraison d\'un autre pays', true, 'aucun article en stock : rien à commander');
    }
  }

  // --- rapport --------------------------------------------------------
  const echecs = resultats.filter((r) => r.verdict === 'ÉCHEC');
  console.log('\n  RECETTE DE SÉCURITÉ\n');
  for (const r of resultats) {
    const marque = r.verdict === 'OK' ? '\x1b[32m  ✓\x1b[0m' : '\x1b[31m  ✗\x1b[0m';
    console.log(`${marque} ${r.controle}\n      \x1b[90m${r.detail}\x1b[0m`);
  }
  console.log(`\n  ${resultats.length - echecs.length}/${resultats.length} contrôles passés.\n`);
  process.exit(echecs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
