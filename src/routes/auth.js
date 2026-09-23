'use strict';
const express = require('express');
const db = require('../db');
const auth = require('../lib/auth');
const limite = require('../lib/limite');
const { valider, connexion, motDePasse } = require('../lib/schemas');

const r = express.Router();

r.post('/api/connexion', limite.connexion, valider(connexion), (req, res) => {
  const { email, mot_de_passe } = req.donnees;
  const u = auth.verifier(email, mot_de_passe);
  if (!u) {
    // Message unique : ne jamais distinguer « e-mail inconnu » de
    // « mot de passe faux », sinon on offre un annuaire des comptes.
    return res.status(401).json({ erreur: 'E-mail ou mot de passe incorrect.' });
  }
  const id = auth.creerSession(u.id, req.ip, req.headers['user-agent']);
  db.run("UPDATE utilisateurs SET derniere_connexion = datetime('now') WHERE id = ?", u.id);
  auth.poserCookie(req, res, id);
  limite.reinitialiser(req, email);

  res.json({
    ok: true,
    utilisateur: { id: u.id, nom: u.nom, email: u.email, role: u.role },
    // Diagnostic honnête : si la page dit « connecté » puis vous renvoie
    // ici, c'est que le cookie n'a pas été gardé. cookie_secure indique
    // ce que le serveur a demandé, d'après le protocole réel de CETTE
    // requête — pas d'après une variable d'environnement.
    cookie_secure: auth.requeteSecurisee(req),
  });
});

r.post('/api/deconnexion', (req, res) => {
  auth.detruireSession(req.cookies[auth.NOM_COOKIE]);
  auth.retirerCookie(req, res);
  res.json({ ok: true });
});

r.get('/api/session', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ connecte: !!req.utilisateur, utilisateur: req.utilisateur });
});

r.post('/api/mot-de-passe', auth.exigerAdmin, valider(motDePasse), (req, res) => {
  const u = auth.verifier(req.utilisateur.email, req.donnees.actuel);
  if (!u) return res.status(401).json({ erreur: 'Mot de passe actuel incorrect.' });

  db.run('UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?', auth.hacher(req.donnees.nouveau), u.id);
  // Toutes les autres sessions tombent : c'est l'intérêt d'une session en
  // base plutôt qu'un JWT. Un jeton signé resterait valable jusqu'à son
  // expiration, même après un changement de mot de passe.
  auth.detruireSessionsUtilisateur(u.id);
  const nouvelle = auth.creerSession(u.id, req.ip, req.headers['user-agent']);
  auth.poserCookie(req, res, nouvelle);
  res.json({ ok: true, message: 'Mot de passe changé. Les autres appareils ont été déconnectés.' });
});

module.exports = r;
