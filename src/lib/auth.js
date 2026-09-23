'use strict';
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');

const NOM_COOKIE = 'atlas_session';
const DUREE_JOURS = 14;

/**
 * bcryptjs plutôt que bcrypt : bcrypt est un module natif, il exige un
 * compilateur. Même problème que better-sqlite3 — sur un Windows sans
 * Visual Studio, l'installation échoue. bcryptjs est du JavaScript pur,
 * même algorithme, même coût 12. Il est plus lent (~250 ms par hachage),
 * ce qui, pour une page de connexion, n'est pas un défaut : c'est un
 * frein supplémentaire au bourrage d'identifiants.
 */
const COUT = 12;

/** Hachage bidon utilisé quand le compte n'existe pas (voir verifier()). */
const LEURRE = bcrypt.hashSync('mot-de-passe-qui-ne-sera-jamais-utilise', COUT);

function hacher(motDePasse) {
  return bcrypt.hashSync(motDePasse, COUT);
}

/**
 * Vérifie un couple e-mail / mot de passe.
 *
 * Quand le compte n'existe pas, on compare quand même contre un hachage
 * leurre. Sans ça, une réponse en 3 ms signifie « cet e-mail n'existe pas »
 * et une réponse en 250 ms signifie « il existe » : on peut énumérer les
 * comptes en mesurant le temps de réponse.
 */
function verifier(email, motDePasse) {
  const u = db.get(
    'SELECT * FROM utilisateurs WHERE email = ? AND actif = 1',
    String(email || '').trim().toLowerCase()
  );
  if (!u) {
    bcrypt.compareSync(String(motDePasse || ''), LEURRE);
    return null;
  }
  if (!bcrypt.compareSync(String(motDePasse || ''), u.mot_de_passe)) return null;
  return u;
}

function creerSession(utilisateurId, ip, agent) {
  const id = crypto.randomBytes(32).toString('base64url');
  const expire = new Date(Date.now() + DUREE_JOURS * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  db.run(
    'INSERT INTO sessions (id, utilisateur_id, expire_le, ip, agent) VALUES (?, ?, ?, ?, ?)',
    id, utilisateurId, expire, String(ip || '').slice(0, 45), String(agent || '').slice(0, 250)
  );
  return id;
}

function lireSession(id) {
  if (!id) return null;
  const s = db.get(
    `SELECT s.id, s.expire_le, u.id AS utilisateur_id, u.email, u.nom, u.role
       FROM sessions s JOIN utilisateurs u ON u.id = s.utilisateur_id
      WHERE s.id = ? AND u.actif = 1 AND s.expire_le > datetime('now')`,
    id
  );
  return s || null;
}

function detruireSession(id) {
  if (id) db.run('DELETE FROM sessions WHERE id = ?', id);
}

/** Révocation immédiate de toutes les sessions d'un compte. */
function detruireSessionsUtilisateur(utilisateurId) {
  db.run('DELETE FROM sessions WHERE utilisateur_id = ?', utilisateurId);
}

function purger() {
  db.run("DELETE FROM sessions WHERE expire_le <= datetime('now')");
}

/**
 * Le drapeau Secure se décide sur le protocole RÉEL de la requête,
 * jamais sur NODE_ENV.
 *
 * Le piège : NODE_ENV=production + site servi en HTTP (le temps de
 * configurer le certificat) → le navigateur refuse silencieusement un
 * cookie Secure arrivé en clair. Aucune erreur nulle part. La connexion
 * « réussit », puis renvoie à l'écran de connexion. On cherche pendant
 * une heure un mot de passe qui était juste.
 */
function requeteSecurisee(req) {
  if (req.secure) return true;                       // Express + trust proxy
  const xf = req.headers['x-forwarded-proto'];
  if (xf && String(xf).split(',')[0].trim() === 'https') return true;
  return false;
}

function poserCookie(req, res, sessionId) {
  res.cookie(NOM_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: requeteSecurisee(req),
    maxAge: DUREE_JOURS * 86400000,
    path: '/',
  });
}

function retirerCookie(req, res) {
  res.clearCookie(NOM_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: requeteSecurisee(req),
    path: '/',
  });
}

/** Middleware : attache req.utilisateur si une session valide existe. */
function attacher(req, res, next) {
  const s = lireSession(req.cookies[NOM_COOKIE]);
  req.session = s;
  req.utilisateur = s ? { id: s.utilisateur_id, email: s.email, nom: s.nom, role: s.role } : null;
  next();
}

/**
 * Middleware : refuse l'accès si non connecté.
 *
 * On teste req.originalUrl, PAS req.path.
 *
 * Le piège : monté par `app.use('/api/admin', exigerAdmin, …)`, req.path
 * vaut « /produits » — le préfixe du montage a disparu. Le test
 * `req.path.startsWith('/api/')` était donc toujours faux, et une requête
 * d'API non authentifiée recevait une REDIRECTION 302 vers la page de
 * connexion au lieu d'un 401. fetch() suit la redirection, récupère du
 * HTML avec un code 200, et le code appelant conclut que tout va bien.
 * Aucune donnée ne fuyait, mais l'administration ne savait plus qu'elle
 * était déconnectée. req.originalUrl garde l'URL complète.
 */
function exigerAdmin(req, res, next) {
  if (!req.utilisateur) {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ erreur: 'Session expirée. Reconnectez-vous.' });
    }
    return res.redirect('/admin/connexion.html?suite=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

module.exports = {
  NOM_COOKIE, COUT,
  hacher, verifier,
  creerSession, lireSession, detruireSession, detruireSessionsUtilisateur, purger,
  requeteSecurisee, poserCookie, retirerCookie,
  attacher, exigerAdmin,
};
