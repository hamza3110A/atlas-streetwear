'use strict';
/**
 * Catalogue de démonstration.
 * Uniquement exécuté quand la base est vide : jamais sur une boutique
 * en production. Les visuels sont des gabarits générés à l'installation
 * pour que le commerçant voie tout de suite à quoi ressemble une fiche
 * complète — il les remplace par ses photos depuis l'administration.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RACINE = path.join(__dirname, '..');
const UPLOADS = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(RACINE, 'data', 'uploads');

const CATEGORIES = [
  { nom: 'Tee-shirts', slug: 'tee-shirts', description: 'Coton lourd 220 g, coupe droite.', ordre: 1 },
  { nom: 'Hoodies',    slug: 'hoodies',    description: 'Molleton gratté 400 g, capuche doublée.', ordre: 2 },
  { nom: 'Casquettes', slug: 'casquettes', description: 'Broderie dense, visière préformée.', ordre: 3 },
];

const PRODUITS = [
  {
    cat: 'tee-shirts', nom: 'Tee-shirt Sommet', ref: 'ATL-TS-001', prix: 89000, prix_barre: null,
    matiere: '100 % coton peigné 220 g/m²', avant: 1,
    description: "Le tee-shirt de base de la maison. Coton lourd qui ne se déforme pas au premier lavage, épaules tombantes, sérigraphie foudre au dos.",
    points: ['Coton peigné 220 g/m², non transparent', 'Sérigraphie dos, encre à l\'eau', 'Coupe droite, épaules tombantes', 'Lavage 30°, séchage à plat'],
    tailles: [['S', 8], ['M', 14], ['L', 12], ['XL', 5], ['XXL', 0]],
    couleur: '#161616', accent: '#C6272D',
  },
  {
    cat: 'tee-shirts', nom: 'Tee-shirt Djebel', ref: 'ATL-TS-002', prix: 95000, prix_barre: 119000,
    matiere: '100 % coton peigné 220 g/m²', avant: 1,
    description: "Impression pleine largeur inspirée des crêtes du Djebel Chambi. Tirage limité, une seule série.",
    points: ['Impression pleine largeur', 'Série limitée à 80 pièces', 'Coton peigné 220 g/m²'],
    tailles: [['S', 3], ['M', 6], ['L', 9], ['XL', 4]],
    couleur: '#1a1613', accent: '#C6272D',
  },
  {
    cat: 'hoodies', nom: 'Hoodie Foudre', ref: 'ATL-HD-001', prix: 189000, prix_barre: null,
    matiere: 'Molleton gratté 400 g/m², 80 % coton', avant: 1,
    description: "Molleton 400 g, capuche doublée, poche kangourou. Le vêtement qui tient l'hiver de Tunis et les nuits de montagne.",
    points: ['Molleton gratté 400 g/m²', 'Capuche doublée, cordon plat', 'Poignets et bas de corps côtelés', 'Broderie poitrine'],
    tailles: [['S', 4], ['M', 7], ['L', 7], ['XL', 3], ['XXL', 2]],
    couleur: '#111111', accent: '#C6272D',
  },
  {
    cat: 'hoodies', nom: 'Hoodie Zaghouan', ref: 'ATL-HD-002', prix: 199000, prix_barre: null,
    matiere: 'Molleton gratté 400 g/m²', avant: 0,
    description: "Version zippée, doublure contrastée, deux poches latérales fermées.",
    points: ['Zip métal massif', 'Doublure de capuche contrastée', 'Deux poches latérales zippées'],
    tailles: [['M', 5], ['L', 6], ['XL', 0]],
    couleur: '#141a18', accent: '#C6272D',
  },
  {
    cat: 'casquettes', nom: 'Casquette Ibex', ref: 'ATL-CP-001', prix: 59000, prix_barre: null,
    matiere: 'Sergé de coton, fermeture métal', avant: 1,
    description: "Six panneaux, broderie dense du bouquetin, visière préformée. Taille unique réglable.",
    points: ['Broderie 3D du bouquetin', 'Six panneaux, œillets brodés', 'Fermeture métal réglable'],
    tailles: [['Taille unique', 18]],
    couleur: '#101010', accent: '#C6272D',
  },
];

/** Gabarit de visuel produit : SVG → JPEG, dans l'esprit de la marque. */
async function gabarit(sharp, nom, sousTitre, fond, accent, variante) {
  const L = 1200, H = 1600;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stop-color="${fond}"/>
        <stop offset="100%" stop-color="#050505"/>
      </linearGradient>
      <pattern id="p" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(${variante ? 45 : -45})">
        <rect width="6" height="6" fill="none"/>
        <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" stroke-opacity="0.035" stroke-width="2"/>
      </pattern>
    </defs>
    <rect width="${L}" height="${H}" fill="url(#g)"/>
    <rect width="${L}" height="${H}" fill="url(#p)"/>
    ${variante ? `<rect x="0" y="${H * 0.62}" width="${L}" height="10" fill="${accent}" opacity="0.9"/>` : ''}
    <text x="${L / 2}" y="${H - 210}" text-anchor="middle" font-family="Helvetica, Nimbus Sans, Arial, sans-serif"
          font-size="86" font-weight="700" letter-spacing="-2" fill="#ffffff">${nom.toUpperCase()}</text>
    <text x="${L / 2}" y="${H - 150}" text-anchor="middle" font-family="'Space Mono', 'Courier New', monospace"
          font-size="30" letter-spacing="6" fill="${accent}">${sousTitre.toUpperCase()}</text>
    <text x="${L / 2}" y="${H - 70}" text-anchor="middle" font-family="'Space Mono', 'Courier New', monospace"
          font-size="22" letter-spacing="4" fill="#ffffff" opacity="0.35">VISUEL À REMPLACER</text>
  </svg>`;

  const marque = await sharp(path.join(RACINE, 'public', 'img', 'mark.png'))
    .resize({ width: variante ? 300 : 420 })
    .toBuffer();

  const nomFichier = crypto.randomBytes(12).toString('hex') + '.jpg';
  await sharp(Buffer.from(svg))
    .composite([{ input: marque, top: variante ? 460 : 380, left: variante ? 700 : 390 }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path.join(UPLOADS, nomFichier));
  return nomFichier;
}

module.exports = function demo(db) {
  const sharp = require('sharp');
  fs.mkdirSync(UPLOADS, { recursive: true });

  const idCat = {};
  for (const c of CATEGORIES) {
    const r = db.run(
      'INSERT INTO categories (nom, slug, description, ordre, visible) VALUES (?, ?, ?, ?, 1)',
      c.nom, c.slug, c.description, c.ordre
    );
    idCat[c.slug] = r.dernierId;
  }

  const travaux = [];
  PRODUITS.forEach((p, i) => {
    const slug = p.nom.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const r = db.run(
      `INSERT INTO produits (categorie_id, nom, slug, reference, description, matiere, prix, prix_barre, actif, mis_en_avant, ordre)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      idCat[p.cat], p.nom, slug, p.ref, p.description, p.matiere, p.prix, p.prix_barre, p.avant, i
    );
    const pid = r.dernierId;

    p.tailles.forEach(([taille, stock], j) => {
      db.run('INSERT INTO variantes (produit_id, taille, sku, stock, ordre) VALUES (?, ?, ?, ?, ?)',
        pid, taille, `${p.ref}-${taille}`, stock, j);
    });
    p.points.forEach((texte, j) => {
      db.run('INSERT INTO points_forts (produit_id, texte, ordre) VALUES (?, ?, ?)', pid, texte, j);
    });

    travaux.push((async () => {
      const a = await gabarit(sharp, p.nom.replace(/^(Tee-shirt|Hoodie|Casquette)\s+/i, ''), p.ref, p.couleur, p.accent, 0);
      const b = await gabarit(sharp, p.nom.replace(/^(Tee-shirt|Hoodie|Casquette)\s+/i, ''), 'dos / détail', p.couleur, p.accent, 1);
      db.run('INSERT INTO images (produit_id, fichier, alt, ordre) VALUES (?, ?, ?, 0)', pid, a, p.nom);
      db.run('INSERT INTO images (produit_id, fichier, alt, ordre) VALUES (?, ?, ?, 1)', pid, b, p.nom + ' — dos');
    })());
  });

  db.run(
    `INSERT INTO promotions (code, libelle, type, valeur, minimum_achat, portee, actif)
     VALUES ('BIENVENUE10', 'Première commande', 'pourcentage', 10, 100000, 'panier', 1)`
  );

  // Les visuels s'écrivent en tâche de fond ; on attend avant de rendre la main.
  return Promise.all(travaux);
};
