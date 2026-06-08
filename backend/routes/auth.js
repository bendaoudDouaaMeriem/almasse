const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
  }
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ success: true, token, expiresIn: 28800, username: user.username });
  });
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  const token = req.headers['authorization'].split(' ')[1];
  db.run('INSERT OR IGNORE INTO revoked_tokens (token) VALUES (?)', [token], () => {
    res.json({ success: true });
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.admin.username, role: req.admin.role });
});

// POST /api/auth/change-username
router.post('/change-username', requireAuth, (req, res) => {
  const { newUsername } = req.body;
  if (!newUsername || newUsername.length < 3) {
    return res.status(400).json({ error: 'Nom d’utilisateur trop court (min 3 caractères)' });
  }
  db.run('UPDATE users SET username = ? WHERE id = ?', [newUsername, req.admin.id], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Nom d’utilisateur déjà pris' });
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, newUsername });
  });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });
  }
  db.get('SELECT password FROM users WHERE id = ?', [req.admin.id], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user || !bcrypt.compareSync(oldPassword, user.password)) {
      return res.status(401).json({ error: 'Ancien mot de passe incorrect' });
    }
    const hashed = bcrypt.hashSync(newPassword, 10);
    db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, req.admin.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

module.exports = router;