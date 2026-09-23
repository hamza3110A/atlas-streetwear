'use strict';
/**
 * Statistiques de fréquentation — hébergées ici, chez le commerçant.
 *
 * Pourquoi pas Google Analytics : le cahier des charges interdit les
 * services extérieurs au moment de l'exécution. Et un service extérieur
 * imposerait une bannière de cookies, enverrait les données de navigation
 * des clients tunisiens à un tiers, et cesserait de fonctionner le jour où
 * il change ses conditions.
 *
 * DEUX CHOIX DE FOND, à ne pas défaire sans y penser :
 *
 * 1. LE COMPTAGE EST CÔTÉ SERVEUR. Un script de mesure dans la page est
 *    bloqué par tous les bloqueurs de publicité, qui équipent une part
 *    importante des navigateurs. Le commerçant verrait alors des chiffres
 *    faux sans jamais pouvoir savoir de combien. Ici, on compte au moment
 *    où la page part du serveur : rien à bloquer.
 *
 * 2. AUCUNE ADRESSE IP N'EST CONSERVÉE. Le visiteur est identifié par une
 *    empreinte SHA-256 de (IP + navigateur + secret + JOUR). Le sel change
 *    à minuit, donc l'empreinte d'hier ne vaut plus rien aujourd'hui : on
 *    sait compter les personnes distinctes d'une journée, on ne peut pas
 *    suivre quelqu'un d'un jour à l'autre, et on ne peut pas remonter à
 *    une personne. Pas de cookie non plus — donc pas de bannière.
 */
const crypto = require('node:crypto');
const db = require('../db');

/* Les robots ne sont pas des clients. Les compter gonflerait les visites
   et écraserait le taux de conversion, qui est le seul chiffre qui dise
   au commerçant si son site marche. */
const ROBOTS = /bot|crawler|spider|crawling|slurp|facebookexternalhit|preview|whatsapp|telegram|discord|headless|lighthouse|curl|wget|python-requests|axios|postman|monitor|uptime|pingdom|semrush|ahrefs|dataprovider|scrapy/i;

/* D'où vient le visiteur. On garde la PROVENANCE, pas l'URL complète :
   le commerçant a besoin de savoir qu'Instagram lui amène du monde, pas
   de connaître le fil exact d'où l'on a cliqué. */
const SOURCES = [
  [/instagram|ig\.me/i, 'instagram'],
  [/facebook|fb\.com|fb\.me/i, 'facebook'],
  [/tiktok/i, 'tiktok'],
  [/google\./i, 'google'],
  [/bing\.|duckduckgo|yahoo|qwant|ecosia/i, 'autre moteur'],
  [/t\.co|twitter|x\.com/i, 'twitter'],
  [/youtube|youtu\.be/i, 'youtube'],
  [/wa\.me|whatsapp/i, 'whatsapp'],
  [/mail\.google|outlook|webmail/i, 'e-mail'],
];

let selDuJour = null;
let jourDuSel = '';

/** Un sel neuf chaque jour, jamais écrit sur le disque. */
function sel() {
  const j = aujourdhui();
  if (j !== jourDuSel) {
    selDuJour = crypto.randomBytes(32);
    jourDuSel = j;
  }
  return selDuJour;
}

function aujourdhui() {
  return new Date().toISOString().slice(0, 10);
}

function empreinte(req) {
  const ip = req.ip || req.socket.remoteAddress || '';
  const agent = req.get('user-agent') || '';
  return crypto.createHash('sha256')
    .update(ip).update('|').update(agent).update('|').update(sel())
    .digest('hex').slice(0, 24);   // 24 caractères : assez pour ne pas se cogner, inutile au-delà
}

function provenance(req) {
  const ref = req.get('referer') || '';
  if (!ref) return 'direct';
  try {
    const hote = new URL(ref).hostname;
    // un lien interne n'est pas une provenance : on ne vient pas « de soi-même »
    if (hote === req.hostname) return 'interne';
    for (const [motif, nom] of SOURCES) if (motif.test(hote)) return nom;
    return hote.replace(/^www\./, '').slice(0, 60);
  } catch { return 'direct'; }
}

function appareil(req) {
  const a = req.get('user-agent') || '';
  if (/iPad|Tablet/i.test(a)) return 'tablette';
  if (/Mobile|Android|iPhone/i.test(a)) return 'téléphone';
  return 'ordinateur';
}

/**
 * Enregistre une vue. Ne lève jamais : une statistique ratée ne doit pas
 * empêcher une page de s'afficher ni une vente de se faire.
 *
 * @param {object} req
 * @param {string} chemin     page vue, déjà nettoyée
 * @param {number|null} produitId  si c'est une fiche produit
 */
function noter(req, chemin, produitId = null) {
  try {
    const agent = req.get('user-agent') || '';
    if (!agent || ROBOTS.test(agent)) return;        // robot : on ne compte pas
    if (req.utilisateur) return;                     // le commerçant n'est pas un client
    db.run(
      'INSERT INTO visites (jour, chemin, produit_id, visiteur, source, appareil) VALUES (?, ?, ?, ?, ?, ?)',
      aujourdhui(), chemin.slice(0, 200), produitId, empreinte(req), provenance(req), appareil(req)
    );
  } catch { /* une visite non comptée ne casse rien */ }
}

/** Middleware : compte les pages de la vitrine, et elles seules. */
function middleware(chemin) {
  return (req, res, next) => { noter(req, chemin); next(); };
}

/* ------------------------------------------------------------------ lecture */

/** Les N derniers jours, y compris ceux SANS visite.
 *  Un graphique qui saute les jours creux ment sur la régularité : deux
 *  points côte à côte donnent l'illusion d'une fréquentation continue. */
function serie(jours = 30) {
  const lignes = db.all(`
    SELECT v.jour,
           COUNT(*)                    AS visites,
           COUNT(DISTINCT v.visiteur)  AS visiteurs
      FROM visites v
     WHERE v.jour >= date('now', ?)
     GROUP BY v.jour`, `-${jours - 1} days`);
  const cmds = db.all(`
    SELECT substr(cree_le, 1, 10) AS jour,
           COUNT(*)               AS commandes,
           COALESCE(SUM(total),0) AS chiffre
      FROM commandes
     WHERE substr(cree_le, 1, 10) >= date('now', ?) AND statut != 'annulee'
     GROUP BY substr(cree_le, 1, 10)`, `-${jours - 1} days`);

  const parJour = new Map();
  for (const l of lignes) parJour.set(l.jour, { ...l, commandes: 0, chiffre: 0 });
  for (const c of cmds) {
    const e = parJour.get(c.jour) || { jour: c.jour, visites: 0, visiteurs: 0 };
    parJour.set(c.jour, { ...e, commandes: c.commandes, chiffre: c.chiffre });
  }

  const out = [];
  for (let i = jours - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push(parJour.get(d) || { jour: d, visites: 0, visiteurs: 0, commandes: 0, chiffre: 0 });
  }
  return out;
}

function resume(jours = 30) {
  const s = serie(jours);
  const visites = s.reduce((t, x) => t + x.visites, 0);
  const commandes = s.reduce((t, x) => t + x.commandes, 0);
  const chiffre = s.reduce((t, x) => t + x.chiffre, 0);
  /* Les visiteurs uniques ne s'additionnent PAS : quelqu'un qui revient
     trois jours compterait pour trois. On les recompte sur la période. */
  const visiteurs = db.get(
    'SELECT COUNT(DISTINCT visiteur) n FROM visites WHERE jour >= date(\'now\', ?)', `-${jours - 1} days`).n;
  return {
    jours, visites, visiteurs, commandes, chiffre,
    // combien de visiteurs finissent par commander : le seul chiffre qui
    // dise si le site travaille, ou s'il se contente d'être joli
    conversion: visiteurs ? +(commandes / visiteurs * 100).toFixed(2) : 0,
    panier_moyen: commandes ? Math.round(chiffre / commandes) : 0,
  };
}

const periode = (jours) => `-${jours - 1} days`;

function pages(jours = 30, limite = 10) {
  return db.all(`
    SELECT chemin, COUNT(*) vues, COUNT(DISTINCT visiteur) visiteurs
      FROM visites WHERE jour >= date('now', ?) AND produit_id IS NULL
     GROUP BY chemin ORDER BY vues DESC LIMIT ?`, periode(jours), limite);
}

function produits(jours = 30, limite = 10) {
  return db.all(`
    SELECT p.id, p.nom, p.slug, COUNT(*) vues, COUNT(DISTINCT v.visiteur) visiteurs,
           (SELECT COALESCE(SUM(lc.quantite), 0) FROM lignes_commande lc
              JOIN commandes c ON c.id = lc.commande_id
             WHERE lc.produit_id = p.id AND c.statut != 'annulee'
               AND substr(c.cree_le, 1, 10) >= date('now', ?)) AS vendus
      FROM visites v JOIN produits p ON p.id = v.produit_id
     WHERE v.jour >= date('now', ?)
     GROUP BY p.id ORDER BY vues DESC LIMIT ?`, periode(jours), periode(jours), limite);
}

function sources(jours = 30) {
  return db.all(`
    SELECT source, COUNT(*) vues, COUNT(DISTINCT visiteur) visiteurs
      FROM visites WHERE jour >= date('now', ?) AND source != 'interne'
     GROUP BY source ORDER BY visiteurs DESC LIMIT 12`, periode(jours));
}

function appareils(jours = 30) {
  return db.all(`
    SELECT appareil, COUNT(DISTINCT visiteur) visiteurs
      FROM visites WHERE jour >= date('now', ?)
     GROUP BY appareil ORDER BY visiteurs DESC`, periode(jours));
}

/**
 * Entretien : résume la veille, puis efface le détail de plus de 180 jours.
 * Le résumé, lui, ne s'efface jamais — il pèse une ligne par jour.
 */
function entretien() {
  try {
    db.run(`
      INSERT INTO visites_jour (jour, visites, visiteurs, commandes, chiffre)
      SELECT v.jour, COUNT(*), COUNT(DISTINCT v.visiteur),
             (SELECT COUNT(*) FROM commandes c
               WHERE substr(c.cree_le,1,10) = v.jour AND c.statut != 'annulee'),
             (SELECT COALESCE(SUM(c.total),0) FROM commandes c
               WHERE substr(c.cree_le,1,10) = v.jour AND c.statut != 'annulee')
        FROM visites v GROUP BY v.jour
      ON CONFLICT(jour) DO UPDATE SET
        visites = excluded.visites, visiteurs = excluded.visiteurs,
        commandes = excluded.commandes, chiffre = excluded.chiffre`);
    const avant = db.get('SELECT COUNT(*) n FROM visites').n;
    db.run("DELETE FROM visites WHERE jour < date('now', '-180 days')");
    return { resume: true, effacees: avant - db.get('SELECT COUNT(*) n FROM visites').n };
  } catch (e) { return { resume: false, erreur: e.message }; }
}

module.exports = {
  noter, middleware, serie, resume, pages, produits, sources, appareils, entretien,
};
