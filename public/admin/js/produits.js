(function () {
  'use strict';
  const A = window.ADMIN;

  let produits = [];
  let rayons = [];
  let filtre = '';

  const sansAccent = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  A.demarrer('produits', async () => {
    rayons = await A.api('/admin/rayons');
    await charger();

    document.querySelector('[data-nouveau]').addEventListener('click', () => editer(null));
    document.querySelector('[data-recherche]').addEventListener('input', (e) => {
      filtre = sansAccent(e.target.value);
      afficher();
    });
  });

  async function charger() {
    produits = await A.api('/admin/produits');
    afficher();
  }

  /* Un prix et un stock PAR PAYS.
     Dans la colonne des prix, la devise dit déjà de quel pays il s'agit
     (« 55,000 DT », « 150,00 AED ») : y répéter le nom du pays serait du
     bruit. Dans la colonne des stocks, rien ne le dit — donc le nom y
     figure. Les deux colonnes empilent les pays dans le même ordre. */
  const listeMarches = (p) => (p.par_marche && p.par_marche.length ? p.par_marche : []);

  function cellulePrix(p) {
    const ms = listeMarches(p);
    if (!ms.length) return A.prix(p.prix);
    return ms.map((m) => {
      if (m.prix === null || m.prix === undefined) {
        return `<div class="ligne-marche"><span class="gris"
          title="Aucun prix dans ce pays : il ne peut pas être ouvert aux clients.">—</span></div>`;
      }
      /* Le prix barré ne s'affiche que s'il est SUPÉRIEUR au prix de
         vente. Un « 0,00 AED » barré à côté de 129,90 — ce que donnait un
         champ laissé vide et enregistré à zéro — annonce une remise de
         moins l'infini. Et un prix barré égal ou inférieur au prix réel
         est une fausse promotion : la loi la nomme, elle ne s'affiche
         pas ici. */
      const barre = (m.prix_barre > m.prix)
        ? ` <span class="gris petit">${A.prixMarche(m.prix_barre, m)}</span>` : '';
      return `<div class="ligne-marche">${A.prixMarche(m.prix, m)}${barre}</div>`;
    }).join('');
  }

  function celluleStock(p) {
    const ms = listeMarches(p);
    if (!ms.length) return '';
    const seul = ms.length === 1;
    return ms.map((m) => {
      const cls = m.stock === 0 ? 'stock-0' : m.stock <= 5 ? 'stock-bas' : '';
      const nom = seul ? '' : `<span class="mono gris petit">${A.ech(m.nom)}</span> `;
      return `<div class="ligne-marche">${nom}<span class="stock-pastille ${cls}">${m.stock}</span></div>`;
    }).join('');
  }

  function afficher() {
    const liste = produits.filter((p) => !filtre ||
      sansAccent(p.nom).includes(filtre) || sansAccent(p.reference).includes(filtre) ||
      sansAccent(p.rayon).includes(filtre));

    const corps = document.querySelector('[data-liste]');
    if (!liste.length) {
      corps.innerHTML = `<tr><td colspan="7" class="vide-admin">${
        produits.length ? 'Aucun produit ne correspond.' : 'Aucun produit. Créez le premier avec « + Nouveau produit ».'}</td></tr>`;
      return;
    }

    corps.innerHTML = liste.map((p) => `
      <tr>
        <td><img class="vignette" src="${p.image ? '/media/' + A.ech(p.image) : '/img/mark-sm-clair.png'}" alt="" loading="lazy"></td>
        <td>
          <strong>${A.ech(p.nom)}</strong><br>
          <span class="mono gris">${A.ech(p.reference || '—')} · ${p.nb_tailles} taille(s)</span>
        </td>
        <td>${A.ech(p.rayon || '—')}</td>
        <td class="num">${cellulePrix(p)}</td>
        <td class="num">${celluleStock(p)}</td>
        <td>${p.actif
          ? '<span class="etiq etiq--livree">En vente</span>'
          : '<span class="etiq etiq--annulee">Masqué</span>'}</td>
        <td>
          <div class="groupe-boutons">
            <button class="btn btn--petit" type="button" data-editer="${p.id}">Modifier</button>
            <button class="btn btn--petit btn--danger" type="button" data-supprimer="${p.id}">Suppr.</button>
          </div>
        </td>
      </tr>`).join('');

    corps.querySelectorAll('[data-editer]').forEach((b) =>
      b.addEventListener('click', () => editer(parseInt(b.dataset.editer, 10))));
    corps.querySelectorAll('[data-supprimer]').forEach((b) =>
      b.addEventListener('click', () => supprimer(parseInt(b.dataset.supprimer, 10))));
  }

  // ------------------------------------------------------------- édition
  async function editer(id) {
    const p = id ? await A.api('/admin/produits/' + id) : {
      nom: '', slug: '', reference: '', description: '', matiere: '', prix: 0, prix_barre: null,
      categorie_id: null, actif: 1, mis_en_avant: 0, ordre: 0,
      variantes: [{ taille: 'S' }, { taille: 'M' }, { taille: 'L' }],
      images: [], points_forts: [], marches: [],
    };
    /* Sur une création, la liste des pays n'est pas dans la réponse :
       on va la chercher, sinon les champs de prix en dirhams
       n'existeraient que pour les produits déjà enregistrés — et le
       commerçant devrait créer puis rouvrir chaque fiche. */
    if (!id) {
      try {
        p.marches = (await A.api('/admin/marches')).map((m) => ({
          code: m.code, nom: m.nom, devise: m.devise, decimales: m.decimales,
          actif: m.actif, principal: m.ordre === 1, prix: null, prix_barre: null,
        }));
      } catch { p.marches = []; }
    }

    const secondaires = (p.marches || []).filter((m) => !m.principal);
    /* Le pays principal, nommé. Cette fiche saisit SON prix et SON stock ;
       les autres pays ont leur bloc de prix plus bas et leur entrepôt sur
       la page Stock. Sans son nom écrit noir sur blanc, les deux champs
       « Prix » et « Stock » du haut sont des chiffres sans pays — et on
       croit corriger Dubaï en modifiant la Tunisie. */
    const principal = (p.marches || []).find((m) => m.principal)
      || { nom: 'pays principal', devise: 'DT' };
    const blocPrixPays = secondaires.length ? `
      <fieldset class="bloc-pays">
        <legend>Prix dans les autres pays</legend>
        <p class="mono gris">Laissez vide pour ne pas vendre cet article là-bas : il disparaît
          alors du catalogue de ce pays, au lieu de s'y afficher à zéro.</p>
        ${secondaires.map((m) => `
          <div class="duo">
            <div class="champ">
              <label for="m_prix_${m.code}">Prix (${A.ech(m.devise)}) — ${A.ech(m.nom)}</label>
              <input id="m_prix_${m.code}" data-prix-pays="${m.code}" data-dec="${m.decimales}"
                     inputmode="decimal" value="${m.prix == null ? '' : A.depuisMillimes(m.prix, m.decimales)}">
            </div>
            <div class="champ">
              <label for="m_barre_${m.code}">Prix barré (facultatif)</label>
              <input id="m_barre_${m.code}" data-barre-pays="${m.code}" data-dec="${m.decimales}"
                     inputmode="decimal" value="${m.prix_barre == null ? '' : A.depuisMillimes(m.prix_barre, m.decimales)}">
            </div>
          </div>`).join('')}
      </fieldset>` : '';

    const corps = `
      <div class="champ"><label for="m_nom">Nom du produit</label><input id="m_nom" value="${A.ech(p.nom)}"></div>
      <div class="duo">
        <div class="champ"><label for="m_prix">Prix (${A.ech(principal.devise)}) — ${A.ech(principal.nom)}</label>
          <input id="m_prix" inputmode="decimal" value="${A.depuisMillimes(p.prix)}"></div>
        <div class="champ"><label for="m_barre">Prix barré (facultatif)</label>
          <input id="m_barre" inputmode="decimal" value="${p.prix_barre ? A.depuisMillimes(p.prix_barre) : ''}"></div>
      </div>
      ${blocPrixPays}
      <div class="duo">
        <div class="champ"><label for="m_rayon">Rayon</label>
          <select id="m_rayon">
            <option value="">— Aucun —</option>
            ${rayons.map((r) => `<option value="${r.id}"${r.id === p.categorie_id ? ' selected' : ''}>${A.ech(r.nom)}</option>`).join('')}
          </select></div>
        <div class="champ"><label for="m_ref">Référence</label><input id="m_ref" value="${A.ech(p.reference)}"></div>
      </div>
      <div class="champ"><label for="m_desc">Description</label><textarea id="m_desc">${A.ech(p.description)}</textarea></div>
      <div class="champ"><label for="m_matiere">Matière et entretien</label><input id="m_matiere" value="${A.ech(p.matiere)}"></div>
      <div class="champ"><label for="m_points">Points forts (un par ligne)</label>
        <textarea id="m_points">${A.ech((p.points_forts || []).map((x) => x.texte || x).join('\n'))}</textarea></div>

      <h3>Tailles</h3>
      <p class="mono gris">Cette fiche dit quelles tailles existent. Les quantités se saisissent
        sur la page <a href="/admin/stock.html">Stock</a>, entrepôt par entrepôt${
          secondaires.length ? ` (${A.ech(principal.nom)}, ${secondaires.map((m) => A.ech(m.nom)).join(', ')})` : ''}.
        Une taille ajoutée ici démarre à zéro : elle s'affiche « épuisé » jusqu'à ce que vous
        y mettiez une quantité.</p>
      <div data-variantes></div>
      <button class="btn btn--petit" type="button" data-ajouter-variante>+ Ajouter une taille</button>

      ${id ? `
        <h3>Photos</h3>
        <p class="mono gris">Format portrait conseillé (3:4). La deuxième photo s'affiche au survol sur la boutique.</p>
        <div class="galerie" data-galerie></div>
        <div class="depot" data-depot tabindex="0" role="button">
          Déposez vos photos ici, ou touchez pour choisir
          <input type="file" accept="image/*" multiple hidden data-fichiers>
        </div>` : '<p class="mono gris">Les photos s\'ajoutent après l\'enregistrement.</p>'}

      <div class="duo">
        <label class="bascule"><input type="checkbox" id="m_actif"${p.actif ? ' checked' : ''}>
          <span class="piste"></span><span class="texte">En vente sur le site</span></label>
        <label class="bascule"><input type="checkbox" id="m_avant"${p.mis_en_avant ? ' checked' : ''}>
          <span class="piste"></span><span class="texte">Mettre en avant sur l'accueil</span></label>
      </div>`;

    const { boite, valeur } = await new Promise((resolve) => {
      A.modale({
        titre: id ? 'Modifier le produit' : 'Nouveau produit',
        corps,
        boutons: [{ texte: 'Enregistrer', classe: 'btn--primaire', valeur: 'ok' }, { texte: 'Annuler', valeur: null }],
      }).then(resolve);

      // On attend que la modale existe pour brancher ses commandes.
      setTimeout(() => {
        const modale = document.querySelector('.modale');
        if (!modale) return;
        brancherVariantes(modale, p.variantes);
        if (id) brancherPhotos(modale, id, p.images);
      }, 0);
    });

    if (valeur !== 'ok') return;

    const donnees = {
      nom: boite.querySelector('#m_nom').value.trim(),
      prix: A.versMillimes(boite.querySelector('#m_prix').value),
      prix_barre: boite.querySelector('#m_barre').value.trim() ? A.versMillimes(boite.querySelector('#m_barre').value) : null,
      categorie_id: boite.querySelector('#m_rayon').value || null,
      reference: boite.querySelector('#m_ref').value.trim(),
      description: boite.querySelector('#m_desc').value,
      matiere: boite.querySelector('#m_matiere').value.trim(),
      points_forts: boite.querySelector('#m_points').value.split('\n').map((s) => s.trim()).filter(Boolean),
      /* Un champ vide devient null, PAS zéro : c'est ce qui retire
         l'article du catalogue de ce pays au lieu de l'y afficher
         gratuit. */
      prix_marches: [...boite.querySelectorAll('[data-prix-pays]')].reduce((acc, el) => {
        const code = el.dataset.prixPays;
        const dec = parseInt(el.dataset.dec, 10);
        const brut = el.value.trim();
        const barre = boite.querySelector(`[data-barre-pays="${code}"]`);
        acc[code] = {
          prix: brut ? A.versMillimes(brut, dec) : null,
          prix_barre: barre && barre.value.trim() ? A.versMillimes(barre.value, dec) : null,
        };
        return acc;
      }, {}),
      actif: boite.querySelector('#m_actif').checked ? 1 : 0,
      mis_en_avant: boite.querySelector('#m_avant').checked ? 1 : 0,
      variantes: [...boite.querySelectorAll('[data-ligne-variante]')].map((l) => ({
        id: l.dataset.id ? parseInt(l.dataset.id, 10) : undefined,
        taille: l.querySelector('[data-taille]').value.trim(),
        /* Pas de stock ici : c'est la page Stock qui le détient. */
      })).filter((v) => v.taille),
    };

    try {
      if (id) await A.api('/admin/produits/' + id, { method: 'PUT', body: donnees });
      else {
        const r = await A.api('/admin/produits', { method: 'POST', body: donnees });
        A.toast('Produit créé. Ajoutez ses photos, puis ses quantités sur la page Stock.');
        await charger();
        return editer(r.id);
      }
      A.toast('Produit enregistré.');
      await charger();
    } catch (e) {
      A.toast(e.message, 'erreur');
    }
  }

  function brancherVariantes(modale, variantes) {
    const boite = modale.querySelector('[data-variantes]');

    function ligne(v) {
      const el = document.createElement('div');
      el.className = 'ligne-variante';
      el.setAttribute('data-ligne-variante', '');
      if (v.id) el.dataset.id = v.id;
      el.innerHTML = `
        <div class="champ"><label>Taille</label><input data-taille value="${A.ech(v.taille || '')}"></div>
        <button class="icone-bouton" type="button" aria-label="Retirer cette taille">✕</button>`;
      el.querySelector('button').addEventListener('click', () => el.remove());
      return el;
    }

    (variantes || []).forEach((v) => boite.appendChild(ligne(v)));
    modale.querySelector('[data-ajouter-variante]').addEventListener('click', () => {
      boite.appendChild(ligne({ taille: '' }));
      boite.lastElementChild.querySelector('[data-taille]').focus();
    });
  }

  function brancherPhotos(modale, produitId, images) {
    const galerie = modale.querySelector('[data-galerie]');
    const depot = modale.querySelector('[data-depot]');
    const entree = modale.querySelector('[data-fichiers]');

    function dessiner(liste) {
      galerie.innerHTML = liste.map((img) => `
        <div class="galerie-item">
          <img src="/media/${A.ech(img.fichier)}" alt="" loading="lazy">
          <button type="button" data-suppr-image="${img.id}" aria-label="Supprimer cette photo">✕</button>
        </div>`).join('') || '<p class="mono gris">Aucune photo.</p>';
      galerie.querySelectorAll('[data-suppr-image]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!await A.confirmer('Supprimer la photo', 'Cette photo sera définitivement effacée du serveur.', 'Supprimer')) return;
          await A.api('/admin/images/' + b.dataset.supprImage, { method: 'DELETE' });
          const restant = await A.api('/admin/produits/' + produitId);
          dessiner(restant.images);
          charger();
        });
      });
    }
    dessiner(images || []);

    async function envoyer(fichiers) {
      if (!fichiers || !fichiers.length) return;
      const forme = new FormData();
      [...fichiers].forEach((f) => forme.append('images', f));
      depot.textContent = 'Envoi en cours…';
      try {
        await A.api(`/admin/produits/${produitId}/images`, { method: 'POST', body: forme });
        const maj = await A.api('/admin/produits/' + produitId);
        dessiner(maj.images);
        A.toast('Photos ajoutées.');
        charger();
      } catch (e) {
        A.toast(e.message, 'erreur');
      }
      depot.textContent = 'Déposez vos photos ici, ou touchez pour choisir';
      depot.appendChild(entree);
    }

    depot.addEventListener('click', () => entree.click());
    depot.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entree.click(); } });
    entree.addEventListener('change', () => envoyer(entree.files));
    ['dragenter', 'dragover'].forEach((n) => depot.addEventListener(n, (e) => { e.preventDefault(); depot.classList.add('survol'); }));
    ['dragleave', 'drop'].forEach((n) => depot.addEventListener(n, (e) => { e.preventDefault(); depot.classList.remove('survol'); }));
    depot.addEventListener('drop', (e) => envoyer(e.dataTransfer.files));
  }

  async function supprimer(id) {
    const p = produits.find((x) => x.id === id);
    if (!await A.confirmer('Supprimer le produit',
      `« ${p.nom} » et ses photos seront effacés définitivement.`, 'Supprimer')) return;
    try {
      await A.api('/admin/produits/' + id, { method: 'DELETE' });
      A.toast('Produit supprimé.');
      await charger();
    } catch (e) {
      // Le serveur refuse si le produit apparaît dans une commande :
      // on propose alors la seule action juste, le masquer.
      if (e.statut === 409 && e.donnees && e.donnees.suggestion === 'desactiver') {
        const ok = await A.confirmer('Impossible de supprimer', e.message + ' Voulez-vous le masquer ?', 'Masquer le produit');
        if (ok) {
          const complet = await A.api('/admin/produits/' + id);
          await A.api('/admin/produits/' + id, {
            method: 'PUT',
            body: Object.assign({}, complet, {
              actif: 0,
              variantes: complet.variantes,
              points_forts: complet.points_forts.map((x) => x.texte),
            }),
          });
          A.toast('Produit masqué. Il ne s\'affiche plus sur le site.');
          await charger();
        }
        return;
      }
      A.toast(e.message, 'erreur');
    }
  }
})();
