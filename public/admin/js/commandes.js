(function () {
  'use strict';
  const A = window.ADMIN;

  /**
   * Le montant d'une commande, DANS SA PROPRE DEVISE.
   *
   * Chaque commande fige sa devise et son nombre de décimales au moment
   * de l'achat. L'administration les ignorait et formatait tout en
   * dinars sur trois décimales : une commande de 70,00 AED s'affichait
   * « 7,000 DT ». Le nombre en base était juste, l'écran mentait — sur
   * la monnaie ET sur le montant, d'un facteur dix.
   *
   * Les anciennes commandes, passées avant les marchés, n'ont pas ces
   * colonnes : le dinar à trois décimales est alors le bon repli,
   * puisque c'était le seul pays servi.
   */
  const devise = (c) => ({
    devise: (c && c.devise) || 'DT',
    decimales: (c && c.decimales != null) ? c.decimales : 3,
  });
  const montant = (c, v) => A.prixMarche(v, devise(c));

  const STATUTS = ['nouvelle', 'confirmee', 'en_preparation', 'expediee', 'livree', 'annulee'];
  let statutActif = '';
  let recherche = '';
  let minuteur;

  A.demarrer('commandes', async () => {
    const filtres = document.querySelector('[data-filtres]');
    [{ v: '', n: 'Toutes' }].concat(STATUTS.map((s) => ({ v: s, n: A.LIBELLES[s] }))).forEach((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn--petit';
      b.dataset.statut = f.v;
      b.textContent = f.n;
      b.addEventListener('click', () => { statutActif = f.v; charger(); });
      filtres.appendChild(b);
    });

    document.querySelector('[data-recherche]').addEventListener('input', (e) => {
      clearTimeout(minuteur);
      minuteur = setTimeout(() => { recherche = e.target.value.trim(); charger(); }, 220);
    });

    await charger();

    // Ouverture directe depuis le tableau de bord : /admin/commandes.html?id=12
    const id = new URLSearchParams(location.search).get('id');
    if (id) ouvrir(parseInt(id, 10));
  });

  async function charger() {
    const p = new URLSearchParams();
    if (statutActif) p.set('statut', statutActif);
    if (recherche) p.set('q', recherche);
    const d = await A.api('/admin/commandes' + (p.toString() ? '?' + p : ''));

    document.querySelectorAll('[data-statut]').forEach((b) => {
      const v = b.dataset.statut;
      const n = v ? d.compteurs[v] : Object.values(d.compteurs).reduce((a, x) => a + x, 0);
      b.textContent = (v ? A.LIBELLES[v] : 'Toutes') + ' (' + n + ')';
      b.classList.toggle('btn--primaire', v === statutActif);
    });

    const corps = document.querySelector('[data-liste]');
    if (!d.commandes.length) {
      corps.innerHTML = '<tr><td colspan="7" class="vide-admin">Aucune commande à afficher.</td></tr>';
      return;
    }

    corps.innerHTML = d.commandes.map((c) => `
      <tr>
        <td><strong>${A.ech(c.reference)}</strong><br><span class="mono gris">${c.nb_lignes} article(s)</span></td>
        <td>${A.ech(c.nom)}<br><span class="mono gris">${A.ech(c.telephone)}</span></td>
        <td>${A.ech(c.ville)}<br><span class="mono gris">${A.ech(c.gouvernorat)}</span></td>
        <td class="num">${montant(c, c.total)}</td>
        <td>${A.etiquetteStatut(c.statut)}</td>
        <td><span class="mono gris">${A.date(c.cree_le)}</span></td>
        <td><button class="btn btn--petit" type="button" data-ouvrir="${c.id}">Ouvrir</button></td>
      </tr>`).join('');

    corps.querySelectorAll('[data-ouvrir]').forEach((b) =>
      b.addEventListener('click', () => ouvrir(parseInt(b.dataset.ouvrir, 10))));
  }

  async function ouvrir(id) {
    const c = await A.api('/admin/commandes/' + id);

    const lignes = c.lignes.map((l) => `
      <tr>
        <td>${A.ech(l.nom_produit)}<br><span class="mono gris">Taille ${A.ech(l.taille)} · ${A.ech(l.reference || '—')}</span></td>
        <td class="num">${l.quantite} × ${montant(c, l.prix_unitaire)}</td>
        <td class="num"><strong>${montant(c, l.total_ligne)}</strong></td>
      </tr>`).join('');

    const options = [c.statut].concat(c.statuts_possibles)
      .map((s) => `<option value="${s}"${s === c.statut ? ' selected' : ''}>${A.ech(A.LIBELLES[s])}</option>`).join('');

    const corps = `
      <div class="message">
        <strong>${A.ech(c.nom)}</strong> · ${A.ech(c.telephone)}${c.email ? ' · ' + A.ech(c.email) : ''}<br>
        ${A.ech(c.adresse)}<br>${A.ech(c.ville)}, ${A.ech(c.gouvernorat)} ${A.ech(c.code_postal)}
        ${c.marche && c.marche !== 'tn' ? `<br><span class="mono">Livraison ${A.ech(c.pays || c.marche.toUpperCase())} — paiement en ${A.ech(c.devise || '')}</span>` : ''}
        ${c.note_client ? `<br><span class="gris">Note du client : ${A.ech(c.note_client)}</span>` : ''}
        ${c.client && c.client.nb_commandes > 1 ? `<br><span class="mono gris">Client fidèle : ${c.client.nb_commandes} commandes</span>` : ''}
      </div>

      <div class="table-boite"><table><tbody>${lignes}</tbody></table></div>

      <div class="panneau">
        <div class="barre-jour"><span class="gris">Sous-total</span><span></span><span>${montant(c, c.sous_total)}</span></div>
        ${c.remise ? `<div class="barre-jour"><span class="gris">Remise ${A.ech(c.code_promo)}</span><span></span><span>−${montant(c, c.remise)}</span></div>` : ''}
        <div class="barre-jour"><span class="gris">Livraison</span><span></span><span>${c.frais_livraison ? montant(c, c.frais_livraison) : 'Offerte'}</span></div>
        <div class="barre-jour"><strong>À encaisser</strong><span></span><strong>${montant(c, c.total)}</strong></div>
      </div>

      <div class="champ">
        <label for="m_statut">Statut de la commande</label>
        <select id="m_statut">${options}</select>
        <!-- La règle est écrite ICI, sous le menu, en toutes lettres.
             Elle ne se devine pas, et on ne va pas la chercher dans un PDF. -->
        <span class="aide">
          Le stock sort de l'inventaire dès que la commande dépasse « Nouvelle ».
          Il y revient si vous l'annulez ou la ramenez à « Nouvelle ».
          ${c.stock_retire
            ? '<strong class="vert">Le stock de cette commande est actuellement décompté.</strong>'
            : '<strong>Le stock de cette commande n\'est pas encore décompté.</strong>'}
        </span>
      </div>

      <div class="champ">
        <label for="m_note">Note interne (invisible pour le client)</label>
        <textarea id="m_note">${A.ech(c.note_interne)}</textarea>
      </div>`;

    const r = await A.modale({
      titre: 'Commande ' + c.reference,
      corps,
      boutons: [
        { texte: 'Enregistrer', classe: 'btn--primaire', valeur: 'ok' },
        { texte: 'Imprimer le bon', valeur: 'imprimer' },
        { texte: 'Fermer', valeur: null },
      ],
    });

    if (r.valeur === 'imprimer') { imprimer(c); return ouvrir(id); }
    if (r.valeur !== 'ok') return;

    const statut = r.boite.querySelector('#m_statut').value;
    const note = r.boite.querySelector('#m_note').value;

    try {
      if (note !== c.note_interne) {
        await A.api(`/admin/commandes/${id}/note`, { method: 'PUT', body: { note_interne: note } });
      }
      if (statut !== c.statut) {
        const rep = await A.api(`/admin/commandes/${id}/statut`, { method: 'PUT', body: { statut } });
        A.toast(rep.message);
      } else {
        A.toast('Commande enregistrée.');
      }
      await charger();
    } catch (e) {
      A.toast(e.message, 'erreur');
    }
  }

  /** Bon de livraison : une fenêtre d'impression, sans dépendance PDF. */
  function imprimer(c) {
    const f = window.open('', '_blank', 'width=800,height=900');
    if (!f) { A.toast('Autorisez les fenêtres surgissantes pour imprimer.', 'erreur'); return; }
    const lignes = c.lignes.map((l) => `<tr>
      <td>${A.ech(l.nom_produit)} — taille ${A.ech(l.taille)}</td>
      <td style="text-align:right">${l.quantite}</td>
      <td style="text-align:right">${montant(c, l.total_ligne)}</td></tr>`).join('');

    f.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
      <title>Bon ${A.ech(c.reference)}</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; padding: 28px; color: #111; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 18px; }
        td, th { border-bottom: 1px solid #ccc; padding: 8px 4px; font-size: 14px; }
        .total { font-size: 18px; font-weight: bold; margin-top: 18px; text-align: right; }
        .bloc { margin-top: 16px; font-size: 14px; line-height: 1.6; }
      </style></head><body>
      <h1>ATLAS STREETWEAR — bon de livraison</h1>
      <p>${A.ech(c.reference)} · ${A.ech(A.date(c.cree_le))}</p>
      <div class="bloc"><strong>${A.ech(c.nom)}</strong><br>${A.ech(c.telephone)}<br>
        ${A.ech(c.adresse)}<br>${A.ech(c.ville)}, ${A.ech(c.gouvernorat)} ${A.ech(c.code_postal)}
        ${c.note_client ? '<br><em>' + A.ech(c.note_client) + '</em>' : ''}</div>
      <table><tbody>${lignes}</tbody></table>
      <p class="total">À ENCAISSER : ${montant(c, c.total)}</p>
      <p class="bloc">Paiement à la livraison, en espèces.</p>
      </body></html>`);
    f.document.close();
    f.focus();
    setTimeout(() => f.print(), 350);
  }
})();
