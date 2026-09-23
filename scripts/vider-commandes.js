'use strict';
/**
 * Efface les commandes d'essai avant l'ouverture de la boutique.
 *
 *   npm run vider-commandes       montre ce qui serait effacé, ne touche à rien
 *   npm run vider-commandes:oui   efface pour de bon
 *
 * À faire UNE FOIS, juste avant la mise en ligne : les commandes créées
 * pendant les essais faussent le tableau de bord (chiffre du jour, panier
 * moyen, nombre de clients) et le commerçant ne peut pas savoir, en
 * regardant son écran, ce qui est vrai.
 *
 * Trois précautions qui ne sont pas optionnelles :
 *
 * 1. LE STOCK EST RENDU. Une commande confirmée a sorti sa marchandise du
 *    stock. L'effacer sans rendre les quantités laisserait des tailles à
 *    zéro qui sont pourtant en rayon — et personne ne comprendrait
 *    pourquoi le site refuse de vendre un article posé sur l'étagère.
 *
 * 2. LES COMPTEURS DE CODES PROMO REDESCENDENT. Un code limité à 50
 *    utilisations dont 12 ont été consommées par des essais n'en offrirait
 *    plus que 38 aux vrais clients.
 *
 * 3. UNE SAUVEGARDE EST PRISE AVANT. Effacer est la seule opération de ce
 *    projet qu'on ne peut pas annuler.
 *
 * Le serveur doit être ARRÊTÉ : il garde des choses en mémoire, et deux
 * processus qui écrivent dans la même base ne se voient pas l'un l'autre.
 */
require('./charger-env')();
const fs = require('node:fs');
const path = require('node:path');
const db = require('../src/db');

/* Toutes les façons de dire oui sont acceptées. Le « -- » que npm
   exige pour passer un argument n'existe pas sous PowerShell : la
   ligne « -- --vraiment » copiée seule y produit trois erreurs de
   syntaxe incompréhensibles. Il y a donc AUSSI un raccourci sans
   tiret du tout :  npm run vider-commandes:oui  */
const VRAIMENT = process.argv.slice(2)
  .some((a) => ['--vraiment', 'vraiment', '--oui', 'oui', '--confirmer'].includes(a.toLowerCase()));
const c = {
  v: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`,
  j: (s) => `\x1b[33m${s}\x1b[0m`, g: (s) => `\x1b[90m${s}\x1b[0m`,
};
/* Le montant d'une commande, DANS SA DEVISE. Diviser toujours par mille
   et écrire « DT » affichait 145,00 AED comme « 0,145 DT » : un montant
   faux, dans la mauvaise monnaie, juste avant un effacement définitif —
   le pire moment pour douter de ce qu'on lit. */
const dt = (cmd) => {
  const d = cmd.decimales == null ? 3 : cmd.decimales;
  return (cmd.total / Math.pow(10, d)).toFixed(d).replace('.', ',') + ' ' + (cmd.devise || 'DT');
};

const commandes = db.all(`
  SELECT c.id, c.reference, c.statut, c.total, c.stock_retire, c.cree_le, c.nom, c.promotion_id,
         COALESCE(c.marche, 'tn') AS marche, COALESCE(c.devise, 'DT') AS devise,
         COALESCE(c.decimales, 3) AS decimales
    FROM commandes c ORDER BY c.id`);

if (!commandes.length) {
  console.log(c.g('\n  Aucune commande dans la base. Rien à faire.\n'));
  db.fermer();
  process.exit(0);
}

console.log(VRAIMENT
  ? '\n  Effacement des commandes\n'
  : '\n  Effacement des commandes — SIMULATION (« npm run vider-commandes:oui » pour effacer)\n');

/* Ce qui va être rendu au stock : uniquement les commandes dont la
   marchandise est SORTIE et qui ne sont pas déjà annulées. Une commande
   annulée a déjà rendu son stock — le rendre deux fois créerait des
   quantités qui n'existent pas. C'est la même règle que l'administration,
   et elle doit rester la même ici. */
/* La clé est « taille + ENTREPÔT », pas seulement la taille.
   
   Ce script rendait le stock à variantes.stock — la colonne que la
   vitrine ne lit plus depuis l'ouverture des marchés. On aurait vidé
   les commandes, et les quantités affichées sur le site n'auraient pas
   bougé d'un article : la correction se faisait à côté, en silence.
   Et une commande de Dubaï doit rendre sa pièce à Dubaï, pas à Tunis. */
const aRendre = new Map();          // « varianteId|marche » → quantité
let concernees = 0;
for (const cmd of commandes) {
  if (!cmd.stock_retire || cmd.statut === 'annulee') continue;
  concernees++;
  const marche = cmd.marche || 'tn';
  for (const l of db.all('SELECT variante_id, quantite FROM lignes_commande WHERE commande_id = ?', cmd.id)) {
    if (l.variante_id == null) continue;
    const cle = `${l.variante_id}|${marche}`;
    aRendre.set(cle, (aRendre.get(cle) || 0) + l.quantite);
  }
}

const promos = new Map();
for (const cmd of commandes) {
  if (cmd.promotion_id) promos.set(cmd.promotion_id, (promos.get(cmd.promotion_id) || 0) + 1);
}

const clients = db.all('SELECT id, nom, telephone FROM clients');

console.log(`  ${commandes.length} commande(s) :`);
for (const cmd of commandes.slice(0, 12)) {
  console.log(c.g(`    ${cmd.reference}  ${cmd.statut.padEnd(15)} ${dt(cmd).padStart(14)}  ${cmd.cree_le}  ${cmd.nom}`));
}
if (commandes.length > 12) console.log(c.g(`    … et ${commandes.length - 12} autre(s)`));

console.log(`\n  Stock à rendre : ${aRendre.size} taille(s), issues de ${concernees} commande(s) dont la marchandise était sortie`);
for (const [cle, q] of [...aRendre].slice(0, 10)) {
  const [vid, marche] = cle.split('|');
  const v = db.get(
    `SELECT v.taille, p.nom, sm.stock, m.nom AS pays
       FROM variantes v
       JOIN produits p ON p.id = v.produit_id
       LEFT JOIN stock_marche sm ON sm.variante_id = v.id AND sm.marche = ?
       LEFT JOIN marches m ON m.code = ?
      WHERE v.id = ?`, marche, marche, vid);
  if (v) {
    const actuel = v.stock == null ? 0 : v.stock;
    console.log(c.g(`    « ${v.nom} » taille ${v.taille} — ${v.pays || marche} : ${actuel} → ${actuel + q}  (+${q})`));
  }
}
if (aRendre.size > 10) console.log(c.g(`    … et ${aRendre.size - 10} autre(s)`));

if (promos.size) {
  console.log(`\n  Compteurs de codes promo à redescendre : ${promos.size}`);
  for (const [pid, n] of promos) {
    const p = db.get('SELECT code, usage_actuel, usage_max FROM promotions WHERE id = ?', pid);
    if (p) console.log(c.g(`    ${p.code} : ${p.usage_actuel} → ${Math.max(0, p.usage_actuel - n)} utilisation(s)${p.usage_max ? ' sur ' + p.usage_max : ''}`));
  }
}
console.log(`\n  Fiches clients à effacer : ${clients.length}`);

if (!VRAIMENT) {
  console.log(c.g('\n  Rien n\'a été modifié.'));
  console.log(c.g('  Pour effacer :  npm run vider-commandes:oui\n'));
  db.fermer();
  process.exit(0);
}

// --- sauvegarde d'abord ----------------------------------------------------
const dossier = path.join(__dirname, '..', 'data', 'sauvegardes');
fs.mkdirSync(dossier, { recursive: true });
const nom = `avant-vidage-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.db`;
db.sauvegarder(path.join(dossier, nom));
console.log(c.v(`  Sauvegarde prise : data/sauvegardes/${nom} (${Math.round(fs.statSync(path.join(dossier, nom)).size / 1024)} Ko)`));

// --- puis tout en une seule transaction ------------------------------------
const marchePrincipal = (db.get('SELECT code FROM marches WHERE actif = 1 ORDER BY ordre LIMIT 1') || {}).code || 'tn';

const faire = db.transaction(() => {
  for (const [cle, q] of aRendre) {
    const [vid, marche] = cle.split('|');
    /* La ligne d'entrepôt peut manquer si la taille a été créée après
       l'ouverture du pays : on la pose avant d'y ajouter quoi que ce
       soit, sinon la quantité serait rendue à personne. */
    db.run('INSERT OR IGNORE INTO stock_marche (variante_id, marche, stock) VALUES (?, ?, 0)', vid, marche);
    db.run('UPDATE stock_marche SET stock = stock + ? WHERE variante_id = ? AND marche = ?', q, vid, marche);
    /* La colonne d'origine suit le marché principal, pour rester
       cohérente avec ce que montre la fiche produit. */
    if (marche === marchePrincipal) {
      db.run('UPDATE variantes SET stock = stock + ? WHERE id = ?', q, vid);
    }
  }
  for (const [pid, n] of promos) {
    db.run('UPDATE promotions SET usage_actuel = MAX(0, usage_actuel - ?) WHERE id = ?', n, pid);
  }
  db.run('DELETE FROM lignes_commande');
  db.run('DELETE FROM commandes');
  db.run('DELETE FROM clients');
});
faire();

const reste = db.get('SELECT COUNT(*) n FROM commandes').n;
const resteC = db.get('SELECT COUNT(*) n FROM clients').n;
const resteL = db.get('SELECT COUNT(*) n FROM lignes_commande').n;

console.log(c.v(`\n  Effacé : ${commandes.length} commande(s), ${clients.length} fiche(s) client.`));
console.log(c.v(`  Stock rendu sur ${aRendre.size} taille(s).`));
console.log(`  Reste en base : ${reste} commande(s), ${resteC} client(s), ${resteL} ligne(s).`);
if (reste || resteC || resteL) {
  console.log(c.r('  ATTENTION : il reste des enregistrements, l\'effacement est incomplet.'));
  process.exitCode = 1;
}
console.log(c.j('\n  Redémarrez le serveur pour que le tableau de bord reparte de zéro.\n'));

db.fermer();
