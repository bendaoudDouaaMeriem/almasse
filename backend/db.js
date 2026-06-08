const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

// Utiliser une variable d'environnement si elle existe, sinon un fichier local
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'lumiere.db');

console.log(`📁 Base de données : ${DB_PATH}`);

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  // 1. Utilisateurs
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // 2. Produits (avec toutes les colonnes utilisées)
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price INTEGER NOT NULL,
    description TEXT DEFAULT '',
    badge TEXT,
    image TEXT,
    active INTEGER DEFAULT 1,
    stock INTEGER DEFAULT 0,
    color TEXT DEFAULT '',
    details TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // 3. Commandes
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    wilaya TEXT NOT NULL,
    address TEXT NOT NULL,
    delivery_mode TEXT NOT NULL,
    delivery_fee INTEGER NOT NULL,
    subtotal INTEGER NOT NULL,
    total INTEGER NOT NULL,
    status TEXT DEFAULT 'en_attente',
    notes TEXT DEFAULT '',
    items_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // 4. Couleurs des produits
  db.run(`CREATE TABLE IF NOT EXISTS product_colors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    color_name TEXT NOT NULL,
    color_hex TEXT NOT NULL,
    image_url TEXT,
    active INTEGER DEFAULT 1,
    position INTEGER DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);

  // 5. Tokens révoqués (déconnexion)
  db.run(`CREATE TABLE IF NOT EXISTS revoked_tokens (
    token TEXT PRIMARY KEY,
    revoked_at TEXT DEFAULT (datetime('now'))
  )`);

  // --- Création du compte admin par défaut (si aucun user n'existe) ---
  db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
    if (!err && row.count === 0) {
      const hashed = bcrypt.hashSync('admin123', 10);
      db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        ['admin', hashed, 'admin']);
      console.log('✅ Compte admin créé (identifiant: admin / mot de passe: admin123)');
    }
  });

  // --- Produits de démonstration (si table vide) ---
  db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
    if (!err && row.count === 0) {
      const stmt = db.prepare(`
        INSERT INTO products (name, category, price, description, badge, stock)
        VALUES (?,?,?,?,?,?)
      `);
      const demo = [
        ['Fond de Teint Velours', 'visage', 2800, 'Couvrance longue durée, formule légère.', 'Bestseller', 15],
        ['Palette Yeux Sahara', 'yeux', 3500, '12 teintes inspirées des couchers de soleil.', 'Nouveau', 8],
        ['Rouge à Lèvres Mat Satin', 'levres', 1800, 'Formule crémeuse ultra-pigmentée.', null, 25],
        ['Mascara Volume Extrême', 'yeux', 2200, 'Formule nourrissante pour des cils volumineux.', null, 12],
        ['Sérum Éclat Rose', 'soin', 4200, 'Vitamine C et acide hyaluronique.', 'Premium', 5],
        ['Vernis Semi-Permanent', 'ongles', 1600, 'Tenue jusqu\'à 3 semaines.', null, 30],
        ['Contour Palette Pro', 'visage', 2900, 'Bronzer, highlighter et blush.', null, 10],
        ['Eau de Parfum Jasmin', 'parfum', 5500, 'Fragrance florale orientale.', 'Édition Limitée', 3]
      ];
      demo.forEach(p => stmt.run(p));
      stmt.finalize();
      console.log('✅ Produits de démonstration ajoutés');
    }
  });
});

module.exports = db;