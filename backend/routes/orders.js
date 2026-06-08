// routes/orders.js — Gestion des commandes + export CSV
const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const VALID_STATUSES = ['en_attente', 'confirmee', 'expediee', 'livree', 'annulee'];

// ——— PUBLIC ———
router.post('/', (req, res) => {
  const { client, deliveryMode, deliveryFee, items, subtotal, total, notes } = req.body;

  if (!client || !client.prenom || !client.nom || !client.tel || !client.wilaya || !client.adresse) {
    return res.status(400).json({ error: 'Informations client incomplètes' });
  }
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Le panier est vide' });
  }
  if (!deliveryMode || deliveryFee === undefined || !subtotal || !total) {
    return res.status(400).json({ error: 'Informations de livraison manquantes' });
  }

  const checkStock = (items, callback) => {
    let remaining = items.length;
    let outOfStock = [];
    if (remaining === 0) return callback(null, []);
    items.forEach(item => {
      db.get('SELECT stock FROM products WHERE id = ?', [item.id], (err, row) => {
        if (err) return callback(err);
        if (!row || row.stock < item.qty) outOfStock.push(item.name);
        remaining--;
        if (remaining === 0) callback(null, outOfStock);
      });
    });
  };

  checkStock(items, (err, outOfStock) => {
    if (err) {
      console.error('Erreur vérification stock:', err);
      return res.status(500).json({ error: 'Erreur interne' });
    }
    if (outOfStock.length > 0) {
      return res.status(400).json({ error: `Stock insuffisant pour : ${outOfStock.join(', ')}` });
    }

    const orderId = 'LUM-' + Date.now().toString(36).toUpperCase();
    const date = new Date().toISOString();

    db.serialize(() => {
      db.run(
        `INSERT INTO orders
           (id, date, client_name, client_phone, wilaya, address,
            delivery_mode, delivery_fee, subtotal, total, status, notes, items_json)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          orderId, date,
          `${client.prenom} ${client.nom}`,
          client.tel,
          client.wilaya,
          client.adresse,
          deliveryMode,
          parseInt(deliveryFee),
          parseInt(subtotal),
          parseInt(total),
          'en_attente',
          notes || '',
          JSON.stringify(items),
        ],
        (err) => {
          if (err) {
            console.error('Erreur insertion commande:', err);
            return res.status(500).json({ error: 'Erreur lors de la création de la commande' });
          }
        }
      );

      items.forEach(item => {
        db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.qty, item.id]);
      });

      res.status(201).json({ success: true, orderId, message: 'Commande reçue avec succès' });
    });
  });
});

// ——— ADMIN ———
router.get('/', requireAuth, (req, res) => {
  const { status, search, page = 1, limit = 50 } = req.query;
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  if (status && VALID_STATUSES.includes(status)) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (id LIKE ? OR client_name LIKE ? OR client_phone LIKE ? OR wilaya LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  sql += ' ORDER BY date DESC';
  sql += ` LIMIT ${parseInt(limit)} OFFSET ${(parseInt(page) - 1) * parseInt(limit)}`;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(formatOrder));
  });
});

// Export CSV
router.get('/export', requireAuth, (req, res) => {
  db.all('SELECT * FROM orders ORDER BY date DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const csvRows = [['ID', 'Date', 'Client', 'Téléphone', 'Wilaya', 'Adresse', 'Mode livraison', 'Total', 'Statut']];
    rows.forEach(o => {
      csvRows.push([
        o.id, o.date, o.client_name, o.client_phone, o.wilaya, o.address,
        o.delivery_mode === 'home' ? 'Domicile' : 'Bureau', o.total, o.status
      ]);
    });
    const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    res.header('Content-Type', 'text/csv');
    res.attachment('commandes.csv');
    res.send(csvContent);
  });
});

router.get('/stats', requireAuth, (req, res) => { /* identique à avant */ });
router.get('/:id', requireAuth, (req, res) => { /* identique */ });
// Mise à jour du statut d'une commande
router.patch('/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  const { id } = req.params;

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }

  db.run('UPDATE orders SET status = ? WHERE id = ?', [status, id], function (err) {
    if (err) {
      console.error('Erreur mise à jour statut:', err);
      return res.status(500).json({ error: 'Erreur interne' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    res.json({ success: true, status });
  });
});

// Suppression d'une commande
router.delete('/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM orders WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('Erreur suppression commande:', err);
      return res.status(500).json({ error: 'Erreur interne' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }
    res.json({ success: true });
  });
});

function formatOrder(o) {
  let items = [];
  try { items = JSON.parse(o.items_json); } catch (_) { }
  return {
    id: o.id, date: o.date,
    client: { name: o.client_name, phone: o.client_phone, wilaya: o.wilaya, address: o.address },
    deliveryMode: o.delivery_mode, deliveryFee: o.delivery_fee,
    subtotal: o.subtotal, total: o.total, status: o.status, notes: o.notes, items,
    created_at: o.created_at,
  };
}
module.exports = router;
