'use strict';
/**
 * npm run archives
 *
 * Produit DEUX archives distinctes dans livraison/ :
 *
 *   atlas-installation-AAAA-MM-JJ.zip
 *       tout le projet, pour une première installation.
 *
 *   atlas-mise-a-jour-AAAA-MM-JJ.zip
 *       le code SEUL. Ni data/, ni .env.
 *
 * Pourquoi deux ? Parce qu'un jour, quelqu'un déploiera l'archive complète
 * sur un serveur en production « pour mettre à jour », et écrasera la base
 * du commerçant avec le catalogue de démonstration. Six mois de commandes
 * perdus par un dézippage. La seule protection qui tienne, c'est que le
 * fichier de mise à jour ne CONTIENNE pas la base.
 *
 * Les fichiers sont écrits en 644 (dossiers en 755) : une archive en
 * lecture seule provoque « Permission denied » à la mise à jour suivante,
 * quand l'utilisateur du service tente de réécrire par-dessus.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RACINE = path.join(__dirname, '..');
const SORTIE = path.join(RACINE, 'livraison');
const DATE = new Date().toISOString().slice(0, 10);

/**
 * Jamais dans une archive, quelle qu'elle soit — y compris celle
 * d'installation. Une archive livrée avec la base de développement
 * installerait chez le commerçant nos commandes de test et NOTRE compte
 * administrateur. L'installateur recrée une base propre à l'arrivée ;
 * on n'expédie que la structure de dossiers vide.
 */
const TOUJOURS_EXCLUS = [
  'node_modules/*', '.git/*', 'livraison/*', 'captures/*',
  '*.log', '.DS_Store',
  'data/boutique.db', 'data/boutique.db-*',
  'data/uploads/*.jpg', 'data/uploads/*.png', 'data/uploads/*.webp',
  'data/sauvegardes/*.db',
  '.env',
];

/**
 * En plus, pour l'archive de mise à jour : AUCUNE entrée « data/ », pas
 * même les dossiers vides. Un `unzip -o` de cette archive sur un serveur
 * en production ne peut donc pas toucher la base, quoi qu'il arrive.
 */
const EXCLUS_MISE_A_JOUR = ['data/*', 'data', '.env.*'];

function zipper(nom, exclusions) {
  const cible = path.join(SORTIE, nom);
  if (fs.existsSync(cible)) fs.unlinkSync(cible);
  const args = ['-r', '-q', cible, '.', '-x', ...exclusions];
  execFileSync('zip', args, { cwd: RACINE, stdio: 'inherit' });
  const taille = fs.statSync(cible).size;
  console.log(`  ${nom}  (${(taille / 1048576).toFixed(1)} Mo)`);
  return cible;
}

function normaliserLesDroits() {
  // 644 pour les fichiers, 755 pour les dossiers, avant de zipper.
  const parcourir = (dossier) => {
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
      if (['node_modules', '.git', 'livraison', 'captures'].includes(entree.name)) continue;
      const p = path.join(dossier, entree.name);
      if (entree.isDirectory()) { fs.chmodSync(p, 0o755); parcourir(p); }
      else if (entree.isFile() && entree.name !== '.env') fs.chmodSync(p, 0o644);
    }
  };
  parcourir(RACINE);
}

fs.mkdirSync(SORTIE, { recursive: true });
normaliserLesDroits();

console.log('\n  Archives générées dans livraison/ :\n');
zipper(`atlas-installation-${DATE}.zip`, TOUJOURS_EXCLUS);
zipper(`atlas-mise-a-jour-${DATE}.zip`, [...TOUJOURS_EXCLUS, ...EXCLUS_MISE_A_JOUR]);

console.log(`
  Installation : première mise en place. Contient tout.
  Mise à jour  : ne contient NI data/ NI .env. C'est celle-ci qu'on
                 déploie sur un serveur qui tourne déjà.

  Sur le serveur, après une mise à jour :
      npm ci --omit=dev
      npm run installer        (applique les nouvelles tables, ne touche pas aux données)
      sudo systemctl restart atlas
`);
