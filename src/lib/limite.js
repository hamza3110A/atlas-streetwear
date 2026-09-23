'use strict';
/**
 * Limitation de débit, en mémoire, sans dépendance.
 * Suffisant pour un processus unique — qui est exactement notre cas.
 * Si un jour la boutique tourne sur plusieurs processus, il faudra
 * déplacer ce compteur en base ; le point d'entrée ne changera pas.
 */
const compteurs = new Map();

setInterval(() => {
  const maintenant = Date.now();
  for (const [cle, e] of compteurs) if (e.fin < maintenant) compteurs.delete(cle);
}, 60000).unref();

/**
 * `nom` cloisonne les compteurs. Sans lui, tous les limiteurs partagent la
 * même entrée : les 300 requêtes/5 min du garde-fou général faisaient
 * tomber la limite de 8 commandes/heure au bout de huit appels d'API
 * ordinaires, et plus personne ne pouvait commander. Trouvé en passant
 * une vraie commande dans le navigateur.
 */
function limiteur({ nom, max, fenetreMs, message, cle }) {
  return (req, res, next) => {
    const identite = (nom || 'defaut') + '|' + (cle ? cle(req) : '') + '|' + (req.ip || 'inconnu');
    const maintenant = Date.now();
    let e = compteurs.get(identite);
    if (!e || e.fin < maintenant) {
      e = { n: 0, fin: maintenant + fenetreMs };
      compteurs.set(identite, e);
    }
    e.n += 1;
    const reste = Math.max(0, max - e.n);
    res.set('X-RateLimit-Remaining', String(reste));
    if (e.n > max) {
      const secondes = Math.ceil((e.fin - maintenant) / 1000);
      res.set('Retry-After', String(secondes));
      return res.status(429).json({
        erreur: message || 'Trop de tentatives. Réessayez dans un instant.',
        reessayer_dans: secondes,
      });
    }
    next();
  };
}

/** 5 tentatives par tranche de 15 minutes, par IP ET par e-mail visé. */
const connexion = limiteur({
  nom: 'connexion',
  max: 5,
  fenetreMs: 15 * 60 * 1000,
  message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
  cle: (req) => String(req.body?.email || '').toLowerCase(),
});

/** Création de commande : 8 par heure et par IP. */
const commande = limiteur({
  nom: 'commande',
  max: 8,
  fenetreMs: 60 * 60 * 1000,
  message: 'Trop de commandes depuis cet appareil. Contactez-nous par téléphone.',
});

/** Garde-fou général sur l'API publique. */
const api = limiteur({ nom: 'api', max: 300, fenetreMs: 5 * 60 * 1000 });

/** Remet un compteur à zéro (connexion réussie). */
function reinitialiser(req, cleValeur, nom) {
  compteurs.delete((nom || 'connexion') + '|' + (cleValeur || '') + '|' + (req.ip || 'inconnu'));
}

module.exports = { limiteur, connexion, commande, api, reinitialiser };
