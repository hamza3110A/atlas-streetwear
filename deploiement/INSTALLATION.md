# Mise en production — ATLAS STREETWEAR

VPS Ubuntu LTS. Pas d'hébergement mutualisé : il faut Node, un processus
permanent et un disque inscriptible — trois choses qu'un mutualisé ne donne pas.

Comptez trente minutes. Les commandes sont à exécuter dans l'ordre.

---

## 1. Accès au serveur, avant tout le reste

L'ordre de cette section n'est pas négociable : on ouvre SSH dans le pare-feu
**avant** d'allumer le pare-feu, et on installe sa clé **avant** de couper le
mot de passe. L'inverse vous enferme dehors.

```bash
# --- depuis VOTRE machine : envoyer votre clé publique ---
ssh-copy-id root@IP_DU_SERVEUR
# vérifiez que ça marche AVANT de continuer :
ssh root@IP_DU_SERVEUR
```

```bash
# --- sur le serveur ---
apt update && apt upgrade -y

# 1) autoriser SSH d'abord
ufw allow OpenSSH
ufw allow 'Nginx Full'
# 2) seulement maintenant, activer
ufw enable
ufw status
```

Une fois la connexion par clé confirmée, coupez le mot de passe :

```bash
nano /etc/ssh/sshd_config
#   PasswordAuthentication no
#   PermitRootLogin prohibit-password
systemctl restart ssh
```

> Gardez la session SSH actuelle **ouverte** pendant que vous testez une
> nouvelle connexion dans un second terminal. Si elle échoue, vous avez encore
> la première pour réparer.

---

## 2. Node 22 et nginx

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs nginx zip
node -v      # doit afficher v22.x ou plus
```

Node 22.5 minimum : c'est la version qui apporte `node:sqlite`, le module
SQLite intégré. Rien à compiler, donc rien qui casse à l'installation.

---

## 3. Utilisateur dédié et dépôt des fichiers

```bash
adduser --system --group --home /var/www/atlas atlas
mkdir -p /var/www/atlas
```

Depuis votre machine, envoyez l'archive **d'installation** :

```bash
scp livraison/atlas-installation-*.zip root@IP_DU_SERVEUR:/tmp/
```

Sur le serveur :

```bash
cd /var/www/atlas
unzip /tmp/atlas-installation-*.zip
npm ci --omit=dev
chown -R atlas:atlas /var/www/atlas
```

---

## 4. Installation de la boutique

```bash
cd /var/www/atlas
sudo -u atlas npm run installer
```

Le script :

- crée `data/boutique.db` ;
- génère un `.env` avec une **clé de session unique à cette installation** ;
- vous demande l'e-mail, le nom et le mot de passe du **compte du commerçant** ;
- insère un catalogue de démonstration **uniquement si la base est vide**.

Pour installer sans données de démonstration : `sudo -u atlas npm run installer -- --vide`.

---

## 5. Service permanent

```bash
cp deploiement/atlas.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now atlas
systemctl status atlas          # doit afficher « active (running) »
journalctl -u atlas -f          # les journaux en direct
```

`Restart=always` : le site remonte seul après un plantage ou un redémarrage.

---

## 6. nginx en façade

```bash
cp deploiement/nginx-atlas.conf /etc/nginx/sites-available/atlas
nano /etc/nginx/sites-available/atlas       # remplacez le nom de domaine
ln -s /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Deux réglages comptent vraiment dans ce fichier :

- `client_max_body_size 12M` — plus haut que les 8 Mo acceptés par
  l'application. Trop bas, l'envoi d'une photo échoue avec un 413 que
  personne ne sait interpréter.
- `proxy_set_header X-Forwarded-Proto $scheme` — c'est cet en-tête qui dit à
  l'application si la requête est arrivée en HTTPS, et donc si le cookie de
  session doit porter le drapeau `Secure`. Sans lui, la connexion à
  l'administration « réussit » puis renvoie à l'écran de connexion, sans
  aucun message d'erreur.

---

## 7. HTTPS

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d atlastreetwear.com -d www.atlastreetwear.com
```

Choisissez la **redirection automatique** vers HTTPS quand certbot la propose.
Le renouvellement est automatique ; vérifiez-le une fois :

```bash
certbot renew --dry-run
```

Après certbot, relisez le bloc `listen 443` et confirmez que la ligne
`proxy_set_header X-Forwarded-Proto $scheme;` y figure toujours.

---

## 8. Sauvegarde quotidienne

```bash
cp deploiement/atlas-sauvegarde.service /etc/systemd/system/
cp deploiement/atlas-sauvegarde.timer   /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now atlas-sauvegarde.timer
systemctl list-timers atlas-sauvegarde   # vérifie la prochaine exécution
```

La sauvegarde utilise `VACUUM INTO` : elle s'exécute **pendant** que le site
tourne, sans interruption, et produit une base cohérente. Un simple `cp` du
fichier `.db` sur une base en mode WAL peut produire une copie incomplète.

Les copies restent sur le serveur (30 dernières). **Récupérez-en une hors du
serveur régulièrement** : une sauvegarde qui vit sur la machine qui brûle ne
sauve rien.

```bash
# depuis votre machine, une fois par semaine
rsync -av root@IP_DU_SERVEUR:/var/www/atlas/data/sauvegardes/ ./sauvegardes-atlas/
```

---

## 9. Restaurer une sauvegarde

```bash
systemctl stop atlas
cd /var/www/atlas/data
cp boutique.db boutique-avant-restauration.db     # filet de sécurité
cp sauvegardes/boutique-2026-08-23-03-30-00.db boutique.db
rm -f boutique.db-wal boutique.db-shm             # journaux devenus incohérents
chown atlas:atlas boutique.db
systemctl start atlas
```

---

## 10. Mettre à jour plus tard

Utilisez l'archive **de mise à jour**. Elle ne contient ni `data/` ni `.env` :
c'est ce qui empêche d'écraser la base de production en dézippant.

```bash
systemctl stop atlas
cd /var/www/atlas
sudo -u atlas npm run sauvegarde        # d'abord une sauvegarde
unzip -o /tmp/atlas-mise-a-jour-*.zip
npm ci --omit=dev
sudo -u atlas npm run installer         # applique les nouvelles tables, garde les données
chown -R atlas:atlas /var/www/atlas
systemctl start atlas
journalctl -u atlas -n 30
```

`npm run installer` est sans danger sur une base existante : toutes les
instructions du schéma sont en `IF NOT EXISTS`, et le script détecte qu'il y a
déjà un catalogue pour ne rien insérer.

---

## Vérifications après mise en ligne

```bash
# depuis votre machine
node scripts/verif-securite.js https://atlastreetwear.com admin@… motdepasse
node scripts/verif-navigateur.js https://atlastreetwear.com
```

Et à la main, dans un navigateur :

1. la page d'accueil s'affiche en HTTPS, cadenas fermé ;
2. `/admin` demande une connexion ;
3. la connexion aboutit **et reste** (si elle vous renvoie à l'écran de
   connexion, lisez le diagnostic affiché sous le bouton) ;
4. une commande d'essai passe de bout en bout ;
5. `https://atlastreetwear.com/.env` répond 404 ;
6. l'interrupteur « boutique fermée » renvoie bien un code 503 :
   `curl -I https://atlastreetwear.com`.

---

## Dépannage

| Symptôme | Cause la plus fréquente |
|---|---|
| Connexion admin qui boucle | `X-Forwarded-Proto` absent du bloc nginx en 443 |
| 413 à l'envoi d'une photo | `client_max_body_size` trop bas |
| 502 Bad Gateway | service arrêté → `systemctl status atlas` |
| « Permission denied » à la mise à jour | droits perdus → `chown -R atlas:atlas /var/www/atlas` |
| Site lent au premier chargement | normal : les polices se mettent en cache ensuite |
| Modification invisible dans l'admin | rechargement forcé : `Ctrl+F5` |
