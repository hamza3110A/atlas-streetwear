'use strict';
/**
 * Prépare les photos du shooting pour le site.
 *
 *   npm run photos
 *
 * 1. Copiez vos photos dans le dossier  photos-source  (glisser-déposer
 *    depuis l'explorateur Windows, c'est tout).
 * 2. Lancez la commande.
 * 3. Téléversez depuis  photos-web  dans l'administration.
 *
 * POURQUOI CE DÉTOUR. Le site refuse les fichiers de plus de 8 Mo, et un
 * JPEG sorti d'un appareil photo en fait facilement quinze. Ce n'est pas
 * une limite arbitraire : l'image est entièrement chargée en mémoire le
 * temps d'être ré-encodée, et huit photos de vingt mégaoctets envoyées
 * ensemble suffiraient à mettre le serveur à genoux. Plutôt que d'ouvrir
 * cette porte, on réduit les photos une fois pour toutes, ici.
 *
 * CE QUE VOUS NE PERDEZ PAS. Le site redimensionne de toute façon à
 * 1400 px de large pour la fiche produit et 500 px pour la vignette. On
 * sort donc 2200 px : de la marge pour les écrans les plus fins, et pas
 * un octet de plus. Vos originaux ne sont jamais modifiés ni déplacés.
 *
 * LES FICHIERS RAW (.ARW, .CR2, .NEF) SONT IGNORÉS. Ce sont vos négatifs
 * numériques : ils ne s'affichent pas dans un navigateur et leur place
 * est dans votre dossier de shooting, pas sur le site.
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const RACINE = path.join(__dirname, '..');
const SOURCE = path.join(RACINE, 'photos-source');
const SORTIE = path.join(RACINE, 'photos-web');

const COTE_MAX = 2200;
const QUALITE = 88;
const LIMITE_SITE = 8 * 1024 * 1024;

const c = {
  v: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`,
  j: (s) => `\x1b[33m${s}\x1b[0m`, g: (s) => `\x1b[90m${s}\x1b[0m`,
};
const ko = (n) => `${(n / 1024 / 1024).toFixed(1)} Mo`;

fs.mkdirSync(SOURCE, { recursive: true });

const IMAGES = /\.(jpe?g|png|webp|avif|tiff?)$/i;
const RAW = /\.(arw|cr2|cr3|nef|dng|orf|raf|rw2)$/i;

const tout = fs.readdirSync(SOURCE, { withFileTypes: true }).filter((e) => e.isFile());
const aFaire = tout.filter((e) => IMAGES.test(e.name));
const raw = tout.filter((e) => RAW.test(e.name));

console.log('\n  Préparation des photos\n');

if (!aFaire.length) {
  console.log(c.j('  Le dossier photos-source est vide.'));
  console.log(c.g(`\n  Copiez-y vos photos, puis relancez la commande :`));
  console.log(c.g(`  ${SOURCE}`));
  if (raw.length) {
    console.log(c.g(`\n  (${raw.length} fichier(s) RAW trouvé(s) : ils ne sont pas utilisables`));
    console.log(c.g('   sur un site. Copiez plutôt les .JPG du même shooting.)'));
  }
  console.log('');
  process.exit(0);
}

fs.mkdirSync(SORTIE, { recursive: true });

(async () => {
  let avant = 0, apres = 0, faits = 0, rates = 0;

  for (const e of aFaire) {
    const entree = path.join(SOURCE, e.name);
    const nom = e.name.replace(/\.[^.]+$/, '') + '.jpg';
    const sortie = path.join(SORTIE, nom);
    const tailleAvant = fs.statSync(entree).size;

    try {
      const meta = await sharp(entree).metadata();
      await sharp(entree)
        .rotate()                                   // applique l'orientation, puis l'oublie
        .resize(COTE_MAX, COTE_MAX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: QUALITE, mozjpeg: true })
        .toFile(sortie);

      const tailleApres = fs.statSync(sortie).size;
      avant += tailleAvant; apres += tailleApres; faits++;

      const alerte = tailleApres > LIMITE_SITE;
      console.log(
        `  ${alerte ? c.j('gros    ') : c.v('prêt    ')} ${e.name.padEnd(22)} `
        + c.g(`${ko(tailleAvant)} → ${ko(tailleApres)}  (${meta.width}×${meta.height})`)
      );
      if (alerte) console.log(c.j(`           dépasse encore 8 Mo — prévenez-moi, on ajustera.`));
    } catch (err) {
      rates++;
      console.log(`  ${c.r('illisible')} ${e.name.padEnd(22)} ${c.g(err.message)}`);
    }
  }

  console.log('');
  if (faits) {
    console.log(c.v(`  ${faits} photo(s) prête(s) — ${ko(avant)} ramenés à ${ko(apres)}.`));
    console.log(c.g(`  Elles vous attendent dans :  ${SORTIE}`));
    console.log(c.g('  Dans l\'administration : Produits → une fiche → Ajouter une photo.'));
  }
  if (rates) console.log(c.r(`  ${rates} fichier(s) illisible(s), laissés de côté.`));
  if (raw.length) {
    console.log(c.g(`\n  ${raw.length} fichier(s) RAW ignoré(s) : un navigateur ne sait pas les afficher.`));
  }
  console.log(c.g('\n  Vos originaux n\'ont pas été touchés.\n'));
})();
