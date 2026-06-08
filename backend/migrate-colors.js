const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./lumiere.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS product_colors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    color_name TEXT NOT NULL,
    color_hex TEXT NOT NULL,
    image_url TEXT,
    active INTEGER DEFAULT 1,
    position INTEGER DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`, (err) => {
    if (err) console.error('Erreur création table:', err.message);
    else console.log('Table product_colors créée avec succès');
  });
});

db.close();