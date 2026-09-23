'use strict';
/**
 * npm run installer
 *
 * 1. crée data/boutique.db si elle n'existe pas ;
 * 2. applique le schéma (toutes les instructions sont IF NOT EXISTS,
 *    donc relancer l'installateur ne casse rien) ;
 * 3. génère un .env avec une clé de session UNIQUE à cette installation ;
 * 4. DÉTECTE si la base contient déjà un catalogue et, dans ce cas,
 *    n'insère aucune donnée de démonstration.
 *
 * Ce dernier point est la raison d'être du script : une mise à jour ne
 * doit jamais écraser le catalogue d'un commerçant en production.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const bcrypt = require('bcryptjs');

const RACINE = path.join(__dirname, '..');
require('./charger-env')();

const db = require('../src/db');
const reglages = require('../src/lib/reglages');

const c = {
  t: (s) => `\x1b[1m${s}\x1b[0m`,
  v: (s) => `\x1b[32m${s}\x1b[0m`,
  j: (s) => `\x1b[33m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  g: (s) => `\x1b[90m${s}\x1b[0m`,
};

function demander(question, muet = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (muet) {
      const ecrire = rl._writeToOutput.bind(rl);
      rl._writeToOutput = function (s) { if (s.includes(question)) ecrire(s); };
      rl.question(question, (a) => { rl.output.write('\n'); rl.close(); resolve(a.trim()); });
    } else {
      rl.question(question, (a) => { rl.close(); resolve(a.trim()); });
    }
  });
}

function ecrireEnv() {
  const chemin = path.join(RACINE, '.env');
  if (fs.existsSync(chemin)) {
    const contenu = fs.readFileSync(chemin, 'utf8');
    if (/SESSION_SECRET=.{16,}/.test(contenu)) {
      console.log(c.g('  .env déjà présent, clé de session conservée'));
      return false;
    }
  }
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(chemin, [
    '# Généré par npm run installer — NE PAS PARTAGER, NE PAS VERSIONNER',
    `SESSION_SECRET=${secret}`,
    'PORT=3000',
    '# DB_PATH=./data/boutique.db',
    '# UPLOAD_DIR=./data/uploads',
    '',
  ].join('\n'), { mode: 0o600 });
  console.log(c.v('  .env créé, clé de session unique générée'));
  return true;
}

async function main() {
  console.log('\n' + c.t('  INSTALLATION — ATLAS STREETWEAR') + '\n');

  // --- 1. schéma -------------------------------------------------------
  const schema = fs.readFileSync(path.join(RACINE, 'src', 'db', 'schema.sql'), 'utf8');
  db.exec(schema);
  console.log(c.v('  Schéma appliqué') + c.g(`  (${db.moteur} → ${path.relative(RACINE, db.chemin)})`));

  // --- 2. environnement ------------------------------------------------
  ecrireEnv();
  fs.mkdirSync(path.join(RACINE, 'data', 'uploads'), { recursive: true });
  fs.mkdirSync(path.join(RACINE, 'data', 'sauvegardes'), { recursive: true });

  // --- 3. base déjà remplie ? -----------------------------------------
  const nbProduits = db.get('SELECT COUNT(*) n FROM produits').n;
  const nbCommandes = db.get('SELECT COUNT(*) n FROM commandes').n;
  const nbAdmins = db.get('SELECT COUNT(*) n FROM utilisateurs').n;
  const dejaRemplie = nbProduits > 0 || nbCommandes > 0;

  if (dejaRemplie) {
    console.log(c.j(`\n  Base déjà remplie : ${nbProduits} produit(s), ${nbCommandes} commande(s).`));
    console.log(c.j('  Aucune donnée de démonstration ne sera insérée.'));
  }

  // --- 4. réglages par défaut (n'écrase jamais l'existant) ------------
  for (const [cle, valeur] of Object.entries(reglages.DEFAUTS)) {
    db.run('INSERT OR IGNORE INTO reglages (cle, valeur) VALUES (?, ?)', cle, valeur);
  }
  reglages.invalider();
  console.log(c.v('  Réglages par défaut en place'));

  // --- 4 bis. reprises de version ---------------------------------------
  // Le titre du héros est passé de DEUX lignes à QUATRE fragments (la
  // composition de la maquette : deux lignes que la marque interrompt).
  // Une base installée avant ce changement contient encore les anciennes
  // valeurs ; laissées telles quelles, elles rempliraient le fragment du
  // haut à gauche avec une phrase entière et feraient sortir le titre de
  // l'écran. On ne réécrit QUE si les valeurs sont restées celles d'origine
  // — un texte personnalisé par le commerçant n'est jamais touché.
  const ANCIENS = {
    hero_ligne1: 'BORN FROM THE MOUNTAINS',
    hero_ligne2: 'BUILT FOR THE STREETS',
  };
  if (reglages.get('hero_ligne1') === ANCIENS.hero_ligne1 &&
      reglages.get('hero_ligne2') === ANCIENS.hero_ligne2) {
    reglages.definirPlusieurs({
      hero_ligne1: 'BORN FROM',
      hero_ligne2: 'THE MOUNTAINS',
      hero_ligne3: 'BUILT FOR THE STREETS',
      hero_ligne4: 'MADE TO MOVE',
      hero_accent1: '',
      hero_accent2: 'MOUNTAINS',
      hero_accent3: 'STREETS',
      hero_accent4: '',
    });
    console.log(c.v('  Titre d\'accueil repris en quatre fragments'));
  }
  db.run("DELETE FROM reglages WHERE cle IN ('hero_bouton')");
  reglages.invalider();

  // --- 5. compte administrateur ---------------------------------------
  const argv = process.argv.slice(2);
  const auto = argv.includes('--auto');
  if (nbAdmins === 0) {
    let email, nom, mdp;
    if (auto) {
      email = process.env.ADMIN_EMAIL || 'admin@atlas.tn';
      nom = process.env.ADMIN_NOM || 'Administrateur';
      mdp = process.env.ADMIN_MDP || crypto.randomBytes(9).toString('base64url');
      console.log(c.j(`\n  Compte auto : ${email} / ${mdp}`));
    } else {
      console.log('\n  ' + c.t('Compte administrateur') + c.g(' (celui du commerçant)'));
      email = (await demander('  E-mail            : ')).toLowerCase();
      nom = await demander('  Nom affiché       : ');
      mdp = await demander('  Mot de passe (8+) : ', true);
      while (mdp.length < 8) mdp = await demander('  Trop court, 8 caractères minimum : ', true);
    }
    db.run(
      'INSERT INTO utilisateurs (email, nom, mot_de_passe, role) VALUES (?, ?, ?, ?)',
      email, nom || 'Administrateur', bcrypt.hashSync(mdp, 12), 'proprietaire'
    );
    console.log(c.v(`  Compte créé : ${email}`));
  } else {
    console.log(c.g(`  ${nbAdmins} compte(s) administrateur déjà présent(s), aucun créé`));
  }

  // --- 6. démonstration -------------------------------------------------
  if (!dejaRemplie && !argv.includes('--vide')) {
    await require('./demo')(db);
    console.log(c.v('  Catalogue de démonstration inséré') + c.g('  (supprimable depuis l\'admin)'));
  }

  console.log('\n  ' + c.t('Terminé.'));
  console.log('  Démarrer  : ' + c.t('npm start'));
  console.log('  Boutique  : http://localhost:' + (process.env.PORT || 3000));
  console.log('  Admin     : http://localhost:' + (process.env.PORT || 3000) + '/admin\n');
  db.fermer();
}

main().catch((e) => { console.error(c.r('\n  Échec : ' + e.message)); process.exit(1); });
