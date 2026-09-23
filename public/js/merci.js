(function () {
  'use strict';
  const A = window.ATLAS;
  const ref = new URLSearchParams(location.search).get('ref') || '';
  document.querySelector('[data-reference]').textContent = ref || '—';

  A.pret((donnees) => {
    let c = null;
    try { c = JSON.parse(sessionStorage.getItem('atlas_derniere_commande') || 'null'); } catch { c = null; }
    if (!c || c.reference !== ref) return;

    /* L'ACHAT, annoncé une seule fois. Un simple rechargement de la page
       de remerciement renverrait l'événement et gonflerait le chiffre
       d'affaires vu par Meta — d'où le verrou, posé dans la mémoire de
       session à côté de la commande elle-même. */
    let dejaCompte = false;
    try { dejaCompte = sessionStorage.getItem('atlas_achat_compte') === c.reference; } catch { /* ignoré */ }
    if (!dejaCompte) {
      try { sessionStorage.setItem('atlas_achat_compte', c.reference); } catch { /* ignoré */ }
      document.dispatchEvent(new CustomEvent('atlas:achat', { detail: c }));
    }

    document.querySelector('[data-recap]').hidden = false;
    document.querySelector('[data-lignes]').innerHTML = (c.lignes || []).map((l) => `
      <div class="recap-ligne">
        <span>${A.echapper(l.nom)} · ${A.echapper(l.taille)} × ${l.quantite}</span>
        <span>${A.prix(l.total_ligne)}</span>
      </div>`).join('');
    document.querySelector('[data-sous-total]').textContent = A.prix(c.sous_total);
    document.querySelector('[data-livraison]').textContent = c.frais_livraison === 0 ? 'Offerte' : A.prix(c.frais_livraison);
    document.querySelector('[data-total]').textContent = A.prix(c.total);
    if (c.remise > 0) {
      document.querySelector('[data-ligne-remise]').hidden = false;
      document.querySelector('[data-remise]').textContent = '−' + A.prix(c.remise);
    }
    document.querySelector('[data-delai]').textContent = 'Livraison ' + (c.delai || donnees.reglages.delai_livraison) + '.';
  });
})();
