'use strict';
/**
 * npm run sauvegarde
 *
 * VACUUM INTO : la sauvegarde se fait PENDANT que le site tourne. Copier
 * le fichier .db avec `cp` sur une base en mode WAL donne une copie
 * potentiellement incohérente — il manque le contenu du journal. VACUUM
 * INTO écrit une base complète, compactée et cohérente, sans arrêter le
 * service et sans bloquer les commandes en cours.
 *
 * Conserve les 30 dernières.
 */
require('./charger-env')();
const fs = require('node:fs');
const path = require('node:path');
const db = require('../src/db');

const DOSSIER = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(__dirname, '..', 'data', 'sauvegardes');

const GARDER = parseInt(process.env.BACKUP_KEEP, 10) || 30;

fs.mkdirSync(DOSSIER, { recursive: true });

const horodatage = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const destination = path.join(DOSSIER, `boutique-${horodatage}.db`);

db.sauvegarder(destination);
const taille = fs.statSync(destination).size;
console.log(`Sauvegarde : ${path.basename(destination)} (${(taille / 1024).toFixed(0)} Ko)`);

const anciennes = fs.readdirSync(DOSSIER)
  .filter((f) => /^boutique-.*\.db$/.test(f))
  .sort()
  .reverse()
  .slice(GARDER);

for (const f of anciennes) {
  fs.unlinkSync(path.join(DOSSIER, f));
  console.log(`Supprimée : ${f}`);
}

db.fermer();
