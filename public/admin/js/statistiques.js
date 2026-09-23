(function () {
  'use strict';
  const A = window.ADMIN;
  const $ = (s) => document.querySelector(s);

  let jours = 30;

  A.demarrer('statistiques', async () => {
    document.querySelectorAll('[data-periode]').forEach((b) => {
      b.addEventListener('click', () => {
        jours = parseInt(b.dataset.periode, 10);
        document.querySelectorAll('[data-periode]').forEach((x) => x.classList.toggle('btn--primaire', x === b));
        charger();
      });
    });
    await charger();
  });

  async function charger() {
    let d;
    try {
      d = await A.api('/admin/statistiques?jours=' + jours);
    } catch (e) {
      const m = $('[data-message]');
      m.hidden = false;
      m.className = 'message message--erreur';
      m.textContent = e.message;
      return;
    }

    $('[data-visiteurs]').textContent = nombre(d.resume.visiteurs);
    $('[data-visites]').textContent = nombre(d.resume.visites);
    $('[data-commandes]').textContent = nombre(d.resume.commandes);
    $('[data-conversion]').textContent = d.resume.conversion.toString().replace('.', ',') + ' %';

    dessiner(d.serie);
    remplirSources(d.sources);
    remplirAppareils(d.appareils);
    remplirProduits(d.produits);
    remplirPages(d.pages);

    const m = $('[data-message]');
    if (d.resume.visites === 0) {
      m.hidden = false;
      m.className = 'message';
      m.innerHTML = '<strong>Aucune visite enregistrée sur cette période.</strong> '
        + 'C\'est normal tant que le site n\'est pas en ligne : le comptage démarre au premier visiteur réel. '
        + 'Vos propres passages en tant qu\'administrateur connecté ne sont jamais comptés.';
    } else m.hidden = true;
  }

  const nombre = (n) => (n || 0).toLocaleString('fr-FR');

  /* --------------------------------------------------------- graphique
     Dessiné en SVG à la main. Deux séries sur le même dessin : les barres
     sont les visiteurs, la ligne fine est le nombre de commandes, mise à
     l'échelle séparément — sinon, avec 400 visiteurs et 3 commandes, la
     ligne des commandes serait collée à l'axe et ne dirait rien. Le fait
     que les deux échelles diffèrent est écrit sous le graphique : un
     graphique à deux échelles qui ne le dit pas est un graphique qui ment. */
  function dessiner(serie) {
    const boite = $('[data-graphe]');
    const maxV = Math.max(1, ...serie.map((x) => x.visiteurs));
    const maxC = Math.max(1, ...serie.map((x) => x.commandes));
    const L = 1000, H = 220, bas = 28, haut = 10;
    const pas = L / serie.length;
    const largeur = Math.max(2, pas * 0.62);

    const barres = serie.map((x, i) => {
      const h = (H - bas - haut) * (x.visiteurs / maxV);
      const px = i * pas + (pas - largeur) / 2;
      return `<rect x="${px.toFixed(1)}" y="${(H - bas - h).toFixed(1)}" width="${largeur.toFixed(1)}" height="${h.toFixed(1)}" rx="2">
        <title>${x.jour} — ${x.visiteurs} visiteur(s), ${x.visites} page(s) vue(s), ${x.commandes} commande(s)</title>
      </rect>`;
    }).join('');

    /* Pas de ligne des commandes s'il n'y en a aucune : un trait rouge posé
       sur l'axe des abscisses ressemble à l'axe lui-même et laisse croire
       à une donnée là où il n'y en a pas. */
    const totalCmd = serie.reduce((t, x) => t + x.commandes, 0);
    const points = totalCmd === 0 ? '' : serie.map((x, i) => {
      const px = i * pas + pas / 2;
      const py = H - bas - (H - bas - haut) * (x.commandes / maxC);
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    }).join(' ');

    /* Une étiquette tous les n jours. La dernière date est forcée — on veut
       toujours savoir où s'arrête le graphique — mais SEULEMENT si elle ne
       vient pas se coller à la précédente : « 10/09 11/09 » superposés sur
       le bord droit, c'était illisible et ça donnait l'air d'un bug. */
    const saut = Math.ceil(serie.length / 8);
    const dernier = serie.length - 1;
    const derniereMarquee = Math.floor(dernier / saut) * saut;
    const forcerDernier = dernier - derniereMarquee >= Math.max(2, Math.ceil(saut / 2));
    const etiquettes = serie.map((x, i) => {
      const regulier = i % saut === 0 && (forcerDernier || i !== derniereMarquee || i === dernier);
      if (!regulier && !(forcerDernier && i === dernier)) return '';
      const [, mois, jour] = x.jour.split('-');
      // ancrée au bord pour les extrêmes, sinon l'étiquette dépasse du cadre
      const ancre = i === 0 ? 'start' : i === dernier ? 'end' : 'middle';
      const px = i === 0 ? 2 : i === dernier ? L - 2 : i * pas + pas / 2;
      return `<text x="${px.toFixed(1)}" y="${H - 8}" text-anchor="${ancre}">${jour}/${mois}</text>`;
    }).join('');

    boite.innerHTML = `
      <svg viewBox="0 0 ${L} ${H}" preserveAspectRatio="none" role="img"
           aria-label="Visiteurs par jour sur ${serie.length} jours${totalCmd ? ', et nombre de commandes' : ''}">
        <line class="axe" x1="0" y1="${H - bas}" x2="${L}" y2="${H - bas}"></line>
        <g class="barres-visiteurs">${barres}</g>
        ${points ? `<polyline class="ligne-commandes" points="${points}"></polyline>` : ''}
        <g class="etiquettes">${etiquettes}</g>
      </svg>`;

    $('[data-legende]').textContent = totalCmd === 0
      ? `Barres : visiteurs par jour (maximum ${maxV}). Aucune commande sur la période.`
      : `Barres : visiteurs par jour (maximum ${maxV}). Ligne : commandes par jour (maximum ${maxC}). `
        + `Les deux échelles sont différentes — sans cela, la ligne des commandes serait invisible.`;
  }

  function remplirSources(l) {
    const corps = $('[data-sources]');
    if (!l.length) return vide(corps, 3, 'Aucune provenance enregistrée.');
    corps.innerHTML = l.map((x) => `
      <tr><td>${A.ech(nomSource(x.source))}</td>
          <td class="num">${nombre(x.visiteurs)}</td>
          <td class="num">${nombre(x.vues)}</td></tr>`).join('');
  }

  const NOMS = {
    direct: 'Accès direct (lien tapé, favori)', instagram: 'Instagram', facebook: 'Facebook',
    tiktok: 'TikTok', google: 'Google', twitter: 'X / Twitter', youtube: 'YouTube',
    whatsapp: 'WhatsApp', 'e-mail': 'E-mail', 'autre moteur': 'Autre moteur de recherche',
  };
  const nomSource = (s) => NOMS[s] || s;

  function remplirAppareils(l) {
    const corps = $('[data-appareils]');
    if (!l.length) return vide(corps, 3, 'Aucune donnée.');
    const total = l.reduce((t, x) => t + x.visiteurs, 0) || 1;
    corps.innerHTML = l.map((x) => `
      <tr><td>${A.ech(x.appareil)}</td>
          <td class="num">${nombre(x.visiteurs)}</td>
          <td class="num">${Math.round(x.visiteurs / total * 100)} %</td></tr>`).join('');
  }

  function remplirProduits(l) {
    const corps = $('[data-produits]');
    if (!l.length) return vide(corps, 5, 'Aucune fiche produit consultée.');
    corps.innerHTML = l.map((x) => `
      <tr>
        <td><a href="/produit/${encodeURIComponent(x.slug)}" target="_blank" rel="noopener">${A.ech(x.nom)}</a></td>
        <td class="num">${nombre(x.vues)}</td>
        <td class="num">${nombre(x.visiteurs)}</td>
        <td class="num">${nombre(x.vendus)}</td>
        <td class="num">${x.vendus ? Math.round(x.vues / x.vendus) : '—'}</td>
      </tr>`).join('');
  }

  /* Le commerçant n'a pas à décoder des chemins d'URL : on nomme les
     pages. Accessoirement, un lien dont le texte est « / » mesure neuf
     pixels de large — impossible à viser au doigt. */
  const PAGES = {
    '/': 'Accueil',
    '/boutique': 'La boutique',
    '/panier': 'Panier',
    '/commande': 'Page de commande',
    '/merci': 'Confirmation de commande',
    '/contact': 'Contact',
    '/mentions-legales': 'Mentions légales',
    '/conditions-de-vente': 'Conditions de vente',
    '/livraison-et-retours': 'Livraison et retours',
  };
  function nomPage(chemin) {
    if (PAGES[chemin]) return PAGES[chemin];
    if (chemin.startsWith('/rayon/')) return 'Rayon « ' + chemin.slice(7).replace(/-/g, ' ') + ' »';
    if (chemin.startsWith('/produit/')) return 'Fiche produit';
    return chemin;
  }

  function remplirPages(l) {
    const corps = $('[data-pages]');
    if (!l.length) return vide(corps, 3, 'Aucune page vue.');
    corps.innerHTML = l.map((x) => `
      <tr><td>
            <a href="${A.ech(x.chemin)}" target="_blank" rel="noopener">${A.ech(nomPage(x.chemin))}</a>
            <span class="mono gris chemin-page">${A.ech(x.chemin)}</span>
          </td>
          <td class="num">${nombre(x.vues)}</td>
          <td class="num">${nombre(x.visiteurs)}</td></tr>`).join('');
  }

  function vide(corps, colonnes, texte) {
    corps.innerHTML = `<tr><td colspan="${colonnes}" class="vide-admin">${texte}</td></tr>`;
  }
})();
