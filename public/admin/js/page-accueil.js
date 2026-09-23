(function () {
  'use strict';
  const A = window.ADMIN;

  A.demarrer('accueil', async () => {
    const d = await A.api('/admin/reglages');
    const valeurs = d.valeurs;

    document.querySelectorAll('[data-cle]').forEach((champ) => {
      const cle = champ.dataset.cle;
      if (champ.hasAttribute('data-booleen')) champ.checked = valeurs[cle] === '1';
      else champ.value = valeurs[cle] || '';
      champ.addEventListener('input', apercu);
      champ.addEventListener('change', apercu);
    });
    apercu();

    document.querySelector('[data-form]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const corps = {};
      document.querySelectorAll('[data-cle]').forEach((champ) => {
        corps[champ.dataset.cle] = champ.hasAttribute('data-booleen')
          ? (champ.checked ? '1' : '0')
          : champ.value.trim();
      });
      try {
        await A.api('/admin/reglages', { method: 'PUT', body: corps });
        A.toast('Page d\'accueil enregistrée.');
      } catch (err) { A.toast(err.message, 'erreur'); }
    });

    await chargerMisEnAvant();
  });

  /** Aperçu du titre : on montre la composition réelle — deux lignes,
      la marque au milieu — et on prévient si un mot « en rouge » ne
      figure pas dans son fragment. */
  function apercu() {
    const v = (id) => (document.getElementById(id) || {}).value || '';
    const frag = (n) => {
      const texte = v('hero_ligne' + n);
      const mot = v('hero_accent' + n);
      if (!texte) return '<span class="gris">—</span>';
      const t = A.ech(texte);
      if (!mot) return t;
      const m = A.ech(mot);
      return t.includes(m)
        ? t.replace(m, `<strong class="rouge">${m}</strong>`)
        : `${t} <span class="rouge">(« ${m} » n'est pas dans ce fragment : rien ne sera rouge)</span>`;
    };
    document.querySelector('[data-apercu]').innerHTML =
      '<strong>Aperçu</strong>' +
      `<table class="compacte"><tbody>
         <tr><td>${frag(1)}</td><td class="gris">▲ marque ▲</td><td>${frag(2)}</td></tr>
         <tr><td>${frag(3)}</td><td class="gris">▼ marque ▼</td><td>${frag(4)}</td></tr>
       </tbody></table>` +
      `<span class="mono gris">${A.ech(v('hero_sous_titre'))}</span>`;
  }

  async function chargerMisEnAvant() {
    const produits = await A.api('/admin/produits');
    const boite = document.querySelector('[data-avant]');
    if (!produits.length) {
      boite.innerHTML = '<li class="gris">Aucun produit au catalogue.</li>';
      return;
    }
    boite.innerHTML = produits.map((p) => `
      <li>
        <img class="vignette" src="${p.image ? '/media/' + A.ech(p.image) : '/img/mark-sm-clair.png'}" alt="" loading="lazy">
        <span>${A.ech(p.nom)}<br><span class="mono gris">${A.prix(p.prix)}</span></span>
        <label class="bascule pousse-droite">
          <input type="checkbox" data-avant-produit="${p.id}"${p.mis_en_avant ? ' checked' : ''}>
          <span class="piste"></span>
        </label>
      </li>`).join('');

    boite.querySelectorAll('[data-avant-produit]').forEach((c) => {
      c.addEventListener('change', async () => {
        const id = parseInt(c.dataset.avantProduit, 10);
        try {
          const complet = await A.api('/admin/produits/' + id);
          await A.api('/admin/produits/' + id, {
            method: 'PUT',
            body: Object.assign({}, complet, {
              mis_en_avant: c.checked ? 1 : 0,
              variantes: complet.variantes,
              points_forts: complet.points_forts.map((x) => x.texte),
            }),
          });
          A.toast(c.checked ? 'Mis en avant sur l\'accueil.' : 'Retiré de l\'accueil.');
        } catch (e) {
          c.checked = !c.checked;
          A.toast(e.message, 'erreur');
        }
      });
    });
  }
})();
