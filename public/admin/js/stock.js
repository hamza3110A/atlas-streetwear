(function () {
  'use strict';
  const A = window.ADMIN;

  /**
   * Page Stock : une ligne par TAILLE, jamais par produit.
   * Le geste visé : au retour d'un réassort, on descend la liste, on tape
   * la quantité, Entrée, on passe à la ligne suivante. Aucune fiche à
   * ouvrir, aucun bouton « enregistrer » à chercher.
   *
   * Tri par stock croissant : les ruptures remontent d'elles-mêmes en
   * haut de la liste, sans qu'on ait à les chercher.
   */

  let lignes = [];
  let minuteur;
  /* L'entrepôt regardé. Il est demandé EXPLICITEMENT au serveur et
     affiché en gros au-dessus du tableau : corriger le stock de Dubaï en
     croyant corriger celui de Tunis est l'erreur que cette page doit
     rendre impossible. */
  let marche = null;
  let listeMarches = [];
  let recherche = '';

  A.demarrer('stock', async () => {
    await charger();
    document.querySelector('[data-recharger]').addEventListener('click', () => charger(recherche));
    document.querySelector('[data-recherche]').addEventListener('input', (e) => {
      clearTimeout(minuteur);
      recherche = e.target.value;
      minuteur = setTimeout(() => charger(recherche), 220);
    });
    document.addEventListener('change', (e) => {
      const sel = e.target.closest && e.target.closest('[data-marche-stock]');
      if (sel) { marche = sel.value; charger(recherche); }
    });
  });

  /* La copie écrase un inventaire. On demande confirmation en nommant
     les deux entrepôts : « copier » et « écraser » sont le même geste
     vu des deux bouts, et seul le second fait peur au bon moment. */
  async function copierStock(source) {
    const cible = listeMarches.find((x) => x.code === marche);
    const ok = await A.confirmer(
      `Copier ${A.ech(source.nom)} vers ${A.ech(cible.nom)} ?`,
      `Toutes les quantités de l'entrepôt ${cible.nom} seront remplacées par celles de `
      + `${source.nom}. Vous pourrez ensuite les corriger ligne par ligne.`,
      'Copier et écraser'
    );
    if (!ok) return;
    try {
      const r = await A.api('/admin/stock/copier', { method: 'POST', body: { source: source.code, cible: marche } });
      A.toast(`${r.lignes} taille(s) recopiée(s) de ${r.source} vers ${r.cible}.`);
      await charger(recherche);
    } catch (e) { A.toast(e.message, 'erreur'); }
  }

  async function charger(q) {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (marche) p.set('marche', marche);
    const d = await A.api('/admin/stock' + (p.toString() ? '?' + p : ''));
    lignes = d.lignes || [];
    listeMarches = d.marches || [];
    marche = (d.marche && d.marche.code) || marche;
    afficherEntrepot(d.marche);
    afficher();
  }

  /** Le bandeau « vous modifiez l'entrepôt X », avec le sélecteur. */
  function afficherEntrepot(m) {
    const zone = document.querySelector('[data-entrepot]');
    if (!zone) return;
    const ouverts = listeMarches.filter((x) => x.actif || x.code === marche);
    if (ouverts.length < 2) { zone.hidden = true; return; }
    zone.hidden = false;
    zone.innerHTML = `
      <label class="champ champ--entrepot">
        <span>Entrepôt modifié</span>
        <select data-marche-stock>
          ${ouverts.map((x) => `<option value="${A.ech(x.code)}"${x.code === (m && m.code) ? ' selected' : ''}>`
            + `${A.ech(x.nom)}${x.actif ? '' : ' (marché fermé)'}</option>`).join('')}
        </select>
      </label>
      <p class="mono gris">Les quantités saisies ci-dessous ne concernent que cet entrepôt.</p>
      ${ouverts.length > 1 && marche !== ouverts[0].code ? `
        <div class="groupe-boutons">
          <button class="btn btn--petit" type="button" data-copier-stock>
            Copier les quantités depuis ${A.ech(ouverts[0].nom)}
          </button>
        </div>
        <p class="mono gris">Point de départ à ajuster ensuite : la copie écrase les quantités
          de cet entrepôt.</p>` : ''}`;

    const bouton = zone.querySelector('[data-copier-stock]');
    if (bouton) bouton.addEventListener('click', () => copierStock(ouverts[0]));
  }

  function afficher() {
    const corps = document.querySelector('[data-liste]');
    if (!lignes.length) {
      corps.innerHTML = '<tr><td colspan="6" class="vide-admin">Aucune taille ne correspond.</td></tr>';
      return;
    }

    corps.innerHTML = lignes.map((l) => `
      <tr${l.actif ? '' : ' class="gris"'}>
        <td><img class="vignette" src="${l.image ? '/media/' + A.ech(l.image) : '/img/mark-sm-clair.png'}" alt="" loading="lazy"></td>
        <td>
          <strong>${A.ech(l.nom)}</strong>
          ${l.actif ? '' : ' <span class="etiq etiq--annulee">Masqué</span>'}<br>
          <span class="mono gris">${A.ech(l.rayon || '—')}</span>
        </td>
        <td><strong>${A.ech(l.taille)}</strong></td>
        <td><span class="mono gris">${A.ech(l.sku || l.reference || '—')}</span></td>
        <td class="num">
          <span class="stock-pastille ${l.stock === 0 ? 'stock-0' : l.stock <= 3 ? 'stock-bas' : ''}" data-affichage="${l.variante_id}">
            ${l.stock === 0 ? 'ÉPUISÉ' : l.stock}
          </span>
        </td>
        <td class="num">
          <input class="champ-stock" type="number" min="0" inputmode="numeric"
                 value="${l.stock}" data-variante="${l.variante_id}"
                 aria-label="Stock de ${A.ech(l.nom)} taille ${A.ech(l.taille)}">
        </td>
      </tr>`).join('');

    corps.querySelectorAll('[data-variante]').forEach((champ) => {
      // Entrée enregistre et saute à la ligne suivante : la liste se
      // parcourt au clavier, sans souris.
      champ.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        enregistrer(champ).then(() => {
          const tous = [...corps.querySelectorAll('[data-variante]')];
          const suivant = tous[tous.indexOf(champ) + 1];
          if (suivant) { suivant.focus(); suivant.select(); }
        });
      });
      // Sortir du champ enregistre aussi : personne ne devrait perdre une
      // saisie parce qu'il a cliqué ailleurs.
      champ.addEventListener('blur', () => enregistrer(champ));
      champ.addEventListener('focus', () => champ.select());
    });
  }

  async function enregistrer(champ) {
    const id = parseInt(champ.dataset.variante, 10);
    const ligne = lignes.find((l) => l.variante_id === id);
    const valeur = Math.max(0, parseInt(champ.value, 10) || 0);
    if (!ligne || valeur === ligne.stock) return;

    try {
      await A.api('/admin/stock/' + id + (marche ? '?marche=' + encodeURIComponent(marche) : ''),
        { method: 'PUT', body: { stock: valeur } });
      ligne.stock = valeur;
      champ.classList.add('enregistre');
      setTimeout(() => champ.classList.remove('enregistre'), 1200);

      const affichage = document.querySelector(`[data-affichage="${id}"]`);
      if (affichage) {
        affichage.textContent = valeur === 0 ? 'ÉPUISÉ' : valeur;
        affichage.className = 'stock-pastille ' + (valeur === 0 ? 'stock-0' : valeur <= 3 ? 'stock-bas' : '');
      }
      A.toast(`${ligne.nom} · ${ligne.taille} → ${valeur}`);
    } catch (e) {
      champ.value = ligne.stock;
      A.toast(e.message, 'erreur');
    }
  }
})();
