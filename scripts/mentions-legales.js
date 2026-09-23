'use strict';
/**
 * Remplit les mentions légales d'ATLAS STREETWEAR.
 *
 *   npm run mentions
 *
 * À lancer SERVEUR ARRÊTÉ (Ctrl+C dans sa fenêtre) : le serveur garde les
 * réglages en mémoire et ne les relit pas.
 *
 * Pourquoi un script plutôt que « tapez-les dans le formulaire » : ces
 * valeurs ont été données une fois, elles sont stables, et les retaper à
 * la main est une occasion de plus de se tromper sur un numéro à onze
 * chiffres. Une commande, et c'est posé.
 *
 * CE SCRIPT N'INVENTE RIEN. Les champs qui demandent un numéro officiel —
 * matricule fiscal, registre de commerce — restent vides tant qu'ils
 * n'existent pas. Un faux numéro fiscal sur une boutique en ligne n'est
 * pas un champ rempli, c'est un faux : il appartient peut-être à
 * quelqu'un d'autre, et il figure aussi bien sur les pages légales que
 * sur les factures.
 *
 * IL N'ÉCRASE RIEN NON PLUS. Une valeur déjà saisie dans l'administration
 * est conservée : on peut relancer la commande sans rien perdre.
 */
require('./charger-env')();
const reglages = require('../src/lib/reglages');
const db = require('../src/db');

const c = {
  v: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`,
  j: (s) => `\x1b[33m${s}\x1b[0m`, g: (s) => `\x1b[90m${s}\x1b[0m`,
};

/* Les valeurs communiquées par le commerçant. Modifiez-les ici le jour où
   elles changent — ou saisissez-les directement dans l'administration,
   les deux chemins mènent au même endroit. */
const VALEURS = {
  legal_raison_sociale: 'ATLAS STREETWEAR',
  legal_forme_juridique: 'Personne physique',
  legal_siege: '11 bis rue lagha kram',
  legal_directeur: 'Hamza Zouiten',
  legal_regime_tva: 'non_assujetti',
  legal_entreprise_inscrite: '0',

  /* L'HÉBERGEUR : OVH, choisi par le commerçant.
   *
   * Coordonnées relevées sur les mentions légales publiées par OVH
   * elle-même, et non écrites de mémoire. Une version antérieure de ce
   * script inscrivait ce nom d'office, avant que personne ne l'ait
   * choisi : c'était une fausse mention légale, produite par le script
   * qui annonce en tête qu'il n'invente rien. La valeur est la même, mais
   * elle ne vient plus du même endroit — cette fois, elle a été demandée.
   *
   * CETTE LIGNE DEVIENT UNE DÉCLARATION PUBLIQUE LE JOUR OÙ LE SITE EST
   * EN LIGNE CHEZ OVH. Tant qu'il tourne sur l'ordinateur du commerçant,
   * elle n'est lue par personne. Si l'hébergement se fait finalement
   * ailleurs, ce champ doit être corrigé dans l'administration avant la
   * mise en ligne : la loi impose de nommer l'hébergeur réel. */
  legal_hebergeur: 'OVH SAS, 2 rue Kellermann, 59100 Roubaix, France — RCS Lille Métropole 424 761 419',
};

/* Le siège social reprend l'adresse de contact quand elle est renseignée.
   La loi 2000-83, article 25, impose de communiquer l'adresse du vendeur
   avant la conclusion du contrat ; pour une personne physique, c'est
   celle-là. Elle est de toute façon déjà publiée dans le bloc Contact de
   la même page — on ne divulgue donc rien de neuf. Si vous préférez ne
   pas l'y voir, videz le champ dans l'administration. */
const adresse = reglages.get('adresse');
if (adresse) VALEURS.legal_siege = adresse;

/* Entreprise non inscrite : les deux champs qui attendent un numéro
   officiel sont VIDÉS, et les lignes correspondantes retirées de la page
   publique. On les avait vus remplis avec « Non assujetti » — ce n'est
   pas un faux numéro, mais ce n'est pas non plus une réponse à la
   question posée, et surtout ça éteignait les trois rappels : l'alerte du
   tableau de bord, la confirmation avant ouverture, et le rouge sur la
   page. Une case remplie n'est pas la même chose qu'un problème réglé.

   La même règle est appliquée par le serveur à l'enregistrement des
   réglages : les deux chemins partagent la liste et le motif, pour ne
   pas dériver l'un de l'autre.

   CE TEST SE FAIT APRÈS L'ÉCRITURE, pas avant. Lu trop tôt, il voyait
   encore l'ancienne valeur : le script inscrivait « pas encore inscrite »
   puis, dans la même exécution, concluait que l'entreprise était inscrite
   et laissait les deux champs en l'état. Il aurait fallu lancer la
   commande deux fois pour qu'elle fasse son travail — sans que rien ne le
   dise. Même piège d'ordre que celui déjà corrigé côté serveur. */

const LIBELLES = {
  legal_raison_sociale: 'Raison sociale',
  legal_forme_juridique: 'Forme juridique',
  legal_matricule_fiscal: 'Matricule fiscal',
  legal_rc: 'Registre de commerce',
  legal_siege: 'Siège social',
  legal_directeur: 'Directeur de la publication',
  legal_hebergeur: 'Hébergeur',
  legal_regime_tva: 'Régime de TVA',
  legal_entreprise_inscrite: 'Inscription',
  telephone: 'Téléphone',
  email: 'E-mail',
  adresse: 'Adresse',
};
const nom = (k) => LIBELLES[k] || k;

/* Ce que le commerçant doit lire à l'écran, pas ce que la base stocke.
   « legal_entreprise_inscrite « 0 » » est exact et illisible : personne
   ne relit un compte rendu qu'il ne comprend pas, et un compte rendu
   qu'on ne relit pas ne sert à rien. */
const LISIBLE = {
  legal_entreprise_inscrite: { 0: 'pas encore inscrite', 1: 'inscrite' },
  legal_regime_tva: { non_assujetti: 'non assujetti à la TVA', assujetti: 'assujetti à la TVA' },
};
const lisible = (cle, v) => (LISIBLE[cle] && LISIBLE[cle][v]) || v;

console.log('\n  Mentions légales\n');

const aEcrire = {};
for (const [cle, valeur] of Object.entries(VALEURS)) {
  const actuelle = reglages.get(cle);
  /* Déjà à la bonne valeur, ou personnalisé par le commerçant : on ne
     touche pas. Sans le premier test, un réglage dont la valeur voulue est
     aussi la valeur par défaut — le régime de TVA — se réaffichait comme
     « rempli » à chaque passage : un faux mouvement, qui fait douter de ce
     que le script a vraiment fait. */
  if (actuelle === valeur || (actuelle && actuelle !== reglages.DEFAUTS[cle])) {
    const vu = lisible(cle, actuelle);
    console.log(c.g(`  inchangé   ${nom(cle).padEnd(28)} « ${vu.slice(0, 56)} »`));
    continue;
  }
  aEcrire[cle] = valeur;
  const vu = lisible(cle, valeur);
  console.log(c.v(`  rempli     ${nom(cle).padEnd(28)} « ${vu.slice(0, 56)}${vu.length > 56 ? '…' : ''} »`));
}

if (Object.keys(aEcrire).length) {
  reglages.definirPlusieurs(aEcrire);
  reglages.invalider();
}

if (reglages.get('legal_entreprise_inscrite') === '0') {
  const aVider = {};
  for (const cle of reglages.CHAMPS_NUMERO_OFFICIEL) {
    const v = reglages.get(cle).trim();
    if (v && reglages.MENTION_NON_VALIDE.test(v)) {
      aVider[cle] = '';
      console.log(c.j(`  vidé       ${nom(cle).padEnd(28)} « ${v} » n'est pas un numéro officiel`));
    }
  }
  if (Object.keys(aVider).length) { reglages.definirPlusieurs(aVider); reglages.invalider(); }
  console.log(c.g('\n  Entreprise non inscrite : ces deux lignes sont retirées de la page publique.'));
}

const manquants = reglages.CHAMPS_LEGAUX_REQUIS.filter((k) => !reglages.get(k));
console.log('');
if (manquants.length) {
  console.log(c.j(`  ${manquants.length} champ(s) encore vide(s) : ${manquants.map(nom).join(', ')}`));
  if (manquants.includes('legal_matricule_fiscal')) {
    console.log(c.g('\n  Le matricule fiscal ne peut pas être inventé : il est délivré par'));
    console.log(c.g('  l\'administration fiscale après inscription au Registre national des'));
    console.log(c.g('  entreprises. Tant qu\'il manque, la boutique ne doit pas ouvrir —'));
    console.log(c.g('  l\'interrupteur d\'ouverture vous le rappellera.'));
  }
} else {
  console.log(c.v('  Toutes les mentions obligatoires sont renseignées.'));
}

console.log(c.j('\n  Redémarrez le serveur pour que les pages du site en tiennent compte.\n'));
db.fermer();
