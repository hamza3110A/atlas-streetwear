/* Remplit les pages légales depuis les réglages — une seule source.
   Un champ obligatoire non renseigné s'affiche en rouge, sur le site
   comme dans l'administration : on ne peut pas le laisser passer. */
(function () {
  'use strict';
  const A = window.ATLAS;
  const T = (t) => A.T(t);

  A.pret(async () => {
    let data;
    try { data = await A.api('/legal'); } catch { return; }
    const { valeurs, requis, administre, masquer } = data;

    /* Les lignes que le serveur demande de retirer disparaissent de la
       page. Elles restent comptées comme manquantes côté administration :
       le commerçant ne doit pas les perdre de vue sous prétexte que ses
       clients ne les voient plus. */
    (masquer || []).forEach((cle) => {
      document.querySelectorAll(`[data-ligne="${cle}"]`).forEach((el) => el.remove());
    });

    /* La zone desservie : le pays et le mot qui désigne ses divisions,
       tels que le serveur les donne pour le marché courant. */
    /* Le pluriel porte sur le PREMIER mot, pas sur le dernier :
       « Ville de livraison » donne « villes de livraison », pas
       « ville de livraisons ». Ajouter un « s » à la fin produisait
       « dans les 3 ville de livraisons » sur la page qui engage le
       vendeur. Les mots déjà terminés par s, x ou z ne bougent pas. */
    const pluriel = (mot) => {
      const mots = String(mot || '').trim().split(/\s+/);
      if (!mots[0]) return '';
      if (!/[sxz]$/i.test(mots[0])) mots[0] += 's';
      return mots.join(' ').toLowerCase();
    };

    const zone = document.querySelector('[data-zone-livraison]');
    if (zone && valeurs.pays_livraison) {
      const n = (data.marche && data.marche.regions || []).length;
      const mot = (data.marche && data.marche.libelle_region) || '';
      /* La phrase entière passe par le dictionnaire, pas seulement le
         nom du pays : « dans les 3 villes de livraison » au milieu d'une
         page anglaise se remarque autant que le reste. */
      zone.textContent = T(valeurs.pays_livraison)
        + (n && mot ? `${T(', dans les')} ${n} ${T(pluriel(mot))}` : '');
    }

    /* « offerte à partir de … » ne s'affiche que si un seuil existe.
       À zéro, la phrase annonçait « offerte à partir de 0,00 AED » —
       c'est-à-dire une livraison gratuite qui ne l'est pas. */
    /* Un seul des deux paragraphes « Cookies » reste dans la page. */
    const versionCookies = data.pixel_actif ? 'avec-pixel' : 'sans-pixel';
    document.querySelectorAll('[data-cookies]').forEach((el) => {
      if (el.dataset.cookies === versionCookies) el.hidden = false;
      else el.remove();
    });

    const seuil = document.querySelector('[data-seuil-gratuit]');
    if (seuil && !parseInt(valeurs.livraison_gratuite_des, 10)) seuil.remove();

    document.querySelectorAll('[data-legal]').forEach((el) => {
      const cle = el.dataset.legal;
      const v = valeurs[cle];
      if (v) {
        /* Les montants gardent leur forme ; tout le reste — nom de la
           devise en toutes lettres, mention de TVA, délai — est du texte
           qui doit suivre la langue du pays. */
        el.textContent = (cle === 'frais_livraison' || cle === 'livraison_gratuite_des')
          ? A.prix(v) : T(v);
        el.classList.remove('a-remplir');
      } else {
        /* Un VISITEUR ne doit jamais lire une consigne adressée au
           commerçant. La version précédente imprimait
           « [à renseigner : Administration → Réglages] » sur la page des
           mentions légales, pour tout le monde — le client d'une boutique
           ouverte y aurait lu le mode d'emploi du logiciel au lieu de
           l'identité du vendeur. Le champ reste rouge et manifestement
           vide dans les deux cas : on ne cache rien, on ne s'adresse
           simplement pas à la mauvaise personne. */
        el.textContent = !requis.includes(cle) ? '—'
          : administre ? '[à renseigner : Administration → Réglages]'
          : T('Non renseigné');
        el.classList.add('a-remplir');
      }
    });
  });
})();
