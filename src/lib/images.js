'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const sharp = require('sharp');

/**
 * Envoi d'images.
 *
 * Deux règles :
 *
 * 1. Le fichier est RÉ-ENCODÉ par sharp avant d'être écrit sur le disque.
 *    On ne copie jamais l'octet reçu. Le ré-encodage reconstruit l'image
 *    à partir des pixels décodés : tout ce qui était caché dans les
 *    métadonnées (EXIF, commentaires, charge utile déguisée en photo)
 *    disparaît. On perd l'orientation EXIF — d'où le .rotate() explicite
 *    qui l'applique avant de la jeter.
 *
 * 2. Le nom du fichier est tiré au hasard. Jamais celui fourni. Un nom
 *    d'origine peut contenir « ../ », un point-virgule, un caractère
 *    Unicode qui ressemble à un slash, ou 300 caractères.
 *
 * Version de sharp : la branche 0.33 traîne quatre CVE héritées de
 * libvips. Ce projet exige ^0.34 (voir package.json) et le serveur
 * affiche un avertissement au démarrage si une version plus ancienne
 * s'est glissée dans node_modules.
 */

const DOSSIER = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', '..', 'data', 'uploads');

fs.mkdirSync(DOSSIER, { recursive: true });

const TAILLE_MAX = 8 * 1024 * 1024;   // 8 Mo — nginx doit accepter au moins ça
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/** Stockage en mémoire : rien ne touche le disque avant ré-encodage. */
const reception = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAILLE_MAX, files: 8 },
  fileFilter: (req, file, cb) => {
    if (!TYPES.has(file.mimetype)) {
      return cb(new Error('Format non accepté. Envoyez un JPEG, un PNG ou un WebP.'));
    }
    cb(null, true);
  },
});

async function enregistrer(buffer) {
  // Le type déclaré par le navigateur ne prouve rien : sharp refusera
  // tout ce qui n'est pas réellement une image.
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) throw new Error('Fichier illisible : ce n\'est pas une image.');

  const nom = crypto.randomBytes(16).toString('hex');
  const grand = `${nom}.jpg`;
  const vignette = `${nom}-min.jpg`;

  const base = sharp(buffer).rotate();               // applique l'orientation EXIF puis l'oublie

  await base.clone()
    .resize(1400, 1867, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(path.join(DOSSIER, grand));

  await base.clone()
    .resize(500, 667, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 76, mozjpeg: true })
    .toFile(path.join(DOSSIER, vignette));

  return { fichier: grand, vignette, largeur: meta.width, hauteur: meta.height };
}

function supprimer(fichier) {
  if (!fichier || /[\/\\]/.test(fichier)) return;   // jamais de chemin, seulement un nom
  for (const f of [fichier, fichier.replace(/\.jpg$/, '-min.jpg')]) {
    const p = path.join(DOSSIER, f);
    if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { /* déjà parti */ } }
  }
}

function verifierVersionSharp() {
  try {
    const v = require(path.join(path.dirname(require.resolve('sharp')), '..', 'package.json')).version;
    const [maj, min] = v.split('.').map(Number);
    if (maj === 0 && min < 34) {
      console.warn(`\x1b[33m  sharp ${v} : cette branche traîne des CVE libvips. Faites « npm i sharp@latest ».\x1b[0m`);
    }
  } catch { /* version indéterminable, on n'empêche pas le démarrage */ }
}

module.exports = { DOSSIER, TAILLE_MAX, reception, enregistrer, supprimer, verifierVersionSharp };
