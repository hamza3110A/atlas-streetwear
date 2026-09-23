(function () {
  'use strict';
  const A = window.ATLAS;
  const T = (t) => A.T(t);
  const slug = decodeURIComponent((location.pathname.match(/^\/produit\/([^\/]+)$/) || [])[1] || '');

  let varianteChoisie = null;
  let quantite = 1;

  const $ = (s) => document.querySelector(s);

  A.pret(async (donnees) => {
    let p;
    try {
      p = await A.api('/produit/' + encodeURIComponent(slug));
    } catch (e) {
      $('[data-introuvable]').hidden = false;
      return;
    }

    document.title = p.nom + ' — ' + donnees.reglages.nom_boutique;
    $('[data-fiche]').hidden = false;

    /* La page annonce ce qu'elle montre. Elle ne sait pas qu'un pixel
       écoute, et elle continuera de marcher le jour où il n'y en aura
       plus : c'est un fait publié, pas un appel à un service. */
    document.dispatchEvent(new CustomEvent('atlas:vu-produit', {
      detail: { id: p.id, nom: p.nom, prix: p.prix },
    }));

    // --- visuels -------------------------------------------------------
    const visuels = $('[data-visuels]');
    const listeImages = p.images.length ? p.images : [{ fichier: null, alt: p.nom }];
    visuels.innerHTML = listeImages.map((img, i) => `
      <div class="fiche-visuel">
        <img src="${img.fichier ? '/media/' + A.echapper(img.fichier) : '/img/mark.png'}"
             alt="${A.echapper(img.alt || p.nom)}"
             width="700" height="933" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>
      </div>`).join('');

    // --- identité ------------------------------------------------------
    $('[data-nom]').textContent = p.nom;
    $('[data-reference]').textContent = [p.rayon, p.reference].filter(Boolean).join(' · ');
    if (p.rayon_slug) {
      const lien = $('[data-lien-rayon]');
      lien.href = '/rayon/' + p.rayon_slug;
      lien.textContent = p.rayon;
    }

    const promo = p.prix_barre && p.prix_barre > p.prix;
    $('[data-prix]').innerHTML = `<strong>${A.prix(p.prix)}</strong>` +
      (promo ? `<del>${A.prix(p.prix_barre)}</del><span class="remise">−${Math.round((1 - p.prix / p.prix_barre) * 100)} %</span>` : '');

    // --- tailles -------------------------------------------------------
    // Une taille épuisée reste affichée, barrée et désactivée : elle
    // prouve que la taille existe et qu'elle reviendra au réassort.
    const boiteTailles = $('[data-tailles]');
    p.variantes.forEach((v) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'taille';
      b.textContent = v.taille;
      b.setAttribute('aria-pressed', 'false');
      if (!v.stock) {
        b.disabled = true;
        b.title = T('Épuisé pour le moment');
        b.setAttribute('aria-label', v.taille + ' — épuisé');
      } else {
        b.addEventListener('click', () => {
          varianteChoisie = v;
          boiteTailles.querySelectorAll('.taille').forEach((x) => x.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true');
          $('[data-erreur-taille]').hidden = true;
          if (quantite > v.stock) { quantite = v.stock; $('[data-quantite]').textContent = quantite; }
        });
      }
      boiteTailles.appendChild(b);
    });

    const disponibles = p.variantes.filter((v) => v.stock > 0);
    if (disponibles.length === 1) boiteTailles.querySelector('.taille:not(:disabled)').click();

    const bouton = $('[data-ajouter]');
    if (!disponibles.length) {
      bouton.disabled = true;
      bouton.textContent = T('Épuisé — réassort en cours');
    }

    // --- quantité ------------------------------------------------------
    const majQ = () => { $('[data-quantite]').textContent = quantite; };
    $('[data-moins]').addEventListener('click', () => { quantite = Math.max(1, quantite - 1); majQ(); });
    $('[data-plus]').addEventListener('click', () => {
      const max = varianteChoisie ? Math.min(20, varianteChoisie.stock) : 20;
      if (quantite >= max) {
        A.notice(varianteChoisie ? T('Il ne reste que') + ' ' + varianteChoisie.stock : T('Choisissez d\'abord une taille'));
        return;
      }
      quantite += 1; majQ();
    });

    // --- ajout au panier -----------------------------------------------
    bouton.addEventListener('click', () => {
      if (!varianteChoisie) {
        $('[data-erreur-taille]').hidden = false;
        boiteTailles.querySelector('.taille:not(:disabled)')?.focus();
        return;
      }
      A.ajouterAuPanier(varianteChoisie.id, quantite);
      document.dispatchEvent(new CustomEvent('atlas:ajout-panier', {
        detail: { id: p.id, nom: p.nom, prix: p.prix * quantite, quantite },
      }));
      A.notice(`${p.nom} · ${varianteChoisie.taille} ajouté au panier`);
    });

    // --- contenus ------------------------------------------------------
    $('[data-points]').innerHTML = p.points_forts.map((t) => `<li>${A.echapper(t)}</li>`).join('');
    $('[data-description]').innerHTML = A.echapper(p.description).replace(/\n+/g, '<br>') || T('Aucune description pour le moment.');
    $('[data-matiere]').textContent = p.matiere || T('Détail de la matière à venir.');
    $('[data-livraison]').textContent =
      `Vous réglez au livreur, en main propre. Livraison ${donnees.reglages.delai_livraison}.`;
    $('[data-retours]').innerHTML =
      `Livraison ${A.echapper(donnees.reglages.delai_livraison)} partout en Tunisie. ` +
      `<a class="lien-touche" href="/livraison-et-retours">${T('Conditions de retour')}</a>.`;

    // --- suggestions ---------------------------------------------------
    if (p.suggestions && p.suggestions.length) {
      $('[data-suggestions-bloc]').hidden = false;
      const boite = $('[data-suggestions]');
      p.suggestions.forEach((s) => boite.appendChild(window.carteProduit({
        ...s, images: s.image ? [{ fichier: s.image, alt: s.nom }] : [], tailles: [],
      })));
    }
  });
})();
