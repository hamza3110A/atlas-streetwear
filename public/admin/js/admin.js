/* ==========================================================================
   ATLAS — socle de l'administration.
   La barre latérale est construite ICI, à un seul endroit. Ajouter une page
   se fait en ajoutant une ligne au tableau MENU : elle apparaît sur les neuf
   écrans, et le bouton ☰ du mobile avec elle.
   ========================================================================== */
(function () {
  'use strict';

  const MENU = [
    { section: 'Pilotage' },
    { id: 'index',      href: '/admin/index.html',      nom: 'Tableau de bord', icone: 'M3 12h4l3 8 4-16 3 8h4' },
    { id: 'commandes',  href: '/admin/commandes.html',  nom: 'Commandes',       icone: 'M6 2h12l2 6-8 14L4 8z', pastille: 'commandes_nouvelles' },
    { id: 'statistiques', href: '/admin/statistiques.html', nom: 'Statistiques', icone: 'M4 20V10m6 10V4m6 16v-7' },
    { section: 'Catalogue' },
    { id: 'produits',   href: '/admin/produits.html',   nom: 'Produits',        icone: 'M4 7h16v13H4zM8 7V4h8v3' },
    { id: 'stock',      href: '/admin/stock.html',      nom: 'Stock',           icone: 'M4 6h16M4 12h16M4 18h10' },
    { id: 'rayons',     href: '/admin/rayons.html',     nom: 'Rayons',          icone: 'M3 5h8v6H3zM13 5h8v14h-8zM3 13h8v6H3z' },
    { section: 'Clientèle' },
    { id: 'clients',    href: '/admin/clients.html',    nom: 'Clients',         icone: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6' },
    { id: 'promotions', href: '/admin/promotions.html', nom: 'Promotions',      icone: 'M7 7h.01M20 13l-7 7-9-9V4h7z' },
    { section: 'Boutique' },
    { id: 'accueil',    href: '/admin/accueil.html',    nom: 'Page d\'accueil', icone: 'm3 11 9-8 9 8v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
    { id: 'reglages',   href: '/admin/reglages.html',   nom: 'Réglages',        icone: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2m12 0h2M12 4v2m0 12v2' },
    { id: 'guide',      href: '/admin/guide.html',      nom: 'Guide du site',   icone: 'M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z' },
  ];

  // ------------------------------------------------------------ formats
  function prix(millimes) {
    const n = Math.round(Number(millimes) || 0);
    const s = n < 0 ? '-' : '';
    const a = Math.abs(n);
    return s + Math.floor(a / 1000).toLocaleString('fr-FR') + ',' + String(a % 1000).padStart(3, '0') + ' DT';
  }

  /** « 89,500 », « 89.5 », « 89 500 » → millimes. Le commerçant écrit comme
      il veut, on range en entier. */
  function versMillimes(texte, decimales) {
    const d = decimales == null ? 3 : decimales;
    const t = String(texte == null ? '' : texte).replace(/\s/g, '').replace(',', '.');
    if (!t) return 0;
    const n = parseFloat(t);
    return Number.isFinite(n) ? Math.round(n * Math.pow(10, d)) : 0;
  }

  function depuisMillimes(millimes, decimales) {
    const d = decimales == null ? 3 : decimales;
    const n = Math.round(Number(millimes) || 0);
    return (n / Math.pow(10, d)).toFixed(d).replace('.', ',');
  }

  /* Un montant AVEC sa devise, pour les pays autres que le principal.
     Le dinar a trois décimales, le dirham deux : une fonction qui divise
     toujours par mille affiche un prix en dirhams dix fois trop petit,
     sans rien signaler. */
  function prixMarche(montant, marche) {
    return depuisMillimes(montant, marche.decimales) + ' ' + marche.devise;
  }

  function date(iso) {
    if (!iso) return '—';
    const d = new Date(String(iso).replace(' ', 'T') + (String(iso).length <= 19 ? 'Z' : ''));
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
      ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function ech(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  const LIBELLES = {
    nouvelle: 'Nouvelle', confirmee: 'Confirmée', en_preparation: 'En préparation',
    expediee: 'Expédiée', livree: 'Livrée', annulee: 'Annulée',
  };

  function etiquetteStatut(statut) {
    return `<span class="etiq etiq--${ech(statut)}">${ech(LIBELLES[statut] || statut)}</span>`;
  }

  // ------------------------------------------------------------- réseau
  async function api(chemin, options) {
    const o = Object.assign({ headers: {} }, options);
    if (o.body && !(o.body instanceof FormData) && typeof o.body !== 'string') {
      o.headers['Content-Type'] = 'application/json';
      o.body = JSON.stringify(o.body);
    }
    const r = await fetch('/api' + chemin, o);
    if (r.status === 401) {
      location.href = '/admin/connexion.html?suite=' + encodeURIComponent(location.pathname);
      throw new Error('Session expirée.');
    }
    let d = null;
    try { d = await r.json(); } catch { d = null; }
    if (!r.ok) {
      const e = new Error((d && d.erreur) || `Erreur ${r.status}.`);
      e.statut = r.status; e.donnees = d;
      throw e;
    }
    return d;
  }

  // -------------------------------------------------------------- toast
  let minuteur;
  function toast(message, type) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle('toast--erreur', type === 'erreur');
    requestAnimationFrame(() => el.classList.add('visible'));
    clearTimeout(minuteur);
    minuteur = setTimeout(() => el.classList.remove('visible'), 3400);
  }

  // ------------------------------------------------------------- modale
  function modale({ titre, corps, boutons }) {
    return new Promise((resolve) => {
      const fond = document.createElement('div');
      fond.className = 'modale';
      fond.innerHTML = `
        <div class="modale-boite" role="dialog" aria-modal="true" aria-label="${ech(titre)}">
          <div class="modale-entete">
            <h2>${ech(titre)}</h2>
            <button class="icone-bouton" type="button" data-fermer aria-label="Fermer">✕</button>
          </div>
          <div data-corps>${corps || ''}</div>
          <div class="modale-pied" data-pied></div>
        </div>`;
      document.body.appendChild(fond);

      const pied = fond.querySelector('[data-pied]');
      (boutons || [{ texte: 'Fermer', valeur: null }]).forEach((b) => {
        const bt = document.createElement('button');
        bt.type = 'button';
        bt.className = 'btn ' + (b.classe || '');
        bt.textContent = b.texte;
        bt.addEventListener('click', () => fermer(b.valeur === undefined ? true : b.valeur));
        pied.appendChild(bt);
      });

      function fermer(valeur) {
        fond.classList.remove('ouverte');
        setTimeout(() => fond.remove(), 200);
        document.removeEventListener('keydown', auClavier);
        resolve({ valeur, boite: fond });
      }
      function auClavier(e) { if (e.key === 'Escape') fermer(null); }

      fond.querySelector('[data-fermer]').addEventListener('click', () => fermer(null));
      fond.addEventListener('click', (e) => { if (e.target === fond) fermer(null); });
      document.addEventListener('keydown', auClavier);
      requestAnimationFrame(() => fond.classList.add('ouverte'));
      fond.querySelector('input, select, textarea, button')?.focus();
    });
  }

  async function confirmer(titre, texte, texteBouton) {
    const r = await modale({
      titre,
      corps: `<p>${ech(texte)}</p>`,
      boutons: [
        { texte: texteBouton || 'Confirmer', classe: 'btn--danger', valeur: true },
        { texte: 'Annuler', valeur: false },
      ],
    });
    return r.valeur === true;
  }

  // ------------------------------------------------- barre de navigation
  function construireCoque(utilisateur, pageActive) {
    const app = document.querySelector('.app');

    const barre = document.createElement('div');
    barre.className = 'barre-mobile';
    barre.innerHTML = `
      <button class="icone-bouton burger-admin" type="button" aria-expanded="false"
              aria-controls="lateral" aria-label="Ouvrir le menu">
        <span></span><span></span><span></span>
      </button>
      <h1>${ech((MENU.find((m) => m.id === pageActive) || {}).nom || 'Administration')}</h1>`;

    const voile = document.createElement('div');
    voile.className = 'voile-admin';

    const lateral = document.createElement('aside');
    lateral.className = 'lateral';
    lateral.id = 'lateral';
    lateral.innerHTML = `
      <div class="lateral-entete">
        <img src="/img/mark-sm-clair.png" alt="" width="22" height="35">
        <strong>Administration</strong>
      </div>
      <nav class="lateral-nav" aria-label="Sections">
        ${MENU.map((m) => m.section
          ? `<p class="lateral-titre">${ech(m.section)}</p>`
          : `<a class="lateral-lien" href="${m.href}"${m.id === pageActive ? ' aria-current="page"' : ''}>
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                 <path d="${m.icone}"/>
               </svg>
               <span>${ech(m.nom)}</span>
               ${m.pastille ? `<span class="pastille" data-pastille="${m.pastille}">0</span>` : ''}
             </a>`).join('')}
      </nav>
      <div class="lateral-pied">
        <p class="qui">${ech(utilisateur.nom)}</p>
        <p class="role">${ech(utilisateur.role)}</p>
        <a class="lateral-lien" href="/" target="_blank" rel="noopener">Voir la boutique ↗</a>
        <button class="lateral-lien" type="button" data-deconnexion>Se déconnecter</button>
      </div>`;

    app.prepend(lateral);
    app.prepend(voile);
    app.prepend(barre);

    // Le bouton ☰ est dans la barre du haut, jamais dans la zone qui se
    // referme au clic : sinon l'ouverture et la fermeture se produisent
    // dans le même événement et rien ne bouge.
    const burger = barre.querySelector('.burger-admin');
    const basculer = (oui) => {
      lateral.classList.toggle('ouvert', oui);
      voile.classList.toggle('ouvert', oui);
      document.body.classList.toggle('menu-ouvert', oui);
      burger.setAttribute('aria-expanded', String(oui));
    };
    burger.addEventListener('click', () => basculer(!lateral.classList.contains('ouvert')));
    voile.addEventListener('click', () => basculer(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') basculer(false); });
    lateral.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => basculer(false)));

    lateral.querySelector('[data-deconnexion]').addEventListener('click', async () => {
      await fetch('/api/deconnexion', { method: 'POST' });
      location.href = '/admin/connexion.html';
    });

    // Pastille « commandes nouvelles » : visible depuis n'importe quelle page.
    api('/admin/tableau-de-bord').then((d) => {
      document.querySelectorAll('[data-pastille]').forEach((el) => {
        const v = d.stats[el.dataset.pastille] || 0;
        el.textContent = v;
        el.classList.toggle('visible', v > 0);
      });
    }).catch(() => { /* la pastille n'est pas vitale */ });
  }

  /** Point d'entrée de chaque page d'administration. */
  async function demarrer(pageActive, apres) {
    let session;
    try { session = await (await fetch('/api/session')).json(); }
    catch { session = { connecte: false }; }

    if (!session.connecte) {
      location.href = '/admin/connexion.html?suite=' + encodeURIComponent(location.pathname);
      return;
    }
    construireCoque(session.utilisateur, pageActive);
    try { await apres(session.utilisateur); }
    catch (e) { console.error(e); toast(e.message || 'Erreur inattendue.', 'erreur'); }
  }

  window.ADMIN = {
    MENU, LIBELLES,
    api, toast, modale, confirmer, demarrer,
    prix, versMillimes, depuisMillimes, prixMarche, date, ech, etiquetteStatut,
  };
})();
