(function () {
  'use strict';
  const A = window.ADMIN;
  const form = document.querySelector('[data-form]');
  const erreur = document.querySelector('[data-erreur]');
  const diag = document.querySelector('[data-diagnostic]');
  const suite = new URLSearchParams(location.search).get('suite') || '/admin/index.html';

  // Déjà connecté ? on ne fait pas retaper un mot de passe pour rien.
  fetch('/api/session').then((r) => r.json()).then((s) => {
    if (s.connecte) location.replace(suite);
  }).catch(() => { /* on reste sur la page */ });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bouton = form.querySelector('[data-valider]');
    erreur.hidden = true;
    diag.hidden = true;
    bouton.disabled = true;
    bouton.textContent = 'Connexion…';

    try {
      const r = await A.api('/connexion', {
        method: 'POST',
        body: {
          email: form.email.value.trim(),
          mot_de_passe: form.mot_de_passe.value,
        },
      });

      // Vérification honnête : on redemande la session. Si le cookie n'a
      // pas été gardé par le navigateur, on le dit ici, avec la cause,
      // au lieu de renvoyer bêtement sur l'écran de connexion.
      const session = await (await fetch('/api/session')).json();
      if (!session.connecte) {
        erreur.hidden = false;
        erreur.textContent = 'Le navigateur n\'a pas conservé le cookie de session.';
        diag.hidden = false;
        diag.textContent = r.cookie_secure
          ? 'Le serveur a envoyé un cookie « Secure » (il vous croit en HTTPS) mais la page est en ' +
            location.protocol.replace(':', '') + '. Passez le site en HTTPS, ou vérifiez l\'en-tête ' +
            'X-Forwarded-Proto envoyé par nginx.'
          : 'Cookie non sécurisé demandé, et pourtant refusé : vérifiez que les cookies ne sont pas ' +
            'bloqués pour ce domaine dans votre navigateur.';
        bouton.disabled = false;
        bouton.textContent = 'Se connecter';
        return;
      }

      location.href = suite;
    } catch (err) {
      erreur.hidden = false;
      erreur.textContent = err.message;
      bouton.disabled = false;
      bouton.textContent = 'Se connecter';
      form.mot_de_passe.value = '';
      form.mot_de_passe.focus();
    }
  });
})();
