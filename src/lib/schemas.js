'use strict';
const { z } = require('zod');

/**
 * Validation par schéma à l'entrée de chaque route.
 * Objectif : qu'aucune route n'ait à écrire `if (!req.body.x)`. Ce qui
 * n'est pas décrit ici n'entre pas dans l'application.
 */

/**
 * Messages en français par défaut.
 *
 * Sans ça, un client tunisien qui met une quantité aberrante voit
 * « Too big: expected number to be <=20 ». Le message d'erreur d'une
 * bibliothèque finit toujours par arriver sous les yeux de quelqu'un :
 * autant qu'il soit dans la langue du site.
 */
z.config({
  customError: (probleme) => {
    const champ = Array.isArray(probleme.path) && probleme.path.length
      ? String(probleme.path[probleme.path.length - 1])
      : 'Ce champ';
    switch (probleme.code) {
      case 'invalid_type':
        return probleme.input === undefined
          ? `« ${champ} » est obligatoire.`
          : `« ${champ} » n'a pas le format attendu.`;
      case 'too_small':
        return probleme.origin === 'string'
          ? `« ${champ} » est trop court (${probleme.minimum} caractère(s) minimum).`
          : `« ${champ} » doit valoir au moins ${probleme.minimum}.`;
      case 'too_big':
        return probleme.origin === 'string'
          ? `« ${champ} » est trop long (${probleme.maximum} caractères maximum).`
          : `« ${champ} » ne peut pas dépasser ${probleme.maximum}.`;
      case 'invalid_value':
      case 'invalid_enum_value':
        return `« ${champ} » n'a pas une valeur autorisée.`;
      case 'invalid_format':
        return `« ${champ} » n'est pas au bon format.`;
      default:
        return `« ${champ} » est invalide.`;
    }
  },
});

const texte = (max = 200) => z.string().trim().max(max);
const texteRequis = (max = 200, champ = 'Ce champ') =>
  z.string().trim().min(1, `${champ} est obligatoire.`).max(max);

/**
 * Numéro de téléphone — contrôle de FORME seulement.
 *
 * Le format exact dépend du pays de livraison, que ce schéma ne connaît
 * pas : il est résolu par le serveur au moment de la commande. La règle
 * par pays est appliquée juste après, dans la route, avec un message qui
 * nomme le bon format.
 *
 * Ici on refuse seulement ce qui ne peut être un numéro nulle part :
 * des lettres, moins de six chiffres, plus de quinze. Coder en dur les
 * huit chiffres tunisiens à cet endroit rendait toute commande émiratie
 * impossible — le client voyait « Numéro de téléphone tunisien
 * invalide » sur une boutique qui l'affichait en dirhams.
 */
const telephone = z.string().trim()
  .transform((s) => s.replace(/[\s.\-()]/g, ''))
  .refine((s) => /^\+?\d{6,15}$/.test(s), 'Numéro de téléphone invalide.');

const email = z.string().trim().toLowerCase().email('Adresse e-mail invalide.');
const emailFacultatif = z.union([z.literal(''), email]).default('');

const ligne_panier = z.object({
  variante_id: z.coerce.number().int().positive('Article invalide.'),
  quantite: z.coerce.number().int()
    .min(1, 'La quantité doit être d\'au moins 1.')
    .max(20, 'Maximum 20 exemplaires du même article. Contactez-nous pour une commande en gros.'),
});

const panier = z.array(ligne_panier).min(1, 'Votre panier est vide.').max(50);

const devis = z.object({
  panier: z.array(ligne_panier).max(50).default([]),
  code_promo: texte(40).default(''),
});

const commande = z.object({
  panier,
  code_promo: texte(40).default(''),
  nom: texteRequis(120, 'Le nom'),
  telephone,
  email: emailFacultatif,
  adresse: texteRequis(300, 'L\'adresse'),
  ville: texteRequis(80, 'La ville'),
  gouvernorat: texteRequis(60, 'Le gouvernorat'),
  code_postal: texte(10).default(''),
  note_client: texte(500).default(''),
  // envoyés par le navigateur mais ignorés : le serveur recalcule tout
  total: z.any().optional(),
  sous_total: z.any().optional(),
});

const connexion = z.object({
  email,
  mot_de_passe: z.string().min(1, 'Mot de passe requis.').max(200),
});

const categorie = z.object({
  nom: texteRequis(80, 'Le nom du rayon'),
  slug: texte(80).default(''),
  description: texte(500).default(''),
  ordre: z.coerce.number().int().default(0),
  visible: z.coerce.number().int().min(0).max(1).default(1),
});

const variante = z.object({
  id: z.coerce.number().int().optional(),
  taille: texteRequis(30, 'La taille'),
  sku: texte(60).default(''),
  /* « stock » est encore accepté pour ne pas casser un envoi ancien, mais
     il est IGNORÉ à l'écriture : les quantités se règlent uniquement sur
     la page Stock, entrepôt par entrepôt. Le refuser ici ferait échouer
     une fiche enregistrée depuis un onglet resté ouvert avant la mise à
     jour — un message d'erreur pour une donnée qu'on jette de toute
     façon. */
  stock: z.coerce.number().int().min(0).max(100000).default(0),
  ordre: z.coerce.number().int().default(0),
});

const produit = z.object({
  nom: texteRequis(140, 'Le nom du produit'),
  slug: texte(160).default(''),
  categorie_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional(),
  reference: texte(60).default(''),
  description: texte(4000).default(''),
  matiere: texte(300).default(''),
  prix: z.coerce.number().int().min(0, 'Le prix ne peut pas être négatif.').max(100000000),
  prix_barre: z.union([z.coerce.number().int().min(0).max(100000000), z.literal(''), z.null()]).optional(),
  actif: z.coerce.number().int().min(0).max(1).default(1),
  mis_en_avant: z.coerce.number().int().min(0).max(1).default(0),
  ordre: z.coerce.number().int().default(0),
  variantes: z.array(variante).max(40).default([]),
  points_forts: z.array(texte(200)).max(20).default([]),
  /* Les prix des AUTRES marchés : { ae: { prix, prix_barre } }.
  
     Facultatif, et vide par défaut. Un produit sans prix en dirhams
     n'est simplement pas proposé aux Émirats — ce qui vaut mieux qu'un
     montant converti que le commerçant n'a jamais regardé. Une chaîne
     vide efface le prix et retire donc le produit de ce marché : c'est
     la façon de dire « je ne vends pas ça là-bas ». */
  prix_marches: z.record(z.string().max(8), z.object({
    prix: z.union([z.coerce.number().int().min(0).max(100000000), z.literal(''), z.null()]).optional(),
    prix_barre: z.union([z.coerce.number().int().min(0).max(100000000), z.literal(''), z.null()]).optional(),
  })).default({}),
});

const STATUTS = ['nouvelle', 'confirmee', 'en_preparation', 'expediee', 'livree', 'annulee'];

const majStatut = z.object({
  statut: z.enum(STATUTS),
  note_interne: texte(1000).optional(),
});

/* Un marché, tel que l'administration peut le modifier.
   Le CODE, la DEVISE et les DÉCIMALES n'y sont pas : ce sont des faits,
   pas des préférences. Laisser changer « AED, 2 décimales » en « AED,
   3 décimales » suffirait à rendre faux tous les prix du catalogue. */
const marche = z.object({
  nom: texteRequis(60, 'Le nom du pays'),
  frais_livraison: z.coerce.number().int().min(0).max(100000000),
  livraison_gratuite_des: z.coerce.number().int().min(0).max(100000000).default(0),
  delai_livraison: texte(120).default(''),
  bandeau_texte: texte(160).default(''),
  /* Le numéro du commerçant dans ce pays. Volontairement peu contraint :
     c'est un texte d'affichage, pas une donnée qu'on recalcule. La règle
     stricte (REGLES_TEL dans marches.js) s'applique au numéro du CLIENT,
     parce que c'est celui avec lequel le livreur doit pouvoir appeler. */
  telephone: texte(30).default(''),
  /* La langue de la vitrine dans ce pays. Liste fermée : une valeur
     libre créerait un pays dont la langue n'existe pas, et la vitrine
     retomberait en français sans dire pourquoi. */
  langue: z.enum(['fr', 'en']).default('fr'),
  /* Le mot qui désigne la division (« Gouvernorat », « Ville de
     livraison »), et la liste des zones desservies. Le commerçant les
     règle lui-même : ses tournées changent plus souvent que son code. */
  libelle_region: texte(40).default('Région'),
  regions: z.array(texte(80)).max(60).default([]),
  actif: z.coerce.number().int().min(0).max(1).default(0),
  ordre: z.coerce.number().int().min(0).max(99).default(0),
});

const stockLigne = z.object({
  variante_id: z.coerce.number().int().positive(),
  stock: z.coerce.number().int().min(0).max(100000),
});

const client = z.object({
  nom: texteRequis(120, 'Le nom'),
  telephone,
  email: emailFacultatif,
  adresse: texte(300).default(''),
  ville: texte(80).default(''),
  gouvernorat: texte(60).default(''),
  code_postal: texte(10).default(''),
  note: texte(1000).default(''),
});

const promotion = z.object({
  code: texteRequis(40, 'Le code').transform((s) => s.toUpperCase().replace(/\s+/g, '')),
  libelle: texte(120).default(''),
  type: z.enum(['pourcentage', 'montant', 'livraison']),
  valeur: z.coerce.number().int().min(0).max(100000000).default(0),
  minimum_achat: z.coerce.number().int().min(0).default(0),
  portee: z.enum(['panier', 'produits', 'categories']).default('panier'),
  debut_le: texte(25).default(''),
  fin_le: texte(25).default(''),
  usage_max: z.coerce.number().int().min(0).default(0),
  actif: z.coerce.number().int().min(0).max(1).default(1),
  cibles: z.array(z.object({
    cible_type: z.enum(['produit', 'categorie']),
    cible_id: z.coerce.number().int().positive(),
  })).max(200).default([]),
});

const motDePasse = z.object({
  actuel: z.string().min(1, 'Mot de passe actuel requis.'),
  nouveau: z.string().min(8, 'Le nouveau mot de passe doit faire 8 caractères minimum.').max(200),
});

const utilisateur = z.object({
  email,
  nom: texteRequis(120, 'Le nom'),
  mot_de_passe: z.string().min(8, '8 caractères minimum.').max(200),
  role: z.enum(['proprietaire', 'admin', 'preparateur']).default('admin'),
});

/** Middleware générique : valide req.body, remplace par la version propre. */
function valider(schema) {
  return (req, res, next) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      const premier = r.error.issues[0];
      return res.status(400).json({
        erreur: premier.message,
        champ: premier.path.join('.'),
        details: r.error.issues.map((i) => ({ champ: i.path.join('.'), message: i.message })),
      });
    }
    req.donnees = r.data;
    next();
  };
}

module.exports = {
  valider, STATUTS,
  devis, commande, connexion, categorie, produit, majStatut, stockLigne, marche,
  client, promotion, motDePasse, utilisateur,
};
