(function () {
  'use strict';
  const A = window.ATLAS;
  const T = (t) => A.T(t);

  const grille = document.querySelector('[data-grille]');
  const filtres = document.querySelector('[data-filtres]');
  const compte = document.querySelector('[data-compte]');
  const champQ = document.getElementById('q');

  /** Le rayon vient de l'URL : /rayon/hoodies. Pas de code à toucher quand
      le commerçant crée un nouveau rayon — la route existe déjà. */
  const rayonURL = (location.pathname.match(/^\/rayon\/([a-z0-9-]+)$/) || [])[1] || '';
  let rayonActif = rayonURL;
  let recherche = '';
  let minuteur;

  A.pret((donnees) => {
    const rayons = donnees.rayons || [];

    if (rayonActif) {
      const r = rayons.find((x) => x.slug === rayonActif);
      if (r) {
        document.title = r.nom + ' — ' + donnees.reglages.nom_boutique;
        document.querySelector('[data-titre]').textContent = r.nom;
        document.querySelector('[data-fil]').textContent = r.nom;
        if (r.description) document.querySelector('[data-description]').textContent = r.description;
      }
    }

    filtres.innerHTML = '';
    const puces = [{ slug: '', nom: 'Tout' }].concat(rayons);
    puces.forEach((r) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'puce';
      b.textContent = r.nom;
      b.setAttribute('aria-pressed', String(r.slug === rayonActif));
      b.addEventListener('click', () => {
        rayonActif = r.slug;
        filtres.querySelectorAll('.puce').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        history.replaceState(null, '', r.slug ? '/rayon/' + r.slug : '/boutique');
        charger();
      });
      filtres.appendChild(b);
    });

    charger();
  });

  champQ.addEventListener('input', () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => { recherche = champQ.value.trim(); charger(); }, 250);
  });

  async function charger() {
    grille.innerHTML = '<div class="squelette squelette-carte"></div>'.repeat(4);
    compte.textContent = '';
    const params = new URLSearchParams();
    if (rayonActif) params.set('rayon', rayonActif);
    if (recherche) params.set('q', recherche);

    try {
      const produits = await A.api('/produits' + (params.toString() ? '?' + params : ''));
      grille.innerHTML = '';
      if (!produits.length) {
        grille.innerHTML = `<div class="vide"><p>Aucun article ne correspond${recherche ? ' à « ' + A.echapper(recherche) + ' »' : ''}.</p></div>`;
        compte.textContent = '';
        return;
      }
      compte.textContent = produits.length + (produits.length > 1 ? ' articles' : ' article');
      produits.forEach((p) => grille.appendChild(window.carteProduit(p)));
    } catch (e) {
      grille.innerHTML = `<p class="texte-gris">${T('Catalogue momentanément indisponible.')}</p>`;
    }
  }
})();
