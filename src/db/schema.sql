-- ============================================================
--  ATLAS STREETWEAR — schéma de la boutique
--  Une seule base, un seul fichier. Une sauvegarde = une copie.
-- ============================================================
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 1. RAYONS ---------------------------------------------------
-- Le menu du site se déduit de cette table : le commerçant crée
-- un rayon, il apparaît tout seul dans la navigation.
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nom         TEXT    NOT NULL,
  slug        TEXT    NOT NULL UNIQUE,
  description TEXT    NOT NULL DEFAULT '',
  ordre       INTEGER NOT NULL DEFAULT 0,
  visible     INTEGER NOT NULL DEFAULT 1,
  cree_le     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 2. PRODUITS -------------------------------------------------
-- prix et prix_barre en MILLIMES (entiers). Jamais de flottant
-- sur de l'argent : 0.1 + 0.2 != 0.3 en virgule flottante.
CREATE TABLE IF NOT EXISTS produits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  categorie_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  nom           TEXT    NOT NULL,
  slug          TEXT    NOT NULL UNIQUE,
  reference     TEXT    NOT NULL DEFAULT '',
  description   TEXT    NOT NULL DEFAULT '',
  matiere       TEXT    NOT NULL DEFAULT '',
  prix          INTEGER NOT NULL,
  prix_barre    INTEGER,
  actif         INTEGER NOT NULL DEFAULT 1,
  mis_en_avant  INTEGER NOT NULL DEFAULT 0,
  ordre         INTEGER NOT NULL DEFAULT 0,
  cree_le       TEXT    NOT NULL DEFAULT (datetime('now')),
  modifie_le    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_produits_cat    ON produits(categorie_id);
CREATE INDEX IF NOT EXISTS idx_produits_actif  ON produits(actif);

-- 3. VARIANTES (tailles) --------------------------------------
CREATE TABLE IF NOT EXISTS variantes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  produit_id  INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  taille      TEXT    NOT NULL,
  sku         TEXT    NOT NULL DEFAULT '',
  stock       INTEGER NOT NULL DEFAULT 0,
  ordre       INTEGER NOT NULL DEFAULT 0,
  UNIQUE(produit_id, taille)
);
CREATE INDEX IF NOT EXISTS idx_variantes_produit ON variantes(produit_id);

-- 4. IMAGES ---------------------------------------------------
CREATE TABLE IF NOT EXISTS images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  produit_id  INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  fichier     TEXT    NOT NULL,
  alt         TEXT    NOT NULL DEFAULT '',
  ordre       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_images_produit ON images(produit_id);

-- 5. POINTS FORTS (arguments produit) -------------------------
CREATE TABLE IF NOT EXISTS points_forts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  produit_id  INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  texte       TEXT    NOT NULL,
  ordre       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pf_produit ON points_forts(produit_id);

-- 6. CLIENTS --------------------------------------------------
-- Le téléphone est UNIQUE : dans un pays où l'on commande sans
-- créer de compte, c'est la seule identité fiable. Deux commandes
-- du même numéro = le même client, son historique se construit seul.
CREATE TABLE IF NOT EXISTS clients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  telephone     TEXT    NOT NULL UNIQUE,
  nom           TEXT    NOT NULL,
  email         TEXT    NOT NULL DEFAULT '',
  adresse       TEXT    NOT NULL DEFAULT '',
  ville         TEXT    NOT NULL DEFAULT '',
  gouvernorat   TEXT    NOT NULL DEFAULT '',
  code_postal   TEXT    NOT NULL DEFAULT '',
  note          TEXT    NOT NULL DEFAULT '',
  cree_le       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 7. COMMANDES ------------------------------------------------
-- stock_retire : trace si le stock a DÉJÀ été décrémenté pour
-- cette commande. Sans ce booléen, confirmer deux fois une
-- commande retire le stock deux fois.
CREATE TABLE IF NOT EXISTS commandes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  reference         TEXT    NOT NULL UNIQUE,
  client_id         INTEGER REFERENCES clients(id) ON DELETE RESTRICT,
  statut            TEXT    NOT NULL DEFAULT 'nouvelle',
  -- coordonnées figées au moment de l'achat
  nom               TEXT    NOT NULL,
  telephone         TEXT    NOT NULL,
  email             TEXT    NOT NULL DEFAULT '',
  adresse           TEXT    NOT NULL,
  ville             TEXT    NOT NULL,
  gouvernorat       TEXT    NOT NULL,
  code_postal       TEXT    NOT NULL DEFAULT '',
  note_client       TEXT    NOT NULL DEFAULT '',
  note_interne      TEXT    NOT NULL DEFAULT '',
  -- montants en millimes, TOUS recalculés par le serveur
  sous_total        INTEGER NOT NULL,
  frais_livraison   INTEGER NOT NULL DEFAULT 0,
  remise            INTEGER NOT NULL DEFAULT 0,
  total             INTEGER NOT NULL,
  promotion_id      INTEGER REFERENCES promotions(id) ON DELETE SET NULL,
  code_promo        TEXT    NOT NULL DEFAULT '',
  mode_paiement     TEXT    NOT NULL DEFAULT 'livraison',
  stock_retire      INTEGER NOT NULL DEFAULT 0,
  ip                TEXT    NOT NULL DEFAULT '',
  cree_le           TEXT    NOT NULL DEFAULT (datetime('now')),
  modifie_le        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_commandes_statut ON commandes(statut);
CREATE INDEX IF NOT EXISTS idx_commandes_client ON commandes(client_id);
CREATE INDEX IF NOT EXISTS idx_commandes_date   ON commandes(cree_le);

-- 8. LIGNES DE COMMANDE ---------------------------------------
-- On FIGE nom, taille et prix unitaire. Si le commerçant change
-- son prix demain, les anciennes commandes gardent le bon montant.
-- Sans ça, tout l'historique comptable est faux.
CREATE TABLE IF NOT EXISTS lignes_commande (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  commande_id     INTEGER NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  produit_id      INTEGER REFERENCES produits(id) ON DELETE SET NULL,
  variante_id     INTEGER REFERENCES variantes(id) ON DELETE SET NULL,
  nom_produit     TEXT    NOT NULL,
  taille          TEXT    NOT NULL,
  reference       TEXT    NOT NULL DEFAULT '',
  image           TEXT    NOT NULL DEFAULT '',
  prix_unitaire   INTEGER NOT NULL,
  quantite        INTEGER NOT NULL,
  total_ligne     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lignes_commande ON lignes_commande(commande_id);

-- 9. PROMOTIONS -----------------------------------------------
CREATE TABLE IF NOT EXISTS promotions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT    NOT NULL UNIQUE,
  libelle         TEXT    NOT NULL DEFAULT '',
  type            TEXT    NOT NULL DEFAULT 'pourcentage', -- pourcentage | montant | livraison
  valeur          INTEGER NOT NULL DEFAULT 0,
  minimum_achat   INTEGER NOT NULL DEFAULT 0,
  portee          TEXT    NOT NULL DEFAULT 'panier',      -- panier | produits | categories
  debut_le        TEXT,
  fin_le          TEXT,
  usage_max       INTEGER NOT NULL DEFAULT 0,             -- 0 = illimité
  usage_actuel    INTEGER NOT NULL DEFAULT 0,
  actif           INTEGER NOT NULL DEFAULT 1,
  cree_le         TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 10. CIBLES DES PROMOTIONS -----------------------------------
CREATE TABLE IF NOT EXISTS promotions_cibles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  promotion_id  INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  cible_type    TEXT    NOT NULL,   -- produit | categorie
  cible_id      INTEGER NOT NULL,
  UNIQUE(promotion_id, cible_type, cible_id)
);

-- 11. UTILISATEURS (administration) ---------------------------
CREATE TABLE IF NOT EXISTS utilisateurs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT    NOT NULL UNIQUE,
  nom               TEXT    NOT NULL,
  mot_de_passe      TEXT    NOT NULL,   -- bcrypt, coût 12
  role              TEXT    NOT NULL DEFAULT 'admin',
  actif             INTEGER NOT NULL DEFAULT 1,
  derniere_connexion TEXT,
  cree_le           TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 12. SESSIONS ------------------------------------------------
-- En base, pas de JWT : une session doit pouvoir être révoquée
-- instantanément (mot de passe changé, appareil perdu).
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT    PRIMARY KEY,
  utilisateur_id  INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  expire_le       TEXT    NOT NULL,
  ip              TEXT    NOT NULL DEFAULT '',
  agent           TEXT    NOT NULL DEFAULT '',
  cree_le         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(utilisateur_id);

-- 13. RÉGLAGES ------------------------------------------------
CREATE TABLE IF NOT EXISTS reglages (
  cle         TEXT PRIMARY KEY,
  valeur      TEXT NOT NULL DEFAULT '',
  modifie_le  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 14. VISITES -------------------------------------------------
-- Statistiques hébergées ICI, pas chez Google.
--
-- Aucune adresse IP n'est enregistrée. Le « visiteur » est une empreinte
-- calculée à partir de l'IP, du navigateur et d'un sel qui CHANGE CHAQUE
-- JOUR : elle permet de compter les personnes distinctes dans la journée,
-- et devient inutilisable le lendemain. On ne peut donc ni suivre
-- quelqu'un dans le temps, ni remonter à une personne. C'est aussi
-- pourquoi le site n'a besoin d'aucune bannière de cookies : il n'en pose
-- aucun pour mesurer.
--
-- Le comptage se fait côté SERVEUR, au moment où la page est servie.
-- Un script de mesure dans la page serait bloqué par un bloqueur de
-- publicité sur une bonne partie des visiteurs — le commerçant verrait
-- alors des chiffres faux sans jamais savoir de combien.
CREATE TABLE IF NOT EXISTS visites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  jour        TEXT    NOT NULL,              -- AAAA-MM-JJ, pour regrouper vite
  horodatage  TEXT    NOT NULL DEFAULT (datetime('now')),
  chemin      TEXT    NOT NULL,              -- /boutique, /produit/…
  produit_id  INTEGER REFERENCES produits(id) ON DELETE SET NULL,
  visiteur    TEXT    NOT NULL,              -- empreinte du jour, jamais une IP
  source      TEXT    NOT NULL DEFAULT 'direct',   -- instagram, google, facebook…
  appareil    TEXT    NOT NULL DEFAULT 'ordinateur'
);
CREATE INDEX IF NOT EXISTS idx_visites_jour    ON visites(jour);
CREATE INDEX IF NOT EXISTS idx_visites_chemin  ON visites(jour, chemin);
CREATE INDEX IF NOT EXISTS idx_visites_produit ON visites(produit_id);

-- 15. RÉSUMÉ QUOTIDIEN ----------------------------------------
-- Le détail des visites est purgé au-delà de 180 jours : une boutique à
-- 1 000 visites par jour produirait 365 000 lignes par an, et le
-- commerçant n'a aucun usage du chemin exact d'un visiteur de l'an
-- dernier. Ce résumé-ci, lui, est minuscule (une ligne par jour) et se
-- garde indéfiniment : c'est lui qui permettra de comparer un mois de
-- mars à celui de l'année précédente.
CREATE TABLE IF NOT EXISTS visites_jour (
  jour        TEXT    PRIMARY KEY,
  visites     INTEGER NOT NULL DEFAULT 0,
  visiteurs   INTEGER NOT NULL DEFAULT 0,
  commandes   INTEGER NOT NULL DEFAULT 0,
  chiffre     INTEGER NOT NULL DEFAULT 0    -- en millimes
);

-- 16. MARCHÉS -------------------------------------------------
-- Un marché, c'est un pays servi : sa devise, ses prix, son stock,
-- ses frais et son délai de livraison.
--
-- POURQUOI UNE TABLE ET PAS DEUX COLONNES « _ae » PARTOUT. Le jour où
-- un troisième marché s'ouvre, deux colonnes en deviennent quatre, dans
-- six tables, et chaque requête du site doit être relue. Ici, ouvrir un
-- marché est une ligne insérée.
--
-- DÉCIMALES : le dinar tunisien en a TROIS (89,500 DT), le dirham DEUX
-- (115,25 AED). Tous les montants du site sont des entiers dans la plus
-- petite unité de la devise — millimes ici, fils là. Sans cette colonne,
-- un prix en dirhams serait dix fois trop grand ou trop petit, en
-- silence : l'addition resterait juste, seul le montant serait faux.
CREATE TABLE IF NOT EXISTS marches (
  code                    TEXT    PRIMARY KEY,          -- 'tn', 'ae'
  nom                     TEXT    NOT NULL,
  devise                  TEXT    NOT NULL,             -- 'DT', 'AED'
  decimales               INTEGER NOT NULL DEFAULT 3,
  frais_livraison         INTEGER NOT NULL DEFAULT 0,
  livraison_gratuite_des  INTEGER NOT NULL DEFAULT 0,
  delai_livraison         TEXT    NOT NULL DEFAULT '',
  actif                   INTEGER NOT NULL DEFAULT 0,
  ordre                   INTEGER NOT NULL DEFAULT 0
);

-- 17. PRIX PAR MARCHÉ -----------------------------------------
-- Saisis à la main, jamais convertis. Un taux de change ne connaît ni
-- les frais de douane, ni le coût d'un entrepôt à Dubaï, et il bouge
-- tout seul : il donnerait des prix faux et laids (47,33 AED).
CREATE TABLE IF NOT EXISTS prix_marche (
  produit_id  INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  marche      TEXT    NOT NULL REFERENCES marches(code) ON DELETE CASCADE,
  prix        INTEGER NOT NULL,
  prix_barre  INTEGER,
  PRIMARY KEY (produit_id, marche)
);

-- 18. STOCK PAR MARCHÉ ----------------------------------------
-- Une taille, un entrepôt, une quantité. La colonne variantes.stock
-- reste dans le schéma mais n'est plus lue : elle a servi de source à
-- la migration, et la garder évite de réécrire une base en service.
CREATE TABLE IF NOT EXISTS stock_marche (
  variante_id INTEGER NOT NULL REFERENCES variantes(id) ON DELETE CASCADE,
  marche      TEXT    NOT NULL REFERENCES marches(code) ON DELETE CASCADE,
  stock       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (variante_id, marche)
);
CREATE INDEX IF NOT EXISTS idx_stock_marche ON stock_marche(marche);
