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
// FIREBASE ADMIN – Lecture de la clé (Secret File ou variable)
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
const YABETOO_SECRET = process.env.YABETOO_SECRET_KEY || '';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '065918166';

const COMMISSION_BUYER = 0.03;
const COMMISSION_SELLER = 0.04;

const ALLOWED_CATEGORIES = [
  'vêtements', 'chaussures', 'sacs', 'bijoux', 'accessoires'
];

console.log(`📱 Admin Phone: ${ADMIN_PHONE}`);
console.log(`🖼️  ImgBB: ${IMG_BB_KEY ? 'OK' : 'MANQUANT'}`);
console.log(`💳 Yabetoo: ${YABETOO_SECRET ? 'OK' : 'MANQUANT'}`);
console.log(`🔥 Firebase: ${firebaseReady ? 'OK' : 'DÉGRADÉ (SIMULATION)'}`);

// ============================================================
// CRON – REMBOURSEMENT AUTO (si Firebase prêt)
// ============================================================
if (firebaseReady) {
  cron.schedule('0 * * * *', async () => {
    console.log('⏰ Vérification des commandes expirées...');
    try {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
      const snapshot = await db.collection('orders')
        .where('status', '==', 'en attente de confirmation')
        .where('createdAt', '<=', twelveHoursAgo)
        .get();

      for (const doc of snapshot.docs) {
        const order = doc.data();
        console.log(`🔄 Remboursement commande ${doc.id}`);
        await refundOrder(doc.id, order);
      }
    } catch (error) {
      console.error('❌ Cron Error:', error.message);
    }
  });
}

async function refundOrder(orderId, order) {
  if (!firebaseReady) return;
  try {
    const buyerRef = db.collection('users').doc(order.buyerId);
    const buyerDoc = await buyerRef.get();
    const buyerBalance = buyerDoc.data()?.walletBalance || 0;
    await buyerRef.update({
      walletBalance: buyerBalance + order.totalAmount
    });
    await db.collection('products').doc(order.articleId).update({
      status: 'active'
    });
    await db.collection('orders').doc(orderId).update({
      status: 'remboursé',
      refundedAt: new Date()
    });
    console.log(`✅ Remboursement effectué pour ${orderId}`);
  } catch (error) {
    console.error(`❌ Erreur remboursement ${orderId}:`, error.message);
  }
}

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
      imgbb: IMG_BB_KEY ? '✅' : '❌',
      yabetoo: YABETOO_SECRET ? '✅' : '❌'
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
// ARTICLES (collection "products") – Version SIMPLE SANS INDEX
// ============================================================
app.get('/api/articles', async (req, res) => {
  if (!firebaseReady) {
    return res.json({
      success: true,
      data: [
        { id: '1', title: 'Robe vintage', description: 'Belle robe des années 80', price: 15000, category: 'vêtements', image: '', sellerName: 'Marie K.', sellerId: 'seller1', status: 'active', createdAt: new Date() },
        { id: '2', title: 'Talons rouges', description: 'Escarpins en cuir rouge', price: 25000, category: 'chaussures', image: '', sellerName: 'Sophie L.', sellerId: 'seller2', status: 'active', createdAt: new Date() },
        { id: '3', title: 'Sac en cuir', description: 'Sac à main en cuir noir', price: 35000, category: 'sacs', image: '', sellerName: 'Jean P.', sellerId: 'seller3', status: 'active', createdAt: new Date() }
      ]
    });
  }
  try {
    const snapshot = await db.collection('products').get();
    const articles = [];
    snapshot.forEach(doc => {
      articles.push({ id: doc.id, ...doc.data() });
    });
    res.json({ success: true, data: articles });
  } catch (error) {
    console.error('❌ Erreur articles:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/articles/seller/:sellerId', async (req, res) => {
  if (!firebaseReady) {
    return res.json({
      success: true,
      data: [
        { id: '1', title: 'Robe vintage', price: 15000, image: '', status: 'active' },
        { id: '2', title: 'Talons rouges', price: 25000, image: '', status: 'active' }
      ]
    });
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
// UPLOAD IMAGE (ImgBB)
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
        walletBalance: 5000,
        phone: '+242 06 123 4567',
        email: 'test@example.com'
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
        email: data.email || ''
      }
    });
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
    const { name, email, phone, photo } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (photo) updateData.photo = photo;
    await db.collection('users').doc(userId).update(updateData);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// WALLET
// ============================================================
app.get('/api/wallet/:userId', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ balance: 5000 });
  }
  try {
    const { userId } = req.params;
    const doc = await db.collection('users').doc(userId).get();
    res.json({ balance: doc.data()?.walletBalance || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/wallet/deposit', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true, message: 'Dépôt simulé', newBalance: 10000 });
  }
  try {
    const { userId, amount, phone } = req.body;
    if (!userId || !amount || !phone) {
      return res.status(400).json({ success: false, message: 'userId, amount et phone requis' });
    }
    if (!YABETOO_SECRET) {
      return res.status(500).json({ success: false, message: 'Yabetoo non configuré' });
    }
    const reference = `DEP-${userId.slice(0,8)}-${Date.now().toString().slice(-6)}`;
    const yabResponse = await axios.post('https://api.yabetoo.com/v1/payment/initiate', {
      amount: parseInt(amount),
      phone: phone,
      reference: reference,
      description: 'Dépôt BLK Wallet',
      callback_url: `https://blk-marketplace2.0-1.onrender.com/api/payment/callback`
    }, {
      headers: {
        'Authorization': `Bearer ${YABETOO_SECRET}`,
        'Content-Type': 'application/json'
      }
    });
    if (yabResponse.data && yabResponse.data.status === 'success') {
      await db.collection('transactions').add({
        userId,
        amount: parseInt(amount),
        phone,
        reference,
        type: 'deposit',
        status: 'pending',
        yabetooId: yabResponse.data.transaction_id || '',
        createdAt: new Date()
      });
      res.json({
        success: true,
        message: '💰 Paiement initié ! Confirme sur ton mobile MTN',
        reference,
        transactionId: yabResponse.data.transaction_id
      });
    } else {
      res.status(400).json({ success: false, message: yabResponse.data?.message || 'Erreur Yabetoo' });
    }
  } catch (error) {
    console.error('Deposit Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: error.response?.data?.message || 'Erreur dépôt' });
  }
});

app.post('/api/wallet/withdraw', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true, message: 'Retrait simulé', newBalance: 0 });
  }
  try {
    const { userId, amount, phone } = req.body;
    if (!userId || !amount || !phone) {
      return res.status(400).json({ success: false, message: 'userId, amount et phone requis' });
    }
    if (!YABETOO_SECRET) {
      return res.status(500).json({ success: false, message: 'Yabetoo non configuré' });
    }
    const userRef = db.collection('users').doc(userId);
    const doc = await userRef.get();
    const currentBalance = doc.data()?.walletBalance || 0;
    if (currentBalance < amount) {
      return res.status(400).json({ success: false, message: 'Solde insuffisant' });
    }
    const reference = `WTH-${userId.slice(0,8)}-${Date.now().toString().slice(-6)}`;
    const yabResponse = await axios.post('https://api.yabetoo.com/v1/withdraw', {
      amount: parseInt(amount),
      phone: phone,
      reference: reference,
      callback_url: `https://blk-marketplace2.0-1.onrender.com/api/payment/callback`
    }, {
      headers: {
        'Authorization': `Bearer ${YABETOO_SECRET}`,
        'Content-Type': 'application/json'
      }
    });
    if (yabResponse.data && yabResponse.data.status === 'success') {
      await userRef.update({ walletBalance: currentBalance - amount });
      await db.collection('transactions').add({
        userId,
        amount: parseInt(amount),
        phone,
        reference,
        type: 'withdraw',
        status: 'pending',
        yabetooId: yabResponse.data.transaction_id || '',
        createdAt: new Date()
      });
      res.json({
        success: true,
        message: '💰 Retrait demandé ! Tu recevras l\'argent sur ton MTN',
        reference,
        newBalance: currentBalance - amount
      });
    } else {
      res.status(400).json({ success: false, message: yabResponse.data?.message || 'Erreur Yabetoo' });
    }
  } catch (error) {
    console.error('Withdraw Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: error.response?.data?.message || 'Erreur retrait' });
  }
});

// ============================================================
// PAYMENT CALLBACK
// ============================================================
app.post('/api/payment/callback', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true });
  }
  try {
    const { reference, status, transaction_id } = req.body;
    const snapshot = await db.collection('transactions')
      .where('reference', '==', reference)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return res.status(404).json({ success: false, message: 'Transaction non trouvée' });
    }
    const doc = snapshot.docs[0];
    const data = doc.data();
    if (status === 'success') {
      if (data.type === 'deposit') {
        const userRef = db.collection('users').doc(data.userId);
        const userDoc = await userRef.get();
        const currentBalance = userDoc.data()?.walletBalance || 0;
        await userRef.update({ walletBalance: currentBalance + data.amount });
      }
      await doc.ref.update({
        status: 'completed',
        yabetooId: transaction_id,
        completedAt: new Date()
      });
      res.json({ success: true });
    } else {
      await doc.ref.update({
        status: 'failed',
        yabetooId: transaction_id,
        failedAt: new Date()
      });
      res.json({ success: false, message: 'Transaction échouée' });
    }
  } catch (error) {
    console.error('Callback Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// ORDRES
// ============================================================
app.post('/api/orders/create', async (req, res) => {
  if (!firebaseReady) {
    return res.json({
      success: true,
      orderId: 'mock-' + Date.now(),
      message: 'Commande créée (simulée)',
      totalAmount: 15450,
      buyerCommission: 450,
      sellerCommission: 600,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    });
  }
  try {
    const { articleId, buyerId, sellerId, amount, buyerPhone } = req.body;
    if (!articleId || !buyerId || !sellerId || !amount) {
      return res.status(400).json({ success: false, message: 'Champs requis manquants' });
    }
    const buyerRef = db.collection('users').doc(buyerId);
    const buyerDoc = await buyerRef.get();
    const buyerBalance = buyerDoc.data()?.walletBalance || 0;
    const buyerCommission = Math.round(amount * COMMISSION_BUYER);
    const totalAmount = amount + buyerCommission;
    if (buyerBalance < totalAmount) {
      return res.status(400).json({
        success: false,
        message: '❌ Solde insuffisant',
        balance: buyerBalance,
        required: totalAmount,
        difference: totalAmount - buyerBalance
      });
    }
    await buyerRef.update({ walletBalance: buyerBalance - totalAmount });
    const order = {
      articleId,
      buyerId,
      sellerId,
      buyerPhone: buyerPhone || buyerDoc.data()?.phone || '',
      amount: parseInt(amount),
      buyerCommission,
      totalAmount,
      sellerCommission: Math.round(amount * COMMISSION_SELLER),
      status: 'en attente de confirmation',
      buyerConfirmed: false,
      buyerConfirmedAt: null,
      flamesGiven: false,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      createdAt: new Date()
    };
    const orderRef = await db.collection('orders').add(order);
    const orderId = orderRef.id;
    await db.collection('notifications').add({
      userId: sellerId,
      message: `🛒 Nouvelle commande #${orderId.slice(0,8)} - ${amount} FCFA`,
      type: 'new_order',
      read: false,
      orderId: orderId,
      createdAt: new Date()
    });
    res.json({
      success: true,
      orderId,
      message: '✅ Commande créée avec succès ! Livre dans les 12h.',
      totalAmount,
      buyerCommission,
      sellerCommission: Math.round(amount * COMMISSION_SELLER),
      expiresAt: order.expiresAt
    });
  } catch (error) {
    console.error('Order Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/orders/confirm', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true, message: 'Commande confirmée (simulée)' });
  }
  try {
    const { orderId, buyerId, confirmations } = req.body;
    if (!orderId || !buyerId || !confirmations) {
      return res.status(400).json({ success: false, message: 'Champs requis' });
    }
    const required = ['recu', 'bon_etat', 'confirme'];
    for (const key of required) {
      if (!confirmations[key]) {
        return res.status(400).json({
          success: false,
          message: '❌ Tu dois cocher les 3 cases pour confirmer'
        });
      }
    }
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    }
    const order = orderDoc.data();
    if (order.buyerId !== buyerId) {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }
    if (order.status !== 'en attente de confirmation') {
      return res.status(400).json({ success: false, message: 'Commande déjà traitée' });
    }
    const now = new Date();
    const expiresAt = order.expiresAt.toDate ? order.expiresAt.toDate() : new Date(order.expiresAt);
    if (now > expiresAt) {
      return res.status(400).json({ success: false, message: '⏰ Délai expiré, remboursement automatique' });
    }
    const sellerCommission = order.sellerCommission || Math.round(order.amount * COMMISSION_SELLER);
    const buyerCommission = order.buyerCommission || Math.round(order.amount * COMMISSION_BUYER);
    const amountToSeller = order.amount - sellerCommission;
    const adminTotal = buyerCommission + sellerCommission;
    const sellerRef = db.collection('users').doc(order.sellerId);
    const sellerDoc = await sellerRef.get();
    const sellerBalance = sellerDoc.data()?.walletBalance || 0;
    await sellerRef.update({ walletBalance: sellerBalance + amountToSeller });
    const articleRef = db.collection('products').doc(order.articleId);
    await articleRef.update({
      status: 'sold',
      soldAt: new Date(),
      soldTo: buyerId,
      orderId: orderId
    });
    if (ADMIN_PHONE && adminTotal > 0) {
      try {
        const adminRef = `ADMIN-${Date.now().toString().slice(-6)}`;
        await axios.post('https://api.yabetoo.com/v1/withdraw', {
          amount: adminTotal,
          phone: ADMIN_PHONE,
          reference: `COM-${orderId.slice(0,8)}-${adminRef}`,
          callback_url: `https://blk-marketplace2.0-1.onrender.com/api/payment/callback`
        }, {
          headers: {
            'Authorization': `Bearer ${YABETOO_SECRET}`,
            'Content-Type': 'application/json'
          }
        });
        console.log(`✅ Commission ${adminTotal} FCFA envoyée à ${ADMIN_PHONE}`);
      } catch (error) {
        console.error('❌ Erreur envoi commission:', error.message);
      }
    }
    await orderRef.update({
      status: 'livré',
      buyerConfirmed: true,
      buyerConfirmedAt: new Date(),
      confirmations,
      sellerReceived: amountToSeller,
      adminCommission: adminTotal
    });
    await db.collection('notifications').add({
      userId: order.sellerId,
      message: `💰 Vente confirmée ! ${amountToSeller} FCFA crédités sur ton wallet.`,
      type: 'sale_confirmed',
      read: false,
      orderId: orderId,
      createdAt: new Date()
    });
    await db.collection('notifications').add({
      userId: order.buyerId,
      message: `✅ Commande #${orderId.slice(0,8)} confirmée avec succès.`,
      type: 'order_confirmed',
      read: false,
      orderId: orderId,
      createdAt: new Date()
    });
    res.json({
      success: true,
      message: '✅ Commande confirmée !',
      sellerReceived: amountToSeller,
      adminCommission: adminTotal,
      sellerBalance: sellerBalance + amountToSeller
    });
  } catch (error) {
    console.error('Confirm Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/orders/:userId', async (req, res) => {
  if (!firebaseReady) {
    return res.json([
      {
        id: '1',
        articleId: '1',
        buyerId: 'buyer1',
        sellerId: 'seller1',
        amount: 15000,
        totalAmount: 15450,
        status: 'en attente de confirmation',
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
        createdAt: new Date(),
        article: { title: 'Robe vintage', price: 15000, image: '' },
        seller: { name: 'Marie K.' }
      },
      {
        id: '2',
        articleId: '2',
        buyerId: 'buyer2',
        sellerId: 'seller2',
        amount: 35000,
        totalAmount: 36050,
        status: 'livré',
        expiresAt: new Date(),
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        article: { title: 'Sac en cuir', price: 35000, image: '' },
        buyer: { name: 'Jean P.' },
        sellerReceived: 33600,
        buyerConfirmedAt: new Date()
      }
    ]);
  }
  try {
    const { userId } = req.params;
    const orders = [];
    // En tant qu'acheteur
    const buyerSnapshot = await db.collection('orders')
      .where('buyerId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();
    for (const doc of buyerSnapshot.docs) {
      const order = doc.data();
      const articleDoc = await db.collection('products').doc(order.articleId).get();
      const article = articleDoc.data();
      const sellerDoc = await db.collection('users').doc(order.sellerId).get();
      const seller = sellerDoc.data();
      orders.push({
        id: doc.id,
        ...order,
        article: article ? { title: article.title, image: article.image, price: article.price } : null,
        seller: seller ? { name: seller.name, photo: seller.photo || '' } : null
      });
    }
    // En tant que vendeur
    const sellerSnapshot = await db.collection('orders')
      .where('sellerId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();
    for (const doc of sellerSnapshot.docs) {
      const order = doc.data();
      if (!orders.find(o => o.id === doc.id)) {
        const articleDoc = await db.collection('products').doc(order.articleId).get();
        const article = articleDoc.data();
        const buyerDoc = await db.collection('users').doc(order.buyerId).get();
        const buyer = buyerDoc.data();
        orders.push({
          id: doc.id,
          ...order,
          article: article ? { title: article.title, image: article.image, price: article.price } : null,
          buyer: buyer ? { name: buyer.name, photo: buyer.photo || '' } : null
        });
      }
    }
    orders.sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
      const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
      return dateB - dateA;
    });
    res.json(orders);
  } catch (error) {
    console.error('Orders Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/orders/cancel/:orderId', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true, message: 'Commande annulée (simulée)' });
  }
  try {
    const { orderId } = req.params;
    const { userId } = req.body;
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    }
    const order = orderDoc.data();
    if (order.buyerId !== userId && order.sellerId !== userId) {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }
    const now = new Date();
    const createdAt = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
    const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);
    if (hoursSinceCreation > 2) {
      return res.status(400).json({
        success: false,
        message: '⏰ Délai de 2h dépassé. Annulation impossible.'
      });
    }
    const buyerRef = db.collection('users').doc(order.buyerId);
    const buyerDoc = await buyerRef.get();
    const buyerBalance = buyerDoc.data()?.walletBalance || 0;
    await buyerRef.update({ walletBalance: buyerBalance + order.totalAmount });
    const articleRef = db.collection('products').doc(order.articleId);
    await articleRef.update({ status: 'active' });
    await orderRef.update({
      status: 'annulé',
      cancelledAt: new Date(),
      cancelledBy: userId
    });
    res.json({
      success: true,
      message: '✅ Commande annulée et remboursée',
      refunded: order.totalAmount
    });
  } catch (error) {
    console.error('Cancel Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// FLAMMES
// ============================================================
app.post('/api/flames', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true, flames: 5 });
  }
  try {
    const { sellerId, buyerId } = req.body;
    if (!sellerId || !buyerId) {
      return res.status(400).json({ success: false, message: 'sellerId et buyerId requis' });
    }
    const existing = await db.collection('flames')
      .where('sellerId', '==', sellerId)
      .where('buyerId', '==', buyerId)
      .get();
    if (!existing.empty) {
      return res.status(400).json({ success: false, message: 'Flamme déjà donnée' });
    }
    await db.collection('flames').add({
      sellerId,
      buyerId,
      createdAt: new Date()
    });
    const userRef = db.collection('users').doc(sellerId);
    const userDoc = await userRef.get();
    const currentFlames = userDoc.data()?.flames || 0;
    await userRef.update({ flames: currentFlames + 1 });
    res.json({ success: true, flames: currentFlames + 1 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/flames/:userId', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ flames: 3 });
  }
  try {
    const { userId } = req.params;
    const doc = await db.collection('users').doc(userId).get();
    res.json({ flames: doc.data()?.flames || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// STATISTIQUES
// ============================================================
app.get('/api/stats/:userId', async (req, res) => {
  if (!firebaseReady) {
    return res.json({
      success: true,
      data: {
        totalArticles: 2,
        totalSales: 5,
        totalRevenue: 75000,
        totalPurchases: 3,
        totalSpent: 45000,
        history: [
          { month: '2025-06', ventes: 2, revenu: 30000 },
          { month: '2025-07', ventes: 3, revenu: 45000 }
        ]
      }
    });
  }
  try {
    const { userId } = req.params;
    const articlesSnapshot = await db.collection('products')
      .where('sellerId', '==', userId)
      .where('status', '==', 'active')
      .get();
    const ordersSnapshot = await db.collection('orders')
      .where('sellerId', '==', userId)
      .where('status', '==', 'livré')
      .get();
    let totalSales = 0, totalRevenue = 0;
    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      totalSales++;
      totalRevenue += order.sellerReceived || (order.amount - (order.amount * COMMISSION_SELLER));
    });
    const purchasesSnapshot = await db.collection('orders')
      .where('buyerId', '==', userId)
      .where('status', '==', 'livré')
      .get();
    let totalPurchases = 0, totalSpent = 0;
    purchasesSnapshot.forEach(doc => {
      const order = doc.data();
      totalPurchases++;
      totalSpent += order.totalAmount || order.amount;
    });
    const history = {};
    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      const date = order.createdAt?.toDate?.() || new Date(order.createdAt);
      const month = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
      if (!history[month]) history[month] = { ventes: 0, revenu: 0 };
      history[month].ventes++;
      history[month].revenu += order.sellerReceived || (order.amount - (order.amount * COMMISSION_SELLER));
    });
    const historyArray = Object.keys(history).sort().map(month => ({
      month,
      ventes: history[month].ventes,
      revenu: Math.round(history[month].revenu)
    }));
    res.json({
      success: true,
      data: {
        totalArticles: articlesSnapshot.size,
        totalSales,
        totalRevenue: Math.round(totalRevenue),
        totalPurchases,
        totalSpent,
        history: historyArray
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// TRANSACTIONS
// ============================================================
app.get('/api/transactions/:userId', async (req, res) => {
  if (!firebaseReady) {
    return res.json({
      success: true,
      data: [
        { type: 'deposit', amount: 10000, description: 'Dépôt', date: new Date() },
        { type: 'achat', amount: -15300, description: 'Achat #BLK-12345', date: new Date(Date.now() - 86400000) },
        { type: 'vente', amount: 9600, description: 'Vente #BLK-67890', date: new Date(Date.now() - 172800000) }
      ]
    });
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
    // Ajouter les achats et ventes comme transactions
    const ordersSnapshot = await db.collection('orders')
      .where('buyerId', '==', userId)
      .where('status', '==', 'livré')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      transactions.push({
        type: 'achat',
        amount: -order.totalAmount,
        description: `Achat #${doc.id.slice(0,8)} - ${order.amount} FCFA + commission`,
        date: order.createdAt,
        orderId: doc.id
      });
    });
    const salesSnapshot = await db.collection('orders')
      .where('sellerId', '==', userId)
      .where('status', '==', 'livré')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    salesSnapshot.forEach(doc => {
      const order = doc.data();
      const sellerReceived = order.sellerReceived || (order.amount - (order.amount * COMMISSION_SELLER));
      transactions.push({
        type: 'vente',
        amount: sellerReceived,
        description: `Vente #${doc.id.slice(0,8)} - ${order.amount} FCFA - commission ${Math.round(order.amount * COMMISSION_SELLER)} FCFA`,
        date: order.createdAt,
        orderId: doc.id
      });
    });
    transactions.sort((a, b) => {
      const dateA = a.date?.toDate?.() || new Date(a.date);
      const dateB = b.date?.toDate?.() || new Date(b.date);
      return dateB - dateA;
    });
    res.json({ success: true, data: transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// MESSAGES
// ============================================================
app.get('/api/messages/:userId', async (req, res) => {
  if (!firebaseReady) {
    return res.json({
      success: true,
      data: [
        { id: '1', senderId: 'user1', senderName: 'Marie K.', senderPhoto: '', text: 'Bonjour, je suis intéressé par la robe vintage', createdAt: new Date() },
        { id: '2', senderId: 'user2', senderName: 'Jean P.', senderPhoto: '', text: 'Le sac est-il encore disponible ?', createdAt: new Date(Date.now() - 3600000) }
      ]
    });
  }
  try {
    const { userId } = req.params;
    const snapshot = await db.collection('messages')
      .where('participants', 'array-contains', userId)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    const messages = [];
    snapshot.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));
    // Marquer comme lus
    for (const msg of messages) {
      if (msg.receiverId === userId && !msg.read) {
        await db.collection('messages').doc(msg.id).update({ read: true });
      }
    }
    res.json({ success: true, data: messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/messages', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true, id: 'mock-' + Date.now() });
  }
  try {
    const { senderId, receiverId, text, senderName, senderPhoto } = req.body;
    if (!senderId || !receiverId || !text) {
      return res.status(400).json({ success: false, message: 'Champs requis' });
    }
    const message = {
      senderId,
      receiverId,
      text,
      senderName: senderName || 'Anonyme',
      senderPhoto: senderPhoto || '',
      participants: [senderId, receiverId],
      read: false,
      createdAt: new Date()
    };
    const docRef = await db.collection('messages').add(message);
    await db.collection('notifications').add({
      userId: receiverId,
      message: `💬 Nouveau message de ${senderName || 'Anonyme'}`,
      type: 'new_message',
      read: false,
      messageId: docRef.id,
      createdAt: new Date()
    });
    res.json({ success: true, id: docRef.id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// NOTIFICATIONS
// ============================================================
app.get('/api/notifications/:userId', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true, data: [] });
  }
  try {
    const { userId } = req.params;
    const snapshot = await db.collection('notifications')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    const notifications = [];
    snapshot.forEach(doc => notifications.push({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/notifications/read/:id', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true });
  }
  try {
    const { id } = req.params;
    await db.collection('notifications').doc(id).update({ read: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// DÉMARRAGE
// ============================================================
app.listen(PORT, () => {
  console.log(`✅ BLK API running on port ${PORT}`);
  console.log(`📦 Mode: ${firebaseReady ? '100% RÉEL' : 'SIMULATION'}`);
  console.log(`💳 Paiement: ${YABETOO_SECRET ? 'Yabetoo (MTN)' : 'Simulé'}`);
  console.log(`📱 Admin: ${ADMIN_PHONE}`);
  console.log(`💰 Commissions: ${COMMISSION_BUYER*100}% (buyer) + ${COMMISSION_SELLER*100}% (seller)`);
});
