(function () {
  'use strict';
  const A = window.ADMIN;

  let valeurs = {};
  let requis = [];
  let moi = null;          // le compte connecté, pour ne pas s'offrir de se supprimer

  A.demarrer('reglages', async (utilisateur) => {
    moi = utilisateur;
    await charger();

    document.querySelector('[data-ouverte]').addEventListener('change', async (e) => {
      /* OUVRIR sans mentions légales complètes, c'est vendre sans dire qui
         vend. L'article 25 de la loi 2000-83 sur le commerce électronique
         oblige le vendeur à communiquer son identité et son adresse avant
         la conclusion du contrat.
         
         On n'INTERDIT pas : l'interrupteur appartient au commerçant, et
         lui seul sait où il en est de ses démarches. Mais on ne le laisse
         pas ouvrir par inadvertance une boutique dont les pages légales
         affichent « Non renseigné » — le tableau de bord signalait déjà le
         manque, sauf qu'on ne le lit pas au moment où l'on bascule
         l'interrupteur. C'est ici qu'il faut le dire. */
      if (e.target.checked) {
        const manquants = requis.filter((c) => !valeurs[c]);
        if (manquants.length) {
          const ok = await A.confirmer(
            'Ouvrir avec des mentions légales incomplètes ?',
            `${manquants.length} information(s) légale(s) manquante(s) : ${manquants.map(libelleLegal).join(', ')}. `
            + 'Vos pages légales afficheront « Non renseigné » à vos clients. '
            + 'La loi tunisienne sur le commerce électronique (2000-83, article 25) impose de communiquer '
            + 'l\'identité et l\'adresse du vendeur avant toute commande.',
            'Ouvrir quand même'
          );
          if (!ok) { e.target.checked = false; return; }
        }
      }
      try {
        const r = await A.api('/admin/boutique/ouverte', { method: 'PUT', body: { ouverte: e.target.checked } });
        majInterrupteur(r.boutique_ouverte);
        A.toast(r.message);
      } catch (err) {
        e.target.checked = !e.target.checked;
        A.toast(err.message, 'erreur');
      }
    });

    document.querySelector('[data-form]').addEventListener('submit', enregistrer);
    document.querySelector('[data-sauvegarde]').addEventListener('click', sauvegarder);

    /* L'essai d'alerte. Le bouton se désactive pendant l'appel : Telegram
       répond en une seconde ou pas du tout, et deux clics impatients
       enverraient deux messages. */
    const essai = document.querySelector('[data-essai-notification]');
    if (essai) essai.addEventListener('click', async () => {
      essai.disabled = true;
      const texte = essai.textContent;
      essai.textContent = 'Envoi…';
      try {
        const r = await A.api('/admin/notification/essai', { method: 'POST', body: {} });
        A.toast(r.message);
      } catch (e) {
        A.toast(e.message, 'erreur');
      } finally {
        essai.disabled = false;
        essai.textContent = texte;
      }
    });
    document.querySelector('[data-form-mdp]').addEventListener('submit', changerMotDePasse);
    document.querySelector('[data-nouvel-utilisateur]').addEventListener('click', nouvelUtilisateur);

    await Promise.all([chargerUtilisateurs(), chargerSauvegardes()]);
  });

  /* Le commerçant ne connaît pas « legal_matricule_fiscal ». */
  const LIBELLES_LEGAUX = {
    legal_raison_sociale: 'raison sociale',
    legal_forme_juridique: 'forme juridique',
    legal_matricule_fiscal: 'matricule fiscal',
    legal_rc: 'registre de commerce',
    legal_siege: 'siège social',
    legal_directeur: 'directeur de la publication',
    legal_hebergeur: 'hébergeur',
    telephone: 'téléphone',
    email: 'e-mail',
    adresse: 'adresse',
  };
  const libelleLegal = (c) => LIBELLES_LEGAUX[c] || c;

  /* ------------------------------------------------------- pays servis */
  let pays = [];

  /* Les langues proposées. Le code (« fr », « en ») est ce que la base
     retient ; le nom n'est là que pour l'écran. */
  const NOM_LANGUE = { fr: 'Français', en: 'Anglais' };

  async function chargerPays() {
    const zone = document.querySelector('[data-liste-pays]');
    if (!zone) return;
    pays = await A.api('/admin/marches');
    zone.innerHTML = pays.map((m) => {
      const pret = m.produits_tarifes > 0;
      return `
      <article class="carte-pays${m.actif ? '' : ' carte-pays--ferme'}" data-pays-code="${A.ech(m.code)}">
        <div class="carte-pays-entete">
          <div>
            <h3 class="carte-pays-titre">${A.ech(m.nom)}</h3>
            <span class="carte-pays-devise">${A.ech(m.devise)} — ${m.decimales} décimales</span>
          </div>
          <span class="etat-pays ${m.actif ? 'etat-pays--ouvert' : 'etat-pays--ferme'}">
            ${m.actif ? 'Ouvert aux clients' : 'Fermé'}
          </span>
        </div>

        <p class="pays-pret${pret ? '' : ' pays-pret--non'}">
          ${m.produits_tarifes} produit(s) sur ${m.produits_actifs} ont un prix en ${A.ech(m.devise)}
          · ${m.stock_total} pièce(s) en stock
          ${pret ? '' : ' — ce pays ne peut pas être ouvert tant qu\'aucun produit n\'y a de prix.'}
        </p>

        <div class="trio">
          <div class="champ">
            <label>Frais de livraison (${A.ech(m.devise)})</label>
            <input data-pays-champ="frais_livraison" inputmode="decimal"
                   value="${A.depuisMillimes(m.frais_livraison, m.decimales)}">
          </div>
          <div class="champ">
            <label>Livraison offerte dès (${A.ech(m.devise)})</label>
            <input data-pays-champ="livraison_gratuite_des" inputmode="decimal"
                   value="${A.depuisMillimes(m.livraison_gratuite_des, m.decimales)}">
            <span class="aide">0 = jamais offerte</span>
          </div>
          <div class="champ">
            <label>Délai annoncé</label>
            <input data-pays-champ="delai_livraison" value="${A.ech(m.delai_livraison)}">
            ${(m.langue && m.langue !== 'fr') ? `<span class="aide">Ce pays affiche le site
              en ${A.ech(NOM_LANGUE[m.langue] || m.langue)} : écrivez ce délai dans cette
              langue, il s'affiche tel quel.</span>` : ''}
          </div>
        </div>

        <div class="champ">
          <label>Bandeau affiché en bas du site</label>
          <input data-pays-champ="bandeau_texte" maxlength="160" value="${A.ech(m.bandeau_texte || '')}">
          <span class="aide">${m.ordre === 1
            ? 'Vide : le texte général des réglages est utilisé.'
            : 'Vide : <strong>aucun bandeau</strong> dans ce pays. Le texte général annoncerait un seuil en dinars à un client qui paie en ' + A.ech(m.devise) + '.'}</span>
        </div>

        <div class="champ">
          <label>Langue du site dans ce pays</label>
          <select data-pays-champ="langue">
            ${Object.keys(NOM_LANGUE).map((c) => `<option value="${c}"${(m.langue || 'fr') === c ? ' selected' : ''}>${A.ech(NOM_LANGUE[c])}</option>`).join('')}
          </select>
          <span class="aide">Les boutons, le panier, le formulaire de commande et les pages
            légales s'affichent dans cette langue pour les visiteurs de ce pays. Vos textes à
            vous — noms de produits, descriptions, bandeau, délai — s'affichent tels que vous
            les écrivez.</span>
        </div>

        <div class="champ">
          <label>Votre téléphone dans ce pays</label>
          <input data-pays-champ="telephone" maxlength="30" inputmode="tel"
                 value="${A.ech(m.telephone || '')}"
                 placeholder="${m.code === 'tn' ? '50 494 016' : '+971 50 123 4567'}">
          <span class="aide">Affiché dans le pied de page, et utilisé pour le bouton WhatsApp,
            <strong>uniquement pour les visiteurs de ce pays</strong>. Vide : c'est le numéro
            général de la section « Contact et réseaux » qui s'affiche — ce qui fait composer
            un appel international à un client qui n'est pas en ${A.ech(m.nom)}.</span>
        </div>

        <div class="duo">
          <div class="champ">
            <label>Nom du champ d'adresse</label>
            <input data-pays-champ="libelle_region" maxlength="40" value="${A.ech(m.libelle_region || '')}">
            <span class="aide">Le mot affiché au client : « Gouvernorat », « Ville de livraison »…</span>
          </div>
          <div class="champ">
            <label>Zones desservies (une par ligne)</label>
            <textarea data-pays-champ="regions" rows="5">${A.ech((m.regions_liste || []).join('\n'))}</textarea>
            <span class="aide">La liste proposée au client. N'y mettez que les zones où vous livrez
              vraiment : une zone proposée est une commande que vous devrez honorer.</span>
          </div>
        </div>

        <label class="bascule">
          <input type="checkbox" data-pays-actif${m.actif ? ' checked' : ''}>
          <span class="piste"></span>
          <span class="texte">Ouvrir ce pays aux clients</span>
        </label>

        <div class="groupe-boutons">
          <button class="btn btn--petit" type="button" data-pays-enregistrer>Enregistrer ${A.ech(m.nom)}</button>
        </div>
      </article>`;
    }).join('');

    zone.querySelectorAll('[data-pays-enregistrer]').forEach((b) => {
      b.addEventListener('click', () => enregistrerPays(b.closest('[data-pays-code]')));
    });
  }

  async function enregistrerPays(carte) {
    const code = carte.dataset.paysCode;
    const m = pays.find((x) => x.code === code);
    const val = (nom) => carte.querySelector(`[data-pays-champ="${nom}"]`).value;
    const corps = {
      nom: m.nom,
      frais_livraison: A.versMillimes(val('frais_livraison'), m.decimales),
      livraison_gratuite_des: A.versMillimes(val('livraison_gratuite_des'), m.decimales),
      delai_livraison: val('delai_livraison').trim(),
      bandeau_texte: val('bandeau_texte').trim(),
      telephone: val('telephone').trim(),
      langue: val('langue'),
      libelle_region: val('libelle_region').trim() || 'Région',
      regions: val('regions').split('\n').map((x) => x.trim()).filter(Boolean),
      actif: carte.querySelector('[data-pays-actif]').checked ? 1 : 0,
      ordre: m.ordre,
    };
    try {
      await A.api('/admin/marches/' + encodeURIComponent(code), { method: 'PUT', body: corps });
      A.toast(`${m.nom} enregistré.` + (corps.actif && !m.actif
        ? ' Le sélecteur de pays apparaît maintenant sur le site.' : ''));
      await chargerPays();
    } catch (e) {
      /* Le refus d'ouvrir un pays sans prix arrive ici. On remet
         l'interrupteur dans son état réel : le laisser coché après un
         refus ferait croire que c'est passé. */
      A.toast(e.message, 'erreur');
      await chargerPays();
    }
  }

  async function charger() {
    await chargerPays();
    const d = await A.api('/admin/reglages');
    valeurs = d.valeurs;
    requis = d.champs_legaux_requis;

    document.querySelectorAll('[data-cle]').forEach((champ) => {
      const cle = champ.dataset.cle;
      champ.value = champ.hasAttribute('data-argent')
        ? A.depuisMillimes(valeurs[cle])
        : (valeurs[cle] || '');
      marquer(champ);
      champ.addEventListener('input', () => marquer(champ));
    });

    majInterrupteur(valeurs.boutique_ouverte === '1');
  }

  /** Un champ légal obligatoire non renseigné passe en rouge, ici comme
      sur le site. On ne peut pas le laisser passer par distraction. */
  function marquer(champ) {
    const cle = champ.dataset.cle;
    const obligatoire = requis.includes(cle) || champ.hasAttribute('data-requis');
    champ.closest('.champ').classList.toggle('champ--requis-vide', obligatoire && !champ.value.trim());
  }

  function majInterrupteur(ouverte) {
    document.querySelector('[data-ouverte]').checked = ouverte;
    document.querySelector('[data-etat]').textContent = ouverte ? 'La boutique est OUVERTE' : 'La boutique est FERMÉE';
    document.querySelector('[data-explication]').textContent = ouverte
      ? 'Les visiteurs voient le catalogue et peuvent commander.'
      : 'Les visiteurs voient la page d\'attente, servie en 503 pour que les moteurs de recherche ' +
        'reviennent plus tard au lieu d\'indexer la page d\'attente. Aucune commande ne peut être ' +
        'enregistrée. Vous, connecté, continuez à voir le vrai site.';
    document.querySelector('[data-interrupteur]').classList.toggle('stat--alerte', !ouverte);
  }

  async function enregistrer(e) {
    e.preventDefault();
    const bouton = document.querySelector('[data-enregistrer]');
    bouton.disabled = true;

    const corps = {};
    document.querySelectorAll('[data-cle]').forEach((champ) => {
      const cle = champ.dataset.cle;
      corps[cle] = champ.hasAttribute('data-argent')
        ? String(A.versMillimes(champ.value))
        : champ.value.trim();
    });

    try {
      const r = await A.api('/admin/reglages', { method: 'PUT', body: corps });
      valeurs = r.valeurs;

      /* Le serveur peut avoir vidé un champ (« Non assujetti » écrit à la
         place d'un matricule, alors que l'entreprise est déclarée non
         inscrite). On réaffiche donc ce qui est RÉELLEMENT en base, et pas
         ce que le formulaire contenait : un écran qui montre encore une
         valeur effacée ment sur l'état de la boutique. Et on le dit, au
         lieu d'effacer en silence. */
      document.querySelectorAll('[data-cle]').forEach((champ) => {
        const cle = champ.dataset.cle;
        champ.value = champ.hasAttribute('data-argent')
          ? A.depuisMillimes(valeurs[cle])
          : (valeurs[cle] || '');
        marquer(champ);
      });

      const nettoyes = r.nettoyes || [];
      const manquants = requis.filter((c) => !valeurs[c]);
      if (nettoyes.length) {
        A.toast(`Enregistré. ${nettoyes.map(libelleLegal).join(' et ')} : le texte saisi a été retiré — `
          + 'ces champs attendent un numéro officiel, et l\'entreprise est déclarée non inscrite. '
          + 'Les lignes correspondantes n\'apparaissent plus sur le site.');
      } else {
        A.toast(manquants.length
          ? `Enregistré. ${manquants.length} champ(s) légal(aux) encore vide(s).`
          : 'Réglages enregistrés.');
      }
    } catch (err) {
      A.toast(err.message, 'erreur');
    }
    bouton.disabled = false;
  }

  async function sauvegarder() {
    try {
      const r = await A.api('/admin/sauvegarde', { method: 'POST' });
      A.toast(`Sauvegarde créée (${Math.round(r.taille / 1024)} Ko) : ${r.fichier}`);
      await chargerSauvegardes();
    } catch (e) {
      A.toast(e.message, 'erreur');
    }
  }

  async function changerMotDePasse(e) {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      const r = await A.api('/mot-de-passe', {
        method: 'POST',
        body: { actuel: form.actuel.value, nouveau: form.nouveau.value },
      });
      form.reset();
      A.toast(r.message);
    } catch (err) {
      A.toast(err.message, 'erreur');
    }
  }
  /* ------------------------------------------------- comptes d'accès ----
     Ces trois routes existaient côté serveur depuis le premier jour sans
     qu'aucune page ne les appelle. Plutôt que de supprimer du code qui
     marche, on lui donne enfin son écran : le commerçant crée un compte
     pour son employé et le révoque lui-même.

     Le serveur refuse déjà de supprimer son propre compte et de descendre
     sous un administrateur actif. Ce n'est pas au navigateur d'en décider :
     ici on se contente de ne pas proposer un bouton qui sera refusé. */
  async function chargerUtilisateurs() {
    const liste = document.querySelector('[data-utilisateurs]');
    let comptes;
    try {
      comptes = await A.api('/admin/utilisateurs');
    } catch (e) {
      liste.innerHTML = '<li class="gris">Liste indisponible.</li>';
      return;
    }
    const monId = moi ? moi.id : null;
    liste.innerHTML = comptes.map((u) => `
      <li class="ligne-utilisateur">
        <span class="qui">
          <strong>${A.ech(u.nom)}</strong>
          <span>${A.ech(u.email)} — ${A.ech(u.role)}</span>
        </span>
        ${u.id === monId
          ? '<span class="moi pousse-droite">vous</span>'
          : `<button class="btn btn--petit btn--danger pousse-droite" type="button" data-supprimer-utilisateur="${u.id}">Supprimer</button>`}
      </li>`).join('');

    liste.querySelectorAll('[data-supprimer-utilisateur]').forEach((bt) => {
      bt.addEventListener('click', () => supprimerUtilisateur(bt.dataset.supprimerUtilisateur));
    });
  }

  async function nouvelUtilisateur() {
    const r = await A.modale({
      titre: 'Ajouter un compte',
      corps: `
        <div class="champ"><label for="u_nom">Nom</label><input id="u_nom" autocomplete="off"></div>
        <div class="champ"><label for="u_email">E-mail</label><input id="u_email" type="email" autocomplete="off"></div>
        <div class="champ"><label for="u_mdp">Mot de passe</label><input id="u_mdp" type="password" autocomplete="new-password">
          <span class="aide">8 caractères minimum.</span></div>
        <div class="champ"><label for="u_role">Rôle</label>
          <select id="u_role">
            <option value="admin">Administrateur — accès complet</option>
            <option value="preparateur">Préparateur — commandes et stock</option>
          </select></div>`,
      boutons: [
        { texte: 'Créer le compte', classe: 'btn--primaire', valeur: true },
        { texte: 'Annuler', valeur: false },
      ],
    });
    if (r.valeur !== true) return;

    const b = r.boite;
    try {
      await A.api('/admin/utilisateurs', {
        method: 'POST',
        body: {
          nom: b.querySelector('#u_nom').value.trim(),
          email: b.querySelector('#u_email').value.trim(),
          mot_de_passe: b.querySelector('#u_mdp').value,
          role: b.querySelector('#u_role').value,
        },
      });
      A.toast('Compte créé.');
      await chargerUtilisateurs();
    } catch (e) {
      A.toast(e.message, 'erreur');
    }
  }

  async function supprimerUtilisateur(id) {
    const ok = await A.confirmer(
      'Supprimer ce compte',
      'La personne perdra l\'accès immédiatement, y compris sur les appareils déjà connectés. Les commandes qu\'elle a traitées ne bougent pas.',
      'Supprimer'
    );
    if (!ok) return;
    try {
      await A.api('/admin/utilisateurs/' + id, { method: 'DELETE' });
      A.toast('Compte supprimé.');
      await chargerUtilisateurs();
    } catch (e) {
      A.toast(e.message, 'erreur');
    }
  }

  /* ---------------------------------------------------- sauvegardes ---- */
  async function chargerSauvegardes() {
    const liste = document.querySelector('[data-sauvegardes]');
    let fichiers;
    try {
      fichiers = await A.api('/admin/sauvegardes');
    } catch (e) {
      liste.innerHTML = '<li class="gris">Liste indisponible.</li>';
      return;
    }
    if (!fichiers.length) {
      liste.innerHTML = '<li class="gris">Aucune sauvegarde pour l\'instant.</li>';
      return;
    }
    liste.innerHTML = fichiers.slice(0, 10).map((f) => `
      <li>
        <span class="mono">${A.ech(f.fichier)}</span>
        <span class="mono gris pousse-droite">${Math.round(f.taille / 1024)} Ko</span>
      </li>`).join('');
  }

})();
