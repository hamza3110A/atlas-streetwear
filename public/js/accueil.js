(function () {
  'use strict';
  const T = (t) => window.ATLAS.T(t);

  /**
   * Le titre du héros vient des réglages : quatre fragments, deux lignes
   * que la marque interrompt. Sans ça, l'écran « Page d'accueil » de
   * l'administration laisserait le commerçant modifier des champs qui
   * n'ont aucun effet sur le site.
   */
  function surligne(texte, mot) {
    const t = window.ATLAS.echapper(texte || '');
    if (!mot) return t;
    const m = window.ATLAS.echapper(mot);
    return t.includes(m) ? t.replace(m, `<span class="accent">${m}</span>`) : t;
  }

  window.ATLAS.pret(async (donnees) => {
    const r = donnees.reglages;

    document.querySelectorAll('[data-hero]').forEach((el) => {
      const n = el.dataset.hero;
      const ligne = r['hero_ligne' + n];
      if (ligne) el.innerHTML = surligne(ligne, r['hero_accent' + n]);
      el.hidden = !ligne;          // un fragment vidé disparaît proprement
    });

    const sous = document.querySelector('.heros-sous');
    if (sous && r.hero_sous_titre !== undefined) {
      sous.textContent = r.hero_sous_titre;
      sous.hidden = !r.hero_sous_titre;
    }

    /* Le repère de la crête. Il dit le pays servi et le délai RÉEL, lus
       sur le marché que le serveur a résolu — pas sur une phrase écrite
       dans le HTML. L'ancien ruban annonçait « LIVRÉ EN 48 H » : faux en
       Tunisie (« 2 à 4 jours ouvrables ») comme aux Émirats (« environ
       une semaine »).

       Si le délai n'est pas renseigné, le repère entier disparaît et il
       ne reste que la ligne de crête. Mieux vaut un bloc muet qu'un bloc
       qui annonce « Livraison — » suivi de rien. */
    const repere = document.querySelector('[data-crete]');
    if (repere) {
      const m = donnees.marche || {};
      const delai = T(String(m.delai_livraison || '').trim());
      const pays = T(String(m.nom || '').trim());
      if (delai) {
        /* « Livraison — <délai> » : le tiret évite la préposition. « en
           environ une semaine » et « aux Émirats » sont les deux pièges
           déjà rencontrés sur les pages légales — le genre et la forme du
           pays ne sont pas devinables depuis un champ libre. */
        repere.querySelector('[data-crete-pays]').textContent =
          pays ? T('Livraison —') + ' ' + pays : T('Livraison');
        repere.querySelector('[data-crete-delai]').textContent = delai;
        repere.hidden = false;
      }
    }

    const cible = document.querySelector('[data-vitrine]');
    try {
      let produits = await window.ATLAS.api('/produits?avant=1');
      if (!produits.length) produits = await window.ATLAS.api('/produits');
      cible.innerHTML = '';
      if (!produits.length) {
        cible.innerHTML = `<p class="texte-gris">${T('Le catalogue arrive très bientôt.')}</p>`;
        return;
      }
      produits.slice(0, 8).forEach((p) => cible.appendChild(window.carteProduit(p)));
    } catch (e) {
      cible.innerHTML = `<p class="texte-gris">${T('Impossible de charger la collection pour le moment.')}</p>`;
    }
  });
})();
