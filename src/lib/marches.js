'use strict';
/**
 * LES MARCHÉS.
 *
 * Un marché, c'est un pays servi : sa devise, ses prix, son stock, ses
 * frais et son délai de livraison. Deux aujourd'hui — la Tunisie et les
 * Émirats — mais rien dans ce fichier ne suppose qu'il n'y en aura que
 * deux.
 *
 * TROIS RÈGLES, dont dépend tout le reste.
 *
 * 1. LE MARCHÉ EST UN CHOIX DU VISITEUR, JAMAIS UNE DEVINETTE. Il se
 *    range dans un cookie, il se change d'un clic, et il est écrit en
 *    toutes lettres dans l'en-tête. Deviner le pays d'après la connexion
 *    se trompe sur un Tunisien en voyage, sur un VPN, sur un téléphone
 *    en itinérance — et le visiteur voit alors les mauvais prix sans
 *    comprendre pourquoi, ce qui est pire que de lui demander.
 *
 * 2. LE COOKIE EST UNE PROPOSITION, PAS UN FAIT. Il est relu ici,
 *    comparé à la liste des marchés ACTIFS, et remplacé par le marché
 *    par défaut s'il ne correspond à rien. Un cookie forgé à la main ne
 *    peut donc pas ouvrir un marché que le commerçant n'a pas ouvert,
 *    ni faire payer en dirhams une commande tunisienne.
 *
 * 3. LES DÉCIMALES APPARTIENNENT À LA DEVISE. Le dinar en a trois
 *    (89,500 DT), le dirham deux (115,25 AED). Tous les montants du
 *    site sont des entiers dans la plus petite unité — millimes ici,
 *    fils là. Une fonction de conversion qui suppose trois décimales
 *    partout donne des montants faux SANS RIEN CASSER : les additions
 *    restent justes, les totaux restent cohérents, et seul le prix est
 *    dix fois trop grand. C'est le genre d'erreur qu'on ne voit qu'à la
 *    première facture.
 */
const db = require('../db');

const COOKIE = 'marche';
/* Un an. Le marché d'un client ne change pas entre deux saisons, et lui
   reposer la question à chaque visite serait une façon de lui dire qu'on
   ne l'a pas écouté. */
const COOKIE_DUREE = 365 * 24 * 3600;

/* Les deux marchés créés au premier démarrage. Les valeurs sont des
   points de départ que le commerçant corrige dans l'administration —
   sauf la devise et les décimales, qui sont des faits. */
const SEMENCE = [
  {
    code: 'tn', nom: 'Tunisie', devise: 'DT', decimales: 3, langue: 'fr',
    frais_livraison: 7000, livraison_gratuite_des: 200000,
    delai_livraison: '2 à 4 jours ouvrables', actif: 1, ordre: 1,
    libelle_region: 'Gouvernorat',
    exemples: {
      nom: 'Yassine Ben Salah', email: 'vous@exemple.tn',
      telephone: '20 123 456', telephone_aide: '8 chiffres. C\'est par ce numéro que le livreur vous joindra.',
      ville: 'La Marsa', ville_libelle: 'Ville / délégation',
      code_postal: '2078', code_postal_visible: true,
      adresse: 'Rue, numéro, immeuble, étage, point de repère',
    },
    regions: ['Ariana', 'Béja', 'Ben Arous', 'Bizerte', 'Gabès', 'Gafsa', 'Jendouba',
      'Kairouan', 'Kasserine', 'Kébili', 'Le Kef', 'Mahdia', 'La Manouba', 'Médenine',
      'Monastir', 'Nabeul', 'Sfax', 'Sidi Bouzid', 'Siliana', 'Sousse', 'Tataouine',
      'Tozeur', 'Tunis', 'Zaghouan'],
  },
  {
    code: 'ae', nom: 'Émirats arabes unis', devise: 'AED', decimales: 2, langue: 'en',
    frais_livraison: 2500, livraison_gratuite_des: 0,
    delai_livraison: 'environ une semaine',
    /* « Ville de livraison » et non « Émirat » : la liste contient Al Ain,
       qui est une ville de l'émirat d'Abou Dabi, pas un émirat. Un champ
       qui s'appelle « Émirat » et propose une ville met le doigt sur une
       erreur que le client n'a pas commise. */
    libelle_region: 'Ville de livraison',
    exemples: {
      nom: 'Ahmed Al Mansouri', email: 'vous@exemple.ae',
      telephone: '50 123 4567', telephone_aide: '9 chiffres. C\'est par ce numéro que le livreur vous joindra.',
      ville: 'Al Barsha', ville_libelle: 'Quartier',
      /* Les Émirats n'utilisent pas de code postal : le champ disparaît
         plutôt que de rester vide avec un exemple tunisien dedans. */
      code_postal: '', code_postal_visible: false,
      adresse: 'Rue, immeuble, appartement, point de repère',
    },
    /* LES ZONES RÉELLEMENT DESSERVIES, pas la liste administrative du
       pays. Proposer les sept émirats alors qu'on ne livre que dans
       trois villes, c'est prendre une commande qu'on ne pourra pas
       honorer — et le client ne l'apprend qu'au téléphone.
       Modifiable dans Réglages → Pays servis. */
    regions: ['Abu Dhabi', 'Dubaï', 'Al Ain'],
    /* INACTIF au départ, et c'est délibéré : tant que le commerçant n'a
       pas saisi ses prix en dirhams ni son stock de Dubaï, ouvrir ce
       marché afficherait un catalogue à zéro dirham. Le site ne change
       donc pas d'apparence le jour de la mise à jour ; il attend qu'on
       le lui demande. */
    actif: 0, ordre: 2,
  },
];

let cache = null;
const invalider = () => { cache = null; };

/** Tous les marchés, actifs ou non, dans l'ordre d'affichage. */
function tous() {
  if (!cache) cache = db.all('SELECT * FROM marches ORDER BY ordre, code');
  return cache;
}

const actifs = () => tous().filter((m) => m.actif);

/** Le marché par défaut : le premier actif. */
function defaut() {
  const a = actifs();
  if (a.length) return a[0];
  /* Aucun marché actif : le commerçant a tout fermé. On renvoie quand
     même la Tunisie plutôt que de laisser le site planter — une boutique
     mal réglée doit s'afficher et se laisser réparer, pas rendre une
     page blanche. */
  return tous()[0] || SEMENCE[0];
}

function parCode(code) {
  return tous().find((m) => m.code === code) || null;
}

/**
 * Le marché d'une requête. C'est LA fonction qui compte : tout le reste
 * du site l'appelle plutôt que de lire le cookie lui-même.
 */
function deLaRequete(req) {
  const demande = req && req.cookies ? req.cookies[COOKIE] : null;
  const m = demande ? parCode(String(demande)) : null;
  return (m && m.actif) ? m : defaut();
}

/* ---------------------------------------------------------- montants */

/**
 * D'un montant saisi (« 89,500 », « 115.25 ») vers l'entier stocké.
 *
 * Le nombre de décimales vient du marché, pas d'une constante. On
 * arrondit au lieu de tronquer : 0.1+0.2 vaut 0.30000000000000004 en
 * virgule flottante, et tronquer transformerait 115,25 AED en 115,24.
 */
function versEntier(valeur, decimales) {
  const n = typeof valeur === 'number' ? valeur : parseFloat(String(valeur).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * Math.pow(10, decimales));
}

/** De l'entier stocké vers le nombre décimal. */
function versDecimal(entier, decimales) {
  return (parseInt(entier, 10) || 0) / Math.pow(10, decimales);
}

/** Montant affichable : « 89,500 DT », « 115,25 AED ». */
function formater(entier, marche) {
  const d = marche.decimales;
  const v = versDecimal(entier, d);
  return `${v.toFixed(d).replace('.', ',')} ${marche.devise}`;
}

/* -------------------------------------------------------- migration */

/**
 * Appelée au DÉMARRAGE DU SERVEUR, pas dans l'installeur.
 *
 * L'installeur, personne ne le relance après une mise à jour : une
 * correction qui n'y vit que pour les nouvelles installations n'atteint
 * jamais la boutique en service. Le démarrage, lui, a lieu à chaque
 * fois. La fonction est donc écrite pour pouvoir tourner mille fois
 * sans rien abîmer.
 *
 * Elle fait trois choses, toutes réversibles par l'administration :
 *   — crée les deux marchés s'ils n'existent pas ;
 *   — recopie les prix actuels comme prix tunisiens ;
 *   — recopie les stocks actuels comme stocks tunisiens.
 *
 * Elle ne devine JAMAIS un prix en dirhams. Un produit sans prix
 * émirati n'est pas vendable aux Émirats, et c'est la bonne réponse :
 * mieux vaut un article manquant qu'un article à un prix inventé.
 */
/* Les colonnes ajoutées à une table qui existe déjà. SQLite n'a pas de
   « ADD COLUMN IF NOT EXISTS » : relancer la commande sur une base déjà
   migrée lève une erreur et empêcherait le serveur de démarrer. On
   demande donc la liste des colonnes avant d'écrire.

   Elles ne sont pas dans schema.sql pour la même raison : le schéma est
   rejoué à chaque démarrage, et un CREATE TABLE « IF NOT EXISTS » ne
   touche jamais une table déjà créée — une colonne ajoutée là ne serait
   apparue que sur les bases neuves. */
/* Les divisions administratives du pays, et le mot qui les désigne.
   Sans elles, le formulaire de commande proposait les 24 gouvernorats
   tunisiens à un client de Dubaï — qui ne pouvait tout simplement pas
   terminer sa commande. Un champ obligatoire sans réponse valable, c'est
   une vente perdue sans message d'erreur. */
const COLONNES_MARCHES = [
  ['libelle_region', "TEXT NOT NULL DEFAULT 'Gouvernorat'"],
  ['regions',        "TEXT NOT NULL DEFAULT ''"],
  /* Le bandeau du haut de page, par pays.
  
     Il était unique pour tout le monde : « LIVRAISON OFFERTE DÈS 200 DT »
     s'affichait à un client des Émirats qui paie en dirhams — et pour
     lequel aucun seuil de gratuité n'existe. Une promesse fausse, dans
     la mauvaise monnaie, en gros caractères en bas de l'écran.
     
     Vide, il ne s'affiche PAS dans les pays secondaires : mieux vaut
     pas de bandeau qu'un bandeau qui ment. Le pays principal, lui,
     garde le texte général des réglages — rien ne change pour la
     Tunisie tant que le commerçant n'écrit rien ici. */
  ['bandeau_texte',  "TEXT NOT NULL DEFAULT ''"],
  /* Les exemples gris du formulaire de commande : nom, ville, code
     postal, téléphone. Ils étaient écrits en dur dans la page — « La
     Marsa », « 2078 », « 20 123 456 » — et s'affichaient donc à un
     client de Dubaï. Un exemple, ça montre la forme attendue ; un
     exemple venu d'un autre pays montre la mauvaise forme. */
  ['exemples',       "TEXT NOT NULL DEFAULT ''"],
  /* Le numéro du COMMERÇANT, par pays — celui du pied de page et du
     bouton WhatsApp, à ne pas confondre avec celui que le CLIENT saisit
     à la commande (règles plus bas).

     Un seul numéro pour tout le monde obligeait un client de Dubaï à
     appeler la Tunisie : coût international, et un indicatif qui n'a
     pas l'air d'un numéro local sur une boutique qui affiche des
     dirhams. Vide, le pays retombe sur le numéro général des réglages
     — donc rien ne change tant qu'on n'écrit rien ici. */
  ['telephone',      "TEXT NOT NULL DEFAULT ''"],
  /* La LANGUE de la vitrine dans ce pays.

     Elle est une propriété du pays servi, pas une préférence du
     visiteur : c'est la décision que le commerçant a prise (« aux
     Émirats, je parle anglais »), et elle doit donc se lire en base
     comme les frais ou le délai. Écrite en dur dans le code, ouvrir un
     troisième pays aurait demandé une modification de fichier. */
  ['langue',         "TEXT NOT NULL DEFAULT 'fr'"],
];

/* Indicatif international et longueur du numéro NATIONAL, par pays.
   Sert à fabriquer le lien WhatsApp : « wa.me » n'accepte qu'un numéro
   au format international, sans « + » ni espaces. Sans ces deux
   informations, un numéro émirati saisi en local (9 chiffres) produisait
   un lien qui s'ouvre sur « numéro invalide » — la pire des pannes,
   celle qui a l'air de marcher. */
const INDICATIFS = {
  tn: { indicatif: '216', national: 8 },
  ae: { indicatif: '971', national: 9 },
};

/** L'indicatif d'un pays servi, avec un repli large pour un pays ajouté demain. */
function indicatifs(marche) {
  return INDICATIFS[marche && marche.code] || { indicatif: '', national: 0 };
}

/**
 * LA RÈGLE DU NUMÉRO DE TÉLÉPHONE, PAR PAYS.
 *
 * Elle reste DANS LE CODE, pas en base : c'est une expression régulière,
 * et une expression régulière modifiable depuis une page d'administration
 * est une porte ouverte — mal écrite, elle peut bloquer le serveur sur
 * une seule saisie. Les exemples affichés, eux, sont en base : ils ne
 * s'exécutent pas.
 *
 * Le défaut trouvé : le site n'acceptait QUE les numéros tunisiens à
 * huit chiffres. Un client émirati saisissait son vrai numéro et se
 * voyait répondre « Numéro de téléphone tunisien invalide » — sur une
 * boutique qui lui affichait des prix en dirhams. Commande impossible.
 */
const REGLES_TEL = {
  tn: {
    motif: /^(\+?216)?[2-59]\d{7}$/,
    prefixe: /^(\+?216)/,
    message: 'Numéro tunisien invalide : 8 chiffres attendus.',
  },
  ae: {
    /* Émirats : 9 chiffres après l'indicatif, mobiles en 5x, fixes en
       2/3/4/6/7/9. Le zéro de tête (050…) est une convention d'appel
       local, on l'accepte et on le retire. */
    motif: /^(\+?971)?0?[2-9]\d{8}$/,
    prefixe: /^(\+?971)?0?/,
    message: 'Numéro émirati invalide : 9 chiffres attendus, par exemple 50 123 4567.',
  },
};

/* Un pays qu'on ouvrirait demain sans règle écrite ici : on accepte
   largement plutôt que de refuser tout le monde. Mieux vaut un numéro
   mal formé qu'une boutique où personne ne peut commander. */
const REGLE_TEL_DEFAUT = {
  motif: /^\+?\d{6,15}$/,
  prefixe: /^\+/,
  message: 'Numéro de téléphone invalide.',
};

/** Vérifie et normalise un numéro selon le pays. */
function telephone(marche, brut) {
  const nettoye = String(brut || '').replace(/[\s.\-()]/g, '');
  const regle = REGLES_TEL[marche.code] || REGLE_TEL_DEFAUT;
  if (!regle.motif.test(nettoye)) return { ok: false, message: regle.message };
  return { ok: true, valeur: nettoye.replace(regle.prefixe, '') };
}

const COLONNES_COMMANDES = [
  ['marche',    "TEXT NOT NULL DEFAULT 'tn'"],
  ['devise',    "TEXT NOT NULL DEFAULT 'DT'"],
  ['decimales', 'INTEGER NOT NULL DEFAULT 3'],
];

function ajouterColonnes() {
  let n = 0;
  for (const [table, colonnes] of [['commandes', COLONNES_COMMANDES], ['marches', COLONNES_MARCHES]]) {
    const presentes = new Set(db.all(`PRAGMA table_info(${table})`).map((c) => c.name));
    for (const [nom, type] of colonnes) {
      if (presentes.has(nom)) continue;
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${nom} ${type}`);
      n++;
      /* Une colonne qui naît prend les valeurs que la SEMENCE déclare
         pour les pays qu'elle connaît — exactement ce qu'aurait une
         installation neuve. Sans ça, « langue » serait née à « fr »
         partout et les Émirats seraient restés en français jusqu'à ce
         que quelqu'un pense à ouvrir l'écran des réglages. Le remplissage
         n'a lieu qu'À LA CRÉATION de la colonne : il ne repassera jamais
         par-dessus un choix du commerçant. */
      if (table === 'marches') {
        for (const s of SEMENCE) {
          if (s[nom] === undefined) continue;
          /* CERTAINES VALEURS DE LA SEMENCE SONT DES OBJETS.

             « regions » y est une liste et « exemples » un objet : en base
             ce sont des colonnes de texte, qui reçoivent du JSON. Passés
             tels quels au pilote SQLite, ils étaient pris pour un jeu de
             paramètres nommés et l'installation s'arrêtait sur « Unknown
             named parameter '0' ».

             Le défaut ne se voyait QUE sur une base neuve : sur une
             boutique déjà installée, ces colonnes existent, donc la boucle
             ne s'exécute jamais. Autrement dit, le serveur en production
             tournait très bien pendant que la première installation d'un
             nouveau venu échouait au démarrage. */
          const brut = s[nom];
          const valeur = (brut !== null && typeof brut === 'object') ? JSON.stringify(brut) : brut;
          db.run(`UPDATE ${table} SET ${nom} = ? WHERE code = ?`, valeur, s.code);
        }
      }
    }
  }
  return n;
}

/* Le nom de la monnaie EN TOUTES LETTRES, pour les phrases juridiques.
   Les conditions de vente disaient « les prix sont indiqués en dinars
   tunisiens » à un client qui paie en dirhams : une phrase contractuelle
   fausse, dans le document qui engage le vendeur. Le code de devise seul
   (« AED ») n'irait pas dans une phrase ; il faut le mot. */
const NOMS_DEVISE = {
  DT: 'dinars tunisiens',
  TND: 'dinars tunisiens',
  AED: 'dirhams des Émirats arabes unis',
  EUR: 'euros',
  USD: 'dollars américains',
};
const nomDevise = (marche) => NOMS_DEVISE[marche.devise] || marche.devise;

/** Les exemples affichés dans le formulaire, sous forme d'objet. */
function exemples(marche) {
  try {
    const o = JSON.parse(marche.exemples || '{}');
    return (o && typeof o === 'object') ? o : {};
  } catch { return {}; }
}

/** Les régions d'un marché, sous forme de liste. */
function regions(marche) {
  try {
    const l = JSON.parse(marche.regions || '[]');
    return Array.isArray(l) ? l.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

/**
 * Le client a-t-il choisi une région qui existe dans ce pays ?
 *
 * Contrôlé CÔTÉ SERVEUR, comme les prix. Le formulaire propose une liste,
 * mais une liste dans un navigateur se modifie en trois secondes ; et
 * surtout, une commande qui porte « Dubai » comme gouvernorat tunisien
 * partirait chez un transporteur qui ne sait pas quoi en faire.
 *
 * Si le marché n'a pas de liste (cas d'une base ancienne), on accepte :
 * refuser toutes les commandes vaudrait pire que le défaut qu'on corrige.
 */
function regionValide(marche, valeur) {
  const l = regions(marche);
  if (!l.length) return true;
  return l.some((r) => r.localeCompare(String(valeur || ''), 'fr', { sensitivity: 'base' }) === 0);
}

function migrer() {
  const fait = { marches: 0, prix: 0, stocks: 0, colonnes: ajouterColonnes(), regions: 0 };

  for (const m of SEMENCE) {
    const existe = db.get('SELECT code FROM marches WHERE code = ?', m.code);
    if (existe) continue;
    /* LA LISTE DES COLONNES EST DÉDUITE DE LA SEMENCE, pas écrite à la
       main.

       Elle l'était, et il y manquait « langue » : sur une base neuve, les
       colonnes sont ajoutées AVANT que les pays soient créés, donc la
       recopie des valeurs par défaut ne trouvait aucune ligne à remplir,
       et l'INSERT qui suivait ne mentionnait pas la colonne. Résultat :
       les Émirats naissaient en français. Le défaut ne se voyait que sur
       une installation neuve — jamais sur la boutique en service, où les
       lignes existaient déjà quand la colonne est apparue.

       Écrite ainsi, toute valeur ajoutée un jour à la semence entre en
       base sans qu'on ait à y penser. */
    const presentes = new Set(db.all('PRAGMA table_info(marches)').map((c) => c.name));
    const colonnes = Object.keys(m).filter((c) => presentes.has(c));
    const oubliees = Object.keys(m).filter((c) => !presentes.has(c));
    if (oubliees.length) {
      console.warn(`  marchés : la semence décrit ${oubliees.join(', ')}, absent(s) de la table.`);
    }
    const valeurs = colonnes.map((c) => {
      const v = m[c];
      return (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
    });
    db.run(
      `INSERT INTO marches (${colonnes.join(', ')}) VALUES (${colonnes.map(() => '?').join(', ')})`,
      ...valeurs
    );
    fait.marches++;
  }
  invalider();

  /* Les prix tunisiens viennent de produits.prix, la colonne d'origine.
     INSERT OR IGNORE : un prix déjà saisi dans l'administration n'est
     jamais réécrit par la migration, même si la colonne d'origine a
     gardé une vieille valeur. */
  const p = db.run(`
    INSERT OR IGNORE INTO prix_marche (produit_id, marche, prix, prix_barre)
    SELECT id, 'tn', prix, prix_barre FROM produits`);
  fait.prix = (p && p.changements) || 0;

  const s = db.run(`
    INSERT OR IGNORE INTO stock_marche (variante_id, marche, stock)
    SELECT id, 'tn', stock FROM variantes`);
  fait.stocks = (s && s.changements) || 0;

  /* Toute taille existante reçoit aussi une ligne à ZÉRO pour les autres
     marchés. Sans elle, « stock de cette taille à Dubaï » renverrait
     « pas de ligne » — une absence qu'il faudrait distinguer d'un zéro
     dans chaque requête du site. Une ligne à zéro dit la même chose et
     ne se distingue de rien. */
  for (const m of tous()) {
    if (m.code === 'tn') continue;
    const r = db.run(
      `INSERT OR IGNORE INTO stock_marche (variante_id, marche, stock)
       SELECT id, ?, 0 FROM variantes`, m.code);
    fait.stocks += (r && r.changements) || 0;
  }

  /* Les bases créées avant l'ajout des régions ont des marchés sans
     liste. On la pose, sans jamais écraser une liste déjà remplie. */
  for (const m of SEMENCE) {
    const l = db.get('SELECT regions FROM marches WHERE code = ?', m.code);
    if (l && !String(l.regions || '').trim()) {
      db.run('UPDATE marches SET libelle_region = ?, regions = ? WHERE code = ?',
        m.libelle_region, JSON.stringify(m.regions), m.code);
      fait.regions++;
    }
    /* Correction unique : la première version proposait les sept émirats,
       dont quatre où le commerçant ne livre pas. On ne remplace QUE si la
       liste est restée exactement celle qu'on avait posée — une liste
       retouchée dans l'administration appartient au commerçant. */
    if (m.code === 'ae' && l) {
      const ANCIENNE = ['Abou Dabi', 'Dubaï', 'Charjah', 'Ajman', 'Oumm al Qaïwaïn',
        'Ras el Khaïmah', 'Foujaïrah'];
      let actuelle = [];
      try { actuelle = JSON.parse(l.regions || '[]'); } catch { actuelle = []; }
      if (JSON.stringify(actuelle) === JSON.stringify(ANCIENNE)) {
        db.run('UPDATE marches SET regions = ?, libelle_region = ? WHERE code = ?',
          JSON.stringify(m.regions), m.libelle_region, m.code);
        fait.regions++;
      }
    }

    const e = db.get('SELECT exemples FROM marches WHERE code = ?', m.code);
    if (e && !String(e.exemples || '').trim()) {
      db.run('UPDATE marches SET exemples = ? WHERE code = ?', JSON.stringify(m.exemples), m.code);
      fait.regions++;
    } else if (e) {
      /* Corrections ponctuelles d'un libellé livré tel quel dans une
         version précédente. On ne remplace QUE la valeur exacte qu'on
         avait posée : un libellé réécrit par le commerçant reste le
         sien. Ici, « Ville / quartier » se lisait juste sous « Ville de
         livraison » — deux champs disant « ville », dont un seul est une
         liste. */
      const CORRECTIONS = { ae: { ville_libelle: ['Ville / quartier', 'Quartier'] } };
      const c = CORRECTIONS[m.code];
      if (c) {
        let o = {};
        try { o = JSON.parse(e.exemples) || {}; } catch { o = {}; }
        let change = false;
        for (const [cle, [avant, apres]] of Object.entries(c)) {
          if (o[cle] === avant) { o[cle] = apres; change = true; }
        }
        if (change) {
          db.run('UPDATE marches SET exemples = ? WHERE code = ?', JSON.stringify(o), m.code);
          fait.regions++;
        }
      }
    }
  }
  invalider();

  return fait;
}

/**
 * Appelée après la création d'un produit ou d'une taille : garantit
 * qu'il existe une ligne de stock pour chaque marché. Le reste du code
 * peut alors lire un stock sans se demander si la ligne existe.
 */
function completerStock(varianteId) {
  for (const m of tous()) {
    db.run('INSERT OR IGNORE INTO stock_marche (variante_id, marche, stock) VALUES (?, ?, 0)',
      varianteId, m.code);
  }
}

module.exports = {
  COOKIE, COOKIE_DUREE, SEMENCE,
  tous, actifs, defaut, parCode, deLaRequete, invalider,
  versEntier, versDecimal, formater, regions, regionValide, exemples, telephone, nomDevise,
  indicatifs,
  migrer, completerStock,
};
