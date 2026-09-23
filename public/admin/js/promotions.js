(function () {
  'use strict';
  const A = window.ADMIN;
  let promos = [];

  const TYPES = {
    pourcentage: 'Pourcentage',
    montant: 'Montant fixe',
    livraison: 'Livraison offerte',
  };

  A.demarrer('promotions', async () => {
    await charger();
    document.querySelector('[data-nouveau]').addEventListener('click', () => editer(null));
  });

  async function charger() {
    promos = await A.api('/admin/promotions');
    const corps = document.querySelector('[data-liste]');
    if (!promos.length) {
      corps.innerHTML = '<tr><td colspan="7" class="vide-admin">Aucun code promo.</td></tr>';
      return;
    }
    corps.innerHTML = promos.map((p) => `
      <tr>
        <td><strong class="mono">${A.ech(p.code)}</strong>${p.libelle ? `<br><span class="gris">${A.ech(p.libelle)}</span>` : ''}</td>
        <td>${A.ech(TYPES[p.type] || p.type)}</td>
        <td class="num">${p.type === 'pourcentage' ? p.valeur + ' %' : p.type === 'montant' ? A.prix(p.valeur) : '—'}</td>
        <td class="num">${p.minimum_achat ? A.prix(p.minimum_achat) : '—'}</td>
        <td class="num">${p.usage_actuel}${p.usage_max ? ' / ' + p.usage_max : ''}</td>
        <td>${p.actif ? '<span class="etiq etiq--livree">Actif</span>' : '<span class="etiq etiq--annulee">Inactif</span>'}</td>
        <td><div class="groupe-boutons">
          <button class="btn btn--petit" type="button" data-editer="${p.id}">Modifier</button>
          <button class="btn btn--petit btn--danger" type="button" data-supprimer="${p.id}">Suppr.</button>
        </div></td>
      </tr>`).join('');

    corps.querySelectorAll('[data-editer]').forEach((b) =>
      b.addEventListener('click', () => editer(parseInt(b.dataset.editer, 10))));
    corps.querySelectorAll('[data-supprimer]').forEach((b) =>
      b.addEventListener('click', () => supprimer(parseInt(b.dataset.supprimer, 10))));
  }

  async function editer(id) {
    const p = id ? promos.find((x) => x.id === id) : {
      code: '', libelle: '', type: 'pourcentage', valeur: 10, minimum_achat: 0,
      portee: 'panier', debut_le: '', fin_le: '', usage_max: 0, actif: 1,
    };

    const rep = await A.modale({
      titre: id ? 'Modifier le code' : 'Nouveau code promo',
      corps: `
        <div class="duo">
          <div class="champ"><label for="m_code">Code</label>
            <input id="m_code" value="${A.ech(p.code)}" placeholder="BIENVENUE10">
            <span class="aide">Ce que le client tape dans son panier. Sans espace.</span></div>
          <div class="champ"><label for="m_libelle">Libellé interne</label><input id="m_libelle" value="${A.ech(p.libelle)}"></div>
        </div>
        <div class="duo">
          <div class="champ"><label for="m_type">Type de remise</label>
            <select id="m_type">${Object.entries(TYPES).map(([k, v]) =>
              `<option value="${k}"${k === p.type ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="champ"><label for="m_valeur">Valeur</label>
            <input id="m_valeur" inputmode="decimal" value="${p.type === 'montant' ? A.depuisMillimes(p.valeur) : p.valeur}">
            <span class="aide" data-aide-valeur></span></div>
        </div>
        <div class="duo">
          <div class="champ"><label for="m_min">Minimum d'achat (DT)</label>
            <input id="m_min" inputmode="decimal" value="${A.depuisMillimes(p.minimum_achat)}"></div>
          <div class="champ"><label for="m_usage">Nombre d'utilisations maximum</label>
            <input id="m_usage" type="number" min="0" value="${p.usage_max}">
            <span class="aide">0 = illimité</span></div>
        </div>
        <div class="duo">
          <div class="champ"><label for="m_debut">Début (facultatif)</label>
            <input id="m_debut" type="date" value="${A.ech((p.debut_le || '').slice(0, 10))}"></div>
          <div class="champ"><label for="m_fin">Fin (facultatif)</label>
            <input id="m_fin" type="date" value="${A.ech((p.fin_le || '').slice(0, 10))}"></div>
        </div>
        <label class="bascule"><input type="checkbox" id="m_actif"${p.actif ? ' checked' : ''}>
          <span class="piste"></span><span class="texte">Code actif</span></label>`,
      boutons: [{ texte: 'Enregistrer', classe: 'btn--primaire', valeur: 'ok' }, { texte: 'Annuler', valeur: null }],
    });

    // L'aide sous le champ « valeur » change avec le type choisi.
    // (branchée après l'ouverture, elle a besoin que la modale existe)
    if (rep.valeur !== 'ok') return;

    const type = rep.boite.querySelector('#m_type').value;
    const brut = rep.boite.querySelector('#m_valeur').value;
    const corps = {
      code: rep.boite.querySelector('#m_code').value.trim(),
      libelle: rep.boite.querySelector('#m_libelle').value.trim(),
      type,
      valeur: type === 'montant' ? A.versMillimes(brut) : (parseInt(brut, 10) || 0),
      minimum_achat: A.versMillimes(rep.boite.querySelector('#m_min').value),
      portee: 'panier',
      debut_le: rep.boite.querySelector('#m_debut').value ? rep.boite.querySelector('#m_debut').value + ' 00:00:00' : '',
      fin_le: rep.boite.querySelector('#m_fin').value ? rep.boite.querySelector('#m_fin').value + ' 23:59:59' : '',
      usage_max: parseInt(rep.boite.querySelector('#m_usage').value, 10) || 0,
      actif: rep.boite.querySelector('#m_actif').checked ? 1 : 0,
      cibles: [],
    };

    try {
      if (id) await A.api('/admin/promotions/' + id, { method: 'PUT', body: corps });
      else await A.api('/admin/promotions', { method: 'POST', body: corps });
      A.toast('Code promo enregistré.');
      await charger();
    } catch (e) { A.toast(e.message, 'erreur'); }
  }

  async function supprimer(id) {
    const p = promos.find((x) => x.id === id);
    if (!await A.confirmer('Supprimer le code', `« ${p.code} » ne fonctionnera plus.`, 'Supprimer')) return;
    await A.api('/admin/promotions/' + id, { method: 'DELETE' });
    A.toast('Code supprimé.');
    await charger();
  }
})();
