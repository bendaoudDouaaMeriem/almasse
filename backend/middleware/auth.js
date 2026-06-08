// middleware/auth.js — Vérification JWT
const jwt = require('jsonwebtoken');
const db = require('../db');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  const token = header.split(' ')[1];

  // Vérifier si token révoqué
  db.get('SELECT token FROM revoked_tokens WHERE token = ?', [token], (err, row) => {
    if (row) return res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' });

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.admin = decoded;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
  });
}

module.exports = requireAuth;