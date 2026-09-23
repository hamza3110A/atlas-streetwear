/* Page d'attente : elle est servie avec un code 503, donc /api/boutique
   répond lui aussi 503. On lit quand même la réponse pour afficher le
   message que le commerçant a écrit dans ses réglages. */
(function () {
  'use strict';
  fetch('/api/boutique')
    .then((r) => r.json())
    .then((d) => {
      const r = d && d.reglages;
      if (!r) return;
      /* La page d'attente n'a pas ATLAS (pas de dictionnaire chargé par
         lui) : on lit I18N directement, et la langue du marché renvoyée
         par l'API — même fermée, la boutique répond son pays. */
      const langue = (d.marche && d.marche.langue) || 'fr';
      const T = (t) => (window.I18N ? window.I18N.traduire(t, langue) : t);
      document.title = T('Bientôt disponible —') + ' ' + r.nom_boutique;
      if (r.message_fermeture) document.querySelector('[data-message]').textContent = r.message_fermeture;
      const contact = [r.telephone, r.email].filter(Boolean).join(' · ');
      if (contact) document.querySelector('[data-contact]').textContent = contact;
    })
    .catch(() => { /* la page reste lisible sans */ });
})();
