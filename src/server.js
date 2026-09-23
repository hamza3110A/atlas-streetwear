'use strict';
require('../scripts/charger-env')();

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const db = require('./db');
const auth = require('./lib/auth');
const limite = require('./lib/limite');
const images = require('./lib/images');
const reglages = require('./lib/reglages');
const stats = require('./lib/statistiques');
const marches = require('./lib/marches');
const pages = require('./lib/pages');
const i18n = require('../public/js/i18n');

const RACINE = path.join(__dirname, '..');
const PUBLIC = path.join(RACINE, 'public');
const PORT = parseInt(process.env.PORT, 10) || 3000;

const app = express();

/**
 * trust proxy : nginx est devant. Sans ça req.ip vaut 127.0.0.1 pour tout
 * le monde (la limitation de débit bloquerait la boutique entière au 6e
 * essai raté) et req.secure est toujours faux.
 * 1 = un seul intermédiaire de confiance, celui qu'on a installé.
 */
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.set('etag', 'strong');

// --- en-têtes de sécurité --------------------------------------------
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), interest-cohort=()');
  /* LA PORTE NE S'OUVRE QUE SI QUELQU'UN L'A DEMANDÉ.

     Le pixel Meta doit charger un script depuis connect.facebook.net et
     envoyer ses mesures à www.facebook.com. Ces autorisations ne sont
     ajoutées QUE si un identifiant de pixel est réglé : une boutique sans
     pixel garde exactement la politique d'avant, aussi fermée.

     Ce qu'on n'ajoute PAS : « unsafe-inline ». Meta publie son pixel sous
     forme de script écrit dans la page, ce qui obligerait à autoriser
     TOUT script écrit dans une page — la protection principale contre
     l'injection de code sauterait pour tout le site, administration
     comprise. Le même code est servi depuis /js/pixel.js : Meta n'y voit
     aucune différence, et rien n'est cédé. */
  const pixel = String(reglages.get('pixel_meta') || '').trim();
  const imgSrc = pixel ? "img-src 'self' data: https://www.facebook.com" : "img-src 'self' data:";
  const scriptSrc = pixel ? "script-src 'self' https://connect.facebook.net" : "script-src 'self'";
  const connectSrc = pixel
    ? "connect-src 'self' https://connect.facebook.net https://www.facebook.com"
    : "connect-src 'self'";

  res.set('Content-Security-Policy', [
    "default-src 'self'",
    imgSrc,
    "style-src 'self' 'unsafe-inline'",
    scriptSrc,
    "font-src 'self'",
    connectSrc,
    "form-action 'self'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
  ].join('; '));
  if (auth.requeteSecurisee(req)) {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

/** Lecture des cookies : dix lignes, une dépendance de moins. */
app.use((req, res, next) => {
  req.cookies = {};
  const brut = req.headers.cookie;
  if (brut) {
    for (const morceau of brut.split(';')) {
      const i = morceau.indexOf('=');
      if (i === -1) continue;
      const k = morceau.slice(0, i).trim();
      if (!k) continue;
      try { req.cookies[k] = decodeURIComponent(morceau.slice(i + 1).trim()); }
      catch { req.cookies[k] = morceau.slice(i + 1).trim(); }
    }
  }
  next();
});

app.use(auth.attacher);

// --- images des produits ---------------------------------------------
// Servies depuis data/uploads, jamais depuis le dossier du site : on ne
// veut pas qu'un jour un mauvais chemin publie .env ou la base.
app.use('/media', express.static(images.DOSSIER, {
  maxAge: '365d',
  immutable: true,
  index: false,
  dotfiles: 'deny',
  fallthrough: true,
}));

// --- fichiers statiques ------------------------------------------------
const options = { index: false, dotfiles: 'deny', redirect: false };

// Polices : le contenu d'un .woff2 ne change jamais sans changer de nom.
app.use('/fonts', express.static(path.join(PUBLIC, 'fonts'), { ...options, maxAge: '365d', immutable: true }));

/**
 * Visuels du site : un jour de cache, puis revalidation (ETag).
 *
 * C'était 30 jours. Le visuel d'accueil a été refait, le fichier a gardé
 * son nom, et le navigateur a continué à servir l'ancienne version
 * pendant des jours — sans jamais redemander au serveur. Vu de l'écran :
 * une correction livrée, invisible. Exactement le piège du cache d'une
 * heure sur admin.js, à une autre échelle.
 *
 * Un jour + ETag : le fichier n'est retéléchargé que s'il a bougé (304
 * sinon, ~200 octets), et un changement se voit le lendemain au pire.
 * Pour qu'il se voie TOUT DE SUITE, on change le nom du fichier —
 * hero-desktop-2.jpg — parce qu'un navigateur qui a déjà les vieux
 * octets en cache ne peut pas servir une URL qu'il n'a jamais vue.
 */
app.use('/img', express.static(path.join(PUBLIC, 'img'), { ...options, maxAge: '1d', etag: true }));


/**
 * CSS et JS de l'administration : no-store, sans discussion.
 *
 * Le piège déjà rencontré : un cache d'une heure sur admin.js. On livre
 * une correction, le commerçant recharge, rien ne change, et on passe
 * l'après-midi à chercher un bug qui était corrigé depuis le début.
 * L'admin est utilisé par deux personnes : le cache n'y gagne rien.
 */
app.use('/admin/css', express.static(path.join(PUBLIC, 'admin', 'css'), { ...options, setHeaders: sansCache }));
app.use('/admin/js', express.static(path.join(PUBLIC, 'admin', 'js'), { ...options, setHeaders: sansCache }));
// Captures d'écran du guide : nom de fichier stable, cache long.
app.use('/admin/img', express.static(path.join(PUBLIC, 'admin', 'img'), { ...options, maxAge: '7d' }));

function sansCache(res) {
  res.set('Cache-Control', 'no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
}

// CSS et JS de la vitrine : revalidation à chaque fois (ETag), donc une
// correction est visible au premier rechargement, sans re-télécharger
// le fichier quand il n'a pas bougé.
app.use('/css', express.static(path.join(PUBLIC, 'css'), { ...options, maxAge: 0, etag: true }));
app.use('/js', express.static(path.join(PUBLIC, 'js'), { ...options, maxAge: 0, etag: true }));

/* Icône d'onglet. Le SVG d'abord : net à toutes les tailles, un seul
   fichier. Le PNG reste servi pour les navigateurs qui ignorent le SVG,
   et le .ico pour les très anciens — aucun des trois n'est déclaré au
   hasard, chacun répond à une page qui le demande.

   Les fichiers de la racine de public/ ne sont PAS servis par un
   express.static : chaque route est écrite à la main, pour qu'un fichier
   déposé là par erreur (une sauvegarde, une note) ne devienne pas
   publiquement téléchargeable du seul fait de sa présence. D'où ce
   404 sur /favicon.svg tant que la ligne ci-dessous n'existait pas. */
app.get('/favicon.svg', (req, res) => res.sendFile(path.join(PUBLIC, 'favicon.svg')));
app.get('/favicon.png', (req, res) => res.sendFile(path.join(PUBLIC, 'favicon.png')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(PUBLIC, 'favicon.png')));
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    reglages.booleen('boutique_ouverte')
      ? 'User-agent: *\nDisallow: /admin/\nDisallow: /api/\n'
      : 'User-agent: *\nDisallow: /\n'
  );
});

// --- rideau « boutique fermée » ---------------------------------------
/**
 * Fermée, le visiteur voit une page d'attente et AUCUNE commande ne passe :
 * le refus est côté serveur, pas un bouton masqué en CSS.
 *
 * Le code est 503, jamais 200. Un 200 sur la page d'attente apprend à
 * Google que la boutique EST cette page : il la met en cache à la place
 * du catalogue et il faut des semaines pour s'en remettre. 503 dit
 * « service momentanément indisponible, repasse plus tard ».
 *
 * L'administrateur connecté traverse le rideau et voit le vrai site.
 */
const PAGES_LIBRES = new Set(['/admin', '/admin/', '/api/session', '/api/connexion', '/api/deconnexion']);

app.use((req, res, next) => {
  if (reglages.booleen('boutique_ouverte')) return next();
  if (req.utilisateur) { res.set('X-Boutique', 'fermee-vue-admin'); return next(); }
  if (req.path.startsWith('/admin') || PAGES_LIBRES.has(req.path)) return next();
  if (req.path.startsWith('/media') || req.path.startsWith('/img') ||
      req.path.startsWith('/css') || req.path.startsWith('/fonts')) return next();

  res.status(503);
  res.set('Retry-After', '86400');
  res.set('Cache-Control', 'no-store');
  if (req.path === '/api/boutique') {
    // Même fermée, la page d'attente a besoin du nom et du message que le
    // commerçant a écrits. On les donne — en 503, pas en 200.
    const r = reglages.publics();
    const mk = marches.deLaRequete(req);
    return res.json({
      boutique_fermee: true,
      /* La page d'attente doit parler la langue du pays, elle aussi :
         c'est souvent la première page qu'un visiteur voit. */
      marche: { code: mk.code, nom: mk.nom, langue: mk.langue || 'fr' },
      reglages: {
        nom_boutique: r.nom_boutique, message_fermeture: r.message_fermeture,
        telephone: r.telephone, email: r.email, instagram: r.instagram, facebook: r.facebook,
      },
      rayons: [],
    });
  }
  if (req.path.startsWith('/api/')) {
    return res.json({ erreur: 'La boutique est momentanément fermée.', boutique_fermee: true });
  }
  return envoyerPage(req, res, 'boutique-fermee.html');
});

// --- routes -------------------------------------------------------------
app.use('/api', limite.api);
app.use(require('./routes/auth'));
/**
 * Les messages du serveur, dans la langue du pays servi.
 *
 * UN SEUL POINT DE PASSAGE plutôt qu'une traduction à chaque endroit où
 * un message est écrit : il y en a une soixantaine dans le code, et en
 * oublier trois suffirait pour qu'un client de Dubaï voie « Votre panier
 * est vide. » au milieu d'une page anglaise. Ici, tout ce qui sort en
 * JSON passe par la même porte.
 *
 * L'administration est exclue : elle reste en français, c'est l'écran du
 * commerçant. Sans cette exclusion, basculer la boutique sur les Émirats
 * aurait traduit les messages de SON espace de travail.
 */
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/admin')) return next();
  const langue = i18n.langueValide(marches.deLaRequete(req).langue);
  if (langue === 'fr') return next();
  const envoyer = res.json.bind(res);
  res.json = (corps) => {
    if (corps && typeof corps === 'object') {
      for (const cle of ['erreur', 'message']) {
        if (typeof corps[cle] === 'string') corps[cle] = i18n.traduire(corps[cle], langue);
      }
    }
    return envoyer(corps);
  };
  next();
});

app.use('/api', require('./routes/public'));
app.use('/api/admin', auth.exigerAdmin, require('./routes/admin'));

// --- pages de l'administration ----------------------------------------
app.get(/^\/admin(\/.*)?$/, (req, res, next) => {
  const demande = req.path.replace(/^\/admin\/?/, '') || 'index.html';
  if (demande.startsWith('css/') || demande.startsWith('js/') || demande.startsWith('img/')) return next();
  const nom = demande.endsWith('.html') ? demande : demande + '.html';
  const fichier = path.join(PUBLIC, 'admin', path.normalize(nom).replace(/^(\.\.[\/\\])+/, ''));
  if (!fichier.startsWith(path.join(PUBLIC, 'admin')) || !fs.existsSync(fichier)) return next();
  // Page de connexion accessible à tous, le reste exige une session.
  if (!/connexion\.html$/.test(nom) && !req.utilisateur) {
    return res.redirect('/admin/connexion.html?suite=' + encodeURIComponent(req.originalUrl));
  }
  sansCache(res);
  res.sendFile(fichier);
});

/**
 * Envoyer une page, dans la langue du pays servi.
 *
 * Toutes les pages HTML passent par ici. « Vary: Cookie » est
 * indispensable : sans lui, un intermédiaire qui garde la page en cache
 * servirait la version française à un visiteur des Émirats, ou
 * l'inverse — les deux versions ont la même adresse, seul le cookie du
 * pays les distingue.
 */
function envoyerPage(req, res, fichier, code) {
  const m = marches.deLaRequete(req);
  const langue = i18n.langueValide(m.langue);
  res.set('Cache-Control', 'no-cache');
  res.set('Vary', 'Cookie');
  res.type('html');
  if (code) res.status(code);
  res.send(pages.page(path.join(PUBLIC, fichier), langue));
}

// --- pages de la vitrine ------------------------------------------------
const PAGES = {
  '/': 'index.html',
  '/boutique': 'boutique.html',
  '/panier': 'panier.html',
  '/commande': 'commande.html',
  '/merci': 'merci.html',
  '/mentions-legales': 'mentions-legales.html',
  '/conditions-de-vente': 'conditions-de-vente.html',
  '/livraison-et-retours': 'livraison-et-retours.html',
  '/contact': 'contact.html',
};

/* Le comptage des visites se fait ICI, au moment où la page part.
   Pas dans un script à l'intérieur de la page : un bloqueur de publicité
   l'aurait fait taire chez une bonne part des visiteurs, et le commerçant
   aurait lu des chiffres faux sans jamais savoir de combien. */
for (const [route, fichier] of Object.entries(PAGES)) {
  app.get(route, (req, res) => {
    stats.noter(req, route);
    envoyerPage(req, res, fichier);
  });
}

// /rayon/hoodies et /produit/hoodie-foudre : la même page, remplie en JS
app.get(/^\/rayon\/[a-z0-9-]+$/, (req, res) => {
  stats.noter(req, req.path);
  envoyerPage(req, res, 'boutique.html');
});
app.get(/^\/produit\/[a-z0-9-]+$/, (req, res) => {
  res.set('Cache-Control', 'no-cache');
  /* On rattache la vue au produit : « quels articles regarde-t-on sans
     les acheter » est la question qui fait vendre, et elle demande de
     savoir DE QUEL produit il s'agit, pas seulement quelle URL. */
  const slug = req.path.slice('/produit/'.length);
  const p = db.get('SELECT id FROM produits WHERE slug = ? AND actif = 1', slug);
  stats.noter(req, req.path, p ? p.id : null);
  envoyerPage(req, res, 'produit.html');
});

// --- erreurs -------------------------------------------------------------
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ erreur: 'Route inconnue.' });
  envoyerPage(req, res, '404.html', 404);
});

app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ erreur: 'Image trop lourde (8 Mo maximum).' });
  }
  console.error('[erreur]', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  const message = err && err.message && err.expose !== false
    ? err.message
    : 'Une erreur est survenue. Réessayez.';
  res.status(err.status || 500);
  if (req.path.startsWith('/api/')) return res.json({ erreur: message });
  res.type('text/plain').send(message);
});

// --- démarrage ------------------------------------------------------------
function demarrer() {
  if (!process.env.SESSION_SECRET) {
    console.warn('\x1b[33m  SESSION_SECRET absent : lancez « npm run installer ».\x1b[0m');
  }
  const corrige = reglages.verifierPlanchers();
  if (corrige) {
    console.log(`\x1b[33m  Délai de rétractation corrigé : ${corrige.avant} → ${corrige.apres} jours ouvrables `
      + '(minimum légal, loi 2000-83 art. 30).\x1b[0m');
  }
  /* Les marchés sont mis en place ICI, au démarrage, et pas dans
     l'installeur : personne ne relance l'installeur après une mise à
     jour, et une migration qui ne s'exécute que sur les installations
     neuves n'atteint jamais la boutique en service. Le cas s'est déjà
     produit sur ce projet avec le délai de rétractation. */
  const mig = marches.migrer();
  if (mig.marches || mig.prix || mig.stocks || mig.colonnes) {
    console.log(`\x1b[33m  Marchés mis en place : ${mig.marches} marché(s), ${mig.prix} prix repris, `
      + `${mig.stocks} ligne(s) de stock, ${mig.colonnes} colonne(s) ajoutée(s).\x1b[0m`);
  }

  images.verifierVersionSharp();
  auth.purger();
  setInterval(auth.purger, 6 * 3600 * 1000).unref();

  const serveur = app.listen(PORT, () => {
    const ouverte = reglages.booleen('boutique_ouverte');
    console.log(`\n  \x1b[1m${reglages.get('nom_boutique')}\x1b[0m  ${ouverte ? '\x1b[32mouverte\x1b[0m' : '\x1b[33mFERMÉE (page d\'attente en 503)\x1b[0m'}`);
    console.log(`  Boutique : http://localhost:${PORT}`);
    console.log(`  Admin    : http://localhost:${PORT}/admin`);
    console.log(`  Base     : ${db.moteur} → ${path.relative(RACINE, db.chemin)}`);

    /* Ce que CE processus sert vraiment.
    
       Un serveur déjà lancé ne connaît pas les routes ajoutées depuis :
       Node ne relit jamais son code. C'est arrivé — des fichiers bien
       présents sur le disque, une fonctionnalité qui ne marchait pas, et
       rien à l'écran pour dire que le serveur tournait encore sur
       l'ancienne version. Cette ligne répond d'un coup d'œil à
       « est-ce que j'ai redémarré ? ». Ajoutez-y chaque nouveau module. */
    const ouverts = marches.actifs().map((m) => `${m.nom} (${m.devise})`).join(', ') || 'aucun';
    console.log(`  Marchés  : \x1b[32m${ouverts}\x1b[0m`);
    console.log(`  Modules  : \x1b[32mstatistiques, marchés\x1b[0m\n`);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      console.log('\n  Arrêt…');
      serveur.close(() => { db.fermer(); process.exit(0); });
      setTimeout(() => process.exit(0), 3000).unref();
    });
  }
}

if (require.main === module) demarrer();
module.exports = { app, demarrer };
