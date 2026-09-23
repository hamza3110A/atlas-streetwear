'use strict';
const db = require('../db');
const reglages = require('./reglages');
const marches = require('./marches');

/**
 * RECALCUL SERVEUR.
 *
 * Le navigateur envoie une liste de {variante_id, quantite} et rien d'autre
 * qui compte. Les prix, les frais de livraison, la remise et le total sont
 * relus en base et recalculés ici. Ce qui vient du client est une
 * proposition, jamais un fait.
 *
 * Même le prix affiché dans le panier est ignoré : si quelqu'un ouvre les
 * outils de développement et met le hoodie à 1 DT, la commande enregistrée
 * est à 189 DT.
 */

/**
 * Montant entier → texte, selon la devise.
 *
 * Le nombre de décimales n'est plus une constante : trois en Tunisie,
 * deux aux Émirats. L'ancienne version divisait toujours par 1 000 et
 * affichait donc 115,250 AED là où le client doit lire 115,25 — un
 * montant faux d'un facteur dix, sans la moindre erreur à l'écran.
 */
function centimesVersTexte(montant, decimales = 3) {
  const signe = montant < 0 ? '-' : '';
  const base = Math.pow(10, decimales);
  const v = Math.abs(Math.round(montant));
  return `${signe}${Math.floor(v / base)},${String(v % base).padStart(decimales, '0')}`;
}

/**
 * @param {Array<{variante_id:number, quantite:number}>} panier
 * @param {string} code  code promo éventuel
 * @param {object} marche  le marché RÉSOLU PAR LE SERVEUR (jamais celui
 *   que le navigateur prétend). C'est lui qui décide du prix lu, du stock
 *   consulté, des frais de livraison et de la devise.
 * @returns {{lignes, sous_total, frais_livraison, remise, total, promotion, avertissements}}
 */
function calculer(panier, code, marche) {
  /* Aucun marché fourni : on prend celui par défaut plutôt que de
     planter. Un appel interne qui oublie l'argument doit produire un
     devis tunisien, pas une page d'erreur. */
  const m = marche || marches.defaut();
  /* DEUX listes, et la distinction n'est pas cosmétique.
     
     « avertissements » = le panier N'EST PLUS celui que le client a
     validé : un article a disparu, n'est plus en vente, est épuisé, ou sa
     quantité a été réduite. Dans ce cas on refuse d'enregistrer la
     commande : il doit revoir son récapitulatif.
     
     « notes_promo » = le code promo ne s'applique pas. Le panier, lui,
     n'a pas bougé d'un millime, et le total affiché est déjà le bon —
     celui sans remise. Bloquer la commande ici enfermait le client : il
     tapait un code au hasard, se voyait répondre « votre panier a
     changé », et ne pouvait PLUS JAMAIS commander, la page de commande
     n'ayant même pas de champ pour effacer le code. Trouvé en passant
     réellement commande après avoir saisi un code inexistant. */
  const avertissements = [];
  const notesPromo = [];
  const lignes = [];
  let sousTotal = 0;

  const vus = new Map();
  for (const item of panier || []) {
    const vid = parseInt(item.variante_id, 10);
    const q = Math.max(1, Math.min(20, parseInt(item.quantite, 10) || 1));
    if (!Number.isFinite(vid)) continue;
    vus.set(vid, (vus.get(vid) || 0) + q);   // fusionne les doublons
  }

  for (const [vid, quantiteDemandee] of vus) {
    /* Prix ET stock viennent du marché. Deux jointures INTERNES, et
       c'est voulu : un produit sans prix dans ce marché ne remonte pas,
       donc il ne peut pas être vendu à un prix inventé. Mieux vaut
       « cet article n'est pas disponible ici » qu'un article à zéro. */
    const v = db.get(
      `SELECT v.id AS variante_id, v.taille, v.sku,
              sm.stock AS stock,
              p.id AS produit_id, p.nom, p.reference, p.actif, p.slug,
              pm.prix AS prix,
              (SELECT fichier FROM images WHERE produit_id = p.id ORDER BY ordre LIMIT 1) AS image
         FROM variantes v
         JOIN produits p      ON p.id = v.produit_id
         JOIN prix_marche pm  ON pm.produit_id = p.id AND pm.marche = ?
         JOIN stock_marche sm ON sm.variante_id = v.id AND sm.marche = ?
        WHERE v.id = ?`, m.code, m.code, vid
    );
    if (!v) { avertissements.push('Un article a été retiré : il n\'est pas disponible dans ce pays.'); continue; }
    if (!v.actif) { avertissements.push(`« ${v.nom} » n'est plus en vente, il a été retiré du panier.`); continue; }

    let quantite = quantiteDemandee;
    if (v.stock <= 0) {
      avertissements.push(`« ${v.nom} » taille ${v.taille} est épuisé, il a été retiré du panier.`);
      continue;
    }
    if (quantite > v.stock) {
      avertissements.push(`Il ne reste que ${v.stock} × « ${v.nom} » taille ${v.taille}. Quantité ajustée.`);
      quantite = v.stock;
    }

    const totalLigne = v.prix * quantite;   // prix relu en base, pas celui du client
    sousTotal += totalLigne;
    lignes.push({
      variante_id: v.variante_id, produit_id: v.produit_id, slug: v.slug,
      nom: v.nom, taille: v.taille, reference: v.reference, image: v.image || '',
      prix_unitaire: v.prix, quantite, total_ligne: totalLigne, stock: v.stock,
    });
  }

  // --- livraison -------------------------------------------------------
  /* Les frais et le seuil viennent du MARCHÉ, plus des réglages
     généraux : livrer à Dubaï ne coûte pas ce que coûte livrer à Tunis,
     et un seuil de gratuité exprimé en dinars n'a aucun sens en
     dirhams. */
  const fraisBase = m.frais_livraison;
  const seuilGratuit = m.livraison_gratuite_des;
  let fraisLivraison = lignes.length === 0 ? 0 : fraisBase;
  if (seuilGratuit > 0 && sousTotal >= seuilGratuit) fraisLivraison = 0;

  // --- promotion -------------------------------------------------------
  let remise = 0;
  let promotion = null;
  const codeNettoye = String(code || '').trim().toUpperCase();
  if (codeNettoye && lignes.length) {
    const p = db.get(
      `SELECT * FROM promotions
        WHERE code = ? AND actif = 1
          AND (debut_le IS NULL OR debut_le = '' OR debut_le <= datetime('now'))
          AND (fin_le   IS NULL OR fin_le   = '' OR fin_le   >= datetime('now'))`,
      codeNettoye
    );
    if (!p) {
      notesPromo.push('Code promo inconnu ou expiré.');
    } else if (p.usage_max > 0 && p.usage_actuel >= p.usage_max) {
      notesPromo.push('Ce code promo a atteint sa limite d\'utilisation.');
    } else if (sousTotal < p.minimum_achat) {
      notesPromo.push(`Ce code s'applique à partir de ${centimesVersTexte(p.minimum_achat, m.decimales)} ${m.devise} d'achat.`);
    } else {
      // assiette : panier entier, ou seulement les produits/rayons ciblés
      let assiette = sousTotal;
      if (p.portee !== 'panier') {
        const cibles = db.all('SELECT cible_type, cible_id FROM promotions_cibles WHERE promotion_id = ?', p.id);
        const produits = new Set(cibles.filter((c) => c.cible_type === 'produit').map((c) => c.cible_id));
        const rayons = new Set(cibles.filter((c) => c.cible_type === 'categorie').map((c) => c.cible_id));
        assiette = 0;
        for (const l of lignes) {
          const cat = db.get('SELECT categorie_id FROM produits WHERE id = ?', l.produit_id);
          if (produits.has(l.produit_id) || (cat && rayons.has(cat.categorie_id))) assiette += l.total_ligne;
        }
        if (assiette === 0) notesPromo.push('Ce code ne s\'applique à aucun article du panier.');
      }
      if (p.type === 'pourcentage') remise = Math.round(assiette * Math.min(100, p.valeur) / 100);
      else if (p.type === 'montant') remise = Math.min(assiette, p.valeur);
      else if (p.type === 'livraison') { remise = 0; fraisLivraison = 0; }
      if (remise > 0 || p.type === 'livraison') promotion = { id: p.id, code: p.code, libelle: p.libelle, type: p.type, valeur: p.valeur };
    }
  }

  remise = Math.min(remise, sousTotal);
  const total = Math.max(0, sousTotal - remise + fraisLivraison);

  return {
    marche: m.code,
    devise: m.devise,
    decimales: m.decimales,
    delai_livraison: m.delai_livraison,
    lignes,
    sous_total: sousTotal,
    frais_livraison: fraisLivraison,
    remise,
    total,
    promotion,
    livraison_offerte: lignes.length > 0 && fraisLivraison === 0,
    notes_promo: notesPromo,
    reste_pour_livraison_offerte: seuilGratuit > 0 ? Math.max(0, seuilGratuit - sousTotal) : 0,
    avertissements,
  };
}

module.exports = { calculer, centimesVersTexte };
