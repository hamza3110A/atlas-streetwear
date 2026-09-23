'use strict';
/**
 * Ouvrir ou fermer la boutique en ligne de commande.
 *
 *   npm run ouvrir     → la boutique accepte les commandes
 *   npm run fermer     → page d'attente en 503, aucune commande possible
 *   npm run etat       → dit simplement où on en est
 *
 * Sert de porte de secours : si l'administration est inaccessible, ou si
 * un script de recette s'est interrompu en laissant la boutique fermée,
 * une commande suffit à la rouvrir. Agit directement sur la base, donc
 * fonctionne même serveur arrêté — redémarrez ensuite.
 */
require('./charger-env')();
const db = require('../src/db');
const reglages = require('../src/lib/reglages');

const action = (process.argv[2] || 'etat').toLowerCase();
const c = { v: (s) => `\x1b[32m${s}\x1b[0m`, j: (s) => `\x1b[33m${s}\x1b[0m`, g: (s) => `\x1b[90m${s}\x1b[0m` };

function etat() {
  return reglages.booleen('boutique_ouverte');
}

if (action === 'ouvrir' || action === 'fermer') {
  const ouvrir = action === 'ouvrir';
  if (etat() === ouvrir) {
    console.log(c.g(`\n  La boutique était déjà ${ouvrir ? 'ouverte' : 'fermée'}. Rien à faire.\n`));
  } else {
    reglages.definir('boutique_ouverte', ouvrir ? '1' : '0');
    console.log(ouvrir
      ? c.v('\n  Boutique OUVERTE. Les visiteurs peuvent commander.\n')
      : c.j('\n  Boutique FERMÉE. Page d\'attente en 503, aucune commande possible.\n'));
  }
} else {
  console.log(etat()
    ? c.v('\n  La boutique est OUVERTE.') + c.g('  (« npm run fermer » pour la fermer)\n')
    : c.j('\n  La boutique est FERMÉE.') + c.g('  (« npm run ouvrir » pour la rouvrir)\n'));
}

db.fermer();
