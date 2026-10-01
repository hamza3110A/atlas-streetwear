(function () {
  'use strict';
  const A = window.ADMIN;

  A.demarrer('index', async (utilisateur) => {
    const d = await A.api('/admin/tableau-de-bord');
    const heure = new Date().getHours();
    document.querySelector('[data-bonjour]').textContent =
      (heure < 12 ? 'Bonjour ' : heure < 18 ? 'Bon après-midi ' : 'Bonsoir ') + utilisateur.nom + '.';

    if (!d.stats.boutique_ouverte) {
      const el = document.querySelector('[data-fermee]');
      el.hidden = false;
      el.innerHTML = '<strong>La boutique est fermée.</strong> Les visiteurs voient la page d\'attente et ' +
        'aucune commande ne peut être passée. <a href="/admin/reglages.html">Rouvrir dans les réglages</a>.';
    }

    if (d.champs_legaux_manquants.length) {
      const el = document.querySelector('[data-legal]');
      el.hidden = false;
      el.innerHTML = `<strong>${d.champs_legaux_manquants.length} information(s) légale(s) manquante(s).</strong> ` +
        'Les pages légales du site les affichent en rouge tant qu\'elles ne sont pas renseignées. ' +
        '<a href="/admin/reglages.html">Compléter</a>.';
    }

    const s = d.stats;
    const ouverts = d.par_marche || [];
    const principal = ouverts[0] || { devise: 'DT', decimales: 3, nom: '' };

    /**
     * UNE TUILE D'ARGENT AFFICHE TOUTES LES MONNAIES, empilées.
     *
     * Elle n'en affichait qu'une — celle du marché principal — avec le
     * pays entre parenthèses. Exact, et inutile : un jour où la seule
     * vente était émiratie, « Encaissé aujourd'hui (Tunisie) : 0,000 DT »
     * répondait « zéro » à quelqu'un qui venait de vendre. La bonne
     * réponse tient en deux lignes.
     *
     * On n'additionne toujours pas : sans taux de change, la somme d'un
     * dinar et d'un dirham est un nombre qui ne veut rien dire. On les
     * met l'un sous l'autre, ce qui est la seule façon honnête de
     * répondre « combien ai-je encaissé ? » quand on encaisse dans deux
     * monnaies.
     *
     * Les monnaies à zéro sont masquées quand une autre a un montant :
     * sinon la moitié de la tuile dit « rien », ce qui n'apprend rien.
     * Si tout est à zéro, on affiche la monnaie principale — une tuile
     * vide serait pire.
     */
    /* Le repli, quand le détail par pays ne porte pas cette valeur. */
    const GLOBAL = { jour: 'chiffre_jour', trente_jours: 'chiffre_30j', panier: 'panier_moyen' };

    const argent = (cle) => {
      const seul = () => A.ech(A.prixMarche(s[GLOBAL[cle]], principal));
      if (ouverts.length < 2) return seul();

      /* SI AUCUN PAYS NE PORTE CETTE VALEUR, on retombe sur le chiffre
         global plutôt que d'afficher zéro.

         Le cas s'est produit : les scripts de l'administration ne sont
         jamais mis en cache, donc le nouvel affichage arrive dès le
         rechargement de la page — mais le calcul par pays vit côté
         serveur, que Node ne relit qu'au démarrage. Front à jour, API en
         retard : « m.panier » n'existait pas, « undefined > 0 » est faux,
         et la tuile affichait « 0,000 DT » sur une boutique qui venait de
         vendre. Un écran qui montre zéro parce qu'une donnée MANQUE est
         pire qu'un écran qui ne montre rien : il ment avec aplomb. */
      const porte = ouverts.some((m) => m[cle] !== undefined && m[cle] !== null);
      if (!porte) return seul();

      const avec = ouverts.filter((m) => m[cle] > 0);
      const liste = avec.length ? avec : [principal];
      return liste.map((m, i) => `<span class="valeur-monnaie${i ? ' valeur-monnaie--suite' : ''}"
        title="${A.ech(m.nom || '')}">${A.ech(A.prixMarche(m[cle] || 0, m))}</span>`).join('');
    };

    document.querySelector('[data-stats]').innerHTML = [
      { v: A.ech(s.commandes_nouvelles), l: 'Commandes à traiter', alerte: s.commandes_nouvelles > 0 },
      { v: A.ech(s.commandes_jour), l: 'Commandes aujourd\'hui' },
      { v: argent('jour'), l: 'Encaissé aujourd\'hui' },
      { v: argent('trente_jours'), l: '30 derniers jours' },
      { v: argent('panier'), l: 'Panier moyen' },
      { v: A.ech(s.commandes_a_preparer), l: 'À préparer' },
      { v: A.ech(s.produits_actifs), l: 'Produits en vente' },
      { v: A.ech(s.clients), l: 'Clients' },
    ].map((x) => `
      <div class="stat${x.alerte ? ' stat--alerte' : ''}">
        <div class="valeur">${x.v}</div>
        <div class="libelle">${A.ech(x.l)}</div>
      </div>`).join('');

    const corps = document.querySelector('[data-dernieres] tbody');
    corps.innerHTML = d.dernieres.length ? d.dernieres.map((c) => `
      <tr>
        <td><a href="/admin/commandes.html?id=${c.id}"><strong>${A.ech(c.reference)}</strong></a><br>
            <span class="mono gris">${A.ech(c.nom)}</span></td>
        <td>${A.etiquetteStatut(c.statut)}</td>
        <td class="num">${A.prixMarche(c.total, { devise: c.devise || 'DT', decimales: c.decimales == null ? 3 : c.decimales })}</td>
      </tr>`).join('') : '<tr><td class="gris">Aucune commande pour le moment.</td></tr>';

    /* Le détail par pays, chacun dans sa monnaie. Il n'apparaît qu'à
       partir de deux marchés ouverts : sur une boutique tunisienne
       seule, ce serait répéter la ligne du dessus. */
    const zoneMarches = document.querySelector('[data-par-marche]');
    if (zoneMarches) {
      if (ouverts.length > 1) {
        zoneMarches.hidden = false;
        zoneMarches.innerHTML = `
          <h2>Par pays</h2>
          <ul class="liste-simple">
            ${ouverts.map((m) => `
              <li>
                <span><strong>${A.ech(m.nom)}</strong>
                  <span class="gris">· ${m.commandes} commande(s)</span></span>
                <span class="pousse-droite mono">
                  ${A.prixMarche(m.jour, m)} aujourd'hui · ${A.prixMarche(m.trente_jours, m)} sur 30 jours
                </span>
              </li>`).join('')}
          </ul>`;
      } else {
        zoneMarches.hidden = true;
      }
    }

    const ruptures = document.querySelector('[data-ruptures]');
    ruptures.innerHTML = d.ruptures.length ? d.ruptures.map((r) => `
      <li>
        <span>${A.ech(r.nom)} <span class="gris">· ${A.ech(r.taille)}</span></span>
        <span class="stock-pastille pousse-droite ${r.stock === 0 ? 'stock-0' : 'stock-bas'}">
          ${r.stock === 0 ? 'épuisé' : r.stock + ' restant' + (r.stock > 1 ? 's' : '')}
        </span>
      </li>`).join('') : '<li class="gris">Aucun stock faible. Tout va bien.</li>';

    const ventes = document.querySelector('[data-ventes]');
    const max = Math.max(1, ...d.ventes.map((v) => v.t));
    if (!d.ventes.length) {
      ventes.innerHTML = '<p class="gris">Pas encore de ventes à afficher.</p>';
    } else {
      ventes.innerHTML = d.ventes.map((v) => `
        <div class="barre-jour">
          <span class="gris">${A.ech(v.jour.slice(5))}</span>
          <span class="barre-piste"><span data-largeur="${Math.round(v.t / max * 100)}"></span></span>
          <span>${A.prix(v.t)}</span>
        </div>`).join('');
      // La largeur passe par une variable CSS, jamais par un style inline.
      ventes.querySelectorAll('[data-largeur]').forEach((el) => {
        el.style.setProperty('--valeur', el.dataset.largeur + '%');
      });
    }
  });
})();
