'use strict';
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const db = require('../db');
const auth = require('../lib/auth');
const images = require('../lib/images');
const reglages = require('../lib/reglages');
const stats = require('../lib/statistiques');
const marches = require('../lib/marches');
const notifier = require('../lib/notifier');
const S = require('../lib/schemas');
const { valider } = S;

const r = express.Router();
r.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// ---------------------------------------------------------------- outils
function slugifier(texte, secours) {
  const base = String(texte || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return base || secours || 'element-' + Date.now();
}

/** Garantit l'unicité d'un slug dans une table. */
function slugUnique(table, propose, idExclu) {
  let slug = propose, n = 2;
  while (db.get(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`, slug, idExclu || 0)) {
    slug = `${propose}-${n++}`;
  }
  return slug;
}

/** Recherche insensible aux accents ET à la casse : « prepa » trouve « préparation ». */
function sansAccent(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// =====================================================  TABLEAU DE BORD
r.get('/tableau-de-bord', (req, res) => {
  const jour = "date(cree_le) = date('now')";
  /* FENÊTRE GLISSANTE DE 30 JOURS, et non le mois calendaire.
     « Ce mois-ci » retombait à zéro à minuit le 1er du mois : le
     commerçant ouvrait son écran le matin et voyait 0 DT alors qu'il
     avait vendu la veille. Le chiffre était juste, la question était
     mauvaise. Trente jours glissants répondent à « combien ces derniers
     temps », qui est ce qu'on regarde vraiment. 29 jours en arrière plus
     aujourd'hui = 30 jours. */
  const fenetre = "date(cree_le) >= date('now','-29 days')";
  const stats = {
    commandes_nouvelles: db.get("SELECT COUNT(*) n FROM commandes WHERE statut = 'nouvelle'").n,
    commandes_a_preparer: db.get("SELECT COUNT(*) n FROM commandes WHERE statut IN ('confirmee','en_preparation')").n,
    commandes_jour: db.get(`SELECT COUNT(*) n FROM commandes WHERE ${jour}`).n,
    /* Ces trois chiffres restent en monnaie du marché PRINCIPAL : ils
       n'additionnent plus que les commandes de ce pays. Le détail par
       devise est renvoyé juste après.

       Avant, la somme portait sur toutes les commandes : 7 000 fils
       émiratis s'ajoutaient à 89 000 millimes tunisiens et donnaient un
       nombre qui ne veut rien dire. Additionner deux monnaies sans taux
       de change, c'est produire un chiffre d'affaires faux — et il avait
       l'air parfaitement normal à l'écran. */
    chiffre_jour: db.get(`SELECT COALESCE(SUM(total),0) t FROM commandes WHERE ${jour} AND statut != 'annulee' AND COALESCE(marche,'tn') = ?`, marches.defaut().code).t,
    chiffre_30j: db.get(`SELECT COALESCE(SUM(total),0) t FROM commandes WHERE ${fenetre} AND statut != 'annulee' AND COALESCE(marche,'tn') = ?`, marches.defaut().code).t,
    panier_moyen: db.get("SELECT COALESCE(CAST(AVG(total) AS INTEGER),0) t FROM commandes WHERE statut != 'annulee' AND COALESCE(marche,'tn') = ?", marches.defaut().code).t,
    produits_actifs: db.get('SELECT COUNT(*) n FROM produits WHERE actif = 1').n,
    clients: db.get('SELECT COUNT(*) n FROM clients').n,
    boutique_ouverte: reglages.booleen('boutique_ouverte'),
  };

  const ruptures = db.all(
    `SELECT v.id, v.taille, v.stock, p.nom, p.slug, p.id AS produit_id
       FROM variantes v JOIN produits p ON p.id = v.produit_id
      WHERE p.actif = 1 AND v.stock <= 3
      ORDER BY v.stock, p.nom LIMIT 12`
  );

  const dernieres = db.all(
    `SELECT id, reference, nom, ville, total, statut, cree_le,
            COALESCE(marche,'tn') AS marche, COALESCE(devise,'DT') AS devise,
            COALESCE(decimales,3) AS decimales
       FROM commandes ORDER BY id DESC LIMIT 8`
  );

  const ventes = db.all(
    `SELECT date(cree_le) AS jour, COUNT(*) n, COALESCE(SUM(total),0) t
       FROM commandes WHERE statut != 'annulee' AND cree_le >= date('now','-13 days')
      GROUP BY jour ORDER BY jour`
  );

  const legaux = reglages.CHAMPS_LEGAUX_REQUIS.filter((c) => !reglages.get(c));

  /* Un chiffre par pays, chacun dans sa monnaie. Affiché seulement s'il
     y a plus d'un marché ouvert : sur une boutique tunisienne seule, ce
     serait répéter deux fois la même ligne. */
  const parMarche = marches.actifs().map((m) => ({
    code: m.code, nom: m.nom, devise: m.devise, decimales: m.decimales,
    jour: db.get(`SELECT COALESCE(SUM(total),0) t FROM commandes WHERE ${jour} AND statut != 'annulee' AND COALESCE(marche,'tn') = ?`, m.code).t,
    trente_jours: db.get(`SELECT COALESCE(SUM(total),0) t FROM commandes WHERE ${fenetre} AND statut != 'annulee' AND COALESCE(marche,'tn') = ?`, m.code).t,
    commandes: db.get("SELECT COUNT(*) n FROM commandes WHERE statut != 'annulee' AND COALESCE(marche,'tn') = ?", m.code).n,
    panier: db.get("SELECT COALESCE(CAST(AVG(total) AS INTEGER),0) t FROM commandes WHERE statut != 'annulee' AND COALESCE(marche,'tn') = ?", m.code).t,
  }));

  res.json({ stats, ruptures, dernieres, ventes, champs_legaux_manquants: legaux, par_marche: parMarche });
});

// =============================================================  MARCHÉS
/**
 * Les pays servis. Un par ligne : sa devise, ses frais, son délai, et
 * l'interrupteur qui l'ouvre ou le ferme.
 *
 * On renvoie aussi, pour chaque marché, le NOMBRE DE PRODUITS TARIFÉS.
 * C'est le chiffre qui dit si le marché est prêt : ouvrir un pays où
 * aucun produit n'a de prix afficherait une boutique vide à des clients
 * bien réels.
 */
r.get('/marches', (req, res) => {
  const total = db.get('SELECT COUNT(*) n FROM produits WHERE actif = 1').n;
  res.json(marches.tous().map((m) => ({
    ...m,
    regions_liste: marches.regions(m),
    produits_tarifes: db.get(
      `SELECT COUNT(*) n FROM produits p
        JOIN prix_marche pm ON pm.produit_id = p.id AND pm.marche = ?
       WHERE p.actif = 1`, m.code).n,
    produits_actifs: total,
    stock_total: db.get('SELECT COALESCE(SUM(stock),0) n FROM stock_marche WHERE marche = ?', m.code).n,
  })));
});

r.put('/marches/:code', valider(S.marche), (req, res) => {
  const code = String(req.params.code);
  const m = marches.parCode(code);
  if (!m) return res.status(404).json({ erreur: 'Ce pays n\'existe pas.' });
  const d = req.donnees;

  /* REFUS D'OUVRIR UN MARCHÉ VIDE.
  
     Sans ce garde-fou, cocher la case affichait aussitôt aux clients
     émiratis un catalogue sans un seul article — et rien n'aurait dit
     pourquoi. Le refus est explicite et dit quoi faire ensuite. C'est la
     même règle que l'avertissement avant d'ouvrir la boutique sans
     mentions légales : un interrupteur ne doit pas pouvoir produire
     silencieusement une vitrine cassée. */
  if (d.actif && !m.actif) {
    const tarifes = db.get(
      `SELECT COUNT(*) n FROM produits p
        JOIN prix_marche pm ON pm.produit_id = p.id AND pm.marche = ?
       WHERE p.actif = 1`, code).n;
    if (tarifes === 0) {
      return res.status(409).json({
        erreur: `Aucun produit n'a de prix en ${m.devise}. Ouvrir ce pays maintenant y afficherait `
          + 'une boutique vide. Saisissez d\'abord au moins un prix dans une fiche produit.',
      });
    }
  }

  db.run(
    `UPDATE marches SET nom = ?, frais_livraison = ?, livraison_gratuite_des = ?,
            delai_livraison = ?, bandeau_texte = ?, telephone = ?, langue = ?, libelle_region = ?, regions = ?,
            actif = ?, ordre = ? WHERE code = ?`,
    d.nom, d.frais_livraison, d.livraison_gratuite_des, d.delai_livraison,
    d.bandeau_texte, String(d.telephone || '').trim(), d.langue, d.libelle_region,
    JSON.stringify(d.regions.map((x) => x.trim()).filter(Boolean)),
    d.actif, d.ordre, code
  );
  marches.invalider();
  res.json({ ok: true, marche: marches.parCode(code) });
});

// ==============================================================  RAYONS
r.get('/rayons', (req, res) => {
  res.json(db.all(
    `SELECT c.*, (SELECT COUNT(*) FROM produits p WHERE p.categorie_id = c.id) AS nb_produits
       FROM categories c ORDER BY c.ordre, c.nom`
  ));
});

r.post('/rayons', valider(S.categorie), (req, res) => {
  const d = req.donnees;
  const slug = slugUnique('categories', slugifier(d.slug || d.nom));
  const ins = db.run(
    'INSERT INTO categories (nom, slug, description, ordre, visible) VALUES (?, ?, ?, ?, ?)',
    d.nom, slug, d.description, d.ordre, d.visible
  );
  res.status(201).json({ ok: true, id: ins.dernierId, slug });
});

r.put('/rayons/:id', valider(S.categorie), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const d = req.donnees;
  const slug = slugUnique('categories', slugifier(d.slug || d.nom), id);
  const u = db.run(
    'UPDATE categories SET nom = ?, slug = ?, description = ?, ordre = ?, visible = ? WHERE id = ?',
    d.nom, slug, d.description, d.ordre, d.visible, id
  );
  if (!u.changements) return res.status(404).json({ erreur: 'Rayon introuvable.' });
  res.json({ ok: true, slug });
});

r.delete('/rayons/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const nb = db.get('SELECT COUNT(*) n FROM produits WHERE categorie_id = ?', id).n;
  if (nb > 0) {
    return res.status(409).json({
      erreur: `Ce rayon contient ${nb} produit(s). Déplacez-les dans un autre rayon avant de le supprimer.`,
    });
  }
  db.run('DELETE FROM categories WHERE id = ?', id);
  res.json({ ok: true });
});

// ============================================================  PRODUITS
/**
 * La liste des produits, AVEC un prix et un stock par pays servi.
 *
 * Elle affichait auparavant « p.prix » et la somme de « variantes.stock ».
 * Ces deux colonnes existent toujours, mais elles ne suivent QUE le marché
 * principal : depuis l'ouverture d'un deuxième pays, la vitrine lit
 * prix_marche et stock_marche, et plus jamais celles-là. La page montrait
 * donc les chiffres de la Tunisie — sans le dire. Un commerçant qui vient
 * de saisir 39 pièces pour Dubaï lit « 18 » et croit que sa saisie n'a pas
 * été prise : le chiffre n'était pas faux, il répondait à une autre
 * question que celle posée.
 *
 * Deux requêtes groupées plutôt qu'une par produit et par pays : le
 * catalogue est petit aujourd'hui, mais une boucle de requêtes qui grossit
 * avec le catalogue est une lenteur qu'on ne voit qu'une fois trop tard.
 */
r.get('/produits', (req, res) => {
  const lignes = db.all(
    `SELECT p.*, c.nom AS rayon,
            (SELECT COUNT(*) FROM variantes v WHERE v.produit_id = p.id) AS nb_tailles,
            (SELECT fichier FROM images WHERE produit_id = p.id ORDER BY ordre LIMIT 1) AS image
       FROM produits p LEFT JOIN categories c ON c.id = p.categorie_id
      ORDER BY p.ordre, p.id DESC`
  );

  const prix = new Map();
  for (const l of db.all('SELECT produit_id, marche, prix, prix_barre FROM prix_marche')) {
    prix.set(`${l.produit_id}|${l.marche}`, l);
  }
  const stocks = new Map();
  for (const l of db.all(
    `SELECT v.produit_id, sm.marche, COALESCE(SUM(sm.stock), 0) AS stock
       FROM variantes v JOIN stock_marche sm ON sm.variante_id = v.id
      GROUP BY v.produit_id, sm.marche`)) {
    stocks.set(`${l.produit_id}|${l.marche}`, l.stock);
  }

  const tous = marches.tous();
  for (const p of lignes) {
    p.par_marche = tous.map((m) => {
      const t = prix.get(`${p.id}|${m.code}`);
      return {
        code: m.code, nom: m.nom, devise: m.devise, decimales: m.decimales, actif: m.actif,
        /* null et 0 ne veulent pas dire la même chose : « pas de prix dans
           ce pays » n'est pas « gratuit ». La page doit pouvoir écrire
           « — » plutôt qu'un zéro qui a l'air d'un prix. */
        prix: t ? t.prix : null,
        prix_barre: t ? t.prix_barre : null,
        stock: stocks.get(`${p.id}|${m.code}`) || 0,
      };
    });
  }
  res.json(lignes);
});

r.get('/produits/:id', (req, res) => {
  const p = db.get('SELECT * FROM produits WHERE id = ?', parseInt(req.params.id, 10));
  if (!p) return res.status(404).json({ erreur: 'Produit introuvable.' });
  /* Un champ de prix par pays servi, y compris les pays fermés : c'est
     précisément en préparant les prix qu'on rend un marché ouvrable. */
  p.marches = marches.tous().map((m) => {
    const l = db.get('SELECT prix, prix_barre FROM prix_marche WHERE produit_id = ? AND marche = ?', p.id, m.code);
    return { code: m.code, nom: m.nom, devise: m.devise, decimales: m.decimales, actif: m.actif,
             principal: m.code === marches.defaut().code,
             prix: l ? l.prix : null, prix_barre: l ? l.prix_barre : null };
  });
  /* Le stock des tailles est lu dans stock_marche, entrepôt du pays
     PRINCIPAL — pas dans variantes.stock.

     Défaut trouvé : variantes.stock n'était plus décrémenté quand une
     commande sortait du stock (seul stock_marche l'était). La fiche
     produit affichait donc la quantité d'AVANT les ventes, et
     l'enregistrer réécrivait cette vieille valeur par-dessus la vraie.
     Scénario complet : 18 en stock, un client en achète 2 (il en reste
     16), le commerçant rouvre la fiche pour corriger une faute dans la
     description, enregistre — et le stock repasse à 18. Deux pièces
     fantômes, une survente, et rien à l'écran pour le signaler. */
  p.variantes = db.all(
    `SELECT v.*, COALESCE(sm.stock, v.stock) AS stock
       FROM variantes v
       LEFT JOIN stock_marche sm ON sm.variante_id = v.id AND sm.marche = ?
      WHERE v.produit_id = ? ORDER BY v.ordre, v.id`,
    marches.defaut().code, p.id);
  p.images = db.all('SELECT * FROM images WHERE produit_id = ? ORDER BY ordre, id', p.id);
  p.points_forts = db.all('SELECT * FROM points_forts WHERE produit_id = ? ORDER BY ordre, id', p.id);
  res.json(p);
});

/**
 * Le stock saisi dans la fiche produit va dans l'entrepôt du marché
 * PRINCIPAL (le premier ouvert, la Tunisie aujourd'hui).
 *
 * La colonne variantes.stock continue d'être écrite en parallèle : elle
 * n'est plus lue par la vitrine, mais elle reste la source de la
 * migration au premier démarrage d'une base ancienne, et la laisser
 * dériver ferait mentir cette migration si elle devait rejouer.
 *
 * Le stock des AUTRES marchés ne se touche pas ici : il se règle sur la
 * page Stock, entrepôt par entrepôt. Le faire depuis la fiche produit
 * aurait demandé autant de champs que de pays, dans un formulaire déjà
 * long — et aurait surtout invité à saisir un chiffre au hasard pour un
 * entrepôt qu'on n'a pas sous les yeux.
 */
/**
 * Les prix des marchés SECONDAIRES.
 *
 * Un champ laissé vide n'est pas « zéro » : c'est « je ne vends pas cet
 * article dans ce pays ». La ligne est alors SUPPRIMÉE, et le produit
 * disparaît du catalogue de ce marché. Écrire zéro à la place aurait
 * mis l'article en vitrine à 0,00 AED.
 */
function poserPrixMarches(produitId, prixMarches) {
  const principal = marches.defaut().code;
  for (const m of marches.tous()) {
    if (m.code === principal) continue;          // déjà écrit par poserPrix
    const saisi = (prixMarches || {})[m.code];
    if (saisi === undefined) continue;           // champ absent : on ne touche à rien
    const prix = saisi.prix;
    if (prix === '' || prix === null || prix === undefined) {
      db.run('DELETE FROM prix_marche WHERE produit_id = ? AND marche = ?', produitId, m.code);
      continue;
    }
    const barre = (saisi.prix_barre === '' || saisi.prix_barre == null) ? null : saisi.prix_barre;
    db.run(
      `INSERT INTO prix_marche (produit_id, marche, prix, prix_barre) VALUES (?, ?, ?, ?)
       ON CONFLICT(produit_id, marche) DO UPDATE SET prix = excluded.prix, prix_barre = excluded.prix_barre`,
      produitId, m.code, prix, barre
    );
  }
}

function poserPrix(produitId, prix, prixBarre) {
  const barre = (prixBarre === '' || prixBarre == null) ? null : prixBarre;
  db.run(
    `INSERT INTO prix_marche (produit_id, marche, prix, prix_barre) VALUES (?, ?, ?, ?)
     ON CONFLICT(produit_id, marche) DO UPDATE SET prix = excluded.prix, prix_barre = excluded.prix_barre`,
    produitId, marches.defaut().code, prix, barre
  );
}

/**
 * LA FICHE PRODUIT NE TOUCHE PLUS AU STOCK.
 *
 * Elle déclare QUELLES TAILLES existent ; la page Stock dit COMBIEN il y
 * en a, entrepôt par entrepôt — Tunisie comprise. Deux écrans qui
 * écrivaient la même quantité, c'est deux écrans qui peuvent se
 * contredire, et le perdant est toujours celui qui enregistre en dernier.
 *
 * Une taille nouvelle naît donc à zéro partout. C'est volontaire : un
 * article dont on n'a pas encore compté les pièces est en rupture, pas
 * disponible « on verra ». Il reste affiché, barré « épuisé », et passe
 * en vente dès la première quantité saisie sur la page Stock.
 */
function ecrireVariantesEtPoints(produitId, d) {
  const gardees = [];
  d.variantes.forEach((v, i) => {
    let id = v.id;
    if (id) {
      db.run('UPDATE variantes SET taille = ?, sku = ?, ordre = ? WHERE id = ? AND produit_id = ?',
        v.taille, v.sku, i, id, produitId);
    } else {
      const existe = db.get('SELECT id FROM variantes WHERE produit_id = ? AND taille = ?', produitId, v.taille);
      if (existe) {
        db.run('UPDATE variantes SET sku = ?, ordre = ? WHERE id = ?', v.sku, i, existe.id);
        id = existe.id;
      } else {
        id = db.run('INSERT INTO variantes (produit_id, taille, sku, stock, ordre) VALUES (?, ?, ?, 0, ?)',
          produitId, v.taille, v.sku, i).dernierId;
      }
    }
    /* Une ligne d'entrepôt pour CHAQUE pays servi, y compris ceux qui
       sont fermés : sans elle, la page Stock ne proposerait pas la
       taille le jour où le pays ouvre, et la boutique de ce pays
       afficherait un article sans aucune taille commandable. */
    marches.completerStock(id);
    gardees.push(id);
  });
  // Les tailles retirées de la fiche disparaissent, sauf si elles figurent
  // dans une commande : lignes_commande garde la trace, la variante peut
  // partir sans casser l'historique (ON DELETE SET NULL).
  const aSupprimer = db.all('SELECT id FROM variantes WHERE produit_id = ?', produitId)
    .filter((v) => !gardees.includes(v.id));
  for (const v of aSupprimer) db.run('DELETE FROM variantes WHERE id = ?', v.id);

  db.run('DELETE FROM points_forts WHERE produit_id = ?', produitId);
  d.points_forts.filter((t) => t.trim()).forEach((texte, i) => {
    db.run('INSERT INTO points_forts (produit_id, texte, ordre) VALUES (?, ?, ?)', produitId, texte.trim(), i);
  });
}

r.post('/produits', valider(S.produit), (req, res) => {
  const d = req.donnees;
  const slug = slugUnique('produits', slugifier(d.slug || d.nom));
  const ecrire = db.transaction(() => {
    const ins = db.run(
      `INSERT INTO produits (categorie_id, nom, slug, reference, description, matiere, prix, prix_barre, actif, mis_en_avant, ordre)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      d.categorie_id || null, d.nom, slug, d.reference, d.description, d.matiere,
      d.prix, d.prix_barre === '' || d.prix_barre == null ? null : d.prix_barre,
      d.actif, d.mis_en_avant, d.ordre
    );
    /* Le prix saisi est celui du marché principal. Aucun prix n'est
       inventé pour les autres : un produit sans prix en dirhams n'est
       tout simplement pas proposé aux Émirats, ce qui vaut mieux qu'un
       montant converti que le commerçant n'a jamais validé. */
    poserPrix(ins.dernierId, d.prix, d.prix_barre);
    poserPrixMarches(ins.dernierId, d.prix_marches);
    ecrireVariantesEtPoints(ins.dernierId, d);
    return ins.dernierId;
  });
  const id = ecrire();
  res.status(201).json({ ok: true, id, slug });
});

r.put('/produits/:id', valider(S.produit), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!db.get('SELECT id FROM produits WHERE id = ?', id)) {
    return res.status(404).json({ erreur: 'Produit introuvable.' });
  }
  const d = req.donnees;
  const slug = slugUnique('produits', slugifier(d.slug || d.nom), id);
  db.transaction(() => {
    db.run(
      `UPDATE produits SET categorie_id = ?, nom = ?, slug = ?, reference = ?, description = ?,
              matiere = ?, prix = ?, prix_barre = ?, actif = ?, mis_en_avant = ?, ordre = ?,
              modifie_le = datetime('now')
        WHERE id = ?`,
      d.categorie_id || null, d.nom, slug, d.reference, d.description, d.matiere,
      d.prix, d.prix_barre === '' || d.prix_barre == null ? null : d.prix_barre,
      d.actif, d.mis_en_avant, d.ordre, id
    );
    poserPrix(id, d.prix, d.prix_barre);
    poserPrixMarches(id, d.prix_marches);
    ecrireVariantesEtPoints(id, d);
  })();
  res.json({ ok: true, slug });
});

r.delete('/produits/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const nb = db.get('SELECT COUNT(*) n FROM lignes_commande WHERE produit_id = ?', id).n;
  if (nb > 0 && req.query.force !== '1') {
    return res.status(409).json({
      erreur: `Ce produit apparaît dans ${nb} ligne(s) de commande. Désactivez-le plutôt que de le supprimer : l'historique des ventes doit rester lisible.`,
      suggestion: 'desactiver',
    });
  }
  const fichiers = db.all('SELECT fichier FROM images WHERE produit_id = ?', id);
  db.run('DELETE FROM produits WHERE id = ?', id);
  for (const f of fichiers) images.supprimer(f.fichier);
  res.json({ ok: true });
});

// --------------------------------------------------------------- images
r.post('/produits/:id/images', images.reception.array('images', 8), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!db.get('SELECT id FROM produits WHERE id = ?', id)) {
      return res.status(404).json({ erreur: 'Produit introuvable.' });
    }
    if (!req.files || !req.files.length) return res.status(400).json({ erreur: 'Aucune image reçue.' });

    const depart = db.get('SELECT COALESCE(MAX(ordre), -1) m FROM images WHERE produit_id = ?', id).m + 1;
    const ajoutees = [];
    for (const [i, f] of req.files.entries()) {
      const { fichier } = await images.enregistrer(f.buffer);
      const alt = db.get('SELECT nom FROM produits WHERE id = ?', id).nom;
      db.run('INSERT INTO images (produit_id, fichier, alt, ordre) VALUES (?, ?, ?, ?)', id, fichier, alt, depart + i);
      ajoutees.push(fichier);
    }
    res.status(201).json({ ok: true, images: ajoutees });
  } catch (e) { next(e); }
});

r.delete('/images/:id', (req, res) => {
  const img = db.get('SELECT * FROM images WHERE id = ?', parseInt(req.params.id, 10));
  if (!img) return res.status(404).json({ erreur: 'Image introuvable.' });
  db.run('DELETE FROM images WHERE id = ?', img.id);
  images.supprimer(img.fichier);
  res.json({ ok: true });
});

r.put('/produits/:id/images/ordre', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ordre = Array.isArray(req.body.ordre) ? req.body.ordre : [];
  db.transaction(() => {
    ordre.forEach((imageId, i) => {
      db.run('UPDATE images SET ordre = ? WHERE id = ? AND produit_id = ?', i, parseInt(imageId, 10), id);
    });
  })();
  res.json({ ok: true });
});

// ================================================================ STOCK
/**
 * La page Stock travaille à la maille de la TAILLE, pas du produit.
 * Une ligne = une taille. Au retour d'un réassort on descend la liste,
 * on tape la quantité, Entrée. Aucune fiche à ouvrir.
 */
r.get('/stock', (req, res) => {
  /* L'entrepôt regardé est demandé explicitement (?marche=ae), à défaut
     le principal. On ne le déduit PAS d'un cookie : l'administration
     n'est pas la vitrine, et un commerçant qui a laissé son site en
     dirhams pour vérifier une fiche ne doit pas se retrouver à corriger
     le stock de Dubaï en croyant corriger celui de Tunis. */
  const m = marches.parCode(String(req.query.marche || '')) || marches.defaut();
  let lignes = db.all(
    `SELECT v.id AS variante_id, v.taille, sm.stock AS stock, v.sku,
            p.id AS produit_id, p.nom, p.reference, p.actif, pm.prix AS prix,
            c.nom AS rayon,
            (SELECT fichier FROM images WHERE produit_id = p.id ORDER BY ordre LIMIT 1) AS image
       FROM variantes v
       JOIN produits p ON p.id = v.produit_id
       JOIN stock_marche sm ON sm.variante_id = v.id AND sm.marche = ?
       LEFT JOIN prix_marche pm ON pm.produit_id = p.id AND pm.marche = ?
       LEFT JOIN categories c ON c.id = p.categorie_id
      ORDER BY sm.stock ASC, p.nom, v.ordre`, m.code, m.code
  );
  const q = sansAccent(req.query.q);
  if (q) {
    lignes = lignes.filter((l) =>
      sansAccent(l.nom).includes(q) || sansAccent(l.reference).includes(q) ||
      sansAccent(l.taille).includes(q) || sansAccent(l.sku).includes(q) ||
      sansAccent(l.rayon).includes(q));
  }
  res.json({
    marche: { code: m.code, nom: m.nom, devise: m.devise, decimales: m.decimales },
    marches: marches.tous().map((x) => ({ code: x.code, nom: x.nom, devise: x.devise, actif: x.actif })),
    lignes,
  });
});

/**
 * Recopier les quantités d'un entrepôt vers un autre.
 *
 * Sert UNE FOIS, à l'ouverture d'un pays : saisir soixante tailles à la
 * main pour obtenir un point de départ qu'on va de toute façon ajuster
 * est un travail sans valeur. Après, les deux stocks vivent leur vie —
 * ce sont deux entrepôts réels, avec des quantités différentes.
 *
 * L'opération ÉCRASE la destination, et se fait en une transaction :
 * mi-copiée, elle laisserait un inventaire incohérent. Le nombre de
 * lignes touchées est renvoyé pour que l'écran puisse le dire.
 */
r.post('/stock/copier', (req, res) => {
  const source = marches.parCode(String((req.body && req.body.source) || ''));
  const cible = marches.parCode(String((req.body && req.body.cible) || ''));
  if (!source || !cible) return res.status(400).json({ erreur: 'Entrepôt inconnu.' });
  if (source.code === cible.code) {
    return res.status(400).json({ erreur: 'La source et la destination sont le même entrepôt.' });
  }

  const ecrire = db.transaction(() => {
    /* Chaque taille reçoit d'abord une ligne dans l'entrepôt cible si
       elle n'en a pas : sans ça, une taille créée après l'ouverture du
       pays serait silencieusement sautée par la copie. */
    db.run(
      `INSERT OR IGNORE INTO stock_marche (variante_id, marche, stock)
       SELECT id, ?, 0 FROM variantes`, cible.code);
    const u = db.run(
      `UPDATE stock_marche SET stock = (
         SELECT s.stock FROM stock_marche s
          WHERE s.variante_id = stock_marche.variante_id AND s.marche = ?)
       WHERE marche = ?
         AND EXISTS (SELECT 1 FROM stock_marche s
                      WHERE s.variante_id = stock_marche.variante_id AND s.marche = ?)`,
      source.code, cible.code, source.code);
    return u.changements;
  });

  const lignes = ecrire();
  res.json({ ok: true, lignes, source: source.nom, cible: cible.nom });
});

r.put('/stock/:varianteId', valider(S.stockLigne.pick({ stock: true })), (req, res) => {
  const id = parseInt(req.params.varianteId, 10);
  const m = marches.parCode(String(req.query.marche || '')) || marches.defaut();
  marches.completerStock(id);
  const u = db.run('UPDATE stock_marche SET stock = ? WHERE variante_id = ? AND marche = ?',
    req.donnees.stock, id, m.code);
  if (!u.changements) return res.status(404).json({ erreur: 'Taille introuvable.' });
  /* La colonne d'origine suit le marché principal, pour rester cohérente
     avec ce que la fiche produit affiche. */
  if (m.code === marches.defaut().code) {
    db.run('UPDATE variantes SET stock = ? WHERE id = ?', req.donnees.stock, id);
  }
  res.json({ ok: true, stock: req.donnees.stock, marche: m.code });
});

// ============================================================ COMMANDES
const SUIVANTS = {
  nouvelle: ['confirmee', 'annulee'],
  confirmee: ['en_preparation', 'expediee', 'annulee'],
  en_preparation: ['expediee', 'annulee'],
  expediee: ['livree', 'annulee'],
  livree: [],
  annulee: ['nouvelle'],
};

/**
 * Recopie le stock du pays PRINCIPAL dans variantes.stock.
 *
 * Cette vieille colonne n'est plus lue nulle part — ni par la vitrine, ni
 * par la fiche produit depuis la correction — mais elle sert de source à
 * la migration qui remplit stock_marche au premier démarrage d'une base
 * ancienne. Un commentaire affirmait qu'elle restait « écrite en
 * parallèle » ; c'était vrai partout sauf ici, au seul endroit où le
 * stock bouge tout seul. Une affirmation fausse dans un commentaire est
 * pire que pas de commentaire : elle empêche de chercher au bon endroit.
 */
function alignerColonneOrigine(varianteId, marche) {
  if (marche !== marches.defaut().code) return;
  const l = db.get('SELECT stock FROM stock_marche WHERE variante_id = ? AND marche = ?',
    varianteId, marche);
  if (l) db.run('UPDATE variantes SET stock = ? WHERE id = ?', l.stock, varianteId);
}

/**
 * Règle du stock, écrite une seule fois et appliquée ici :
 *   • le stock SORT au passage au-delà de « nouvelle » ;
 *   • il REVIENT à l'annulation, ou au retour en « nouvelle ».
 * commandes.stock_retire empêche une double sortie : confirmer deux fois
 * la même commande ne retire le stock qu'une fois.
 */
function appliquerStock(commandeId, nouveauStatut) {
  const c = db.get('SELECT id, statut, stock_retire, marche FROM commandes WHERE id = ?', commandeId);
  const lignes = db.all('SELECT variante_id, quantite FROM lignes_commande WHERE commande_id = ?', commandeId);
  const doitEtreRetire = nouveauStatut !== 'nouvelle' && nouveauStatut !== 'annulee';

  /* L'ENTREPÔT EST CELUI DE LA COMMANDE, pas celui que regarde le
     commerçant au moment du clic. Une commande de Dubaï confirmée depuis
     une administration réglée sur la Tunisie doit vider le stock de
     Dubaï. Prendre le marché courant ici aurait fait baisser le mauvais
     entrepôt — une erreur invisible jusqu'au jour d'un inventaire.

     Les commandes antérieures aux marchés n'ont pas de colonne remplie :
     la valeur par défaut « tn » du schéma les rattache à la Tunisie, ce
     qui est exact puisque c'était alors le seul pays servi. */
  const marche = c.marche || 'tn';

  if (doitEtreRetire && !c.stock_retire) {
    for (const l of lignes) {
      if (l.variante_id) {
        db.run('UPDATE stock_marche SET stock = MAX(0, stock - ?) WHERE variante_id = ? AND marche = ?',
          l.quantite, l.variante_id, marche);
        alignerColonneOrigine(l.variante_id, marche);
      }
    }
    db.run('UPDATE commandes SET stock_retire = 1 WHERE id = ?', commandeId);
    return 'retire';
  }
  if (!doitEtreRetire && c.stock_retire) {
    for (const l of lignes) {
      if (l.variante_id) {
        db.run('UPDATE stock_marche SET stock = stock + ? WHERE variante_id = ? AND marche = ?',
          l.quantite, l.variante_id, marche);
        alignerColonneOrigine(l.variante_id, marche);
      }
    }
    db.run('UPDATE commandes SET stock_retire = 0 WHERE id = ?', commandeId);
    return 'rendu';
  }
  return 'inchange';
}

r.get('/commandes', (req, res) => {
  const conditions = [];
  const params = [];
  if (req.query.statut && S.STATUTS.includes(req.query.statut)) {
    conditions.push('statut = ?'); params.push(req.query.statut);
  }
  let lignes = db.all(
    `SELECT c.*, (SELECT COUNT(*) FROM lignes_commande l WHERE l.commande_id = c.id) AS nb_lignes
       FROM commandes c
      ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
      ORDER BY c.id DESC LIMIT 500`,
    ...params
  );
  const q = sansAccent(req.query.q);
  if (q) {
    lignes = lignes.filter((c) =>
      sansAccent(c.reference).includes(q) || sansAccent(c.nom).includes(q) ||
      String(c.telephone).includes(q) || sansAccent(c.ville).includes(q));
  }
  res.json({
    commandes: lignes,
    compteurs: Object.fromEntries(S.STATUTS.map((s) => [
      s, db.get('SELECT COUNT(*) n FROM commandes WHERE statut = ?', s).n,
    ])),
  });
});

r.get('/commandes/:id', (req, res) => {
  const c = db.get('SELECT * FROM commandes WHERE id = ?', parseInt(req.params.id, 10));
  if (!c) return res.status(404).json({ erreur: 'Commande introuvable.' });
  const mkc = marches.parCode(c.marche || 'tn');
  c.pays = mkc ? mkc.nom : (c.marche || 'tn');
  c.lignes = db.all('SELECT * FROM lignes_commande WHERE commande_id = ? ORDER BY id', c.id);
  c.statuts_possibles = SUIVANTS[c.statut] || [];
  c.client = c.client_id ? db.get('SELECT * FROM clients WHERE id = ?', c.client_id) : null;
  if (c.client) {
    c.client.nb_commandes = db.get('SELECT COUNT(*) n FROM commandes WHERE client_id = ?', c.client_id).n;
  }
  res.json(c);
});

r.put('/commandes/:id/statut', valider(S.majStatut), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const c = db.get('SELECT * FROM commandes WHERE id = ?', id);
  if (!c) return res.status(404).json({ erreur: 'Commande introuvable.' });

  const cible = req.donnees.statut;
  if (cible === c.statut) return res.json({ ok: true, statut: cible, stock: 'inchange' });

  let effet = 'inchange';
  db.transaction(() => {
    db.run("UPDATE commandes SET statut = ?, modifie_le = datetime('now') WHERE id = ?", cible, id);
    if (req.donnees.note_interne !== undefined) {
      db.run('UPDATE commandes SET note_interne = ? WHERE id = ?', req.donnees.note_interne, id);
    }
    effet = appliquerStock(id, cible);
  })();

  const messages = {
    retire: 'Statut mis à jour. Le stock a été décrémenté.',
    rendu: 'Statut mis à jour. Le stock a été remis en rayon.',
    inchange: 'Statut mis à jour. Le stock est inchangé.',
  };
  res.json({ ok: true, statut: cible, stock: effet, message: messages[effet] });
});

r.put('/commandes/:id/note', (req, res) => {
  db.run('UPDATE commandes SET note_interne = ? WHERE id = ?',
    String(req.body.note_interne || '').slice(0, 1000), parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// ==============================================================  CLIENTS
r.get('/clients', (req, res) => {
  let lignes = db.all(
    `SELECT c.*,
            (SELECT COUNT(*) FROM commandes o WHERE o.client_id = c.id) AS nb_commandes,
            (SELECT COALESCE(SUM(total),0) FROM commandes o WHERE o.client_id = c.id AND o.statut != 'annulee') AS total_achats,
            (SELECT MAX(cree_le) FROM commandes o WHERE o.client_id = c.id) AS derniere_commande
       FROM clients c ORDER BY c.id DESC LIMIT 1000`
  );
  const q = sansAccent(req.query.q);
  if (q) {
    lignes = lignes.filter((c) => sansAccent(c.nom).includes(q) ||
      String(c.telephone).includes(q) || sansAccent(c.ville).includes(q) || sansAccent(c.email).includes(q));
  }
  res.json(lignes);
});

r.get('/clients/:id', (req, res) => {
  const c = db.get('SELECT * FROM clients WHERE id = ?', parseInt(req.params.id, 10));
  if (!c) return res.status(404).json({ erreur: 'Client introuvable.' });
  c.commandes = db.all('SELECT id, reference, statut, total, cree_le FROM commandes WHERE client_id = ? ORDER BY id DESC', c.id);
  res.json(c);
});

r.put('/clients/:id', valider(S.client), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const d = req.donnees;
  const doublon = db.get('SELECT id FROM clients WHERE telephone = ? AND id != ?', d.telephone, id);
  if (doublon) return res.status(409).json({ erreur: 'Un autre client utilise déjà ce numéro de téléphone.' });
  db.run(
    'UPDATE clients SET nom = ?, telephone = ?, email = ?, adresse = ?, ville = ?, gouvernorat = ?, code_postal = ?, note = ? WHERE id = ?',
    d.nom, d.telephone, d.email, d.adresse, d.ville, d.gouvernorat, d.code_postal, d.note, id
  );
  res.json({ ok: true });
});

r.delete('/clients/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const nb = db.get('SELECT COUNT(*) n FROM commandes WHERE client_id = ?', id).n;
  if (nb > 0) {
    // Refus explicite, avec la raison. Supprimer ce client détacherait
    // ses commandes de leur historique — et la comptabilité avec.
    return res.status(409).json({
      erreur: `Impossible : ce client a ${nb} commande(s). Supprimer sa fiche détacherait ces commandes de leur historique. Supprimez d'abord les commandes, ou gardez la fiche.`,
    });
  }
  db.run('DELETE FROM clients WHERE id = ?', id);
  res.json({ ok: true });
});

// ===========================================================  PROMOTIONS
r.get('/promotions', (req, res) => {
  const lignes = db.all('SELECT * FROM promotions ORDER BY actif DESC, id DESC');
  for (const p of lignes) {
    p.cibles = db.all('SELECT cible_type, cible_id FROM promotions_cibles WHERE promotion_id = ?', p.id);
  }
  res.json(lignes);
});

function ecrireCibles(promotionId, cibles) {
  db.run('DELETE FROM promotions_cibles WHERE promotion_id = ?', promotionId);
  for (const c of cibles) {
    db.run('INSERT OR IGNORE INTO promotions_cibles (promotion_id, cible_type, cible_id) VALUES (?, ?, ?)',
      promotionId, c.cible_type, c.cible_id);
  }
}

r.post('/promotions', valider(S.promotion), (req, res) => {
  const d = req.donnees;
  if (db.get('SELECT id FROM promotions WHERE code = ?', d.code)) {
    return res.status(409).json({ erreur: 'Ce code existe déjà.' });
  }
  const id = db.transaction(() => {
    const ins = db.run(
      `INSERT INTO promotions (code, libelle, type, valeur, minimum_achat, portee, debut_le, fin_le, usage_max, actif)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      d.code, d.libelle, d.type, d.valeur, d.minimum_achat, d.portee,
      d.debut_le || null, d.fin_le || null, d.usage_max, d.actif
    );
    ecrireCibles(ins.dernierId, d.cibles);
    return ins.dernierId;
  })();
  res.status(201).json({ ok: true, id });
});

r.put('/promotions/:id', valider(S.promotion), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const d = req.donnees;
  const doublon = db.get('SELECT id FROM promotions WHERE code = ? AND id != ?', d.code, id);
  if (doublon) return res.status(409).json({ erreur: 'Ce code est déjà utilisé par une autre promotion.' });
  db.transaction(() => {
    db.run(
      `UPDATE promotions SET code = ?, libelle = ?, type = ?, valeur = ?, minimum_achat = ?,
              portee = ?, debut_le = ?, fin_le = ?, usage_max = ?, actif = ? WHERE id = ?`,
      d.code, d.libelle, d.type, d.valeur, d.minimum_achat, d.portee,
      d.debut_le || null, d.fin_le || null, d.usage_max, d.actif, id
    );
    ecrireCibles(id, d.cibles);
  })();
  res.json({ ok: true });
});

r.delete('/promotions/:id', (req, res) => {
  db.run('DELETE FROM promotions WHERE id = ?', parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// =============================================================  RÉGLAGES
r.get('/reglages', (req, res) => {
  res.json({
    valeurs: reglages.tous(),
    champs_legaux_requis: reglages.CHAMPS_LEGAUX_REQUIS,
    manquants: reglages.CHAMPS_LEGAUX_REQUIS.filter((c) => !reglages.get(c)),
  });
});

/**
 * Un bouton pour ESSAYER les alertes avant d'en dépendre.
 *
 * Sans lui, on découvre qu'un jeton est mal recopié le jour de la
 * première vraie commande — c'est-à-dire le jour où l'on comptait
 * dessus. L'erreur renvoyée est celle de Telegram, mot pour mot :
 * « chat not found » ne veut pas dire la même chose que « Unauthorized ».
 */
r.post('/notification/essai', async (req, res) => {
  const r2 = await notifier.essai();
  if (r2.ok) return res.json({ ok: true, message: 'Message envoyé. Regardez votre Telegram.' });
  const aide = r2.erreur === 'non configuré'
    ? 'Renseignez le jeton du bot ET l\'identifiant de conversation, puis enregistrez.'
    : `Telegram a répondu : « ${r2.erreur} ».`;
  res.status(400).json({ erreur: aide });
});

r.put('/reglages', (req, res) => {
  const entrees = req.body && typeof req.body === 'object' ? req.body : {};
  const connus = new Set(Object.keys(reglages.DEFAUTS));
  const acceptees = {};
  for (const [cle, valeur] of Object.entries(entrees)) {
    if (!connus.has(cle)) continue;                       // rien d'inconnu n'entre en base
    acceptees[cle] = String(valeur ?? '').slice(0, 2000);
  }

  /* L'IDENTIFIANT DU PIXEL EST UN NOMBRE, PAS UN TEXTE LIBRE.

     Meta donne un identifiant de 15 ou 16 chiffres. Le commerçant, lui,
     copie souvent tout le bloc de code affiché par Meta, balises
     comprises. Accepté tel quel, il ne suivrait rien du tout et rien ne
     le dirait : le pixel resterait muet pendant des semaines de publicité
     payée. On refuse, et on dit où trouver le bon numéro. */
  if ('pixel_meta' in acceptees) {
    const v = String(acceptees.pixel_meta).replace(/\s/g, '');
    if (v && !/^\d{10,20}$/.test(v)) {
      return res.status(400).json({
        erreur: 'L\'identifiant du pixel Meta est un nombre de 15 ou 16 chiffres, rien d\'autre. '
          + 'Vous le trouvez dans Meta Events Manager, à côté du nom de votre pixel — pas le bloc '
          + 'de code entier, seulement le numéro.',
      });
    }
    acceptees.pixel_meta = v;
  }

  /* Le délai de rétractation a un plancher fixé par la loi : on refuse,
     on n'ajuste pas en silence. Corriger sans le dire laisserait le
     commerçant croire que sa saisie a été prise en compte. */
  if ('legal_delai_retract' in acceptees) {
    const d = parseInt(acceptees.legal_delai_retract, 10);
    if (!Number.isFinite(d) || d < reglages.DELAI_RETRACTATION_MINIMUM) {
      return res.status(400).json({
        erreur: `Le délai de rétractation ne peut pas être inférieur à ${reglages.DELAI_RETRACTATION_MINIMUM} jours ouvrables : `
          + 'c\'est le minimum accordé au consommateur par la loi 2000-83 sur le commerce électronique (article 30). '
          + 'Vous pouvez offrir davantage.',
      });
    }
  }

  /* « Pas encore inscrite » vide les deux champs qui attendent un numéro
     officiel, quand ils contiennent une mention à la place d'un numéro.

     Sans ça, l'ordre des clics décidait du résultat : cocher « pas encore
     inscrite » alors que les champs contenaient « Non assujetti » retirait
     les lignes de la page publique ET faisait passer les champs pour
     remplis — donc plus d'alerte au tableau de bord, plus de confirmation
     avant ouverture. Le réglage censé rendre le manque visible l'aurait
     rendu invisible. Un réglage dont l'effet dépend de l'ordre dans lequel
     on l'active est un piège, pas un réglage.

     On ne touche qu'aux mentions reconnues : si un vrai numéro est écrit
     là, il est conservé — se tromper de case ne doit pas effacer une
     donnée qu'on ne pourra pas retrouver. */
  const nettoyes = [];
  if (acceptees.legal_entreprise_inscrite === '0') {
    for (const cle of reglages.CHAMPS_NUMERO_OFFICIEL) {
      const v = String(acceptees[cle] ?? reglages.get(cle)).trim();
      if (v && reglages.MENTION_NON_VALIDE.test(v)) { acceptees[cle] = ''; nettoyes.push(cle); }
    }
  }

  reglages.definirPlusieurs(acceptees);
  res.json({
    ok: true,
    enregistres: Object.keys(acceptees),
    nettoyes,
    valeurs: reglages.tous(),
  });
});

/** L'interrupteur ouvrir / fermer, isolé pour être appelable en un clic. */
r.put('/boutique/ouverte', (req, res) => {
  const ouverte = req.body.ouverte ? '1' : '0';
  reglages.definir('boutique_ouverte', ouverte);
  res.json({
    ok: true,
    boutique_ouverte: ouverte === '1',
    message: ouverte === '1'
      ? 'Boutique ouverte. Les visiteurs peuvent commander.'
      : 'Boutique fermée. Les visiteurs voient la page d\'attente (503) et aucune commande ne peut être passée.',
  });
});

// ==========================================================  UTILISATEURS
r.get('/utilisateurs', (req, res) => {
  res.json(db.all('SELECT id, email, nom, role, actif, derniere_connexion, cree_le FROM utilisateurs ORDER BY id'));
});

r.post('/utilisateurs', valider(S.utilisateur), (req, res) => {
  const d = req.donnees;
  if (db.get('SELECT id FROM utilisateurs WHERE email = ?', d.email)) {
    return res.status(409).json({ erreur: 'Un compte utilise déjà cet e-mail.' });
  }
  const ins = db.run('INSERT INTO utilisateurs (email, nom, mot_de_passe, role) VALUES (?, ?, ?, ?)',
    d.email, d.nom, auth.hacher(d.mot_de_passe), d.role);
  res.status(201).json({ ok: true, id: ins.dernierId });
});

r.delete('/utilisateurs/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.utilisateur.id) return res.status(409).json({ erreur: 'Vous ne pouvez pas supprimer votre propre compte.' });
  if (db.get('SELECT COUNT(*) n FROM utilisateurs WHERE actif = 1').n <= 1) {
    return res.status(409).json({ erreur: 'Il doit rester au moins un compte administrateur.' });
  }
  db.run('DELETE FROM utilisateurs WHERE id = ?', id);   // les sessions tombent en cascade
  res.json({ ok: true });
});

// ==========================================================  SAUVEGARDE
r.post('/sauvegarde', (req, res, next) => {
  try {
    const dossier = path.join(__dirname, '..', '..', 'data', 'sauvegardes');
    const nom = `boutique-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.db`;
    db.sauvegarder(path.join(dossier, nom));
    const taille = fs.statSync(path.join(dossier, nom)).size;
    res.json({ ok: true, fichier: nom, taille, message: 'Sauvegarde créée dans data/sauvegardes.' });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------- statistiques */
r.get('/statistiques', (req, res) => {
  const jours = Math.min(365, Math.max(7, parseInt(req.query.jours, 10) || 30));
  res.json({
    resume: stats.resume(jours),
    serie: stats.serie(jours),
    pages: stats.pages(jours),
    produits: stats.produits(jours),
    sources: stats.sources(jours),
    appareils: stats.appareils(jours),
  });
});

r.get('/sauvegardes', (req, res) => {
  const dossier = path.join(__dirname, '..', '..', 'data', 'sauvegardes');
  if (!fs.existsSync(dossier)) return res.json([]);
  res.json(fs.readdirSync(dossier).filter((f) => f.endsWith('.db')).sort().reverse().map((f) => ({
    fichier: f, taille: fs.statSync(path.join(dossier, f)).size,
  })));
});

module.exports = r;
