// routes/products.js — CRUD produits avec pagination & optimisation image
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');       // npm install sharp
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `product_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Format non supporté. Utilisez JPG, PNG ou WEBP.'));
  },
});

// ——— PUBLIC (avec pagination) ———
router.get('/', (req, res) => {
  const { category, page = 1, limit = 12 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let sql = 'SELECT * FROM products WHERE active = 1';
  let params = [];
  if (category && category !== 'all') {
    sql += ' AND category = ?';
    params.push(category);
  }
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    // Compter le total pour la pagination
    let countSql = 'SELECT COUNT(*) as total FROM products WHERE active = 1';
    let countParams = [];
    if (category && category !== 'all') {
      countSql += ' AND category = ?';
      countParams.push(category);
    }
    db.get(countSql, countParams, (err2, countRow) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({
        products: rows.map(formatProduct),
        total: countRow.total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countRow.total / parseInt(limit))
      });
    });
  });
});

router.get('/:id', (req, res) => {
  db.get('SELECT * FROM products WHERE id = ? AND active = 1', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Produit introuvable' });
    res.json(formatProduct(row));
  });
});

// ——— ADMIN ———
router.get('/admin/all', requireAuth, (req, res) => {
  db.all('SELECT * FROM products ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(formatProduct));
  });
});

// Helper de redimensionnement (optionnel mais recommandé)
async function optimizeImage(filePath) {
  const parsed = path.parse(filePath);
  const resizedPath = path.join(parsed.dir, `resized_${parsed.base}`);
  await sharp(filePath).resize(800, 800, { fit: 'inside' }).toFile(resizedPath);
  fs.unlinkSync(filePath);
  return path.basename(resizedPath);
}

router.post('/', requireAuth, upload.single('image'), async (req, res) => {
  const { name, category, price, description, badge } = req.body;
  if (!name || !category || !price) {
    return res.status(400).json({ error: 'name, category et price sont requis' });
  }
  let imageUrl = null;
  if (req.file) {
    const optimizedName = await optimizeImage(req.file.path);
    imageUrl = `/uploads/${optimizedName}`;
  }
  db.run(
    `INSERT INTO products (name, category, price, description, badge, image, active, stock, color, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, category, parseInt(price), description || '', badge || null, imageUrl, 1,
      req.body.stock || 0, req.body.color || '', req.body.details || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM products WHERE id = ?', [this.lastID], (e, row) => {
        res.status(201).json(formatProduct(row));
      });
    }
  );
});

router.put('/:id', requireAuth, upload.single('image'), async (req, res) => {
  const { name, category, price, description, badge, active } = req.body;
  db.get('SELECT * FROM products WHERE id = ?', [req.params.id], async (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!existing) return res.status(404).json({ error: 'Produit introuvable' });

    let imageUrl = existing.image;
    if (req.file) {
      const optimizedName = await optimizeImage(req.file.path);
      imageUrl = `/uploads/${optimizedName}`;
      if (existing.image) {
        const oldPath = path.join(__dirname, '..', existing.image);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    } else if (req.body.image !== undefined) {
      imageUrl = req.body.image;
    }

    db.run(
      `UPDATE products SET
        name = ?, category = ?, price = ?, description = ?,
        badge = ?, image = ?, active = ?, stock = ?, color = ?, details = ?
       WHERE id = ?`,
      [
        name ?? existing.name,
        category ?? existing.category,
        parseInt(price ?? existing.price),
        description ?? existing.description,
        badge !== undefined ? (badge || null) : existing.badge,
        imageUrl,
        active !== undefined ? parseInt(active) : existing.active,
        req.body.stock ?? existing.stock,
        req.body.color ?? existing.color,
        req.body.details ?? existing.details,
        req.params.id
      ],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.get('SELECT * FROM products WHERE id = ?', [req.params.id], (e, row) => {
          res.json(formatProduct(row));
        });
      }
    );
  });
});

router.delete('/:id', requireAuth, (req, res) => {
  db.get('SELECT image FROM products WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Produit introuvable' });
    if (row.image) {
      const imagePath = path.join(__dirname, '..', row.image);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }
    db.run('DELETE FROM products WHERE id = ?', [req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Produit introuvable' });
      res.json({ success: true, id: parseInt(req.params.id) });
    });
  });
});

function formatProduct(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    desc: p.description,
    badge: p.badge,
    image: p.image,
    active: !!p.active,
    stock: p.stock,
    color: p.color,
    details: p.details,
    created_at: p.created_at,
  };
}

module.exports = router;