/* Démarre un serveur PROPRE pour la recette, et garantit qu'il est arrêté
   à la fin.
   
   Pourquoi ce n'est pas trivial : la première version se contentait de
   lancer le serveur et d'attendre qu'une réponse arrive sur le port 3000.
   Mais si une exécution précédente avait été interrompue — un pipe fermé,
   un Ctrl+C — son serveur tournait encore et répondait le premier. La
   recette croyait dialoguer avec un serveur neuf et parlait en fait à
   l'ancien, dont les compteurs de limitation de débit étaient déjà
   entamés. Résultat : des HTTP 429 au milieu des tests, un « la boutique
   fermée renvoie 200 » incompréhensible, et une demi-heure à chercher un
   bug qui n'existait pas.
   
   On fait donc le ménage AVANT de démarrer, et on vérifie qu'on parle
   bien au processus qu'on vient de lancer. */
const { spawn, execSync } = require('node:child_process');
const path = require('node:path');
const RACINE = path.join(__dirname, '..', '..');
const PORT = 3000;

function menage() {
  try {
    execSync(`pkill -f "src/server.js" 2>/dev/null || true`, { stdio: 'ignore' });
  } catch { /* rien à tuer */ }
}

async function libre() {
  try { await fetch(`http://localhost:${PORT}/api/boutique`, { signal: AbortSignal.timeout(400) }); return false; }
  catch { return true; }
}

async function demarrer() {
  menage();
  for (let i = 0; i < 20 && !(await libre()); i++) await new Promise((r) => setTimeout(r, 200));
  if (!(await libre())) throw new Error(`Le port ${PORT} reste occupé par un autre processus.`);

  const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.js'],
    { cwd: RACINE, stdio: ['ignore', 'pipe', 'pipe'] });
  let sortie = '';
  p.stdout.on('data', (d) => { sortie += d; });
  p.stderr.on('data', (d) => { sortie += d; });
  p.on('exit', (code) => { if (code) sortie += `\n[serveur sorti avec le code ${code}]`; });

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (p.exitCode !== null) throw new Error('Le serveur s\'est arrêté aussitôt :\n' + sortie);
    try {
      const r = await fetch(`http://localhost:${PORT}/api/boutique`);
      if (r.status < 500 || r.status === 503) return p;
    } catch { /* pas encore prêt */ }
  }
  p.kill('SIGKILL');
  throw new Error('Le serveur n\'a pas répondu en 18 s.\n' + sortie);
}

function arreter(p) {
  try { p.kill('SIGKILL'); } catch { /* déjà mort */ }
  menage();   // et tout ce qui aurait survécu
}

/* Même si le script est interrompu, on ne laisse pas de serveur derrière
   soi : c'est lui qui piégeait la recette suivante. */
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => { menage(); process.exit(130); });
}
process.on('exit', menage);

module.exports = { demarrer, arreter };
