(function () {
  'use strict';
  const A = window.ATLAS;
  const T = (t) => A.T(t);
  const $ = (s) => document.querySelector(s);

  let codePromo = '';
  try { codePromo = sessionStorage.getItem('atlas_promo') || ''; } catch { /* ignoré */ }

  A.pret(() => {
    if (codePromo) $('#promo').value = codePromo;
    rafraichir();

    $('[data-form-promo]').addEventListener('submit', (e) => {
      e.preventDefault();
      codePromo = $('#promo').value.trim().toUpperCase();
      try { sessionStorage.setItem('atlas_promo', codePromo); } catch { /* ignoré */ }
      rafraichir();
    });
  });

  /**
   * Chaque affichage repart du serveur : on lui envoie des identifiants,
   * il renvoie des prix. Le panier local ne stocke aucun montant, donc il
   * n'y a rien à falsifier dans le navigateur.
   */
  async function rafraichir() {
    const lignes = A.lirePanier();
    if (!lignes.length) return afficherVide();

    let calc;
    try {
      calc = await A.api('/panier', { method: 'POST', body: { panier: lignes, code_promo: codePromo } });
    } catch (e) {
      A.notice(e.message, 'erreur');
      return;
    }

    // Le serveur a pu retirer un article épuisé : on réaligne le panier
    // local sur ce qu'il a réellement validé.
    const valides = calc.lignes.map((l) => ({ variante_id: l.variante_id, quantite: l.quantite }));
    if (JSON.stringify(valides) !== JSON.stringify(lignes)) A.ecrirePanier(valides);

    /* Deux messages différents, deux titres différents. « Votre panier a
       été mis à jour » pour un code promo refusé était faux : le panier
       n'avait pas bougé, et le client cherchait ce qui avait changé. */
    const boite = $('[data-avertissements]');
    const notes = calc.notes_promo || [];
    if (calc.avertissements.length || notes.length) {
      boite.hidden = false;
      let html = '';
      if (calc.avertissements.length) {
        html += `<strong>${T('Votre panier a été mis à jour')}</strong><ul>` +
          calc.avertissements.map((a) => `<li>${A.echapper(a)}</li>`).join('') + '</ul>';
      }
      if (notes.length) {
        html += `<strong>${T('Code promo')}</strong><ul>` +
          notes.map((a) => `<li>${A.echapper(a)}</li>`).join('') +
          `</ul><p>${T('Votre commande reste possible, au prix affiché.')}</p>`;
      }
      boite.innerHTML = html;
    } else boite.hidden = true;

    if (!calc.lignes.length) return afficherVide();

    $('[data-disposition]').hidden = false;
    $('[data-vide]').hidden = true;

    $('[data-lignes]').innerHTML = calc.lignes.map((l) => `
      <div class="ligne-panier">
        <a class="ligne-panier-visuel" href="/produit/${encodeURIComponent(l.slug)}">
          <img src="${l.image ? '/media/' + A.echapper(l.image) : '/img/mark.png'}" alt="${A.echapper(l.nom)}" width="110" height="147" loading="lazy">
        </a>
        <div class="ligne-panier-corps">
          <h2 class="ligne-panier-nom"><a href="/produit/${encodeURIComponent(l.slug)}">${A.echapper(l.nom)}</a></h2>
          <p class="ligne-panier-meta">Taille ${A.echapper(l.taille)} · ${A.prix(l.prix_unitaire)}</p>
          <div class="ligne-panier-bas">
            <div class="compteur" role="group" aria-label="Quantité pour ${A.echapper(l.nom)}">
              <button type="button" data-q="-1" data-v="${l.variante_id}" aria-label="Diminuer">−</button>
              <output>${l.quantite}</output>
              <button type="button" data-q="1" data-v="${l.variante_id}" aria-label="Augmenter">+</button>
            </div>
            <strong class="mono">${A.prix(l.total_ligne)}</strong>
            <button class="bouton-lien" type="button" data-retirer="${l.variante_id}">${T('Retirer')}</button>
          </div>
        </div>
      </div>`).join('');

    $('[data-lignes]').querySelectorAll('[data-q]').forEach((b) => {
      b.addEventListener('click', () => {
        const vid = parseInt(b.dataset.v, 10);
        const delta = parseInt(b.dataset.q, 10);
        const actuelle = A.lirePanier().find((x) => x.variante_id === vid);
        A.definirQuantite(vid, (actuelle ? actuelle.quantite : 0) + delta);
        rafraichir();
      });
    });
    $('[data-lignes]').querySelectorAll('[data-retirer]').forEach((b) => {
      b.addEventListener('click', () => {
        A.retirerDuPanier(parseInt(b.dataset.retirer, 10));
        A.notice(T('Article retiré'));
        rafraichir();
      });
    });

    $('[data-sous-total]').textContent = A.prix(calc.sous_total);
    $('[data-total]').textContent = A.prix(calc.total);
    $('[data-livraison]').textContent = calc.frais_livraison === 0 ? 'Offerte' : A.prix(calc.frais_livraison);

    const ligneRemise = $('[data-ligne-remise]');
    if (calc.remise > 0) {
      ligneRemise.hidden = false;
      $('[data-libelle-remise]').textContent = 'Remise' + (calc.promotion ? ' · ' + calc.promotion.code : '');
      $('[data-remise]').textContent = '−' + A.prix(calc.remise);
    } else ligneRemise.hidden = true;

    const jauge = $('[data-jauge]');
    if (calc.reste_pour_livraison_offerte > 0) {
      jauge.hidden = false;
      const seuil = calc.sous_total + calc.reste_pour_livraison_offerte;
      $('[data-jauge-barre]').style.setProperty('--valeur', Math.min(100, Math.round(calc.sous_total / seuil * 100)) + '%');
      $('[data-jauge-texte]').textContent = T('Encore') + ' ' + A.prix(calc.reste_pour_livraison_offerte) + ' ' + T('pour la livraison offerte.');
    } else jauge.hidden = true;
  }

  function afficherVide() {
    $('[data-disposition]').hidden = true;
    $('[data-vide]').hidden = false;
  }
})();
