'use strict';
/**
 * LES ALERTES DE COMMANDE.
 *
 * Avec le paiement à la livraison, une commande qui attend deux heures
 * avant d'être confirmée par téléphone est une commande qui s'annule. Le
 * commerçant doit savoir tout de suite, sans avoir à ouvrir son écran
 * d'administration.
 *
 * TROIS RÈGLES, dont dépend la fiabilité de la boutique.
 *
 * 1. UNE ALERTE NE DOIT JAMAIS FAIRE ÉCHOUER UNE COMMANDE. Telegram peut
 *    être lent, indisponible, bloqué par un pare-feu. Si l'envoi se
 *    faisait avant la réponse au client, une panne chez eux deviendrait
 *    une panne chez nous : le client verrait une erreur alors que sa
 *    commande est enregistrée. L'envoi part donc APRÈS la réponse, et
 *    toute erreur est journalisée sans jamais remonter.
 *
 * 2. LE JETON EST UN SECRET. Il est rangé dans les réglages, comme le
 *    reste, mais il ne sort JAMAIS par reglages.publics() : qui le
 *    possède peut écrire à la place du commerçant. C'est pour ça qu'il
 *    n'apparaît nulle part dans ce fichier en clair, et que la vitrine ne
 *    le reçoit pas.
 *
 * 3. AUCUNE DÉPENDANCE AJOUTÉE. Un appel HTTPS avec le module intégré de
 *    Node suffit. Installer une bibliothèque pour écrire vingt lignes,
 *    c'est ajouter à la boutique une chose de plus qui peut casser le
 *    jour d'une mise à jour.
 */
const https = require('node:https');
const reglages = require('./reglages');

/* Six secondes. Au-delà, on abandonne : l'alerte a raté, ce n'est pas une
   raison pour garder une connexion ouverte indéfiniment sur le serveur. */
const DELAI = 6000;

/** Échappe ce que Telegram interprète comme du balisage. */
const ech = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Envoie un message. Résout toujours — jamais de rejet — avec le détail
 * de ce qui s'est passé, pour que l'appelant puisse l'afficher (bouton
 * d'essai) ou l'ignorer (commande réelle).
 */
function envoyer(texte) {
  return new Promise((resolve) => {
    const jeton = String(reglages.get('telegram_token') || '').trim();
    const salon = String(reglages.get('telegram_chat') || '').trim();
    if (!jeton || !salon) return resolve({ ok: false, erreur: 'non configuré' });

    const corps = JSON.stringify({
      chat_id: salon,
      text: texte,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${jeton}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corps) },
      timeout: DELAI,
    }, (rep) => {
      let brut = '';
      rep.on('data', (m) => { brut += m; });
      rep.on('end', () => {
        try {
          const j = JSON.parse(brut);
          /* Telegram répond 200 avec « ok: false » quand le salon est
             inconnu ou le bot bloqué. Se fier au seul code HTTP ferait
             croire que tout va bien pendant qu'aucun message n'arrive. */
          if (j && j.ok) return resolve({ ok: true });
          resolve({ ok: false, erreur: (j && j.description) || 'refus de Telegram' });
        } catch {
          resolve({ ok: false, erreur: `réponse illisible (HTTP ${rep.statusCode})` });
        }
      });
    });

    req.on('timeout', () => { req.destroy(); resolve({ ok: false, erreur: 'délai dépassé' }); });
    req.on('error', (e) => resolve({ ok: false, erreur: e.message }));
    req.write(corps);
    req.end();
  });
}

/** Le message d'essai, pour vérifier AVANT la première vraie commande. */
function essai() {
  return envoyer(
    '<b>ATLAS STREETWEAR</b>\n'
    + 'Message d\'essai. Si vous lisez ceci, les alertes de commande fonctionnent.'
  );
}

/**
 * Le texte de l'alerte, fabriqué à part de l'envoi.
 *
 * Séparé pour pouvoir être LU et vérifié sans rien envoyer à personne :
 * un message d'alerte se relit, comme une page. C'est aussi ce qui permet
 * de contrôler que les caractères d'un nom (« Ben <Salah> ») ne cassent
 * pas la mise en forme de Telegram.
 */
function messageCommande(c) {
  const lignes = (c.lignes || [])
    .map((l) => `• ${ech(l.nom)} · ${ech(l.taille)} × ${l.quantite}`)
    .join('\n');

  const texte = [
    `<b>Nouvelle commande — ${ech(c.reference)}</b>`,
    `${ech(c.pays)} · <b>${ech(c.total)}</b>`,
    '',
    `<b>${ech(c.nom)}</b>`,
    /* Le téléphone en clair, sur sa propre ligne : c'est le geste
       suivant. Un numéro noyé dans une phrase ne se copie pas d'un
       appui sur un téléphone. */
    `${ech(c.telephone)}`,
    `${ech(c.adresse)}`,
    `${ech(c.ville)}${c.region ? ', ' + ech(c.region) : ''}`,
    '',
    lignes,
    c.note ? `\n<i>Note : ${ech(c.note)}</i>` : '',
  ].filter((x) => x !== null && x !== undefined).join('\n');
  return texte;
}

/**
 * L'alerte d'une nouvelle commande. Ne renvoie rien et n'attend rien :
 * on l'appelle et on passe à autre chose.
 */
function nouvelleCommande(c) {
  envoyer(messageCommande(c)).then((r) => {
    if (!r.ok && r.erreur !== 'non configuré') {
      /* Journalisé, jamais remonté au client : sa commande est passée.
         « journalctl -u atlas » montre la ligne si une alerte manque. */
      console.warn(`  alerte commande ${c.reference} non envoyée : ${r.erreur}`);
    }
  });
}

module.exports = { envoyer, essai, nouvelleCommande, messageCommande };
