const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const axios = require('axios');
const FormData = require('form-data');
const cron = require('node-cron');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================================
// FIREBASE ADMIN
// ============================================================
let db = null;
let firebaseReady = false;

try {
  let serviceAccount = null;
  const secretPath = '/etc/secrets/firebase-key.json';
  if (fs.existsSync(secretPath)) {
    console.log('📁 Lecture Firebase depuis Secret File...');
    serviceAccount = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('📁 Lecture Firebase depuis variable d\'environnement...');
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    firebaseReady = true;
    console.log('✅ Firebase connecté avec succès !');
  } else {
    console.warn('⚠️ Aucune clé Firebase trouvée. Mode SIMULATION.');
  }
} catch (error) {
  console.error('❌ Erreur Firebase:', error.message);
  console.warn('⚠️ Mode SIMULATION activé.');
}

// ============================================================
// CONFIGURATION
// ============================================================
const IMG_BB_KEY = process.env.IMG_BB_KEY || '08d90ac3321b7689d9e1c35e34a88b6c';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '065918166';

const COMMISSION_BUYER = 0.03;
const COMMISSION_SELLER = 0.04;

const ALLOWED_CATEGORIES = [
  'vêtements', 'chaussures', 'sacs', 'bijoux', 'accessoires'
];

console.log(`📱 Admin Phone: ${ADMIN_PHONE}`);
console.log(`🖼️  ImgBB: ${IMG_BB_KEY ? 'OK' : 'MANQUANT'}`);
console.log(`🔥 Firebase: ${firebaseReady ? 'OK' : 'DÉGRADÉ (SIMULATION)'}`);

// ============================================================
// ROUTES PRINCIPALES
// ============================================================
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'BLK Marketplace API',
    mode: firebaseReady ? '100% RÉEL' : 'SIMULATION',
    services: {
      firebase: firebaseReady ? '✅' : '❌',
      imgbb: IMG_BB_KEY ? '✅' : '❌'
    }
  });
});

app.get('/ping', (req, res) => res.send('pong'));

// ============================================================
// CATÉGORIES
// ============================================================
app.get('/api/categories', (req, res) => {
  res.json({ success: true, data: ALLOWED_CATEGORIES });
});

// ============================================================
// ARTICLES
// ============================================================
app.get('/api/articles', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true, data: [] });
  }
  try {
    const snapshot = await db.collection('products')
      .where('status', '==', 'active')
      .get();
    const articles = [];
    snapshot.forEach(doc => articles.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data: articles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/articles/seller/:sellerId', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true, data: [] });
  }
  try {
    const { sellerId } = req.params;
    const snapshot = await db.collection('products')
      .where('sellerId', '==', sellerId)
      .get();
    const articles = [];
    snapshot.forEach(doc => articles.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data: articles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/articles', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true, id: 'mock-' + Date.now() });
  }
  try {
    const { title, description, price, category, image, sellerId, sellerName, sellerPhoto } = req.body;
    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Catégorie non autorisée. Autorise: ${ALLOWED_CATEGORIES.join(', ')}`
      });
    }
    const article = {
      title,
      description,
      price: parseInt(price),
      category,
      image: image || '',
      sellerId,
      sellerName: sellerName || 'Anonyme',
      sellerPhoto: sellerPhoto || '',
      status: 'active',
      views: 0,
      createdAt: new Date()
    };
    const docRef = await db.collection('products').add(article);
    res.json({ success: true, id: docRef.id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/articles/:id', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true });
  }
  try {
    const { id } = req.params;
    await db.collection('products').doc(id).update({ status: 'inactive' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/articles/view/:id', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true, views: 1 });
  }
  try {
    const { id } = req.params;
    const doc = await db.collection('products').doc(id).get();
    const views = (doc.data()?.views || 0) + 1;
    await db.collection('products').doc(id).update({ views });
    res.json({ success: true, views });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// UPLOAD IMAGE
// ============================================================
app.post('/api/upload', async (req, res) => {
  try {
    const { base64 } = req.body;
    if (!base64) return res.status(400).json({ success: false, message: 'Aucune image' });
    if (!IMG_BB_KEY) return res.status(500).json({ success: false, message: 'Clé ImgBB manquante' });

    const base64Data = base64.includes('base64,') ? base64.split('base64,')[1] : base64;
    const formData = new FormData();
    formData.append('key', IMG_BB_KEY);
    formData.append('image', base64Data);

    const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
      headers: formData.getHeaders()
    });

    if (response.data.success) {
      res.json({ success: true, url: response.data.data.url });
    } else {
      res.status(400).json({ success: false, message: 'Erreur ImgBB' });
    }
  } catch (error) {
    console.error('ImgBB Error:', error.message);
    res.status(500).json({ success: false, message: 'Erreur upload' });
  }
});

app.post('/api/upload-audio', async (req, res) => {
  try {
    const { base64 } = req.body;
    if (!base64) return res.status(400).json({ success: false, message: 'Aucun audio' });
    const audioUrl = `data:audio/webm;base64,${base64}`;
    res.json({ success: true, url: audioUrl });
  } catch (error) {
    console.error('Audio Upload Error:', error.message);
    res.status(500).json({ success: false, message: 'Erreur upload audio' });
  }
});

// ============================================================
// UTILISATEURS
// ============================================================
app.get('/api/users/:userId', async (req, res) => {
  if (!firebaseReady) {
    return res.json({
      success: true,
      data: {
        name: 'Utilisateur Test',
        photo: '',
        flames: 0,
        walletBalance: 0,
        phone: '+242 06 123 4567',
        email: 'test@example.com',
        isSeller: false,
        blockedUsers: [],
        online: false
      }
    });
  }
  try {
    const { userId } = req.params;
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    const data = doc.data();
    res.json({
      success: true,
      data: {
        name: data.name,
        photo: data.photo || '',
        flames: data.flames || 0,
        walletBalance: data.walletBalance || 0,
        phone: data.phone || '',
        email: data.email || '',
        isSeller: data.isSeller || false,
        blockedUsers: data.blockedUsers || [],
        online: data.online || false
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/users/online', async (req, res) => {
  if (!firebaseReady) return res.json({ success: true });
  try {
    const { userId, online } = req.body;
    await db.collection('users').doc(userId).update({ online: online || false });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/users/:userId', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true });
  }
  try {
    const { userId } = req.params;
    const { name, email, phone, photo, isSeller } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (photo) updateData.photo = photo;
    if (isSeller !== undefined) updateData.isSeller = isSeller;
    await db.collection('users').doc(userId).update(updateData);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/users/block', async (req, res) => {
  if (!firebaseReady) return res.json({ success: true, message: 'Simulation' });
  try {
    const { blockerId, blockedId } = req.body;
    if (!blockerId || !blockedId) {
      return res.status(400).json({ success: false, message: 'IDs requis' });
    }
    const blockerRef = db.collection('users').doc(blockerId);
    const blockerDoc = await blockerRef.get();
    const blocked = blockerDoc.data()?.blockedUsers || [];
    if (blocked.includes(blockedId)) {
      await blockerRef.update({
        blockedUsers: blocked.filter(id => id !== blockedId)
      });
      return res.json({ success: true, message: 'Débloqué', blocked: false });
    } else {
      await blockerRef.update({
        blockedUsers: [...blocked, blockedId]
      });
      return res.json({ success: true, message: 'Bloqué', blocked: true });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// WALLET
// ============================================================
app.get('/api/wallet/:userId', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ balance: 0 });
  }
  try {
    const { userId } = req.params;
    const doc = await db.collection('users').doc(userId).get();
    res.json({ balance: doc.data()?.walletBalance || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// WALLET - DÉPÔT (SIMULATION)
// ============================================================
app.post('/api/wallet/deposit', async (req, res) => {
  console.log('📩 Requête de dépôt reçue !');
  console.log('Body:', req.body);

  try {
    const userId = req.body.userid || req.body.userId;
    const amount = parseInt(req.body.amount);
    const phone = req.body.phone;

    if (!userId || !amount || !phone) {
      return res.status(400).json({ success: false, message: 'userId, amount et phone requis' });
    }

    const userRef = db.collection('users').doc(userId);
    const doc = await userRef.get();
    const currentBalance = doc.data()?.walletBalance || 0;
    const newBalance = currentBalance + amount;

    await userRef.set({
      walletBalance: newBalance,
      phone: phone,
      lastDeposit: admin.firestore.FieldValue.serverTimestamp(),
      name: doc.data()?.name || userId
    }, { merge: true });

    await db.collection('transactions').add({
      userId,
      amount,
      phone,
      type: 'deposit',
      status: 'completed',
      description: 'Dépôt (simulé)',
      createdAt: new Date()
    });

    console.log(`💰 Wallet mis à jour: ${currentBalance} → ${newBalance}`);
    res.json({
      success: true,
      message: '💰 Dépôt effectué avec succès !',
      newBalance: newBalance
    });

  } catch (error) {
    console.error('❌ Erreur dépôt:', error.message);
    res.status(500).json({ success: false, message: 'Erreur interne du serveur' });
  }
});

// ============================================================
// ADMIN - CRÉDIT MANUEL (page admin)
// ============================================================
app.post('/api/wallet/admin-credit', async (req, res) => {
  console.log('📩 Crédit manuel admin reçu !');
  console.log('Body:', req.body);

  try {
    const { userId, amount, phone } = req.body;
    if (!userId || !amount) {
      return res.status(400).json({ success: false, message: 'userId et amount requis' });
    }

    const userRef = db.collection('users').doc(userId);
    const doc = await userRef.get();
    const currentBalance = doc.data()?.walletBalance || 0;
    const newBalance = currentBalance + amount;

    await userRef.set({
      walletBalance: newBalance,
      phone: phone || doc.data()?.phone || '',
      lastDeposit: admin.firestore.FieldValue.serverTimestamp(),
      name: doc.data()?.name || userId
    }, { merge: true });

    await db.collection('transactions').add({
      userId,
      amount,
      phone: phone || '065918166',
      type: 'deposit',
      status: 'completed',
      description: 'Dépôt manuel (admin)',
      createdAt: new Date()
    });

    console.log(`💰 Wallet mis à jour: ${currentBalance} → ${newBalance}`);
    res.json({ success: true, message: 'Wallet crédité', newBalance });

  } catch (error) {
    console.error('❌ Erreur crédit admin:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// WALLET - RETRAIT (SIMULATION)
// ============================================================
app.post('/api/wallet/withdraw', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ 
      success: true, 
      message: '💰 Retrait simulé avec succès !', 
      newBalance: 0 
    });
  }
  try {
    const { userId, amount, phone } = req.body;
    if (!userId || !amount || !phone) {
      return res.status(400).json({ success: false, message: 'userId, amount et phone requis' });
    }

    const userRef = db.collection('users').doc(userId);
    const doc = await userRef.get();
    const currentBalance = doc.data()?.walletBalance || 0;

    if (currentBalance < amount) {
      return res.status(400).json({ success: false, message: 'Solde insuffisant' });
    }

    const newBalance = currentBalance - parseInt(amount);
    await userRef.update({ walletBalance: newBalance });

    await db.collection('transactions').add({
      userId,
      amount: parseInt(amount),
      phone,
      type: 'withdraw',
      status: 'completed',
      description: 'Retrait (simulé)',
      createdAt: new Date()
    });

    res.json({
      success: true,
      message: '💰 Retrait effectué avec succès !',
      newBalance: newBalance
    });
  } catch (error) {
    console.error('Withdraw Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// ORDRES (simplifiées)
// ============================================================
app.post('/api/orders/create', async (req, res) => {
  res.json({
    success: true,
    orderId: 'mock-' + Date.now(),
    message: 'Commande créée (simulée)',
    totalAmount: 0,
    buyerCommission: 0,
    sellerCommission: 0,
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
  });
});

app.post('/api/orders/confirm', (req, res) => {
  res.json({ success: true, message: 'Commande confirmée (simulée)' });
});

app.get('/api/orders/:userId', (req, res) => {
  res.json([]);
});

app.post('/api/orders/cancel/:orderId', (req, res) => {
  res.json({ success: true, message: 'Commande annulée' });
});

// ============================================================
// FLAMMES
// ============================================================
app.post('/api/flames', (req, res) => {
  res.json({ success: true, flames: 1 });
});

app.get('/api/flames/:userId', (req, res) => {
  res.json({ flames: 0 });
});

// ============================================================
// STATISTIQUES
// ============================================================
app.get('/api/stats/:userId', (req, res) => {
  res.json({
    success: true,
    data: {
      totalArticles: 0,
      totalSales: 0,
      totalRevenue: 0,
      totalPurchases: 0,
      totalSpent: 0,
      history: []
    }
  });
});

// ============================================================
// TRANSACTIONS
// ============================================================
app.get('/api/transactions/:userId', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true, data: [] });
  }
  try {
    const { userId } = req.params;
    const snapshot = await db.collection('transactions')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    const transactions = [];
    snapshot.forEach(doc => transactions.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data: transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// MESSAGES
// ============================================================
app.get('/api/messages/:userId', (req, res) => {
  res.json({ success: true, data: [] });
});

app.post('/api/messages', (req, res) => {
  res.json({ success: true, id: 'mock-' + Date.now() });
});

// ============================================================
// DÉMARRAGE
// ============================================================
app.listen(PORT, () => {
  console.log(`✅ BLK API running on port ${PORT}`);
  console.log(`📦 Mode: ${firebaseReady ? '100% RÉEL' : 'SIMULATION'}`);
  console.log(`📱 Admin: ${ADMIN_PHONE}`);
});
