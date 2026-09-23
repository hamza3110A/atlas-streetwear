'use strict';
/**
 * Supprime les fichiers devenus inutiles.
 *
 *   npm run nettoyer              montre ce qui serait supprimé, ne touche à rien
 *   npm run nettoyer:oui          supprime pour de bon
 *
 * Pourquoi une liste écrite à la main plutôt qu'une détection automatique :
 * une détection automatique s'est trompée SIX fois sur ce projet. Elle
 * déclarait mortes des classes CSS construites dans une condition
 * (`stock-0`, `stock-bas`), des classes posées via classList, un lien
 * assemblé dans un gabarit. Un fichier réellement utilisé et supprimé,
 * c'est une page cassée en production.
 *
 * Donc : la liste est explicite, ET chaque fichier est quand même
 * revérifié juste avant la suppression. S'il est cité quelque part dans
 * le code, on refuse de le supprimer et on dit où il est cité.
 */
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
/* Toutes les façons de dire oui sont acceptées. Le « -- » que npm
   exige pour passer un argument n'existe pas sous PowerShell : la
   ligne « -- --vraiment » copiée seule y produit trois erreurs de
   syntaxe incompréhensibles. Il y a donc AUSSI un raccourci sans
   tiret du tout :  npm run nettoyer:oui  */
const VRAIMENT = process.argv.slice(2)
  .some((a) => ['--vraiment', 'vraiment', '--oui', 'oui', '--confirmer'].includes(a.toLowerCase()));

/* Chaque entrée dit POURQUOI. Sans la raison, personne n'ose plus rien
   supprimer six mois plus tard. */
const CIBLES = [
  ['public/fonts/helvetique-regular.woff2',        'Helvetica abandonnée : le site et l\'administration sont en Montserrat'],
  ['public/fonts/helvetique-bold.woff2',           'idem'],
  ['public/fonts/helvetique-condense-bold.woff2',  'idem'],
  ['public/fonts/space-mono-latin-ext-700-normal.woff2', 'la CSS ne déclare le latin étendu qu\'en graisse 400'],
  ['public/fonts/titre-400.woff2',                 'Archivo Narrow n\'est employée qu\'en graisse 700'],
  ['public/fonts/montserrat-800.woff2',            'aucune règle ne demande la graisse 800'],
  ['public/img/hero-desktop.jpg',                  'remplacé par hero-desktop-2.jpg (changement de nom pour vider le cache)'],
  ['public/img/hero-mobile.jpg',                   'remplacé par hero-mobile-2.jpg'],
  ['public/img/hero.jpg',                          'visuel d\'une version antérieure'],
  ['public/img/badge.png',                         'seule la version encre (badge-clair.png) est employée'],
  ['public/img/icon-512.png',                      'icône d\'application : aucun manifeste ne la réclame'],
  ['public/admin/img/guide/clients.jpg',           'le guide n\'a pas de chapitre « clients »'],
  ['public/admin/img/guide/tableau-de-bord.jpg',   'le guide n\'a pas de chapitre « tableau de bord »'],
  ['public/js/ambiance.js',                        'ambiance sonore retirée du site'],
  ['public/audio/ambiance.opus',                   'idem'],
  ['public/audio/ambiance.m4a',                    'idem'],
  ['scripts/recette/composer-ambiance.py',         'idem — le script qui composait la boucle'],
];

/* Où l'on cherche des références. On lit le code, pas les images. */
function fichiersDeCode(dossier, acc = []) {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'data') continue;
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) fichiersDeCode(p, acc);
    else if (/\.(html|css|js|json|md|sql|conf|service|timer)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/* Ce fichier-ci est exclu de la recherche.
   Il contient forcément le nom de chaque fichier à supprimer — c'est sa
   liste. Sans cette exclusion, il se trouve lui-même et refuse tout, en
   disant « encore cité dans : scripts/nettoyer.js ». C'est exactement ce
   qui s'est passé la première fois : chez moi les onze fichiers étaient
   déjà supprimés, le script sortait à la ligne « déjà absent » avant
   d'arriver au contrôle, et le défaut ne s'est montré que sur une machine
   où les fichiers existaient encore. Un garde-fou qu'on n'a jamais vu
   dire « oui » n'est pas un garde-fou testé. */
const code = fichiersDeCode(RACINE)
  .filter((p) => path.resolve(p) !== path.resolve(__filename))
  .map((p) => ({ p, s: fs.readFileSync(p, 'utf8') }));
const c = { v: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, g: (s) => `\x1b[90m${s}\x1b[0m` };

let supprimes = 0, absents = 0, refuses = 0, octets = 0;
console.log(VRAIMENT ? '\n  Nettoyage\n' : '\n  Nettoyage — SIMULATION (« npm run nettoyer:oui » pour supprimer)\n');

for (const [rel, raison] of CIBLES) {
  const abs = path.join(RACINE, rel);
  if (!fs.existsSync(abs)) { absents++; continue; }

  const nom = path.basename(rel);
  const cites = code.filter(({ p, s }) => p !== abs && s.includes(nom));
  if (cites.length) {
    refuses++;
    console.log(c.r(`  REFUSÉ  ${rel}`));
    console.log(c.g(`          encore cité dans : ${cites.map((x) => path.relative(RACINE, x.p)).join(', ')}`));
    continue;
  }

  const taille = fs.statSync(abs).size;
  octets += taille;
  supprimes++;
  console.log(`  ${VRAIMENT ? c.v('supprimé') : 'à supprimer'}  ${rel}  ${c.g(`(${Math.round(taille / 1024)} Ko — ${raison})`)}`);
  if (VRAIMENT) fs.unlinkSync(abs);
}

console.log(`\n  ${supprimes} fichier(s) ${VRAIMENT ? 'supprimés' : 'à supprimer'}, ${Math.round(octets / 1024)} Ko.`);
if (absents) console.log(c.g(`  ${absents} déjà absent(s).`));
if (refuses) {
  console.log(c.r(`  ${refuses} refusé(s) : encore utilisés. Rien n'a été supprimé pour ceux-là.`));
  process.exitCode = 1;
}
if (!VRAIMENT && supprimes) console.log(c.g('\n  Relancez avec :  npm run nettoyer:oui\n'));
else console.log('');
