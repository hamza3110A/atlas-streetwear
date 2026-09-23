/* ==========================================================================
   ATLAS — socle commun de la vitrine.
   En-tête, tiroir de navigation, panier, appels réseau, formats.
   Chargé par TOUTES les pages : le bouton ☰ existe donc partout, et pas
   seulement sur l'accueil. C'est un seul endroit à corriger.
   ========================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------- format
  /* LE MARCHÉ COURANT, tel que le SERVEUR l'a décidé.
  
     Il est renseigné au chargement, avant le premier affichage de prix.
     Les valeurs écrites ici ne servent qu'au cas — théorique — où un
     montant serait formaté avant la réponse du serveur : mieux vaut un
     prix en dinars qu'un « undefined DT » à l'écran. */
  let MARCHE = { code: 'tn', nom: 'Tunisie', devise: 'DT', decimales: 3, langue: 'fr' };

  /**
   * T() — le texte, dans la langue du pays servi.
   *
   * Le serveur traduit déjà les pages HTML avant de les envoyer. T() ne
   * sert qu'aux textes FABRIQUÉS ICI : en-tête, tiroir, pied de page,
   * panier, messages. Sans lui, un visiteur des Émirats aurait une page
   * anglaise avec un panier français à l'intérieur.
   *
   * Français en entrée, français en sortie si la phrase manque au
   * dictionnaire : jamais de texte vide.
   */
  function T(texte) {
    const dico = window.I18N;
    if (!dico) return texte;
    return dico.traduire(texte, MARCHE.langue || 'fr');
  }

  /**
   * Les montants circulent en entiers, dans la plus petite unité de la
   * devise : 89000 millimes → « 89,000 », 12000 fils → « 120,00 ».
   *
   * Le nombre de décimales VIENT DU MARCHÉ. L'ancienne version divisait
   * toujours par mille : un prix en dirhams s'affichait dix fois trop
   * petit, sans erreur, sans alerte — juste un chiffre faux sur la fiche
   * produit et dans le panier.
   */
  function millimes(v, decimales) {
    const d = decimales == null ? MARCHE.decimales : decimales;
    const base = Math.pow(10, d);
    const n = Math.round(Number(v) || 0);
    const signe = n < 0 ? '-' : '';
    const a = Math.abs(n);
    return signe + Math.floor(a / base).toLocaleString('fr-FR') + ',' + String(a % base).padStart(d, '0');
  }
  function prix(v, marche) {
    const m = marche || MARCHE;
    return millimes(v, m.decimales) + ' ' + m.devise;
  }

  function echapper(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // -------------------------------------------------------------- réseau
  async function api(chemin, options) {
    const o = Object.assign({ headers: {} }, options);
    if (o.body && typeof o.body !== 'string') {
      o.headers['Content-Type'] = 'application/json';
      o.body = JSON.stringify(o.body);
    }
    const r = await fetch('/api' + chemin, o);
    let data = null;
    try { data = await r.json(); } catch { data = null; }
    if (!r.ok) {
      const e = new Error((data && data.erreur) || 'Le serveur n\'a pas répondu correctement.');
      e.statut = r.status;
      e.donnees = data;
      throw e;
    }
    return data;
  }

  // -------------------------------------------------------------- panier
  /**
   * Le panier local ne contient que des identifiants de variante et des
   * quantités. Aucun prix. Les montants sont calculés par le serveur à
   * chaque affichage : c'est ce qui rend impossible de « préparer » un
   * panier truqué dans le navigateur.
   */
  const CLE = 'atlas_panier';
  let secours = [];   // si localStorage est indisponible (navigation privée stricte)

  function lirePanier() {
    try {
      const brut = localStorage.getItem(CLE);
      if (!brut) return [];
      const p = JSON.parse(brut);
      return Array.isArray(p) ? p.filter((l) => l && l.variante_id) : [];
    } catch { return secours; }
  }

  function ecrirePanier(lignes) {
    secours = lignes;
    try { localStorage.setItem(CLE, JSON.stringify(lignes)); } catch { /* mémoire seule */ }
    majCompteur();
    document.dispatchEvent(new CustomEvent('panier:change', { detail: lignes }));
  }

  function ajouterAuPanier(varianteId, quantite) {
    const lignes = lirePanier();
    const existante = lignes.find((l) => l.variante_id === varianteId);
    if (existante) existante.quantite = Math.min(20, existante.quantite + (quantite || 1));
    else lignes.push({ variante_id: varianteId, quantite: quantite || 1 });
    ecrirePanier(lignes);
  }

  function definirQuantite(varianteId, quantite) {
    let lignes = lirePanier();
    if (quantite <= 0) lignes = lignes.filter((l) => l.variante_id !== varianteId);
    else {
      const l = lignes.find((x) => x.variante_id === varianteId);
      if (l) l.quantite = Math.min(20, quantite);
    }
    ecrirePanier(lignes);
  }

  function retirerDuPanier(varianteId) { definirQuantite(varianteId, 0); }
  function viderPanier() { ecrirePanier([]); }
  function nbArticles() { return lirePanier().reduce((s, l) => s + (l.quantite || 0), 0); }

  function majCompteur() {
    const n = nbArticles();
    document.querySelectorAll('[data-panier-compteur]').forEach((el) => {
      el.textContent = n;
      el.classList.toggle('visible', n > 0);
    });
  }

  // ------------------------------------------------------------- notices
  let minuteurNotice;
  function notice(message, type) {
    let el = document.querySelector('.notice');
    if (!el) {
      el = document.createElement('div');
      el.className = 'notice';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle('notice--erreur', type === 'erreur');
    requestAnimationFrame(() => el.classList.add('visible'));
    clearTimeout(minuteurNotice);
    minuteurNotice = setTimeout(() => el.classList.remove('visible'), 3200);
  }

  // -------------------------------------------------- en-tête et tiroir
  let boutique = null;

  async function chargerBoutique() {
    if (boutique) return boutique;
    boutique = await api('/boutique');
    return boutique;
  }

  /**
   * Le sélecteur de pays.
   *
   * Il n'apparaît QUE s'il y a plus d'un marché ouvert. Tant que le
   * commerçant ne vend qu'en Tunisie, proposer un choix entre une seule
   * option serait un bouton qui ne fait rien — et un client qui se
   * demande ce qu'il a raté.
   *
   * Le choix part au serveur, qui pose le cookie et répond. On recharge
   * alors la page : prix, stocks, frais et délai changent tous en même
   * temps, et ils viennent tous du serveur. Les corriger un par un dans
   * la page ouverte aurait laissé, le temps d'un battement, un prix en
   * dirhams à côté d'un total en dinars.
   */
  function construireSelecteurMarche(donnees) {
    const liste = donnees.marches || [];
    if (liste.length < 2) return '';
    const courant = (donnees.marche && donnees.marche.code) || liste[0].code;
    const options = liste.map((m) => (
      `<option value="${echapper(m.code)}"${m.code === courant ? ' selected' : ''}>`
      + `${echapper(T(m.nom))} — ${echapper(m.devise)}</option>`
    )).join('');
    return `
      <label class="selecteur-marche">
        <span class="hors-ecran">${T('Pays de livraison')}</span>
        <select data-marche aria-label="${T('Pays de livraison')}">${options}</select>
      </label>`;
  }

  /**
   * LA PORTE D'ENTRÉE : « où livrons-nous ? », posée une seule fois.
   *
   * Elle ne s'affiche QUE si trois conditions sont réunies :
   *   — au moins deux pays sont ouverts (sinon il n'y a pas de choix) ;
   *   — le visiteur n'a pas encore choisi (aucun cookie de marché) ;
   *   — la page n'est pas une page d'administration.
   *
   * POURQUOI DEMANDER PLUTÔT QUE DEVINER. Détecter le pays d'après la
   * connexion se trompe sur un Tunisien en voyage, sur un VPN, sur un
   * téléphone en itinérance — et le visiteur voit alors les mauvais prix
   * sans comprendre pourquoi. Une question posée une fois vaut mieux
   * qu'une erreur silencieuse répétée à chaque visite.
   *
   * ON NE PIÈGE PERSONNE. La porte se ferme au clavier (Échap ferme en
   * gardant le pays par défaut), elle ne bloque pas la lecture de la
   * page derrière, et le choix reste modifiable à tout moment par le
   * sélecteur de l'en-tête. Un panneau qu'on ne peut pas fermer n'est
   * pas une question, c'est un péage.
   */
  function porteDuPays(donnees) {
    const liste = donnees.marches || [];
    if (liste.length < 2) return;
    if (location.pathname.startsWith('/admin')) return;
    /* Le serveur pose le cookie ; s'il est là, le visiteur a déjà
       répondu — ou il revient, et on ne redemande pas. */
    if (document.cookie.split(';').some((c) => c.trim().startsWith('marche='))) return;

    const dlg = document.createElement('div');
    dlg.className = 'porte-pays';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'porte-titre');
    dlg.innerHTML = `
      <div class="porte-fond" aria-hidden="true"></div>
      <div class="porte-boite">
        <img class="porte-marque" src="/img/badge-blanc.png" alt="" width="96" height="110">
        <p class="porte-sur-titre">${echapper(donnees.reglages.nom_boutique)}</p>
        <h2 class="porte-titre" id="porte-titre">${T('Où livrons-nous ?')}</h2>
        <p class="porte-texte">${T('Les prix, les frais et les délais changent selon le pays. Vous pourrez en changer à tout moment en haut de page.')}</p>
        <div class="porte-choix">
          ${liste.map((m) => `
            <button class="porte-bouton" type="button" data-porte-choix="${echapper(m.code)}">
              <span class="porte-pays-nom">${echapper(T(m.nom))}</span>
              <span class="porte-pays-devise">${T('Prix en')} ${echapper(m.devise)}</span>
            </button>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(dlg);
    document.body.classList.add('porte-ouverte');

    const fermer = () => {
      dlg.remove();
      document.body.classList.remove('porte-ouverte');
      if (dernierFocus && dernierFocus.focus) dernierFocus.focus();
    };
    const dernierFocus = document.activeElement;

    dlg.querySelectorAll('[data-porte-choix]').forEach((b) => {
      b.addEventListener('click', () => {
        b.disabled = true;
        changerMarche(b.dataset.porteChoix);
      });
    });

    /* Échap ferme sans choisir : le pays par défaut s'applique, et le
       sélecteur de l'en-tête reste disponible. */
    dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermer(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape' && document.body.contains(dlg)) { fermer(); document.removeEventListener('keydown', esc); }
    });

    /* Le clavier ne doit pas sortir de la porte tant qu'elle est ouverte :
       tabuler jusqu'au menu derrière, invisible, est le genre de piège
       qu'on ne voit qu'en essayant vraiment au clavier. */
    const focalisables = () => [...dlg.querySelectorAll('button:not([disabled])')];
    dlg.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = focalisables();
      if (!f.length) return;
      const premier = f[0], dernier = f[f.length - 1];
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
    });
    requestAnimationFrame(() => { const f = focalisables()[0]; if (f) f.focus(); });
  }

  async function changerMarche(code) {
    try {
      await api('/marche', { method: 'POST', body: { marche: code } });
      location.reload();
    } catch (e) {
      notice(e.message, 'erreur');
    }
  }

  function construireEntete(donnees) {
    const rayons = donnees.rayons || [];
    const chemin = location.pathname;
    const selecteur = construireSelecteurMarche(donnees);

    const navHaut = rayons.slice(0, 4).map((r) => (
      `<a href="/rayon/${encodeURIComponent(r.slug)}"${chemin === '/rayon/' + r.slug ? ' aria-current="page"' : ''}>${echapper(r.nom)}</a>`
    )).join('');

    const entete = document.createElement('header');
    /* La barre ne se pose sur une photo que là où il Y A une photo.
       Sur l'accueil et la page d'attente, un visuel plein écran passe
       derrière elle : elle peut donc rester transparente, texte blanc.
       Partout ailleurs — boutique, panier, pages légales — le fond est
       clair : une barre transparente à texte blanc y serait purement
       invisible. La page le dit elle-même, on ne le devine pas. */
    const surPhoto = !!document.querySelector('.heros, .fermee');
    entete.className = 'entete' + (surPhoto ? ' entete--sur-photo' : '');
    /* Déclaré aussi en attribut : la recette automatique sait alors que le
       contraste de cette zone ne se calcule pas depuis la CSS — il n'y a
       pas de couleur de fond, il y a une photographie — et qu'il faut le
       mesurer sur les pixels rendus. Sans ça elle compare du blanc à du
       blanc et annonce 1,06:1 sur un menu parfaitement lisible. */
    if (surPhoto) entete.setAttribute('data-sur-photo', '');
    entete.innerHTML = `
      <div class="entete-gauche">
        <button class="entete-bouton burger" type="button" aria-expanded="false"
                aria-controls="tiroir-navigation" aria-label="${T('Ouvrir le menu')}">
          <span></span><span></span><span></span>
        </button>
        <a class="entete-logo" href="/" aria-label="${T('Accueil')} ${echapper(donnees.reglages.nom_boutique)}">
          <img class="logo-sombre" src="/img/mark-sm-clair.png" alt="" width="24" height="38">
          <img class="logo-clair" src="/img/mark-sm.png" alt="" width="24" height="38">
        </a>
      </div>
      <nav class="entete-nav" aria-label="${T('Rayons')}">${navHaut}</nav>
      <div class="entete-droite">
        ${selecteur}
        <a class="entete-bouton lien-recherche" href="/boutique#recherche" aria-label="${T('Rechercher')}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
            <circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>
          </svg><span>${T('Rechercher')}</span>
        </a>
        <a class="panier-lien" href="/panier" aria-label="${T('Voir le panier')}">
          <span class="panier-pastille">${T('Panier')}
            <span class="panier-compteur" data-panier-compteur aria-hidden="true">0</span>
          </span>
        </a>
      </div>`;

    const voile = document.createElement('div');
    voile.className = 'voile';
    voile.hidden = false;

    const tiroir = document.createElement('nav');
    tiroir.className = 'tiroir';
    tiroir.id = 'tiroir-navigation';
    tiroir.setAttribute('aria-label', T('Navigation principale'));
    tiroir.innerHTML = `
      <p class="tiroir-titre">${T('Rayons')}</p>
      <a class="tiroir-lien" href="/boutique"${chemin === '/boutique' ? ' aria-current="page"' : ''}>${T('Tout voir')}</a>
      ${rayons.map((r) => `
        <a class="tiroir-lien" href="/rayon/${encodeURIComponent(r.slug)}"${chemin === '/rayon/' + r.slug ? ' aria-current="page"' : ''}>
          ${echapper(r.nom)}<span class="compte">${r.nb}</span>
        </a>`).join('')}
      <p class="tiroir-titre">${T('Boutique')}</p>
      <a class="tiroir-lien" href="/panier">${T('Panier')}<span class="compte" data-panier-compteur-texte>0</span></a>
      ${selecteur ? `<p class="tiroir-titre">${T('Livraison vers')}</p><div class="tiroir-marche">${selecteur}</div>` : ''}
      <div class="tiroir-pied">
        <a href="/livraison-et-retours">${T('Livraison &amp; retours')}</a>
        <a href="/contact">${T('Contact')}</a>
        <a href="/conditions-de-vente">${T('Conditions de vente')}</a>
      </div>`;

    document.body.prepend(voile);
    document.body.prepend(tiroir);

    /* ÉCOUTE DÉLÉGUÉE, posée sur le document.
    
       La version précédente accrochait un écouteur à chaque sélecteur
       trouvé À CET INSTANT — or la barre n'est insérée dans la page que
       quelques lignes plus bas. Seul le sélecteur du tiroir en recevait
       un. Sur téléphone ça marchait (le tiroir est le seul visible), sur
       ordinateur le bouton de la barre ne faisait rien du tout : un
       élément qui a l'air cliquable et qui ne l'est pas, exactement ce
       que ce site s'interdit.
    
       Trouvé en mesurant les appels réseau après le clic : zéro requête
       vers /api/marche. Une capture d'écran n'aurait rien montré. */
    document.addEventListener('change', (e) => {
      const sel = e.target.closest && e.target.closest('[data-marche]');
      if (sel) changerMarche(sel.value);
    });
    document.body.prepend(entete);

    // --- ouverture / fermeture ---------------------------------------
    // Le bouton ☰ vit dans l'en-tête, PAS dans la zone qui se referme au
    // clic. C'est le piège classique : bouton posé dans le voile, le clic
    // ouvre puis referme dans le même événement, et rien ne bouge.
    const burger = entete.querySelector('.burger');

    function ouvrir(oui) {
      tiroir.classList.toggle('ouvert', oui);
      voile.classList.toggle('ouvert', oui);
      document.body.classList.toggle('menu-ouvert', oui);
      burger.setAttribute('aria-expanded', String(oui));
      burger.setAttribute('aria-label', oui ? T('Fermer le menu') : T('Ouvrir le menu'));
    }

    burger.addEventListener('click', () => ouvrir(!tiroir.classList.contains('ouvert')));
    voile.addEventListener('click', () => ouvrir(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ouvrir(false); });
    tiroir.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => ouvrir(false)));

    // --- en-tête opaque au défilement --------------------------------
    const auDefilement = () => entete.classList.toggle('entete--pose', window.scrollY > 24);
    auDefilement();
    window.addEventListener('scroll', auDefilement, { passive: true });

    majCompteur();
    document.querySelectorAll('[data-panier-compteur-texte]').forEach((el) => { el.textContent = nbArticles(); });
    document.addEventListener('panier:change', () => {
      document.querySelectorAll('[data-panier-compteur-texte]').forEach((el) => { el.textContent = nbArticles(); });
    });
  }

  function construireBandeau(reglages) {
    if (!reglages.bandeau_actif || !reglages.bandeau_texte) return;
    let masque = false;
    try { masque = sessionStorage.getItem('atlas_bandeau') === 'masque'; } catch { /* ignoré */ }
    if (masque) return;

    const el = document.createElement('aside');
    el.className = 'bandeau';
    el.innerHTML = `<p>${echapper(reglages.bandeau_texte)}</p><button type="button">${T('Masquer')}</button>`;
    el.querySelector('button').addEventListener('click', () => {
      el.hidden = true;
      mesurer();
      try { sessionStorage.setItem('atlas_bandeau', 'masque'); } catch { /* ignoré */ }
    });
    document.body.appendChild(el);

    /* Le bandeau est fixé en bas de l'écran : il recouvrirait le chevron du
       héros et la dernière ligne du pied de page. On publie sa hauteur réelle
       dans une variable CSS, et la feuille de style réserve la place. Mesurer
       vaut mieux que deviner une valeur en dur qui sera fausse dès que le
       commerçant écrira un texte plus long. */
    const mesurer = () => {
      const h = el.hidden ? 0 : Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--bandeau-h', h + 'px');
    };
    mesurer();
    if (window.ResizeObserver) new ResizeObserver(mesurer).observe(el);
    window.addEventListener('resize', mesurer);
  }

  /* Pictogrammes, écrits à la main et posés directement dans la page.
     Pas de police d'icônes, pas de bibliothèque : une police d'icônes,
     c'est un fichier de plus à télécharger avant que le pied de page ne
     veuille bien s'afficher, et un carré blanc en attendant.

     Tous dessinent en `currentColor` : ils prennent la couleur du texte
     qui les entoure, donc le survol et le mode sombre les suivent sans
     qu'on ait à les redessiner. Chacun porte aria-hidden — le sens est
     porté par le texte à côté, ou par l'aria-label du lien ; annoncé deux
     fois, il devient du bruit. */
  const svg = (contenu) =>
    `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">${contenu}</svg>`;

  const trait = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

  const ICONES = {
    telephone: svg(`<path ${trait} d="M5.2 3.5h3l1.3 3.3-1.8 1.4a11.6 11.6 0 0 0 5.1 5.1l1.4-1.8 3.3 1.3v3a1.7 1.7 0 0 1-1.8 1.7A13.9 13.9 0 0 1 3.5 5.3 1.7 1.7 0 0 1 5.2 3.5Z"/>`),
    email: svg(`<rect x="3" y="5.5" width="18" height="13" rx="2.2" ${trait}/><path ${trait} d="m3.8 7 8.2 5.6L20.2 7"/>`),
    lieu: svg(`<path ${trait} d="M12 21c4.3-4.2 6.4-7.4 6.4-10a6.4 6.4 0 1 0-12.8 0c0 2.6 2.1 5.8 6.4 10Z"/><circle cx="12" cy="11" r="2.4" ${trait}/>`),

    instagram: svg(`<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" ${trait}/><circle cx="12" cy="12" r="4.1" ${trait}/><circle cx="17.1" cy="6.9" r="1.25" fill="currentColor"/>`),
    facebook: svg(`<path fill="currentColor" d="M13.4 21v-7.9h2.6l.5-3.1h-3.1V8c0-.9.3-1.5 1.6-1.5h1.6V3.7A21 21 0 0 0 14.2 3.6c-2.4 0-4 1.4-4 4.1v2.3H7.5v3.1h2.7V21h3.2Z"/>`),
    whatsapp: svg(`<path ${trait} d="M3.6 20.4l1.2-4a8.2 8.2 0 1 1 3.1 3l-4.3 1Z"/><path fill="currentColor" d="M9.1 7.9c-.15-.36-.3-.37-.45-.37h-.38c-.13 0-.35.05-.53.25-.18.2-.7.68-.7 1.65s.72 1.92.82 2.05c.1.13 1.4 2.23 3.44 3.03 1.7.67 2.05.54 2.42.5.37-.03 1.19-.48 1.36-.95.17-.47.17-.87.12-.95-.05-.08-.18-.13-.38-.23s-1.19-.59-1.37-.65c-.18-.07-.32-.1-.45.1-.13.2-.51.65-.63.78-.11.13-.23.15-.43.05-.2-.1-.85-.31-1.62-1-.6-.53-1-1.19-1.12-1.39-.12-.2-.01-.3.09-.4.09-.09.2-.23.3-.35.1-.12.13-.2.2-.34.06-.13.03-.25-.02-.35-.05-.1-.45-1.1-.62-1.5Z"/>`),
    tiktok: svg(`<path fill="currentColor" d="M16.6 3h-2.5v12.2a2.3 2.3 0 1 1-1.9-2.26v-2.6a4.9 4.9 0 1 0 4.4 4.86V9.1a6.4 6.4 0 0 0 3.4 1v-2.5a3.9 3.9 0 0 1-3.4-3.6V3Z"/>`),
  };

  function construirePied(donnees) {
    const r = donnees.reglages;
    const rayons = donnees.rayons || [];
    const pied = document.createElement('footer');
    pied.className = 'pied';

    /* Chaque ligne de contact porte son icône : sans elle, « tunis »
       tombait seul sous une adresse e-mail, et rien ne disait que c'était
       une adresse. Un pictogramme de localisation le dit sans ajouter un
       mot — dans une colonne étroite, la place gagnée compte. */
    const ligne = (icone, contenu, href) => (href
      ? `<a class="pied-ligne" href="${href}">${ICONES[icone]}<span>${contenu}</span></a>`
      : `<span class="pied-ligne">${ICONES[icone]}<span>${contenu}</span></span>`);

    const contact = [
      r.telephone ? ligne('telephone', echapper(r.telephone), `tel:${echapper(r.telephone)}`) : '',
      r.email ? ligne('email', echapper(r.email), `mailto:${echapper(r.email)}`) : '',
      r.adresse ? ligne('lieu', echapper(r.adresse)) : '',
    ].filter(Boolean).join('') || `<a class="pied-ligne" href="/contact">${T('Nous écrire')}</a>`;

    /* Les réseaux passent du texte au pictogramme. Trois mots empilés
       ressemblaient à la suite du menu ; trois ronds alignés se lisent
       d'un coup d'œil et tiennent sur une ligne.

       Chacun garde son nom dans aria-label : un pictogramme muet n'existe
       pas pour qui navigue au lecteur d'écran, et « lien » tout court ne
       dit pas où il mène. */
    const rond = (url, icone, nom) =>
      `<a class="pied-rond" href="${echapper(url)}" aria-label="${nom}" title="${nom}"`
      + ` rel="noopener noreferrer" target="_blank">${ICONES[icone]}</a>`;

    const liens = [
      r.instagram ? rond(r.instagram, 'instagram', 'Instagram') : '',
      r.facebook ? rond(r.facebook, 'facebook', 'Facebook') : '',
      r.whatsapp ? rond(r.whatsapp, 'whatsapp', 'WhatsApp') : '',
      r.tiktok ? rond(r.tiktok, 'tiktok', 'TikTok') : '',
    ].filter(Boolean).join('');
    const reseaux = liens ? `<div class="pied-reseaux">${liens}</div>` : '';

    pied.innerHTML = `
      <div class="pied-marque">
        <img src="/img/badge-clair.png" alt="${echapper(r.nom_boutique)}" width="96" height="110" loading="lazy">
        <p>${echapper(r.accroche)}</p>
      </div>
      <div class="pied-colonnes">
        <div class="pied-colonne">
          <h2 class="pied-titre">${T('Rayons')}</h2>
          ${rayons.map((x) => `<a href="/rayon/${encodeURIComponent(x.slug)}">${echapper(x.nom)}</a>`).join('') || `<a href="/boutique">${T('La boutique')}</a>`}
        </div>
        <div class="pied-colonne">
          <h2 class="pied-titre">${T('Aide')}</h2>
          <a href="/livraison-et-retours">${T('Livraison &amp; retours')}</a>
          <a href="/conditions-de-vente">${T('Conditions de vente')}</a>
          <a href="/mentions-legales">${T('Mentions légales')}</a>
        </div>
        <div class="pied-colonne">
          <h2 class="pied-titre">${T('Contact')}</h2>
          ${contact}
          ${reseaux}
        </div>
      </div>
      <div class="pied-bas">
        <span>© ${new Date().getFullYear()} ${echapper(r.nom_boutique)}</span>
        <span>${T('Paiement à la livraison')} — ${echapper(T(r.delai_livraison))}</span>
        <span class="pied-signature">${T('Site réalisé par')} <a href="mailto:hamzazouiten06@gmail.com">Hamza Zouiten</a></span>
      </div>`;
    document.body.appendChild(pied);
  }

  // ---------------------------------------------------------- démarrage
  async function demarrer() {
    try {
      const donnees = await chargerBoutique();
      /* Le marché est posé AVANT toute construction : l'en-tête, le
         bandeau et le pied affichent des montants, et un prix formaté
         avec les mauvaises décimales serait faux dès la première
         image de la page. */
      if (donnees.marche) MARCHE = donnees.marche;
      construireEntete(donnees);
      porteDuPays(donnees);
      if (!document.body.hasAttribute('data-sans-bandeau')) construireBandeau(donnees.reglages);
      if (!document.body.hasAttribute('data-sans-pied')) construirePied(donnees);
      document.dispatchEvent(new CustomEvent('atlas:pret', { detail: donnees }));
    } catch (e) {
      console.error('Chargement de la boutique impossible', e);
      document.dispatchEvent(new CustomEvent('atlas:erreur', { detail: e }));
    }
  }

  window.ATLAS = {
    api, prix, millimes, echapper, notice, T,
    marche: () => MARCHE,
    lirePanier, ecrirePanier, ajouterAuPanier, definirQuantite, retirerDuPanier,
    viderPanier, nbArticles, chargerBoutique,
    pret: (fn) => document.addEventListener('atlas:pret', (e) => fn(e.detail)),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
