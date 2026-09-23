(function () {
  'use strict';
  const A = window.ADMIN;
  let minuteur;

  A.demarrer('clients', async () => {
    await charger();
    document.querySelector('[data-recherche]').addEventListener('input', (e) => {
      clearTimeout(minuteur);
      minuteur = setTimeout(() => charger(e.target.value), 220);
    });
  });

  async function charger(q) {
    const clients = await A.api('/admin/clients' + (q ? '?q=' + encodeURIComponent(q) : ''));
    const corps = document.querySelector('[data-liste]');
    if (!clients.length) {
      corps.innerHTML = '<tr><td colspan="6" class="vide-admin">Aucun client pour le moment.</td></tr>';
      return;
    }
    corps.innerHTML = clients.map((c) => `
      <tr>
        <td><strong>${A.ech(c.nom)}</strong><br>
            <a class="mono" href="tel:${A.ech(c.telephone)}">${A.ech(c.telephone)}</a></td>
        <td>${A.ech(c.ville || '—')}<br><span class="mono gris">${A.ech(c.gouvernorat || '')}</span></td>
        <td class="num">${c.nb_commandes}</td>
        <td class="num">${A.prix(c.total_achats)}</td>
        <td><span class="mono gris">${A.date(c.derniere_commande)}</span></td>
        <td><div class="groupe-boutons">
          <button class="btn btn--petit" type="button" data-fiche="${c.id}">Fiche</button>
          <button class="btn btn--petit btn--danger" type="button" data-supprimer="${c.id}">Suppr.</button>
        </div></td>
      </tr>`).join('');

    corps.querySelectorAll('[data-fiche]').forEach((b) =>
      b.addEventListener('click', () => fiche(parseInt(b.dataset.fiche, 10))));
    corps.querySelectorAll('[data-supprimer]').forEach((b) =>
      b.addEventListener('click', () => supprimer(parseInt(b.dataset.supprimer, 10), charger)));
  }

  async function fiche(id) {
    const c = await A.api('/admin/clients/' + id);
    const rep = await A.modale({
      titre: c.nom,
      corps: `
        <div class="duo">
          <div class="champ"><label for="m_nom">Nom</label><input id="m_nom" value="${A.ech(c.nom)}"></div>
          <div class="champ"><label for="m_tel">Téléphone</label><input id="m_tel" value="${A.ech(c.telephone)}">
            <span class="aide">C'est l'identifiant du client : deux clients ne peuvent pas avoir le même numéro.</span></div>
        </div>
        <div class="champ"><label for="m_email">E-mail</label><input id="m_email" value="${A.ech(c.email)}"></div>
        <div class="champ"><label for="m_adresse">Adresse</label><input id="m_adresse" value="${A.ech(c.adresse)}"></div>
        <div class="duo">
          <div class="champ"><label for="m_ville">Ville</label><input id="m_ville" value="${A.ech(c.ville)}"></div>
          <div class="champ"><label for="m_gouv">Gouvernorat</label><input id="m_gouv" value="${A.ech(c.gouvernorat)}"></div>
        </div>
        <div class="champ"><label for="m_note">Note interne</label><textarea id="m_note">${A.ech(c.note)}</textarea></div>

        <h3>Historique</h3>
        <div class="table-boite"><table><tbody>
          ${c.commandes.map((o) => `<tr>
            <td><a href="/admin/commandes.html?id=${o.id}">${A.ech(o.reference)}</a></td>
            <td>${A.etiquetteStatut(o.statut)}</td>
            <td class="num">${A.prix(o.total)}</td>
            <td><span class="mono gris">${A.date(o.cree_le)}</span></td>
          </tr>`).join('') || '<tr><td class="gris">Aucune commande.</td></tr>'}
        </tbody></table></div>`,
      boutons: [{ texte: 'Enregistrer', classe: 'btn--primaire', valeur: 'ok' }, { texte: 'Fermer', valeur: null }],
    });
    if (rep.valeur !== 'ok') return;

    try {
      await A.api('/admin/clients/' + id, {
        method: 'PUT',
        body: {
          nom: rep.boite.querySelector('#m_nom').value.trim(),
          telephone: rep.boite.querySelector('#m_tel').value.trim(),
          email: rep.boite.querySelector('#m_email').value.trim(),
          adresse: rep.boite.querySelector('#m_adresse').value.trim(),
          ville: rep.boite.querySelector('#m_ville').value.trim(),
          gouvernorat: rep.boite.querySelector('#m_gouv').value.trim(),
          note: rep.boite.querySelector('#m_note').value,
        },
      });
      A.toast('Fiche client enregistrée.');
      await charger();
    } catch (e) { A.toast(e.message, 'erreur'); }
  }

  async function supprimer(id, recharger) {
    if (!await A.confirmer('Supprimer le client', 'Cette fiche sera effacée définitivement.', 'Supprimer')) return;
    try {
      await A.api('/admin/clients/' + id, { method: 'DELETE' });
      A.toast('Client supprimé.');
      await recharger();
    } catch (e) {
      // Le serveur refuse si le client a des commandes, et dit pourquoi.
      // On relaie le message tel quel : il explique la conséquence.
      await A.modale({
        titre: 'Suppression impossible',
        corps: `<p>${A.ech(e.message)}</p>`,
        boutons: [{ texte: 'J\'ai compris', valeur: null }],
      });
    }
  }
})();
