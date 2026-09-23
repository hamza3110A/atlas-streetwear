/* ==========================================================================
   LE PIXEL META.

   Il ne se charge QUE si un identifiant est réglé dans
   Administration → Réglages. Sans identifiant, ce fichier ne fait
   strictement rien : aucun script extérieur, aucun cookie, aucune requête
   vers Meta. C'est la même règle que côté serveur, où la politique de
   sécurité ne s'ouvre qu'à cette condition.

   POURQUOI CE FICHIER EXISTE AU LIEU DU BLOC FOURNI PAR META.
   Meta donne son pixel sous forme de script écrit directement dans la
   page. L'autoriser obligerait à ouvrir « script-src 'unsafe-inline' »,
   c'est-à-dire à accepter n'importe quel script écrit dans n'importe
   quelle page du site — la protection principale contre l'injection de
   code, supprimée pour tout le monde, administration comprise. Le code
   est donc le même, mais servi depuis notre propre domaine.

   LA DEVISE EST LE PIÈGE PRINCIPAL. Meta veut un code ISO 4217 et un
   montant en unité principale. Le site, lui, affiche « DT » et compte en
   millimes. Envoyer « DT » et « 90000 » pour une commande de 90 dinars
   donne un chiffre d'affaires mille fois trop grand, dans une monnaie que
   Meta ne reconnaît pas — et c'est sur ces nombres que l'algorithme
   décide à qui montrer les publicités. Une erreur ici ne se voit nulle
   part sur le site : elle se paie en budget publicitaire mal dépensé.
   ========================================================================== */
(function () {
  'use strict';

  /* « DT » est le symbole qu'affiche la boutique ; « TND » est le code
     que veut Meta. Les deux désignent le dinar tunisien. Un code inconnu
     fait rejeter la valeur de l'événement, silencieusement. */
  const ISO = { DT: 'TND', TND: 'TND', AED: 'AED', EUR: 'EUR', USD: 'USD' };

  let pret = false;

  /** Le pixel est-il chargé et prêt à recevoir des événements ? */
  const actif = () => pret && typeof window.fbq === 'function';

  /** Charge le pixel une seule fois. */
  function charger(identifiant) {
    if (pret || !identifiant) return;

    /* Le lanceur officiel de Meta, recopié tel quel : il crée la file
       d'attente fbq() pour que les événements envoyés avant la fin du
       téléchargement ne soient pas perdus. */
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */

    window.fbq('init', String(identifiant));
    pret = true;
  }

  /**
   * Un montant tel que Meta l'attend : en unité principale, deux
   * décimales, point décimal.
   *
   * La boutique stocke des entiers dans la plus petite unité — millimes
   * (3 décimales) en Tunisie, fils (2) aux Émirats. Diviser toujours par
   * mille, comme le ferait un code écrit pour la seule Tunisie, rendrait
   * toute commande émiratie dix fois trop petite.
   */
  function montant(entier, decimales) {
    const d = Number.isFinite(decimales) ? decimales : 3;
    return (Number(entier || 0) / Math.pow(10, d)).toFixed(2);
  }

  /** Envoie un événement si — et seulement si — le pixel est en service. */
  function envoyer(nom, donnees) {
    if (!actif()) return;
    /* SANS second argument quand il n'y a rien à dire.
    
       « fbq('track', 'PageView', {}) » et « fbq('track', 'PageView') » ne
       sont pas tout à fait la même chose pour Meta : le premier envoie une
       charge utile vide, que le gestionnaire d'évènements a rangée du côté
       des évènements personnalisés au lieu des standards. C'est cosmétique
       aujourd'hui, mais le classement « standard » est ce qui permet à
       Meta d'optimiser une campagne sur cet évènement. On envoie donc
       exactement l'appel canonique. */
    if (donnees && Object.keys(donnees).length) window.fbq('track', nom, donnees);
    else window.fbq('track', nom);
  }

  /* -------------------------------------------------------- démarrage */

  window.ATLAS.pret((donnees) => {
    const identifiant = (donnees.reglages && donnees.reglages.pixel_meta) || '';
    if (!identifiant) return;                // rien de réglé : on n'existe pas
    charger(identifiant);

    const m = donnees.marche || {};
    const devise = ISO[m.devise] || m.devise || 'TND';
    const decimales = Number.isFinite(m.decimales) ? m.decimales : 3;

    envoyer('PageView');

    /* Chaque page annonce ce qu'elle est par un événement du document.
       Le pixel écoute ; les pages n'ont pas à savoir qu'il existe, et le
       jour où il est retiré, rien d'autre ne bouge. */
    document.addEventListener('atlas:vu-produit', (e) => {
      const p = e.detail || {};
      envoyer('ViewContent', {
        content_ids: [String(p.id)], content_type: 'product',
        content_name: p.nom, value: montant(p.prix, decimales), currency: devise,
      });
    });

    document.addEventListener('atlas:ajout-panier', (e) => {
      const p = e.detail || {};
      envoyer('AddToCart', {
        content_ids: [String(p.id)], content_type: 'product',
        content_name: p.nom, value: montant(p.prix, decimales), currency: devise,
      });
    });

    document.addEventListener('atlas:commande-commencee', (e) => {
      const c = e.detail || {};
      envoyer('InitiateCheckout', {
        num_items: c.articles || 0,
        value: montant(c.total, decimales), currency: devise,
      });
    });

    /* L'ACHAT : le seul événement qui porte de l'argent, donc le seul
       dont une erreur coûte cher. La devise et les décimales viennent de
       LA COMMANDE, pas du marché affiché au moment où la page s'ouvre :
       un client qui change de pays après avoir commandé verrait sinon sa
       commande comptée dans la mauvaise monnaie. */
    document.addEventListener('atlas:achat', (e) => {
      const c = e.detail || {};
      const dev = ISO[c.devise] || devise;
      const dec = Number.isFinite(c.decimales) ? c.decimales : decimales;
      envoyer('Purchase', {
        value: montant(c.total, dec), currency: dev,
        content_ids: (c.lignes || []).map((l) => String(l.produit_id || l.variante_id || '')),
        content_type: 'product',
        num_items: (c.lignes || []).reduce((n, l) => n + (l.quantite || 0), 0),
      });
    });
  });
})();
