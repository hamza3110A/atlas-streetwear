/* ==========================================================================
   LES LANGUES DE LA VITRINE.

   UN SEUL FICHIER, LU DES DEUX CÔTÉS. Ce dictionnaire sert au serveur
   (qui traduit les pages HTML avant de les envoyer) ET au navigateur (qui
   traduit les textes fabriqués en JavaScript : panier, formulaire de
   commande, messages). Deux fichiers auraient dérivé l'un de l'autre à la
   première correction, et la moitié d'une page se serait retrouvée dans
   une langue et l'autre moitié dans l'autre.

   LA CLÉ EST LE TEXTE FRANÇAIS LUI-MÊME. Pas un code du genre
   « panier.vide » : personne n'invente 300 codes sans en réutiliser deux
   pour des phrases différentes, et une clé inconnue afficherait alors du
   vide. Ici, une phrase absente du dictionnaire s'affiche EN FRANÇAIS —
   lisible, repérable, jamais blanche.

   LA LANGUE APPARTIENT AU PAYS SERVI, pas au navigateur du visiteur.
   Elle est lue dans la colonne « langue » du marché : Tunisie → français,
   Émirats → anglais. Un troisième pays se règle dans l'administration,
   sans toucher à ce fichier.

   ATTENTION AUX PHRASES COUPÉES. Certaines phrases des pages légales sont
   interrompues par une valeur calculée (« Les prix sont indiqués en
   <devise>, <mention TVA>. »). Chaque morceau est traduit séparément :
   l'ordre des mots français et anglais coïncide sur ces phrases-là, ce
   qui a été vérifié une par une. Une phrase dont l'ordre changerait
   devrait être réécrite d'un seul tenant, pas découpée.
   ========================================================================== */
(function (racine) {
  'use strict';

  const EN = {
    /* ------------------------------------------------ titres de pages */
    'La boutique — ATLAS STREETWEAR': 'Shop — ATLAS STREETWEAR',
    'Panier — ATLAS STREETWEAR': 'Cart — ATLAS STREETWEAR',
    'Produit — ATLAS STREETWEAR': 'Product — ATLAS STREETWEAR',
    'Finaliser la commande — ATLAS STREETWEAR': 'Checkout — ATLAS STREETWEAR',
    'Commande enregistrée — ATLAS STREETWEAR': 'Order received — ATLAS STREETWEAR',
    'Contact — ATLAS STREETWEAR': 'Contact — ATLAS STREETWEAR',
    'Mentions légales — ATLAS STREETWEAR': 'Legal notice — ATLAS STREETWEAR',
    'Conditions de vente — ATLAS STREETWEAR': 'Terms of sale — ATLAS STREETWEAR',
    'Livraison & retours — ATLAS STREETWEAR': 'Shipping & returns — ATLAS STREETWEAR',
    'Page introuvable — ATLAS STREETWEAR': 'Page not found — ATLAS STREETWEAR',
    'Bientôt disponible — ATLAS STREETWEAR': 'Back soon — ATLAS STREETWEAR',

    /* ----------------------------------------- descriptions et accroches */
    'Streetwear tunisien. Tee-shirts, hoodies et casquettes en coton lourd. Paiement à la livraison partout en Tunisie.':
      'Tunisian streetwear. Heavyweight cotton tees, hoodies and caps. Cash on delivery.',
    'Tous les tee-shirts, hoodies et casquettes ATLAS. Paiement à la livraison en Tunisie.':
      'Every ATLAS tee, hoodie and cap. Cash on delivery.',
    'Paiement à la livraison. Les montants sont calculés par notre serveur au moment de la validation.':
      'Cash on delivery. Amounts are calculated by our server when you confirm.',

    /* --------------------------------------------- navigation et en-tête */
    'Aller au contenu': 'Skip to content',
    'Accueil': 'Home',
    'La boutique': 'Shop',
    'Boutique': 'Shop',
    'Rayons': 'Categories',
    'Contact': 'Contact',
    'Panier': 'Cart',
    'Rechercher': 'Search',
    'Tout voir': 'View all',
    'Voir la collection': 'View the collection',
    'Retour à la boutique': 'Back to the shop',
    'Continuer mes achats': 'Continue shopping',
    'Masquer': 'Hide',
    'Aide': 'Help',
    'Nous écrire': 'Email us',
    'Nous joindre': 'Get in touch',
    'Livraison vers': 'Delivering to',
    'Pays de livraison': 'Delivery country',
    'Où livrons-nous ?': 'Where do we deliver?',
    'Les prix, les frais et les délais changent selon le pays. Vous pourrez en changer à tout moment en haut de page.':
      'Prices, shipping and delivery times differ by country. You can change this at any time from the top of the page.',
    'Site réalisé par': 'Site built by',
    'Suivi de commande': 'Order tracking',
    'Une commande en cours ?': 'Tracking an order?',

    /* ------------------------------------------------ page d'accueil */
    'La collection': 'The collection',
    'Pièces produites en petite série. Quand une taille part, elle reste affichée : elle revient au réassort.':
      'Made in small runs. When a size sells out it stays on show — it comes back with the restock.',
    'Le bouquetin': 'The ibex',
    'ne redescend pas': 'does not come back down',
    'Le mouflon de l’Atlas tient sur des pentes où rien d’autre ne tient. C’est ce qu’on demande à un vêtement : tenir. Coton lourd, coutures doublées, impressions qui survivent au trentième lavage.':
      'The Atlas mouflon holds on slopes where nothing else holds. That is what we ask of a garment: to hold. Heavyweight cotton, double stitching, prints that survive the thirtieth wash.',
    'Matière d’abord': 'Fabric first',
    '220 g/m² sur les tee-shirts, 400 g/m² sur les hoodies. On ne descend pas en dessous.':
      '220 gsm on tees, 400 gsm on hoodies. We never go below that.',
    'Petites séries': 'Small runs',
    'Entre 60 et 120 pièces par référence. Pas de stock dormant, pas de soldes permanentes.':
      'Between 60 and 120 pieces per style. No dead stock, no permanent sales.',
    'Payé à la porte': 'Paid at the door',
    'Vous réglez au livreur, en main propre. Aucune carte à saisir nulle part.':
      'You pay the courier, in person. No card details anywhere.',
    'Tunisie — paiement à la livraison': 'Tunisia — cash on delivery',
    'Livraison —': 'Delivery —',

    /* ----------------------------------------------------- boutique */
    'Tout le catalogue. Les tailles épuisées restent affichées, barrées.':
      'The full catalogue. Sold-out sizes stay on show, struck through.',
    'Filtrer par rayon': 'Filter by category',
    'hoodie, casquette, ATL-TS-001…': 'hoodie, cap, ATL-TS-001…',
    'Catalogue momentanément indisponible.': 'Catalogue temporarily unavailable.',
    'Le catalogue arrive très bientôt.': 'The catalogue is coming very soon.',
    'Impossible de charger la collection pour le moment.': 'The collection cannot be loaded right now.',
    'Sélection': 'Featured',
    'Promo': 'Sale',
    'Épuisé': 'Sold out',
    '— épuisé': '— sold out',

    /* ------------------------------------------------ fiche produit */
    'Ajouter au panier': 'Add to cart',
    'Taille': 'Size',
    'Quantité': 'Quantity',
    'Description': 'Description',
    'Matière & entretien': 'Fabric & care',
    'Ça va avec': 'Goes well with',
    'Référence': 'Reference',
    'Article introuvable': 'Product not found',
    'Ce produit n’existe plus, ou n’est plus en vente.': 'This product no longer exists, or is no longer on sale.',
    'Choisissez une taille avant d’ajouter au panier.': 'Choose a size before adding to the cart.',
    'Choisissez d’abord une taille': 'Choose a size first',
    'Aucune description pour le moment.': 'No description yet.',
    'Détail de la matière à venir.': 'Fabric details coming soon.',
    'Épuisé pour le moment': 'Sold out for now',
    'Épuisé — réassort en cours': 'Sold out — restock on the way',
    'Conditions de retour': 'Return policy',
    'DISPONIBLE': 'IN STOCK',
    'BIENTÔT': 'SOON',

    /* ------------------------------------------------------- panier */
    'Votre panier': 'Your cart',
    'Panier vide': 'Your cart is empty',
    'Rien pour l’instant.': 'Nothing here yet.',
    'Modifier le panier': 'Edit cart',
    'Retirer un article': 'Remove an item',
    'Ajouter un article': 'Add an item',
    'Retirer': 'Remove',
    'Augmenter': 'Increase',
    'Diminuer': 'Decrease',
    'Article retiré': 'Item removed',
    'Votre panier a été mis à jour': 'Your cart has been updated',
    'Récapitulatif': 'Summary',
    'Sous-total': 'Subtotal',
    'Livraison': 'Shipping',
    'Frais': 'Shipping',
    'Remise': 'Discount',
    'Total': 'Total',
    'Total à payer': 'Total to pay',
    'À payer au livreur': 'To pay the courier',
    'Articles': 'Items',
    'Code promo': 'Promo code',
    'Appliquer': 'Apply',
    'Commander': 'Checkout',
    'Détail': 'Details',
    'Montants recalculés par le serveur à la validation.': 'Amounts are recalculated by the server when you confirm.',
    'Votre commande reste possible, au prix affiché.': 'You can still order, at the price shown.',
    'pour la livraison offerte.': 'away from free shipping.',
    'Ajoutez un article avant de commander.': 'Add an item before checking out.',

    /* ---------------------------------------------------- commande */
    'Finaliser la commande': 'Checkout',
    'Vos coordonnées': 'Your details',
    'Nom et prénom *': 'Full name *',
    'Téléphone *': 'Phone *',
    'E-mail (facultatif)': 'Email (optional)',
    'Adresse de livraison *': 'Delivery address *',
    'Ville / délégation *': 'City *',
    'Gouvernorat *': 'Governorate *',
    'Code postal': 'Postcode',
    'Note pour le livreur (facultatif)': 'Note for the courier (optional)',
    'Sonner au 2e étage, appeler avant de passer…': 'Ring on the 2nd floor, call before coming…',
    'Rue, numéro, immeuble, étage, point de repère': 'Street, number, building, floor, landmark',
    'Choisir…': 'Choose…',
    'Votre commande': 'Your order',
    'Valider ma commande': 'Place my order',
    'Envoi en cours…': 'Sending…',
    'En validant, vous acceptez nos': 'By confirming, you accept our',
    'conditions de vente': 'terms of sale',
    'Le total affiché est celui que vous paierez.': 'The total shown is the total you will pay.',
    'Complétez les champs obligatoires.': 'Please fill in the required fields.',
    'Paiement à la livraison': 'Cash on delivery',
    'Vous payez en espèces au livreur, à la remise du colis. Aucune carte bancaire n’est demandée sur ce site.':
      'You pay the courier in cash when the parcel is handed over. No card details are ever requested on this site.',
    'Vous réglez au livreur, en main propre.': 'You pay the courier, in person.',
    'Nous vous appelons pour confirmer avant l’expédition. Le paiement se fait au livreur, en main propre.':
      'We call you to confirm before shipping. Payment is made to the courier, in person.',

    /* ------------------------------------------------------- merci */
    'Commande': 'Order',
    'enregistrée': 'received',
    'Gardez votre référence sous la main (elle commence par': 'Keep your reference handy (it starts with',
    ') : elle nous permet de retrouver votre dossier immédiatement.': ') — it lets us find your order immediately.',
    'Nous vous appelons à chaque étape : confirmation, expédition, livraison. Si vous n’avez pas de nouvelles sous 48 heures, contactez-nous, il y a probablement eu un problème de numéro.':
      'We call you at every step: confirmation, dispatch, delivery. If you have not heard from us within 48 hours, get in touch — there was probably a problem with the number.',

    /* ------------------------------------------------------ contact */
    'Écrivez à': 'Write to',
    'ou appelez le': 'or call',
    'ou au': 'or on',
    'Grossistes et revendeurs': 'Wholesale and resellers',
    'Pour toute demande professionnelle, écrivez à': 'For business enquiries, write to',
    'en précisant votre société et le volume envisagé.': 'stating your company and the volume you have in mind.',
    'Où nous livrons': 'Where we deliver',
    'Zone desservie :': 'Served area:',
    'Délais': 'Lead times',
    'Comptez': 'Allow',
    'à compter de la confirmation téléphonique. Les délais sont indicatifs et peuvent varier en période de forte activité ou pour les zones éloignées.':
      'from the phone confirmation. Lead times are indicative and may vary during busy periods or for remote areas.',

    /* -------------------------------------------- page « fermée » / 404 */
    'Cette page n’existe pas — ou n’existe plus.': 'This page does not exist — or no longer does.',
    'Nouvelle collection en préparation. On revient très vite.':
      'A new collection is on its way. We will be back very soon.',
    'Bientôt disponible —': 'Back soon —',
    'Chargement de la boutique impossible': 'The shop could not be loaded',
    'a pas répondu correctement.': 'did not respond correctly.',

    /* ----------------------------------------------- pages légales */
    'Mentions légales': 'Legal notice',
    'Conditions de vente': 'Terms of sale',
    'Livraison & retours': 'Shipping & returns',
    'Livraison &amp; retours': 'Shipping &amp; returns',
    'Échanges et retours': 'Exchanges and returns',
    'Éditeur du site': 'Site publisher',
    'Raison sociale :': 'Legal name:',
    'Forme juridique :': 'Legal form:',
    'Matricule fiscal :': 'Tax ID:',
    'Registre de commerce :': 'Trade register:',
    'Siège social :': 'Registered office:',
    'Directeur de la publication :': 'Publication director:',
    'Téléphone :': 'Phone:',
    'E-mail :': 'Email:',
    'Adresse :': 'Address:',
    'Hébergement': 'Hosting',
    'Propriété intellectuelle': 'Intellectual property',
    'L’ensemble des visuels, textes, marques et éléments graphiques présents sur ce site est la propriété de':
      'All images, text, trademarks and graphic elements on this site are the property of',
    '. Toute reproduction, même partielle, sans autorisation écrite préalable est interdite.':
      '. Any reproduction, even partial, without prior written permission is prohibited.',
    'Données personnelles': 'Personal data',
    'Les informations collectées lors d’une commande (nom, téléphone, adresse) servent exclusivement à traiter et livrer cette commande. Elles ne sont ni vendues ni transmises à des tiers autres que le transporteur. Conformément à la loi organique n° 2004-63 du 27 juillet 2004 relative à la protection des données à caractère personnel, vous disposez d’un droit d’accès, de rectification et de suppression de vos données : écrivez à':
      'The information collected when you order (name, phone, address) is used solely to process and deliver that order. It is neither sold nor passed to any third party other than the carrier. Under Tunisian organic law no. 2004-63 of 27 July 2004 on the protection of personal data, you have a right of access, rectification and deletion of your data: write to',
    'Cookies': 'Cookies',
    "Ce site utilise le pixel de mesure publicitaire de Meta (Facebook, Instagram), qui dépose des cookies permettant de savoir quelle publicité a amené une visite ou une commande. Sont transmis à Meta : les pages consultées, les articles ajoutés au panier et le montant des commandes. Aucune donnée bancaire n'est concernée — ce site n'en collecte aucune. Un espace de stockage local du navigateur conserve le contenu de votre panier, sur votre appareil, et un cookie technique est déposé à la connexion à l'espace d'administration. Vous pouvez refuser les cookies publicitaires dans les réglages de votre navigateur ou de votre compte Meta.":
      'This site uses the Meta advertising measurement pixel (Facebook, Instagram), which sets cookies that show which advert brought a visit or an order. What is sent to Meta: the pages viewed, the items added to the cart and the order amounts. No banking data is involved — this site collects none. Local browser storage keeps the contents of your cart, on your device, and a technical cookie is set when signing in to the admin area. You can refuse advertising cookies in your browser settings or in your Meta account settings.',
    'Ce site n’utilise aucun cookie publicitaire ni de mesure d’audience tierce. Un espace de stockage local du navigateur conserve uniquement le contenu de votre panier, sur votre appareil. Un cookie technique est déposé à la connexion à l’espace d’administration.':
      'This site uses no advertising cookies and no third-party analytics. Local browser storage keeps only the contents of your cart, on your device. A technical cookie is set when signing in to the admin area.',

    '1. Objet': '1. Purpose',
    'Les présentes conditions régissent les ventes conclues sur ce site entre': 'These terms govern sales made on this site between',
    'et toute personne y passant commande. Passer commande vaut acceptation sans réserve des présentes conditions.':
      'and anyone placing an order on it. Placing an order means accepting these terms in full.',
    '2. Produits et disponibilité': '2. Products and availability',
    'Les articles sont proposés dans la limite des stocks disponibles. Une taille épuisée reste affichée, barrée, et ne peut pas être ajoutée au panier. En cas d’indisponibilité constatée après commande, vous êtes prévenu par téléphone et la commande est annulée sans frais.':
      'Items are offered while stocks last. A sold-out size stays on show, struck through, and cannot be added to the cart. If an item is found to be unavailable after ordering, you are informed by phone and the order is cancelled at no cost.',
    '3. Prix': '3. Prices',
    'Les prix sont indiqués en': 'Prices are shown in',
    '. Le montant définitif est calculé par notre serveur au moment de la validation et affiché avant confirmation.':
      '. The final amount is calculated by our server when you confirm, and shown before confirmation.',
    '4. Commande': '4. Ordering',
    'La commande est enregistrée dès validation du formulaire. Elle est ensuite confirmée par téléphone. Aucun compte n’est nécessaire : votre numéro de téléphone identifie votre commande.':
      'The order is recorded as soon as the form is submitted. It is then confirmed by phone. No account is needed: your phone number identifies your order.',
    '5. Paiement': '5. Payment',
    'Le paiement s’effectue exclusivement en espèces, au livreur, à la remise du colis. Aucune donnée bancaire n’est demandée, saisie ni conservée sur ce site.':
      'Payment is made exclusively in cash, to the courier, when the parcel is handed over. No banking details are requested, entered or stored on this site.',
    '6. Livraison': '6. Delivery',
    'Livraison dans la zone desservie (': 'Delivery within the served area (',
    '. Les frais de livraison s’élèvent à': '. Shipping costs',
    'et sont offerts à partir de': 'and are free from',
    ', offerte à partir de': ', free from',
    '. Livraison à l’adresse que vous indiquez au moment de la commande.': '. Delivered to the address you give when ordering.',
    'après la confirmation téléphonique de votre commande. Nous appelons systématiquement avant d’expédier.':
      'after the phone confirmation of your order. We always call before dispatching.',
    '7. Rétractation et retours': '7. Withdrawal and returns',
    'Vous disposez de': 'You have',
    'jours ouvrables après réception pour demander un échange ou un remboursement, l’article devant être non porté, non lavé, dans son état d’origine avec ses étiquettes. Les frais de retour restent à votre charge, sauf erreur de notre part ou défaut de fabrication.':
      'working days after delivery to request an exchange or a refund. The item must be unworn, unwashed, in its original condition with its tags. Return postage is at your expense, except where we made a mistake or the item is faulty.',
    'jours ouvrables après réception pour demander un échange de taille ou un remboursement. L’article doit être non porté, non lavé, avec ses étiquettes d’origine.':
      'working days after delivery to request a size exchange or a refund. The item must be unworn, unwashed, with its original tags.',
    'avec votre référence de commande : nous organisons le retour avec vous.':
      'with your order reference — we will arrange the return with you.',
    '8. Réclamations': '8. Complaints',
    'Toute réclamation est à adresser à': 'Any complaint should be sent to',
    ', en indiquant la référence de commande.': ', quoting the order reference.',
    '9. Droit applicable': '9. Governing law',
    'Les présentes conditions sont soumises au droit tunisien. En cas de litige, une solution amiable sera recherchée avant toute action judiciaire.':
      'These terms are governed by Tunisian law. In the event of a dispute, an amicable solution will be sought before any legal action.',
    'Livraison à': 'Delivery to',
    'Colis abîmé': 'Damaged parcel',
    'Vérifiez l’état du colis devant le livreur. En cas de dommage visible, refusez la livraison et prévenez-nous le jour même : nous réexpédions sans frais.':
      'Check the parcel in front of the courier. If there is visible damage, refuse the delivery and tell us the same day — we reship at no cost.',
    'Vous réglez en espèces au livreur, au moment où il vous remet le colis. Prévoyez l’appoint autant que possible : les livreurs ne disposent pas toujours de monnaie.':
      'You pay the courier in cash when the parcel is handed to you. Please have the exact amount where possible — couriers do not always carry change.',
    'Vous avez': 'You have',
    ') sous': ') within',
    'Non renseigné': 'Not provided',
    '[à renseigner : Administration → Réglages]': '[to be filled in: Admin → Settings]',

    /* ------------------------------------- fils d’Ariane et liens de pied */
    '/ Conditions de vente': '/ Terms of sale',
    '/ Livraison & retours': '/ Shipping & returns',
    '/ Mentions légales': '/ Legal notice',
    '/ Contact': '/ Contact',
    '/ Panier': '/ Cart',
    '/ Commande': '/ Checkout',

    /* ---- textes venus de la base : exemples et libellés du formulaire */
    "8 chiffres. C'est par ce numéro que le livreur vous joindra.":
      'Eight digits. This is the number the courier will call.',
    "9 chiffres. C'est par ce numéro que le livreur vous joindra.":
      'Nine digits. This is the number the courier will call.',
    /* Les DEUX DÉLAIS LIVRÉS PAR DÉFAUT. Ce sont des mots du commerçant,
       pas de l'interface : s'il en écrit d'autres, ils s'afficheront tels
       quels. L'écran « Pays servis » le dit maintenant sous le champ. */
    '2 à 4 jours ouvrables': '2 to 4 business days',
    'environ une semaine': 'about one week',
    /* Noms de devises en toutes lettres et mentions fiscales : ils sont
       calculés par le serveur pour les phrases contractuelles. */
    'dinars tunisiens': 'Tunisian dinars',
    'dirhams des Émirats arabes unis': 'UAE dirhams',
    'euros': 'euros',
    'dollars américains': 'US dollars',
    'net de taxe — TVA non applicable': 'net of tax — VAT not applicable',
    'toutes taxes comprises': 'all taxes included',
    ', dans les': ', across the',
    'villes de livraison': 'delivery cities',
    'gouvernorats': 'governorates',
    'Gouvernorat': 'Governorate',
    'Ville de livraison': 'Delivery city',
    'Ville / délégation': 'City',
    'Quartier': 'Area',
    'Rue, immeuble, appartement, point de repère': 'Street, building, flat, landmark',
    'Émirats arabes unis': 'United Arab Emirates',
    'Tunisie': 'Tunisia',

    /* ------------------------------- textes fabriqués en JavaScript */
    'Ouvrir le menu': 'Open the menu',
    'Fermer le menu': 'Close the menu',
    'Navigation principale': 'Main navigation',
    'Voir le panier': 'View cart',
    'Prix en': 'Prices in',
    'Encore': 'Another',
    'Il ne reste que': 'Only this many left:',
    'Code promo inconnu ou expiré.': 'Unknown or expired promo code.',
    'Code promo expiré.': 'Promo code expired.',

    /* -------------------------------------------- messages du serveur */
    'La boutique est momentanément fermée.': 'The shop is temporarily closed.',
    'La boutique est momentanément fermée. Réessayez plus tard.': 'The shop is temporarily closed. Please try again later.',
    'Votre panier est vide.': 'Your cart is empty.',
    'Aucun article disponible dans votre panier.': 'No available items in your cart.',
    'Votre panier a changé. Vérifiez le récapitulatif avant de valider.':
      'Your cart has changed. Check the summary before confirming.',
    'Ce produit n’est pas disponible dans ce pays.': 'This product is not available in this country.',
    'Ce pays n’est pas desservi.': 'This country is not served.',
    'Aucune commande ne correspond à ces informations.': 'No order matches these details.',
    'Trop de commandes depuis cet appareil. Contactez-nous par téléphone.':
      'Too many orders from this device. Please contact us by phone.',
    'Trop de tentatives de connexion. Réessayez dans 15 minutes.':
      'Too many sign-in attempts. Please try again in 15 minutes.',
    'Une erreur est survenue. Réessayez.': 'Something went wrong. Please try again.',
    'Route inconnue.': 'Unknown route.',
    'Adresse e-mail invalide.': 'Invalid email address.',
    'La quantité doit être d’au moins 1.': 'Quantity must be at least 1.',
    'Maximum 20 exemplaires du même article. Contactez-nous pour une commande en gros.':
      'Maximum 20 units of the same item. Contact us for a wholesale order.',
    'Numéro de téléphone invalide.': 'Invalid phone number.',
    'Numéro tunisien invalide : 8 chiffres attendus.': 'Invalid Tunisian number: 8 digits expected.',
    'Numéro émirati invalide : 9 chiffres attendus, par exemple 50 123 4567.':
      'Invalid UAE number: 9 digits expected, for example 50 123 4567.',
    'Code promo inconnu ou expiré.': 'Unknown or expired promo code.',
  };

  const DICOS = { en: EN };

  /* LES DEUX APOSTROPHES SE VALENT.
     Les pages de ce site sont écrites avec l'apostrophe droite ('), le
     dictionnaire a été saisi avec la courbe (’), et les deux se
     ressemblent tellement qu'aucune relecture ne les distingue. Sans
     normalisation, « Choisissez d’abord une taille » ne trouvait jamais
     « Choisissez d'abord une taille » : la phrase restait en français,
     au milieu d'une page anglaise, sans erreur nulle part.
     On range donc TOUT sous une seule forme, une fois pour toutes. */
  const plat = (t) => String(t)
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    /* Les retours à la ligne et l'indentation du fichier HTML font partie
       du texte pour JavaScript, pas pour le navigateur qui les réduit à
       une espace. Une phrase écrite sur trois lignes dans la page ne
       correspondait donc à aucune clé, et restait en français — c'était
       le cas de presque tout le texte des pages légales. */
    .replace(/\s+/g, ' ')
    .trim();

  const INDEX = {};
  for (const langue of Object.keys(DICOS)) {
    const dico = DICOS[langue];
    const i = {};
    for (const cle of Object.keys(dico)) i[plat(cle)] = dico[cle];
    INDEX[langue] = i;
  }

  /** La langue est-elle connue ? Sinon, français. */
  function langueValide(code) {
    return Object.prototype.hasOwnProperty.call(DICOS, String(code)) ? String(code) : 'fr';
  }

  /**
   * Traduit un texte. Français en entrée, français en sortie si la langue
   * est le français ou si la phrase n'est pas au dictionnaire.
   *
   * Les espaces de début et de fin sont CONSERVÉS : dans une page, un
   * morceau de phrase est souvent collé à une balise (« … à <span>7,000
   * DT</span> »), et les manger recollerait les mots.
   */
  function traduire(texte, langue) {
    const dico = INDEX[langue];
    if (!dico) return texte;
    const s = String(texte);
    const noyau = s.trim();
    if (!noyau) return s;
    const trad = dico[plat(noyau)];
    if (trad === undefined) return s;
    const debut = s.indexOf(noyau);
    return s.slice(0, debut) + trad + s.slice(debut + noyau.length);
  }

  /** Le dictionnaire brut, pour les outils de vérification. */
  const entrees = (langue) => Object.keys(DICOS[langue] || {});

  const API = { traduire, langueValide, entrees, LANGUES: Object.keys(DICOS).concat('fr') };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else racine.I18N = API;
})(typeof window !== 'undefined' ? window : globalThis);
