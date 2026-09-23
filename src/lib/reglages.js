'use strict';
const db = require('../db');

/**
 * Réglages : une table clé/valeur, lue à chaque requête via un cache
 * mémoire invalidé à l'écriture. Le commerçant modifie le nom de sa
 * boutique, ses frais de livraison ou son bandeau d'annonce sans qu'on
 * touche à une ligne de code.
 */

const DEFAUTS = {
  // Identité
  nom_boutique: 'ATLAS STREETWEAR',
  accroche: 'Born from the mountains, built for the streets.',
  devise: 'TND',
  devise_symbole: 'DT',
  langue: 'fr',
  pays: 'Tunisie',

  // Boutique ouverte / fermée
  boutique_ouverte: '1',
  message_fermeture: 'Nouvelle collection en préparation. On revient très vite.',

  // Livraison & paiement
  frais_livraison: '7000',              // en millimes → 7,000 DT
  livraison_gratuite_des: '200000',     // 0 = jamais de livraison offerte
  delai_livraison: '2 à 4 jours ouvrables',
  mode_paiement: 'livraison',           // paiement à la livraison

  // Contact
  telephone: '',
  email: '',
  adresse: '',
  instagram: '',
  facebook: '',
  tiktok: '',
  /* WhatsApp : un NUMÉRO, pas un lien. C'est ce que le commerçant a sous
     la main, et taper « https://wa.me/216... » de tête est une occasion
     de se tromper. Le site fabrique le lien. L'indicatif +216 est ajouté
     tout seul si le numéro fait huit chiffres — un numéro tunisien saisi
     comme on le dicte au téléphone doit marcher. */
  whatsapp: '',

  /* LES ALERTES DE COMMANDE, par Telegram.

     Le jeton est un SECRET : qui le possède peut écrire à la place du
     commerçant. Ces deux clés ne figurent donc pas dans publics() — la
     vitrine ne les reçoit jamais, et il n'existe aucune route publique
     qui les renvoie. C'est la différence avec l'identifiant du pixel
     juste en dessous, qui est public par nature. */
  telegram_token: '',
  telegram_chat: '',

  /* L'IDENTIFIANT DU PIXEL META.

     En base, pas dans le code : le commerçant le change sans toucher à un
     fichier, et il ne part pas dans le dépôt public du projet.

     Vide = AUCUN suivi. Ni script chargé, ni cookie déposé, et la
     politique de sécurité du site reste aussi fermée qu'avant. Le pixel
     n'existe que si quelqu'un l'a demandé. */
  pixel_meta: '',

  // Bandeau et page d'accueil
  bandeau_actif: '1',
  bandeau_texte: 'LIVRAISON OFFERTE DÈS 200 DT — PAIEMENT À LA LIVRAISON',
  // Le titre du héros est composé de QUATRE fragments, comme sur la
  // maquette : deux lignes que la marque interrompt en son milieu.
  //   1 = haut gauche     2 = haut droite
  //   3 = bas gauche      4 = bas droite
  hero_ligne1: 'BORN FROM',
  hero_ligne2: 'THE MOUNTAINS',
  hero_ligne3: 'BUILT FOR THE STREETS',
  hero_ligne4: 'MADE TO MOVE',
  hero_accent1: '',
  hero_accent2: 'MOUNTAINS',
  hero_accent3: 'STREETS',
  hero_accent4: '',
  hero_sous_titre: 'Tunisie — paiement à la livraison',

  // Mentions légales (affichées en rouge dans l'admin tant que vides)
  legal_raison_sociale: '',
  legal_forme_juridique: '',
  legal_matricule_fiscal: '',
  legal_rc: '',
  legal_siege: '',
  legal_directeur: '',
  legal_hebergeur: '',
  /* Régime de TVA : « assujetti » ou « non_assujetti ».
  
     Ce n'est pas un détail de rédaction. Les conditions de vente
     annonçaient « prix toutes taxes comprises » en dur — une phrase
     fausse pour un vendeur non assujetti, puisqu'il n'y a aucune taxe
     dans son prix. Écrire qu'une taxe est comprise quand elle ne l'est
     pas, c'est une information erronée donnée au client sur le prix.
     
     Le régime pilote la phrase affichée, en un seul endroit. */
  legal_regime_tva: 'non_assujetti',
  /* L'entreprise est-elle inscrite au Registre national des entreprises ?
  
     « 0 » masque les lignes « Matricule fiscal » et « Registre de
     commerce » sur la page publique. Mieux vaut ne rien dire que dire
     quelque chose d'inexact : ces deux lignes attendent des numéros
     officiels, et écrire autre chose à leur place — un statut, une
     mention, un tiret — répond à côté de la question que le visiteur se
     pose en lisant une page de mentions légales.
     
     L'administration, elle, continue de les compter comme manquantes :
     alerte sur le tableau de bord, et confirmation exigée avant
     d'ouvrir la boutique. Masquer une ligne pour le client ne doit
     jamais revenir à masquer le problème au commerçant. */
  legal_entreprise_inscrite: '1',
  /* 10, et pas 7.
  
     Loi n° 2000-83 du 9 août 2000 relative aux échanges et au commerce
     électroniques, article 30 : le consommateur dispose de DIX JOURS
     OUVRABLES pour se rétracter, à compter de la réception de la
     marchandise. C'est un minimum légal : un commerçant peut offrir plus,
     jamais moins. La valeur 7 qui était ici annonçait donc aux clients
     un droit inférieur à celui que la loi leur donne. */
  legal_delai_retract: '10',
};

/** Champs légaux obligatoires : l'admin les signale en rouge tant qu'ils sont vides. */
/**
 * Plancher légal du délai de rétractation, en jours ouvrables.
 *
 * Loi n° 2000-83 du 9 août 2000 relative aux échanges et au commerce
 * électroniques, article 30 : le consommateur dispose de dix jours
 * ouvrables à compter de la réception de la marchandise. Un commerçant
 * peut offrir davantage, jamais moins.
 *
 * Ce n'est donc pas une valeur par défaut qu'on propose, c'est une borne
 * qu'on fait respecter — d'où les deux protections plus bas : correction
 * au démarrage pour les bases déjà installées, et refus à l'enregistrement.
 */
const DELAI_RETRACTATION_MINIMUM = 10;

const CHAMPS_LEGAUX_REQUIS = [
  'legal_raison_sociale',
  'legal_forme_juridique',
  'legal_matricule_fiscal',
  'legal_siege',
  'legal_directeur',
  /* L'hébergeur figure dans la section « Hébergement » des mentions
     légales : son absence laissait un tiret discret là où doit figurer
     une identité. Il n'était pas dans la liste des champs obligatoires,
     donc rien ne le réclamait. */
  'legal_hebergeur',
  'telephone',
  'email',
];

/* Ce qu'on a vu écrit dans « Matricule fiscal » à la place d'un numéro.
   Ce ne sont pas de faux numéros — personne ne cherche à tromper — mais
   ce ne sont pas non plus des réponses à la question posée, et une case
   remplie éteint les trois rappels (alerte du tableau de bord,
   confirmation avant ouverture, rouge sur la page). Résultat : la
   boutique s'ouvrait sans un mot, alors que rien n'était réglé.
   Une case remplie n'est pas la même chose qu'un problème réglé. */
const MENTION_NON_VALIDE = /^(non assujetti|non assujettie|n\/a|na|non applicable|aucun|aucune|néant|neant|pas encore|en cours|-+|\.+|_+)$/i;

/* Champs qui attendent un numéro délivré par l'administration : on ne
   peut ni les inventer, ni les remplacer par une mention. */
const CHAMPS_NUMERO_OFFICIEL = ['legal_matricule_fiscal', 'legal_rc'];

let cache = null;

function tous() {
  if (cache) return cache;
  const lignes = db.all('SELECT cle, valeur FROM reglages');
  const map = Object.assign({}, DEFAUTS);
  for (const l of lignes) map[l.cle] = l.valeur;
  cache = map;
  return cache;
}

function get(cle) {
  const v = tous()[cle];
  return v === undefined ? '' : v;
}

function nombre(cle) {
  const n = parseInt(get(cle), 10);
  return Number.isFinite(n) ? n : 0;
}

function booleen(cle) {
  return get(cle) === '1';
}

function definir(cle, valeur) {
  db.run(
    `INSERT INTO reglages (cle, valeur, modifie_le) VALUES (?, ?, datetime('now'))
     ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur, modifie_le = datetime('now')`,
    cle, String(valeur ?? '')
  );
  cache = null;
}

function definirPlusieurs(objet) {
  for (const [cle, valeur] of Object.entries(objet)) definir(cle, valeur);
}

function invalider() { cache = null; }

/**
 * Transforme un numéro en lien WhatsApp, côté SERVEUR.
 *
 * La vitrine ne reçoit qu'une URL déjà formée : le navigateur n'a pas à
 * deviner un indicatif, et un numéro mal saisi ne produit pas un lien
 * cassé chez le client mais rien du tout ici.
 *
 * Règles, volontairement peu nombreuses :
 *   — on ne garde que les chiffres (les espaces, points et tirets que le
 *     commerçant met naturellement disparaissent) ;
 *   — huit chiffres = numéro tunisien, on préfixe 216 ;
 *   — un « + » ou un indicatif déjà présent est respecté ;
 *   — tout le reste renvoie une chaîne vide : pas de lien plutôt qu'un
 *     lien qui ouvre une conversation avec un inconnu.
 */
function lienWhatsApp(brut, indicatif = '216', national = 8) {
  /* Le « 00 » de tête part : c'est la façon de composer un appel
     international depuis un téléphone, pas un morceau du numéro. Gardé,
     il produisait wa.me/0021650494016 — une adresse qui s'ouvre et
     n'aboutit nulle part, le pire des trois résultats possibles. */
  const chiffres = String(brut || '').replace(/\D/g, '').replace(/^00/, '');
  if (!chiffres) return '';
  /* L'indicatif n'est ajouté QUE si le numéro a exactement la longueur
     nationale du pays. C'était « 8 chiffres → 216 » en dur : un numéro
     émirati écrit en local (9 chiffres) repartait tel quel et donnait un
     lien mort. Et l'inverse — préfixer tout ce qui ne commence pas par
     216 — aurait cassé un numéro étranger déjà complet. La longueur est
     le seul critère qui distingue les deux sans se tromper. */
  let complet;
  if (indicatif && chiffres.startsWith(indicatif) && chiffres.length >= indicatif.length + national) {
    complet = chiffres;                     // déjà au format international
  } else {
    /* Le zéro de tête est une convention d'appel LOCAL — « 050 865 5490 »
       aux Émirats, comme on le dit à voix haute. Non retiré, il produisait
       wa.me/0508655490 : un lien qui s'ouvre et ne trouve personne. Le
       commerçant aurait tapé son propre numéro, exactement comme il le
       donne au téléphone, et le bouton aurait été mort. */
    const local = chiffres.replace(/^0+/, '');
    complet = (national && local.length === national && indicatif)
      ? `${indicatif}${local}`
      : chiffres;
  }
  if (complet.length < 10 || complet.length > 15) return '';
  return `https://wa.me/${complet}`;
}

/** Ce que la vitrine a le droit de connaître (jamais de champ interne). */
function publics() {
  const r = tous();
  return {
    nom_boutique: r.nom_boutique,
    accroche: r.accroche,
    devise_symbole: r.devise_symbole,
    boutique_ouverte: r.boutique_ouverte === '1',
    message_fermeture: r.message_fermeture,
    frais_livraison: parseInt(r.frais_livraison, 10) || 0,
    livraison_gratuite_des: parseInt(r.livraison_gratuite_des, 10) || 0,
    delai_livraison: r.delai_livraison,
    telephone: r.telephone,
    email: r.email,
    adresse: r.adresse,
    instagram: r.instagram,
    facebook: r.facebook,
    tiktok: r.tiktok,
    whatsapp: lienWhatsApp(r.whatsapp),
    /* La vitrine reçoit l'identifiant parce qu'elle doit l'écrire dans
       l'appel à Meta. Ce n'est pas un secret : il est visible dans le code
       de n'importe quelle page qui porte un pixel. */
    pixel_meta: r.pixel_meta,
    bandeau_actif: r.bandeau_actif === '1',
    bandeau_texte: r.bandeau_texte,
    hero_ligne1: r.hero_ligne1,
    hero_ligne2: r.hero_ligne2,
    hero_ligne3: r.hero_ligne3,
    hero_ligne4: r.hero_ligne4,
    hero_accent1: r.hero_accent1,
    hero_accent2: r.hero_accent2,
    hero_accent3: r.hero_accent3,
    hero_accent4: r.hero_accent4,
    hero_sous_titre: r.hero_sous_titre,
  };
}

/**
 * Remet d'aplomb ce qui doit l'être, au démarrage du serveur.
 *
 * La correction vivait dans l'installeur. C'était une erreur : le
 * commerçant met à jour son site, redémarre, et rien ne change — parce
 * que personne ne relance l'installeur après une mise à jour, et qu'il
 * n'y a aucune raison de le faire. Une valeur imposée par la loi ne peut
 * pas dépendre d'une commande que l'on pense à taper.
 *
 * Ne touche QUE ce qui est sous le plancher. Un commerçant qui offre
 * 14 ou 30 jours garde son choix.
 */
function verifierPlanchers() {
  const actuel = nombre('legal_delai_retract');
  if (actuel >= DELAI_RETRACTATION_MINIMUM) return null;
  definir('legal_delai_retract', String(DELAI_RETRACTATION_MINIMUM));
  return { cle: 'legal_delai_retract', avant: actuel, apres: DELAI_RETRACTATION_MINIMUM };
}

module.exports = {
  DEFAUTS, CHAMPS_LEGAUX_REQUIS, DELAI_RETRACTATION_MINIMUM, verifierPlanchers,
  MENTION_NON_VALIDE, CHAMPS_NUMERO_OFFICIEL, lienWhatsApp,
  tous, get, nombre, booleen, definir, definirPlusieurs, invalider, publics,
};
