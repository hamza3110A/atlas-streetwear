# ATLAS STREETWEAR — boutique en ligne

Boutique complète pour une marque de streetwear tunisienne : vitrine,
panier, commande en paiement à la livraison, et une administration que le
commerçant utilise seul, sans jamais ouvrir un fichier de code.

**Node.js + Express + SQLite. Pas de framework front, pas d'étape de
compilation, pas de service tiers.** Un `git clone`, un `npm install`, un
`npm start`.

---

## Démarrer en trois commandes

```bash
npm install
npm run installer     # crée la base, la clé de session, le compte admin
npm start
```

- Boutique : <http://localhost:3000>
- Administration : <http://localhost:3000/admin>

---

## Ce qui est fait, et pourquoi

### Aucune compilation nulle part

`node:sqlite`, le module intégré à Node 22.5+, plutôt que `better-sqlite3` :
ce dernier exige un compilateur C++, et sur un Windows sans Visual Studio,
`npm install` échoue. Un adaptateur (`src/db/index.js`) bascule
automatiquement sur `better-sqlite3` s'il est installé — même interface,
aucune ligne à changer ailleurs.

Même raison pour `bcryptjs` plutôt que `bcrypt` : du JavaScript pur, même
algorithme, même coût 12.

Côté navigateur : HTML, CSS et JavaScript natif. Pas de React, pas de
Tailwind, pas de `npm run build`. Le prochain prestataire ouvre un fichier
et comprend.

### Helvetica, servie honnêtement

La maquette est composée en Helvetica. Helvetica ne se redistribue pas :
la fonte est sous licence, impossible de la poser sur un serveur. Le site
sert donc **Nimbus Sans** (URW), le clone d'Helvetica aux mêmes métriques
et au même dessin, libre de redistribution — 23 Ko par graisse — et laisse
la vraie Helvetica passer devant si le visiteur l'a déjà (Mac, iPhone).

Détail qui compte : sous Windows, demander « Helvetica » en CSS renvoie
Arial. C'est pourquoi la fonte du site est nommée **en premier** dans la
pile. Sans ça, les trois quarts des visiteurs verraient de l'Arial : même
largeur, mais jambe du R courbée et terminaisons du S inclinées — ce n'est
plus le dessin de la maquette.

### Une seule base, un seul fichier

Treize tables dans `data/boutique.db`. Une sauvegarde = une copie de
fichier. Un seul processus sert le site, l'API et les images.

### Le serveur recalcule tout

Le navigateur envoie des identifiants d'article et des quantités. **Rien
d'autre ne compte.** Prix, frais de livraison, remise et total sont relus
en base et recalculés par `src/lib/tarification.js`. Truquez un prix dans
le panier : la commande enregistrée est au bon montant. C'est vérifié par
`npm run verif:securite`.

### Trois décisions de modèle qui évitent des dégâts

| Décision | Ce qu'elle évite |
|---|---|
| `lignes_commande` fige nom, taille et prix | Changer un prix demain ne réécrit pas l'historique comptable d'hier |
| `commandes.stock_retire` | Confirmer deux fois une commande ne retire pas le stock deux fois |
| `clients.telephone` en index unique | Sans compte client, le téléphone est la seule identité fiable |

---

## Les scripts

| Commande | Ce qu'elle fait |
|---|---|
| `npm start` | Lance le site |
| `npm run dev` | Idem, avec redémarrage automatique à chaque modification |
| `npm run installer` | Crée / met à jour la base. Sans danger sur une base pleine |
| `npm run installer -- --vide` | Idem, sans catalogue de démonstration |
| `npm run sauvegarde` | Sauvegarde à chaud (`VACUUM INTO`), garde les 30 dernières |
| `npm run archives` | Produit les deux archives de livraison |
| `npm run verif:securite` | Attaque le site : prix truqués, énumération de comptes, accès admin |
| `npm run verif:navigateur` | Parcourt la vitrine dans un vrai navigateur et passe une commande |
| `npm run verif:admin` | Parcourt l'administration et vérifie la règle du stock |

Les trois scripts de vérification demandent le serveur démarré.

---

## Organisation des fichiers

```
src/
  server.js              un seul processus : site, API, images
  db/schema.sql          les 13 tables, commentées
  db/index.js            adaptateur node:sqlite ↔ better-sqlite3
  lib/auth.js            sessions en base, bcrypt 12, cookie Secure
  lib/tarification.js    LE recalcul serveur des montants
  lib/schemas.js         validation zod, messages en français
  lib/images.js          réencodage sharp, noms aléatoires
  lib/limite.js          limitation de débit
  lib/reglages.js        clé/valeur, avec cache
  routes/                auth · public · admin
public/
  *.html                 la vitrine
  css/atlas.css          toute la vitrine, une seule feuille
  js/atlas.js            en-tête, tiroir, panier — chargé partout
  admin/                 les neuf écrans d'administration
  fonts/                 polices auto-hébergées, aucun appel externe
scripts/                 installateur, sauvegarde, archives, vérifications
deploiement/             systemd, nginx, marche à suivre VPS
data/                    base, photos, sauvegardes  (jamais versionné)
```

---

## Sécurité — ce qui est en place

- **Recalcul serveur** de tous les montants.
- **Sessions en base**, pas de JWT : révocation immédiate possible.
- **Cookie `Secure` décidé sur le protocole réel** de la requête
  (`req.secure` / `X-Forwarded-Proto`), jamais sur `NODE_ENV`.
- **bcrypt coût 12**, avec comparaison leurre quand le compte n'existe pas :
  le temps de réponse ne révèle pas quels e-mails existent.
- **Limitation de débit** : 5 connexions / 15 min, 8 commandes / heure.
- **Images réencodées par sharp** avant écriture, nom de fichier aléatoire.
  sharp ≥ 0.34 exigé (la branche 0.33 traîne des CVE libvips).
- **Validation zod** à l'entrée de chaque route.
- **CSP, X-Frame-Options, nosniff, Referrer-Policy** sur toutes les réponses.
- **`data/` et `.env` hors du dossier servi** : on ne publie jamais la base.

`npm run verif:securite` rejoue tout ça et affiche un rapport.

---

## Pour le commerçant

Un guide illustré, avec de vraies captures d'écran, est intégré à
l'administration : menu de gauche → **Guide du site**. Il est imprimable.
Rien à retrouver dans une boîte mail.

---

## Mise en production

Tout est dans `deploiement/INSTALLATION.md` : VPS Ubuntu, systemd avec
`Restart=always`, nginx, Let's Encrypt, ufw, sauvegarde quotidienne.

**Deux archives sont produites, et ce n'est pas un détail :**

- `atlas-installation-*.zip` — tout, pour une première mise en place ;
- `atlas-mise-a-jour-*.zip` — le code seul, **sans `data/` ni `.env`**.

Parce qu'un jour quelqu'un dézippera l'archive complète sur un serveur en
production « pour mettre à jour » et effacera six mois de commandes. La
seule protection qui tienne, c'est que le fichier de mise à jour ne
contienne pas la base.
