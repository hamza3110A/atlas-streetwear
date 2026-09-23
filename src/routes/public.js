'use strict';
const express = require('express');
const db = require('../db');
const limite = require('../lib/limite');
const reglages = require('../lib/reglages');
const tarif = require('../lib/tarification');
const marches = require('../lib/marches');
const notifier = require('../lib/notifier');
const { valider, devis, commande } = require('../lib/schemas');

const r = express.Router();

const sansCache = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };

/** Réglages + rayons : tout ce dont l'en-tête du site a besoin. */
r.get('/boutique', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  const rayons = db.all(
    `SELECT c.id, c.nom, c.slug, c.description,
            (SELECT COUNT(*) FROM produits p WHERE p.categorie_id = c.id AND p.actif = 1) AS nb
       FROM categories c
      WHERE c.visible = 1
      ORDER BY c.ordre, c.nom`
  );
  /* Le marché courant est RÉSOLU ICI, à partir du cookie mais validé
     contre la liste des marchés actifs. La vitrine reçoit un fait, pas
     une demande : elle affiche ce que le serveur a décidé. */
  const m = marches.deLaRequete(req);
  const publics = reglages.publics();

  /* Frais, seuil de gratuité, délai et devise viennent du marché et
     ÉCRASENT les valeurs générales. Sans cet écrasement, le bandeau
     aurait continué d'annoncer « livraison offerte dès 200 DT » à un
     visiteur qui paie en dirhams. */
  publics.frais_livraison = m.frais_livraison;
  publics.livraison_gratuite_des = m.livraison_gratuite_des;
  publics.delai_livraison = m.delai_livraison;
  publics.devise_symbole = m.devise;

  /* Le téléphone du commerçant suit le pays servi, et le bouton WhatsApp
     suit le téléphone. Un numéro tunisien affiché à un client de Dubaï,
     c'est un appel international pour poser une question avant d'acheter
     — la plupart ne le passent pas. Vide côté pays, on garde le numéro
     général : le comportement d'avant, inchangé pour la Tunisie. */
  if (String(m.telephone || '').trim()) {
    const ind = marches.indicatifs(m);
    publics.telephone = String(m.telephone).trim();
    publics.whatsapp = reglages.lienWhatsApp(publics.telephone, ind.indicatif, ind.national);
  }

  /* Le bandeau suit le pays. Un texte propre au marché gagne ; sinon,
     le texte général ne sert que dans le pays PRINCIPAL — ailleurs, il
     annoncerait un seuil en dinars à quelqu'un qui paie en dirhams. */
  const principal = marches.defaut().code;
  if (String(m.bandeau_texte || '').trim()) {
    publics.bandeau_texte = m.bandeau_texte;
  } else if (m.code !== principal) {
    publics.bandeau_texte = '';
  }

  res.json({
    reglages: publics,
    rayons,
    marche: { code: m.code, nom: m.nom, devise: m.devise, decimales: m.decimales,
              langue: m.langue || 'fr',
              delai_livraison: m.delai_livraison,
              frais_livraison: m.frais_livraison,
              livraison_gratuite_des: m.livraison_gratuite_des,
              libelle_region: m.libelle_region,
              regions: marches.regions(m),
              exemples: marches.exemples(m) },
    marches: marches.actifs().map((x) => ({ code: x.code, nom: x.nom, devise: x.devise })),
  });
});

/**
 * Changer de marché. Une seule chose se passe ici : un cookie est posé.
 *
 * Le code demandé est vérifié contre les marchés ACTIFS avant d'être
 * écrit — poser un cookie sans le valider reviendrait à laisser le
 * visiteur ouvrir un marché que le commerçant garde fermé. Et comme
 * chaque page relit ce cookie à travers marches.deLaRequete(), une
 * valeur invalide qui passerait malgré tout serait de toute façon
 * ramenée au marché par défaut.
 */
r.post('/marche', sansCache, (req, res) => {
  const code = String((req.body && req.body.marche) || '');
  const m = marches.parCode(code);
  if (!m || !m.actif) return res.status(400).json({ erreur: 'Ce pays n\'est pas desservi.' });

  res.cookie(marches.COOKIE, m.code, {
    httpOnly: false,          // la vitrine a besoin de le lire pour cocher le bon bouton
    sameSite: 'Lax',
    maxAge: marches.COOKIE_DUREE * 1000,
    secure: req.secure || req.get('X-Forwarded-Proto') === 'https',
    path: '/',
  });
  res.json({ ok: true, marche: { code: m.code, nom: m.nom, devise: m.devise, decimales: m.decimales } });
});

/**
 * Mentions légales : un seul endroit renseigne les quatre pages légales,
 * les réglages. Tant qu'un champ obligatoire est vide, il s'affiche en
 * rouge sur le site ET dans l'administration — impossible de l'oublier.
 */
r.get('/legal', (req, res) => {
  const valeurs = {};
  for (const cle of Object.keys(reglages.DEFAUTS)) {
    if (cle.startsWith('legal_') || ['telephone', 'email', 'adresse', 'nom_boutique', 'delai_livraison', 'frais_livraison', 'livraison_gratuite_des'].includes(cle)) {
      valeurs[cle] = reglages.get(cle);
    }
  }
  /* « administre » dit à la page qui la regarde. Un champ légal vide doit
     se voir dans les deux cas, mais pas avec le même texte : le commerçant
     a besoin de savoir OÙ le remplir, le client n'a que faire d'une
     consigne d'administration. */
  /* La phrase sur les taxes est CALCULÉE à partir du régime, jamais écrite
     en dur dans une page : deux pages qui se contredisent sur la TVA, c'est
     le genre d'erreur qu'on ne voit qu'une fois le contrôle passé. */
  /* Frais, seuil et délai viennent du PAYS SERVI et écrasent les valeurs
     générales. Sans cet écrasement, la page « Livraison & retours »
     annonçait « 7,000 DT, offerte dès 200,000 DT, 2 à 4 jours ouvrables »
     à un client de Dubaï qui paie en dirhams et attend une semaine.
     Une page légale qui contredit le panier est pire qu'une page
     absente : elle engage le vendeur sur des conditions fausses. */
  const mk = marches.deLaRequete(req);
  valeurs.frais_livraison = String(mk.frais_livraison);
  valeurs.livraison_gratuite_des = String(mk.livraison_gratuite_des);
  valeurs.delai_livraison = mk.delai_livraison;
  valeurs.pays_livraison = mk.nom;
  valeurs.devise_nom = marches.nomDevise(mk);
  /* Même raison pour les pages légales : le numéro de contact qu'elles
     publient doit être celui que ce client-là peut composer. */
  if (String(mk.telephone || '').trim()) valeurs.telephone = String(mk.telephone).trim();

  valeurs.mention_tva = reglages.get('legal_regime_tva') === 'assujetti'
    ? 'toutes taxes comprises'
    : 'net de taxe — TVA non applicable';

  /* Tant que l'entreprise n'est pas inscrite, les deux lignes qui
     attendent un numéro officiel sont retirées de la page — pas remplies
     avec autre chose. */
  const masquer = reglages.get('legal_entreprise_inscrite') === '0'
    ? ['legal_matricule_fiscal', 'legal_rc']
    : [];

  res.json({
    valeurs, requis: reglages.CHAMPS_LEGAUX_REQUIS, administre: !!req.utilisateur, masquer,
    /* La page des cookies doit décrire ce que le site FAIT, pas ce qu'il
       faisait le jour où elle a été écrite. */
    pixel_actif: !!String(reglages.get('pixel_meta') || '').trim(),
    marche: { code: mk.code, nom: mk.nom, devise: mk.devise, decimales: mk.decimales,
              libelle_region: mk.libelle_region, regions: marches.regions(mk) },
  });
});

function produitPublic(p, m) {
  return {
    ...p,
    images: db.all('SELECT fichier, alt FROM images WHERE produit_id = ? ORDER BY ordre, id', p.id),
    /* Le stock affiché est celui de l'entrepôt qui sert ce marché. Une
       taille épuisée à Dubaï mais disponible à Tunis reste VISIBLE et
       barrée : le client voit que la pièce existe et qu'elle reviendra,
       au lieu de croire qu'elle n'a jamais été faite. */
    variantes: db.all(
      `SELECT v.id, v.taille, sm.stock, (sm.stock > 0) AS disponible
         FROM variantes v
         JOIN stock_marche sm ON sm.variante_id = v.id AND sm.marche = ?
        WHERE v.produit_id = ? ORDER BY v.ordre, v.id`,
      m.code, p.id
    ),
    points_forts: db.all('SELECT texte FROM points_forts WHERE produit_id = ? ORDER BY ordre, id', p.id)
      .map((x) => x.texte),
  };
}

/** Catalogue : /api/produits?rayon=hoodies&q=foudre */
r.get('/produits', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  const m = marches.deLaRequete(req);
  const conditions = ['p.actif = 1'];
  const params = [m.code, m.code];

  if (req.query.rayon) { conditions.push('c.slug = ?'); params.push(String(req.query.rayon)); }
  if (req.query.avant === '1') conditions.push('p.mis_en_avant = 1');
  if (req.query.q) {
    conditions.push('(p.nom LIKE ? OR p.description LIKE ? OR p.reference LIKE ?)');
    const m = '%' + String(req.query.q).slice(0, 60) + '%';
    params.push(m, m, m);
  }

  /* Le prix vient de prix_marche, en jointure INTERNE : un produit dont
     le prix n'a pas été saisi pour ce marché n'apparaît pas du tout. Ce
     n'est pas un oubli, c'est la seule réponse honnête — l'alternative
     serait de l'afficher à zéro, ou de convertir depuis le dinar un
     montant que le commerçant n'a jamais validé.

     Le stock total, lui, est celui du seul entrepôt qui sert ce marché :
     sans le filtre, un article épuisé à Dubaï mais plein à Tunis
     s'afficherait disponible aux Émirats, et la rupture n'apparaîtrait
     qu'au moment de commander. */
  const lignes = db.all(
    `SELECT p.id, p.nom, p.slug, pm.prix, pm.prix_barre, p.reference, p.mis_en_avant,
            c.nom AS rayon, c.slug AS rayon_slug,
            (SELECT COALESCE(SUM(sm.stock), 0)
               FROM variantes v JOIN stock_marche sm
                 ON sm.variante_id = v.id AND sm.marche = ?
              WHERE v.produit_id = p.id) AS stock_total
       FROM produits p
       JOIN prix_marche pm ON pm.produit_id = p.id AND pm.marche = ?
       LEFT JOIN categories c ON c.id = p.categorie_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.mis_en_avant DESC, p.ordre, p.id DESC
      LIMIT 200`,
    ...params
  );

  res.json(lignes.map((p) => ({
    ...p,
    epuise: p.stock_total === 0,
    images: db.all('SELECT fichier, alt FROM images WHERE produit_id = ? ORDER BY ordre, id LIMIT 2', p.id),
    tailles: db.all(
      `SELECT v.taille, sm.stock FROM variantes v
         JOIN stock_marche sm ON sm.variante_id = v.id AND sm.marche = ?
        WHERE v.produit_id = ? ORDER BY v.ordre, v.id`, m.code, p.id),
  })));
});

r.get('/produit/:slug', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  const m = marches.deLaRequete(req);
  /* pm.prix écrase p.prix : les deux colonnes portent le même nom, et
     c'est la valeur du marché qui doit gagner. La colonne p.prix d'origine
     n'est plus lue nulle part sur la vitrine. */
  const p = db.get(
    `SELECT p.*, pm.prix AS prix, pm.prix_barre AS prix_barre,
            c.nom AS rayon, c.slug AS rayon_slug
       FROM produits p
       JOIN prix_marche pm ON pm.produit_id = p.id AND pm.marche = ?
       LEFT JOIN categories c ON c.id = p.categorie_id
      WHERE p.slug = ? AND p.actif = 1`,
    m.code, String(req.params.slug)
  );
  /* Un produit qui existe mais n'a pas de prix dans ce marché tombe ici.
     Le message le dit pour ce qu'il est — « pas vendu dans ce pays » —
     plutôt que de laisser croire à une page cassée. */
  if (!p) return res.status(404).json({ erreur: 'Ce produit n\'est pas disponible dans ce pays.' });

  const complet = produitPublic(p, m);
  complet.suggestions = db.all(
    `SELECT p.id, p.nom, p.slug, pm.prix, pm.prix_barre,
            (SELECT fichier FROM images WHERE produit_id = p.id ORDER BY ordre LIMIT 1) AS image
       FROM produits p
       JOIN prix_marche pm ON pm.produit_id = p.id AND pm.marche = ?
      WHERE p.actif = 1 AND p.id != ? AND (p.categorie_id = ? OR ? IS NULL)
      ORDER BY p.mis_en_avant DESC, RANDOM() LIMIT 4`,
    m.code, p.id, p.categorie_id, p.categorie_id
  );
  res.json(complet);
});

/**
 * Devis du panier.
 * Le navigateur envoie des identifiants de variante et des quantités.
 * Il reçoit des prix. Jamais l'inverse.
 */
r.post('/panier', sansCache, valider(devis), (req, res) => {
  res.json(tarif.calculer(req.donnees.panier, req.donnees.code_promo, marches.deLaRequete(req)));
});

/** Création de commande — paiement à la livraison. */
r.post('/commande', sansCache, limite.commande, valider(commande), (req, res) => {
  const d = req.donnees;

  if (!reglages.booleen('boutique_ouverte')) {
    return res.status(503).json({ erreur: 'La boutique est momentanément fermée.' });
  }

  /* Le marché est celui que le SERVEUR résout, pas celui que le panier
     annonce. C'est le point où une commande trafiquée serait rattrapée :
     un panier prétendant des prix tunisiens pour une livraison émiratie
     est recalculé aux prix émiratis, ou refusé si les articles n'y sont
     pas vendus. */
  const m = marches.deLaRequete(req);

  /* LA RÉGION DOIT EXISTER DANS LE PAYS SERVI.
  
     Contrôlé ici, côté serveur, comme les prix. Une liste déroulante est
     une commodité pour le client, pas une garantie : elle se modifie en
     trois secondes dans un navigateur. Et une commande portant « Sousse »
     comme émirat partirait chez un transporteur incapable de la livrer —
     découvert au moment de l'expédition, pas avant. */
  /* Le numéro est vérifié selon le PAYS DE LIVRAISON, pas selon une
     règle unique. Le message nomme le format attendu là-bas. */
  const tel = marches.telephone(m, d.telephone);
  if (!tel.ok) return res.status(400).json({ erreur: tel.message });
  d.telephone = tel.valeur;

  if (!marches.regionValide(m, d.gouvernorat)) {
    return res.status(400).json({
      erreur: `« ${d.gouvernorat} » n'existe pas dans ce pays de livraison (${m.nom}). `
        + `Choisissez un ${String(m.libelle_region || 'région').toLowerCase()} dans la liste.`,
    });
  }

  // Recalcul intégral. Le total envoyé par le navigateur n'est même pas lu.
  const calc = tarif.calculer(d.panier, d.code_promo, m);
  if (calc.lignes.length === 0) {
    return res.status(409).json({
      erreur: 'Aucun article disponible dans votre panier.',
      avertissements: calc.avertissements,
    });
  }
  // Un article a disparu ou changé pendant la saisie : on n'enregistre pas
  // en silence une commande différente de celle que le client a validée.
  if (calc.avertissements.length) {
    return res.status(409).json({
      erreur: 'Votre panier a changé. Vérifiez le récapitulatif avant de valider.',
      avertissements: calc.avertissements,
      recalcul: calc,
    });
  }

  const reference = 'ATL-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' +
    String(Math.floor(Math.random() * 9000) + 1000);

  const ecrire = db.transaction(() => {
    // Client identifié par son téléphone : deux commandes du même numéro
    // sont le même client, son historique se construit tout seul.
    let client = db.get('SELECT * FROM clients WHERE telephone = ?', d.telephone);
    if (client) {
      db.run(
        'UPDATE clients SET nom = ?, email = COALESCE(NULLIF(?, \'\'), email), adresse = ?, ville = ?, gouvernorat = ?, code_postal = ? WHERE id = ?',
        d.nom, d.email, d.adresse, d.ville, d.gouvernorat, d.code_postal, client.id
      );
    } else {
      const ins = db.run(
        'INSERT INTO clients (telephone, nom, email, adresse, ville, gouvernorat, code_postal) VALUES (?, ?, ?, ?, ?, ?, ?)',
        d.telephone, d.nom, d.email, d.adresse, d.ville, d.gouvernorat, d.code_postal
      );
      client = { id: ins.dernierId };
    }

    const cmd = db.run(
      /* Le marché, la devise et le nombre de décimales sont FIGÉS dans
         la commande, au même titre que le nom et le prix de chaque
         article. Si le commerçant change un jour la devise d'un marché,
         ou ferme celui des Émirats, les commandes déjà passées doivent
         continuer à s'afficher dans la devise où elles ont été payées.
         Une commande qui change de monnaie après coup, c'est un
         historique comptable faux. */
      `INSERT INTO commandes (reference, client_id, statut, nom, telephone, email, adresse, ville,
        gouvernorat, code_postal, note_client, sous_total, frais_livraison, remise, total,
        promotion_id, code_promo, mode_paiement, stock_retire, ip, marche, devise, decimales)
       VALUES (?, ?, 'nouvelle', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'livraison', 0, ?, ?, ?, ?)`,
      reference, client.id, d.nom, d.telephone, d.email, d.adresse, d.ville, d.gouvernorat,
      d.code_postal, d.note_client, calc.sous_total, calc.frais_livraison, calc.remise, calc.total,
      calc.promotion ? calc.promotion.id : null, calc.promotion ? calc.promotion.code : '',
      String(req.ip || '').slice(0, 45), m.code, m.devise, m.decimales
    );

    for (const l of calc.lignes) {
      db.run(
        `INSERT INTO lignes_commande (commande_id, produit_id, variante_id, nom_produit, taille,
          reference, image, prix_unitaire, quantite, total_ligne)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        cmd.dernierId, l.produit_id, l.variante_id, l.nom, l.taille, l.reference, l.image,
        l.prix_unitaire, l.quantite, l.total_ligne
      );
    }

    if (calc.promotion) {
      db.run('UPDATE promotions SET usage_actuel = usage_actuel + 1 WHERE id = ?', calc.promotion.id);
    }
    // Le stock N'EST PAS retiré ici : une commande « nouvelle » n'est pas
    // encore une vente. Il sort quand le commerçant la confirme, et
    // stock_retire garantit qu'il ne sortira qu'une fois.
    return { id: cmd.dernierId, reference };
  });

  const resultat = ecrire();

  /* L'ALERTE PART APRÈS LA RÉPONSE, et ne l'attend pas.
  
     Si l'envoi se faisait avant, une lenteur de Telegram deviendrait une
     lenteur de la boutique, et une panne chez eux une erreur affichée à
     un client dont la commande est pourtant enregistrée. Ici, la pire
     chose qui puisse arriver est une ligne dans le journal du serveur. */
  res.status(201).json({
    ok: true,
    reference: resultat.reference,
    total: calc.total,
    sous_total: calc.sous_total,
    frais_livraison: calc.frais_livraison,
    remise: calc.remise,
    lignes: calc.lignes,
    devise: m.devise,
    decimales: m.decimales,
    delai: m.delai_livraison,
  });

  notifier.nouvelleCommande({
    reference: resultat.reference,
    pays: m.nom,
    total: marches.formater(calc.total, m),
    nom: d.nom,
    telephone: d.telephone,
    adresse: d.adresse,
    ville: d.ville,
    region: d.gouvernorat,
    note: d.note_client,
    lignes: calc.lignes,
  });
});

/** Suivi : référence + téléphone. Aucun compte à créer. */
r.get('/commande/:reference', sansCache, (req, res) => {
  const tel = String(req.query.telephone || '').replace(/[\s.\-()]/g, '').replace(/^(\+?216)/, '');
  const c = db.get(
    'SELECT * FROM commandes WHERE reference = ? AND telephone = ?',
    String(req.params.reference).toUpperCase(), tel
  );
  if (!c) return res.status(404).json({ erreur: 'Aucune commande ne correspond à ces informations.' });
  res.json({
    reference: c.reference, statut: c.statut, cree_le: c.cree_le,
    total: c.total, sous_total: c.sous_total, frais_livraison: c.frais_livraison, remise: c.remise,
    devise: c.devise || 'DT', decimales: c.decimales == null ? 3 : c.decimales,
    lignes: db.all('SELECT nom_produit, taille, prix_unitaire, quantite, total_ligne, image FROM lignes_commande WHERE commande_id = ?', c.id),
  });
});

module.exports = r;
