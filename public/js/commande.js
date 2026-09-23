(function () {
  'use strict';
  const A = window.ATLAS;
  const T = (t) => A.T(t);
  const $ = (s) => document.querySelector(s);

  const GOUVERNORATS = [
    'Ariana', 'Béja', 'Ben Arous', 'Bizerte', 'Gabès', 'Gafsa', 'Jendouba', 'Kairouan',
    'Kasserine', 'Kébili', 'Le Kef', 'Mahdia', 'La Manouba', 'Médenine', 'Monastir',
    'Nabeul', 'Sfax', 'Sidi Bouzid', 'Siliana', 'Sousse', 'Tataouine', 'Tozeur',
    'Tunis', 'Zaghouan',
  ];

  let codePromo = '';
  try { codePromo = sessionStorage.getItem('atlas_promo') || ''; } catch { /* ignoré */ }

  A.pret(async (donneesBoutique) => {
    /* La liste des régions VIENT DU PAYS SERVI, plus d'une constante
       écrite dans ce fichier.

       La version précédente proposait les 24 gouvernorats tunisiens à
       tout le monde. Un client de Dubaï trouvait donc un champ
       obligatoire sans une seule réponse valable pour lui : il ne
       pouvait pas terminer sa commande, et rien ne lui disait pourquoi.
       Une vente perdue sans message d'erreur.

       GOUVERNORATS reste en secours, pour le cas — improbable — où le
       serveur ne renverrait pas de liste : mieux vaut la liste
       tunisienne qu'un menu vide. */
    const m = (donneesBoutique && donneesBoutique.marche) || {};
    const liste = (m.regions && m.regions.length) ? m.regions : GOUVERNORATS;

    const select = $('#gouvernorat');
    liste.forEach((g) => {
      const o = document.createElement('option');
      o.value = g; o.textContent = g;
      select.appendChild(o);
    });

    /* Et le MOT qui désigne la division : « Gouvernorat » en Tunisie,
       « Émirat » aux Émirats. Demander son gouvernorat à quelqu'un qui
       habite Charjah, c'est lui dire qu'on ne livre pas vraiment chez
       lui. */
    if (m.libelle_region) {
      const lab = document.querySelector('label[for="gouvernorat"]');
      if (lab) lab.textContent = T(m.libelle_region) + ' *';
    }

    /* LES EXEMPLES GRIS viennent du pays, eux aussi.
    
       Ils étaient écrits en dur dans la page : « La Marsa », « 2078 »,
       « 20 123 456 », « vous@exemple.tn ». Un client de Dubaï lisait donc
       une ville tunisienne, un code postal tunisien et un numéro à huit
       chiffres — c'est-à-dire la mauvaise forme, montrée par l'exemple
       censé montrer la bonne. */
    const ex = m.exemples || {};
    const poser = (sel, valeur) => {
      if (valeur == null) return;
      const el = document.querySelector(sel);
      /* Les exemples viennent de la base, donc en français. Sur un
         pays anglophone, ils passent par le dictionnaire comme le
         reste : un formulaire anglais avec des exemples français
         donne l'impression d'une traduction faite à moitié. */
      if (el) el.placeholder = T(valeur);
    };
    poser('#nom', ex.nom);
    poser('#email', ex.email);
    poser('#telephone', ex.telephone);
    poser('#adresse', ex.adresse);
    poser('#ville', ex.ville);
    poser('#code_postal', ex.code_postal);

    if (ex.telephone_aide) {
      const aide = document.querySelector('#telephone ~ .champ-aide');
      if (aide) aide.textContent = T(ex.telephone_aide);
    }
    if (ex.ville_libelle) {
      const lab = document.querySelector('label[for="ville"]');
      if (lab) lab.textContent = T(ex.ville_libelle) + ' *';
    }

    /* Les Émirats n'utilisent pas de code postal. Le champ DISPARAÎT
       plutôt que de rester là, vide et sans exemple : un champ qu'on ne
       sait pas remplir fait hésiter, même facultatif. */
    if (ex.code_postal_visible === false) {
      const champ = document.querySelector('#code_postal');
      if (champ && champ.closest('.champ')) champ.closest('.champ').remove();
    }

    // Pré-remplissage à partir de la dernière commande passée sur cet
    // appareil : personne n'a envie de retaper son adresse.
    try {
      const memoire = JSON.parse(localStorage.getItem('atlas_coordonnees') || '{}');
      for (const [k, v] of Object.entries(memoire)) {
        const champ = document.querySelector(`[name="${k}"]`);
        if (champ && !champ.value) champ.value = v;
      }
    } catch { /* ignoré */ }

    await rafraichir();
    $('[data-form]').addEventListener('submit', envoyer);
  });

  let debutAnnonce = false;

  async function rafraichir() {
    const lignes = A.lirePanier();
    if (!lignes.length) { $('[data-vide]').hidden = false; return; }

    const calc = await A.api('/panier', { method: 'POST', body: { panier: lignes, code_promo: codePromo } });
    if (!calc.lignes.length) { $('[data-vide]').hidden = false; return; }

    $('[data-disposition]').hidden = false;

    /* UNE SEULE FOIS PAR VISITE. Cette fonction est rappelée à chaque
       essai de code promo : sans le verrou, Meta compterait trois
       « débuts de commande » pour un seul client, et le taux de
       transformation du gestionnaire de publicités serait divisé par
       trois — sur un chiffre qu'on ne peut recouper nulle part. */
    if (!debutAnnonce) {
      debutAnnonce = true;
      document.dispatchEvent(new CustomEvent('atlas:commande-commencee', {
        detail: { total: calc.total, articles: calc.lignes.reduce((n, l) => n + l.quantite, 0) },
      }));
    }

    $('[data-articles]').innerHTML = calc.lignes.map((l) => `
      <div class="recap-ligne">
        <span>${A.echapper(l.nom)} · ${A.echapper(l.taille)} × ${l.quantite}</span>
        <span>${A.prix(l.total_ligne)}</span>
      </div>`).join('');

    $('[data-sous-total]').textContent = A.prix(calc.sous_total);
    $('[data-livraison]').textContent = calc.frais_livraison === 0 ? 'Offerte' : A.prix(calc.frais_livraison);
    $('[data-total]').textContent = A.prix(calc.total);

    const lr = $('[data-ligne-remise]');
    if (calc.remise > 0) {
      lr.hidden = false;
      $('[data-libelle-remise]').textContent = 'Remise' + (calc.promotion ? ' · ' + calc.promotion.code : '');
      $('[data-remise]').textContent = '−' + A.prix(calc.remise);
    } else lr.hidden = true;

    if (calc.avertissements.length) alerte(calc.avertissements.join(' '), 'erreur');
    else if ((calc.notes_promo || []).length) alerte(calc.notes_promo.join(' ') + ' ' + T('Le total affiché est celui que vous paierez.'), 'info');
    return calc;
  }

  function alerte(message, type) {
    const el = $('[data-alerte]');
    el.hidden = false;
    el.className = 'alerte' + (type === 'ok' ? ' alerte--ok' : type === 'info' ? ' alerte--info' : '');
    el.innerHTML = `<strong>${A.echapper(message)}</strong>`;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function envoyer(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const bouton = $('[data-valider]');

    const donnees = Object.fromEntries(new FormData(form).entries());
    const manquants = ['nom', 'telephone', 'adresse', 'ville', 'gouvernorat'].filter((c) => !String(donnees[c] || '').trim());
    if (manquants.length) {
      alerte(T('Complétez les champs obligatoires.'), 'erreur');
      form.querySelector(`[name="${manquants[0]}"]`).focus();
      return;
    }

    bouton.disabled = true;
    bouton.textContent = T('Envoi en cours…');

    try {
      // On envoie le panier (identifiants + quantités) et les coordonnées.
      // Aucun montant : le serveur les recalcule et fait foi.
      const reponse = await A.api('/commande', {
        method: 'POST',
        body: Object.assign({}, donnees, { panier: A.lirePanier(), code_promo: codePromo }),
      });

      try {
        localStorage.setItem('atlas_coordonnees', JSON.stringify({
          nom: donnees.nom, telephone: donnees.telephone, email: donnees.email,
          adresse: donnees.adresse, ville: donnees.ville,
          gouvernorat: donnees.gouvernorat, code_postal: donnees.code_postal,
        }));
        sessionStorage.setItem('atlas_derniere_commande', JSON.stringify(reponse));
        sessionStorage.removeItem('atlas_promo');
      } catch { /* ignoré */ }

      A.viderPanier();
      location.href = '/merci?ref=' + encodeURIComponent(reponse.reference);
    } catch (err) {
      bouton.disabled = false;
      bouton.textContent = T('Valider ma commande');

      if (err.statut === 409 && err.donnees && err.donnees.avertissements) {
        alerte(err.message + ' ' + err.donnees.avertissements.join(' '), 'erreur');
        await rafraichir();
        return;
      }
      if (err.statut === 503) { alerte(T('La boutique est momentanément fermée. Réessayez plus tard.'), 'erreur'); return; }
      if (err.statut === 429) { alerte(err.message, 'erreur'); return; }

      alerte(err.message, 'erreur');
      if (err.donnees && err.donnees.champ) {
        const champ = form.querySelector(`[name="${err.donnees.champ}"]`);
        if (champ) champ.focus();
      }
    }
  }
})();
