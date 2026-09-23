/* Une seule fabrique de carte produit, utilisée par l'accueil, la boutique
   et les suggestions. Un seul endroit à corriger si le rendu change. */
(function () {
  'use strict';
  const E = () => window.ATLAS.echapper;
  const T = (t) => window.ATLAS.T(t);

  /**
   * Rien de cliquable qui ne le soit pas : la carte entière est un lien
   * (.carte-lien couvre la surface). Pas de curseur « main » sur une zone
   * inerte, pas de flèche décorative qui ne mène nulle part.
   */
  window.carteProduit = function carteProduit(p) {
    const ech = E();
    const img1 = p.images && p.images[0] ? '/media/' + p.images[0].fichier : '/img/mark.png';
    const img2 = p.images && p.images[1] ? '/media/' + p.images[1].fichier : null;

    const promo = p.prix_barre && p.prix_barre > p.prix;
    const etiquette = p.epuise
      ? `<span class="etiquette etiquette--sombre">${T('Épuisé')}</span>`
      : promo ? '<span class="etiquette">Promo</span>'
      : p.mis_en_avant ? `<span class="etiquette etiquette--sombre">${T('Sélection')}</span>` : '';

    const tailles = (p.tailles || []).map((t) => (
      `<span class="carte-taille${t.stock > 0 ? '' : ' carte-taille--epuise'}">${ech(t.taille)}</span>`
    )).join('');

    const el = document.createElement('article');
    el.className = 'carte';
    el.innerHTML = `
      ${etiquette}
      <div class="carte-visuel">
        <img class="photo-1" src="${ech(img1)}" alt="${ech(p.nom)}" loading="lazy" width="600" height="800">
        ${img2 ? `<img class="photo-2" src="${ech(img2)}" alt="" aria-hidden="true" loading="lazy" width="600" height="800">` : ''}
      </div>
      <div class="carte-corps">
        ${p.rayon ? `<span class="carte-rayon">${ech(p.rayon)}</span>` : ''}
        <h3 class="carte-nom">${ech(p.nom)}</h3>
        ${tailles ? `<div class="carte-tailles">${tailles}</div>` : ''}
        <p class="carte-prix">
          <strong>${window.ATLAS.prix(p.prix)}</strong>
          ${promo ? `<del>${window.ATLAS.prix(p.prix_barre)}</del>` : ''}
        </p>
      </div>
      <a class="carte-lien" href="/produit/${encodeURIComponent(p.slug)}">
        <span class="saut-contenu">Voir ${ech(p.nom)}</span>
      </a>`;
    return el;
  };
})();
