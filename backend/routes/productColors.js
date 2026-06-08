const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'colors');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `color_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage });

// Récupérer toutes les couleurs d'un produit (public)
router.get('/product/:productId', (req, res) => {
  db.all('SELECT * FROM product_colors WHERE product_id = ? AND active = 1 ORDER BY position', [req.params.productId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ADMIN : créer une couleur
router.post('/', requireAuth, upload.single('image'), (req, res) => {
  const { product_id, color_name, color_hex, active, position } = req.body;
  const imageUrl = req.file ? `/uploads/colors/${req.file.filename}` : null;
  db.run(
    'INSERT INTO product_colors (product_id, color_name, color_hex, image_url, active, position) VALUES (?,?,?,?,?,?)',
    [product_id, color_name, color_hex, imageUrl, active || 1, position || 0],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// ADMIN : modifier une couleur
router.put('/:id', requireAuth, upload.single('image'), (req, res) => {
  const { color_name, color_hex, active, position } = req.body;
  let sql = 'UPDATE product_colors SET color_name=?, color_hex=?, active=?, position=?';
  let params = [color_name, color_hex, active, position];
  if (req.file) {
    sql += ', image_url=?';
    params.push(`/uploads/colors/${req.file.filename}`);
  }
  sql += ' WHERE id=?';
  params.push(req.params.id);
  db.run(sql, params, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ADMIN : supprimer une couleur (physiquement)
router.delete('/:id', requireAuth, (req, res) => {
  db.get('SELECT image_url FROM product_colors WHERE id=?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row && row.image_url) {
      const filePath = path.join(__dirname, '..', row.image_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.run('DELETE FROM product_colors WHERE id=?', [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

module.exports = router;