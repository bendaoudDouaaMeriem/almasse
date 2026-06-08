// server.js — Serveur principal Lumière
require('dotenv').config();

const express = require('express');

const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 3001;
const colorRoutes = require('./routes/productColors');
app.use('/api/product-colors', colorRoutes);
// ═══ Middlewares globaux ═══
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:8080',
    // Ajoutez votre domaine de production ici
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir les images uploadées
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Servir les fichiers frontend (index.html, admin.html)
app.use(express.static(path.join(__dirname, '..')));

// ═══ Routes API ═══
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

// Route santé
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// 404 pour routes inconnues
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Route introuvable' });
});

// Gestion erreurs globale
app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur:', err.stack);
  res.status(500).json({ error: err.message || 'Erreur interne du serveur' });
});

// ═══ Démarrage ═══
app.listen(PORT, () => {
  console.log('');
  console.log('  ✦ LUMIÈRE Backend démarré');
  console.log(`  ► API        : http://localhost:${PORT}/api`);
  console.log(`  ► Boutique   : http://localhost:${PORT}/index.html`);
  console.log(`  ► Admin      : http://localhost:${PORT}/admin.html`);
  console.log(`  ► Login admin: ${process.env.ADMIN_USERNAME} / ${process.env.ADMIN_PASSWORD}`);
  console.log('');
});