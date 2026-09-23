'use strict';
/**
 * LES PAGES DE LA VITRINE, DANS LA LANGUE DU PAYS SERVI.
 *
 * Traduire la page DANS LE SERVEUR, pas dans le navigateur.
 *
 * La tentation était de traduire en JavaScript au chargement : quelques
 * lignes, rien à faire côté serveur. Elle a été écartée pour une raison
 * qui se voit à l'œil nu. Les scripts de ce site sont chargés en fin de
 * page, et la politique de sécurité interdit tout script écrit dans le
 * HTML (« script-src 'self' »). Un visiteur de Dubaï aurait donc vu la
 * page s'afficher EN FRANÇAIS, puis basculer en anglais un instant plus
 * tard. Sur une connexion lente, cet instant dure.
 *
 * Ici, la page part déjà traduite. Et comme les fichiers sont statiques,
 * la traduction est faite UNE FOIS au premier appel puis gardée en
 * mémoire : le coût par visite est nul.
 *
 * LE TEXTE FRANÇAIS EST LA CLÉ. Aucune annotation n'a été ajoutée dans
 * les douze pages : on compare chaque morceau de texte au dictionnaire.
 * Une phrase absente reste en français — visible, donc corrigeable — au
 * lieu de disparaître. C'est aussi ce qui permet de traduire les phrases
 * coupées en deux par une valeur calculée, que des attributs « data-t »
 * n'auraient pas su découper.
 */
const fs = require('node:fs');
const i18n = require('../../public/js/i18n');

/* Le contenu de ces balises n'est pas du texte affiché : le traduire
   casserait le script ou la feuille de style. */
const OPAQUES = new Set(['script', 'style']);

/* Les attributs qui contiennent une phrase lue par un humain. « title »
   et « alt » y sont pour les mêmes raisons que « placeholder » : ils se
   lisent au survol, au clavier et au lecteur d'écran. */
const ATTRIBUTS = ['placeholder', 'aria-label', 'title', 'alt'];

/**
 * Découpe un document en jetons : balises et morceaux de texte.
 *
 * Écrit à la main plutôt qu'avec une expression régulière du genre
 * /<[^>]*>/ : celle-là se termine au premier « > », y compris s'il est à
 * l'intérieur d'un attribut. Une seule occurrence suffirait à décaler
 * tout le reste du document.
 */
function jetons(html) {
  const out = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      /* UN COMMENTAIRE SE LIT JUSQU'À « --> », PAS AVEC LES RÈGLES D'UNE
         BALISE. Ce fichier-ci et les pages du site sont pleins de
         commentaires en français, donc pleins d'apostrophes. Traités
         comme des guillemets ouvrants, ils faisaient avaler au
         découpeur tout le texte jusqu'à l'apostrophe suivante, et la
         suite du document se retrouvait décalée : l'en-tête d'index.html
         cassait le suivi des balises et le premier lien de la page
         restait en français, sans la moindre erreur. */
      if (html.startsWith('<!--', i)) {
        const f = html.indexOf('-->', i + 4);
        const fin = f === -1 ? html.length : f + 3;
        out.push({ balise: true, commentaire: true, texte: html.slice(i, fin) });
        i = fin;
        continue;
      }
      let j = i + 1;
      let guillemet = null;
      while (j < html.length) {
        const c = html[j];
        if (guillemet) { if (c === guillemet) guillemet = null; }
        else if (c === '"' || c === "'") guillemet = c;
        else if (c === '>') break;
        j++;
      }
      out.push({ balise: true, texte: html.slice(i, Math.min(j + 1, html.length)) });
      i = j + 1;
    } else {
      const j = html.indexOf('<', i);
      const fin = j === -1 ? html.length : j;
      out.push({ balise: false, texte: html.slice(i, fin) });
      i = fin;
    }
  }
  return out;
}

const nomBalise = (t) => {
  const m = /^<\/?\s*([a-zA-Z0-9-]+)/.exec(t);
  return m ? m[1].toLowerCase() : '';
};

/** Traduit les attributs lisibles d'une balise, et la langue du document. */
function traduireBalise(jeton, langue) {
  let t = jeton;
  const nom = nomBalise(t);

  if (nom === 'html') {
    /* Sans cet attribut, le navigateur et les lecteurs d'écran
       prononcent l'anglais avec les règles du français, et la césure des
       mots se fait au mauvais endroit. */
    t = /lang\s*=\s*"[^"]*"/.test(t) ? t.replace(/lang\s*=\s*"[^"]*"/, `lang="${langue}"`)
      : t.replace(/^<html/i, `<html lang="${langue}"`);
  }

  for (const attr of ATTRIBUTS) {
    t = t.replace(new RegExp(`(${attr}\\s*=\\s*")([^"]*)(")`, 'gi'),
      (_, a, valeur, b) => a + echapper(i18n.traduire(desechapper(valeur), langue)) + b);
  }

  /* Les descriptions de partage : ce sont elles qui s'affichent quand le
     lien est collé dans une conversation. */
  if (nom === 'meta' && /(name|property)\s*=\s*"(description|og:description|og:title)"/i.test(t)) {
    t = t.replace(/(content\s*=\s*")([^"]*)(")/i,
      (_, a, valeur, b) => a + echapper(i18n.traduire(desechapper(valeur), langue)) + b);
  }
  return t;
}

/* Le texte d'une page contient des entités (&amp;, &nbsp;, &#39;). Le
   dictionnaire, lui, est écrit en clair. On déchiffre avant de chercher
   et on rechiffre après, sinon « Livraison &amp; retours » ne serait
   jamais trouvé. */
const ENTITES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const desechapper = (s) => String(s).replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITES[m] || m);
const echapper = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Traduit un document entier. Rend la même chaîne si la langue est le français. */
function traduireHtml(html, langue) {
  if (!langue || langue === 'fr') return html;
  let opaque = 0;
  return jetons(html).map((j) => {
    if (j.commentaire) return j.texte;   // un commentaire ne s'affiche pas
    if (j.balise) {
      const nom = nomBalise(j.texte);
      if (OPAQUES.has(nom)) {
        if (j.texte.startsWith('</')) opaque = Math.max(0, opaque - 1);
        else if (!j.texte.endsWith('/>')) opaque++;
      }
      return traduireBalise(j.texte, langue);
    }
    if (opaque) return j.texte;
    return echapper(i18n.traduire(desechapper(j.texte), langue));
  }).join('');
}

/* Les pages sont des fichiers statiques : une fois traduites, elles ne
   changent plus tant que le serveur tourne. On garde donc le résultat.
   Clé : le chemin du fichier plus la langue. */
const memoire = new Map();

/** Le contenu d'une page, dans la langue demandée. */
function page(chemin, langue) {
  const l = i18n.langueValide(langue);
  const cle = `${l}|${chemin}`;
  if (!memoire.has(cle)) {
    const brut = fs.readFileSync(chemin, 'utf8');
    memoire.set(cle, l === 'fr' ? brut : traduireHtml(brut, l));
  }
  return memoire.get(cle);
}

/** Vide le cache — utile aux outils de vérification. */
const oublier = () => memoire.clear();

module.exports = { page, traduireHtml, oublier };
