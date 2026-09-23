(function () {
  'use strict';
  const A = window.ADMIN;
  let rayons = [];

  A.demarrer('rayons', async () => {
    await charger();
    document.querySelector('[data-nouveau]').addEventListener('click', () => editer(null));
  });

  async function charger() {
    rayons = await A.api('/admin/rayons');
    const corps = document.querySelector('[data-liste]');
    if (!rayons.length) {
      corps.innerHTML = '<tr><td colspan="5" class="vide-admin">Aucun rayon. Créez « Tee-shirts », « Hoodies »… ils apparaîtront dans le menu du site.</td></tr>';
      return;
    }
    corps.innerHTML = rayons.map((r) => `
      <tr>
        <td><strong>${A.ech(r.nom)}</strong>${r.description ? `<br><span class="mono gris">${A.ech(r.description)}</span>` : ''}</td>
        <td><a class="mono" href="/rayon/${A.ech(r.slug)}" target="_blank" rel="noopener">/rayon/${A.ech(r.slug)} ↗</a></td>
        <td class="num">${r.nb_produits}</td>
        <td>${r.visible ? '<span class="etiq etiq--livree">Visible</span>' : '<span class="etiq etiq--annulee">Masqué</span>'}</td>
        <td><div class="groupe-boutons">
          <button class="btn btn--petit" type="button" data-editer="${r.id}">Modifier</button>
          <button class="btn btn--petit btn--danger" type="button" data-supprimer="${r.id}">Suppr.</button>
        </div></td>
      </tr>`).join('');

    corps.querySelectorAll('[data-editer]').forEach((b) =>
      b.addEventListener('click', () => editer(parseInt(b.dataset.editer, 10))));
    corps.querySelectorAll('[data-supprimer]').forEach((b) =>
      b.addEventListener('click', () => supprimer(parseInt(b.dataset.supprimer, 10))));
  }

  async function editer(id) {
    const r = id ? rayons.find((x) => x.id === id) : { nom: '', description: '', ordre: rayons.length + 1, visible: 1 };
    const rep = await A.modale({
      titre: id ? 'Modifier le rayon' : 'Nouveau rayon',
      corps: `
        <div class="champ"><label for="m_nom">Nom du rayon</label>
          <input id="m_nom" value="${A.ech(r.nom)}" placeholder="Hoodies">
          <span class="aide">C'est ce mot qui apparaîtra dans le menu du site.</span></div>
        <div class="champ"><label for="m_desc">Description (affichée en tête du rayon)</label>
          <input id="m_desc" value="${A.ech(r.description)}"></div>
        <div class="champ"><label for="m_ordre">Position dans le menu</label>
          <input id="m_ordre" type="number" value="${r.ordre}" inputmode="numeric"></div>
        <label class="bascule"><input type="checkbox" id="m_visible"${r.visible ? ' checked' : ''}>
          <span class="piste"></span><span class="texte">Visible sur le site</span></label>`,
      boutons: [{ texte: 'Enregistrer', classe: 'btn--primaire', valeur: 'ok' }, { texte: 'Annuler', valeur: null }],
    });
    if (rep.valeur !== 'ok') return;

    const corps = {
      nom: rep.boite.querySelector('#m_nom').value.trim(),
      description: rep.boite.querySelector('#m_desc').value.trim(),
      ordre: parseInt(rep.boite.querySelector('#m_ordre').value, 10) || 0,
      visible: rep.boite.querySelector('#m_visible').checked ? 1 : 0,
    };
    try {
      if (id) await A.api('/admin/rayons/' + id, { method: 'PUT', body: corps });
      else await A.api('/admin/rayons', { method: 'POST', body: corps });
      A.toast('Rayon enregistré. Il est déjà dans le menu du site.');
      await charger();
    } catch (e) { A.toast(e.message, 'erreur'); }
  }

  async function supprimer(id) {
    const r = rayons.find((x) => x.id === id);
    if (!await A.confirmer('Supprimer le rayon', `« ${r.nom} » disparaîtra du menu du site.`, 'Supprimer')) return;
    try {
      await A.api('/admin/rayons/' + id, { method: 'DELETE' });
      A.toast('Rayon supprimé.');
      await charger();
    } catch (e) { A.toast(e.message, 'erreur'); }
  }
})();
