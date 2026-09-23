'use strict';
/**
 * Adaptateur SQLite.
 *
 * Par défaut on utilise `node:sqlite`, le module intégré à Node 22+ :
 * rien à compiler, donc rien à installer sur la machine du commerçant.
 * better-sqlite3 est plus rapide mais exige un compilateur C++ ; sur un
 * Windows sans Visual Studio, `npm install` échoue et le projet est mort
 * avant d'avoir démarré.
 *
 * Si better-sqlite3 est malgré tout présent (VPS Linux, machine outillée),
 * on l'utilise automatiquement : même interface, aucune ligne de code à
 * changer ailleurs.
 */
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '..', '..', 'data', 'boutique.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let raw = null;
let moteur = 'node:sqlite';

try {
  const Better = require('better-sqlite3');
  raw = new Better(DB_PATH);
  moteur = 'better-sqlite3';
} catch {
  const { DatabaseSync } = require('node:sqlite');
  raw = new DatabaseSync(DB_PATH);
}

raw.exec('PRAGMA journal_mode = WAL');
raw.exec('PRAGMA foreign_keys = ON');
raw.exec('PRAGMA busy_timeout = 5000');

/* Le schéma est appliqué à CHAQUE démarrage.
   Chacune de ses instructions est un « CREATE … IF NOT EXISTS » : sur une
   base déjà remplie, elle ne fait rien et ne touche à aucune donnée. En
   échange, une mise à jour qui ajoute une table fonctionne même si
   personne n'a pensé à relancer l'installeur — le commerçant n'a pas à
   savoir qu'une table est apparue dans la version qu'il vient d'installer. */
raw.exec(require('node:fs').readFileSync(require('node:path').join(__dirname, 'schema.sql'), 'utf8'));

/** node:sqlite renvoie des objets à prototype nul : illisibles au log, et
 *  `obj.hasOwnProperty` n'existe pas. On les normalise une fois pour toutes. */
function propre(ligne) {
  return ligne == null ? ligne : Object.assign({}, ligne);
}

const db = {
  moteur,
  chemin: DB_PATH,

  /** Une ligne ou undefined. */
  get(sql, ...params) {
    return propre(raw.prepare(sql).get(...params));
  },

  /** Toutes les lignes. */
  all(sql, ...params) {
    return raw.prepare(sql).all(...params).map(propre);
  },

  /** INSERT / UPDATE / DELETE → { changements, dernierId }. */
  run(sql, ...params) {
    const r = raw.prepare(sql).run(...params);
    return {
      changements: Number(r.changes),
      dernierId: Number(r.lastInsertRowid),
    };
  },

  exec(sql) {
    raw.exec(sql);
  },

  /**
   * Transaction. Toute exception provoque un ROLLBACK.
   * Indispensable pour la création de commande : soit la commande ET ses
   * lignes ET le stock sont écrits, soit rien ne l'est.
   */
  transaction(fn) {
    return (...args) => {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const res = fn(...args);
        raw.exec('COMMIT');
        return res;
      } catch (e) {
        try { raw.exec('ROLLBACK'); } catch { /* déjà annulée */ }
        throw e;
      }
    };
  },

  /** Sauvegarde à chaud : marche pendant que le site tourne. */
  sauvegarder(destination) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (fs.existsSync(destination)) fs.unlinkSync(destination);
    raw.exec(`VACUUM INTO '${destination.replace(/'/g, "''")}'`);
    return destination;
  },

  fermer() {
    try { raw.close(); } catch { /* déjà fermée */ }
  },
};

module.exports = db;
