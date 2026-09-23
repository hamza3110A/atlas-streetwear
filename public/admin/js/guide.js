(function () {
  'use strict';
  window.ADMIN.demarrer('guide', async () => {
    document.querySelector('[data-imprimer]').addEventListener('click', () => window.print());
  });
})();
