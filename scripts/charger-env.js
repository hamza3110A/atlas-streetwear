'use strict';
/**
 * Lecture du .env sans dépendance externe (dotenv fait 12 lignes utiles).
 * Une variable déjà définie dans l'environnement système gagne toujours :
 * c'est ce qui permet à systemd de surcharger le fichier.
 */
const fs = require('node:fs');
const path = require('node:path');

module.exports = function chargerEnv(fichier) {
  const chemin = fichier || path.join(__dirname, '..', '.env');
  if (!fs.existsSync(chemin)) return {};
  const lu = {};
  for (const ligne of fs.readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const t = ligne.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const cle = t.slice(0, i).trim();
    let valeur = t.slice(i + 1).trim();
    if ((valeur.startsWith('"') && valeur.endsWith('"')) ||
        (valeur.startsWith("'") && valeur.endsWith("'"))) valeur = valeur.slice(1, -1);
    lu[cle] = valeur;
    if (process.env[cle] === undefined) process.env[cle] = valeur;
  }
  return lu;
};
