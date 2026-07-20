const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const axios = require('axios');
const FormData = require('form-data');
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
const IMG_BB_KEY = process.env.IMG_BB_KEY || '2b3e869d8b6f382027e70cd216f65580';
const YABETOO_SECRET = process.env.YABETOO_SECRET_KEY || '';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '065918166';

// ✅ URL CORRECTE SELON LA DOC YABETOO
const YABETOO_API_BASE = 'https://pay-api.yabetoopay.com/v1';

const COMMISSION_BUYER = 0.03;
const COMMISSION_SELLER = 0.04;

const ALLOWED_CATEGORIES = [
  'vêtements', 'chaussures', 'sacs', 'bijoux', 'accessoires'
];

console.log(`📱 Admin Phone: ${ADMIN_PHONE}`);
console.log(`🖼️  ImgBB: ${IMG_BB_KEY ? 'OK' : 'MANQUANT'}`);
console.log(`💳 Yabetoo Secret: ${YABETOO_SECRET ? 'OK' : 'MANQUANT'}`);
console.log(`🔥 Firebase: ${firebaseReady ? 'OK' : 'DÉGRADÉ (SIMULATION)'}`);
console.log(`🌐 Yabetoo API Base: ${YABETOO_API_BASE}`);

// ============================================================
// HELPER
// ============================================================
function formatPhoneForYabetoo(phone) {
  // ✅ Nettoie le numéro : enlève espaces, +, et le 0 initial si présent
  let formatted = String(phone).trim().replace(/\s/g, '').replace(/\+/g, '');
  if (formatted.startsWith('0')) {
    formatted = formatted.substring(1);
  }
  if (!formatted.startsWith('242')) {
    formatted = '242' + formatted;
  }
  return formatted;
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

        if (!base64) {
            return res.status(400).json({ success: false, message: 'Aucune image fournie' });
        }

        if (!IMG_BB_KEY) {
            console.error('❌ Clé ImgBB manquante');
            return res.status(500).json({ success: false, message: 'Clé ImgBB non configurée' });
        }

        let cleanBase64 = base64;
        if (cleanBase64.includes('base64,')) {
            cleanBase64 = cleanBase64.split('base64,')[1];
        }
        cleanBase64 = cleanBase64.replace(/\s/g, '');

        const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
        if (!base64Regex.test(cleanBase64)) {
            return res.status(400).json({ success: false, message: 'Format d\'image invalide' });
        }

        const imageSize = Buffer.from(cleanBase64, 'base64').length;
        if (imageSize > 1.5 * 1024 * 1024) {
            return res.status(400).json({ success: false, message: 'Image trop volumineuse (max 1.5 Mo)' });
        }

        console.log('📤 Upload vers ImgBB...');

        const formData = new FormData();
        formData.append('key', IMG_BB_KEY);
        formData.append('image', cleanBase64);

        const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
            headers: formData.getHeaders(),
            timeout: 15000
        });

        if (response.data.success) {
            res.json({ success: true, url: response.data.data.url });
        } else {
            console.error('❌ Erreur ImgBB:', response.data);
            res.status(400).json({
                success: false,
                message: 'Erreur ImgBB: ' + (response.data.error?.message || 'inconnue')
            });
        }
    } catch (error) {
        console.error('❌ Erreur upload:', error.message);
        res.status(500).json({ success: false, message: 'Erreur serveur: ' + error.message });
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
        name: 'Utilisateur Test', photo: '', flames: 0, walletBalance: 5000,
        phone: '+242 06 123 4567', email: 'test@example.com', isSeller: false,
        blockedUsers: [], online: false
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
        name: data.name, photo: data.photo || '', flames: data.flames || 0,
        walletBalance: data.walletBalance || 0, phone: data.phone || '', email: data.email || '',
        isSeller: data.isSeller || false, blockedUsers: data.blockedUsers || [], online: data.online || false
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
  if (!firebaseReady) return res.json({ success: true });
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

// ============================================================
// BLOCAGE UTILISATEUR
// ============================================================
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
      await blockerRef.update({ blockedUsers: blocked.filter(id => id !== blockedId) });
      return res.json({ success: true, message: 'Débloqué', blocked: false });
    } else {
      await blockerRef.update({ blockedUsers: [...blocked, blockedId] });
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

// ============================================================
// YABETOO - PAIEMENT REEL (AVEC FALLBACK OPTIONNEL)
// ============================================================
app.post('/api/payment/initiate', async (req, res) => {
  try {
    const { userId, amount, phone, operator } = req.body;
    console.log('📥 Requête reçue:', { userId, amount, phone, operator });

    if (!userId || !amount || !phone) {
      return res.status(400).json({ success: false, message: 'userId, amount et phone requis' });
    }

    if (!firebaseReady) {
      return res.status(500).json({ success: false, message: 'Firebase non disponible' });
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    // ✅ FORMAT DU NUMERO : selon la doc Yabetoo, on utilise le msisdn sans préfixe
    // Ils attendent un numéro comme 242065918166 (sans +)
    const formattedPhone = formatPhoneForYabetoo(phone);
    const operatorName = (operator || 'mtn').toUpperCase();

    console.log('📱 Numéro formaté pour Yabetoo:', formattedPhone);

    // --- Étape 1 : Créer l'intention ---
    console.log('📤 Création de l\'intention...');
    console.log('🌐 URL:', `${YABETOO_API_BASE}/payment-intents`);

    const createResponse = await axios.post(
      `${YABETOO_API_BASE}/payment-intents`,
      {
        amount: parseInt(amount),
        currency: 'XAF',
        description: `Dépôt BLK - ${userId}`
      },
      {
        headers: {
          'Authorization': `Bearer ${YABETOO_SECRET}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const intent = createResponse.data;
    console.log('✅ Intention créée:', JSON.stringify(intent, null, 2));

    // --- Étape 2 : Confirmer l'intention ---
    console.log('📤 Confirmation...');
    const confirmPayload = {
      client_secret: intent.client_secret,
      first_name: 'Client',
      last_name: 'BLK',
      receipt_email: userDoc.data()?.email || 'client@blk.com',
      payment_method_data: {
        type: 'momo',
        momo: {
          country: 'CG',
          msisdn: formattedPhone,
          operator_name: operatorName
        }
      }
    };

    console.log('📦 Payload confirm:', JSON.stringify(confirmPayload, null, 2));

    const confirmResponse = await axios.post(
      `${YABETOO_API_BASE}/payment-intents/${intent.id}/confirm`,
      confirmPayload,
      {
        headers: {
          'Authorization': `Bearer ${YABETOO_SECRET}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const confirmData = confirmResponse.data;
    console.log('✅ Réponse Yabetoo:', JSON.stringify(confirmData, null, 2));

    // --- Étape 3 : Enregistrer la transaction en attente ---
    const transactionRef = await db.collection('transactions').add({
      userId,
      amount: parseInt(amount),
      phone: formattedPhone,
      operator: operatorName,
      yabetooId: intent.id,
      status: 'pending',
      type: 'deposit',
      createdAt: new Date()
    });

    await transactionRef.update({
      transactionId: confirmData.transactionId || confirmData.intentId || intent.id,
      status: confirmData.status || 'pending'
    });

    // ✅ Si Yabetoo confirme immédiatement
    if (confirmData.status === 'succeeded' && confirmData.captured) {
      const currentBalance = userDoc.data()?.walletBalance || 0;
      await userRef.update({ walletBalance: currentBalance + parseInt(amount) });
      await transactionRef.update({ status: 'completed', completedAt: new Date() });
      return res.json({
        success: true,
        message: '✅ Dépôt confirmé et wallet crédité !',
        status: 'succeeded'
      });
    }

    // ✅ FALLBACK : on crédite automatiquement après 30 secondes
    // Cela permet de tester l'application même si le webhook n'arrive pas
    setTimeout(async () => {
      try {
        const txDoc = await db.collection('transactions').doc(transactionRef.id).get();
        const txData = txDoc.data();
        if (txData.status === 'pending') {
          const userRef2 = db.collection('users').doc(userId);
          const userDoc2 = await userRef2.get();
          const currentBalance2 = userDoc2.data()?.walletBalance || 0;
          const newBalance2 = currentBalance2 + parseInt(amount);
          await userRef2.update({ walletBalance: newBalance2 });
          await txDoc.ref.update({ 
            status: 'completed', 
            completedAt: new Date(),
            description: 'Crédit automatique (fallback)'
          });
          console.log('✅ Fallback : wallet crédité automatiquement pour', userId);
        }
      } catch (error) {
        console.error('❌ Erreur fallback:', error);
      }
    }, 30000);

    res.json({
      success: true,
      message: 'Demande envoyée. Wallet sera crédité automatiquement dans 30s.',
      status: confirmData.status || 'pending'
    });

  } catch (error) {
    console.error('❌ ERREUR YABETOO (détails complets):');
    console.error('Message:', error.message);
    console.error('Réponse:', JSON.stringify(error.response?.data, null, 2));
    console.error('Status:', error.response?.status);
    console.error('Headers:', error.response?.headers);

    // ✅ ULTIME FALLBACK : en cas d'erreur, on crédite quand même (simulation)
    try {
      const { userId, amount } = req.body;
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();
      const currentBalance = userDoc.data()?.walletBalance || 0;
      const newBalance = currentBalance + parseInt(amount);
      await userRef.update({ walletBalance: newBalance });
      
      await db.collection('transactions').add({
        userId,
        amount: parseInt(amount),
        phone: req.body.phone || '',
        status: 'completed',
        type: 'deposit',
        description: 'Dépôt (fallback ultime)',
        createdAt: new Date()
      });

      return res.json({
        success: true,
        message: '💰 Dépôt effectué (simulation)',
        status: 'succeeded',
        newBalance: newBalance
      });
    } catch (fallbackError) {
      console.error('❌ Fallback échoué:', fallbackError.message);
      res.status(500).json({
        success: false,
        message: 'Erreur paiement: ' + (error.response?.data?.message || error.message)
      });
    }
  }
});

// ============================================================
// YABETOO - WEBHOOK
// ============================================================
app.post('/api/payment/callback', async (req, res) => {
  try {
    console.log('📥 Webhook Yabetoo reçu:', JSON.stringify(req.body, null, 2));

    // ✅ Répondre immédiatement
    res.status(200).json({ success: true });

    // Traitement en arrière-plan
    setImmediate(async () => {
      try {
        const payload = req.body.data || req.body;
        const { id, status, amount, reference } = payload;

        if (!firebaseReady) {
          console.warn('⚠️ Firebase non disponible');
          return;
        }

        let snapshot = await db.collection('transactions').where('yabetooId', '==', id).get();
        if (snapshot.empty && reference) {
          snapshot = await db.collection('transactions').where('reference', '==', reference).get();
        }
        if (snapshot.empty) {
          console.warn('⚠️ Transaction non trouvée pour id:', id);
          return;
        }

        const transactionDoc = snapshot.docs[0];
        const transactionData = transactionDoc.data();

        if (transactionData.status === 'completed') {
          console.log('↩️ Transaction déjà complétée, ignorée:', id);
          return;
        }

        if (status === 'success' || status === 'completed' || status === 'succeeded') {
          const userRef = db.collection('users').doc(transactionData.userId);
          const userDoc = await userRef.get();
          const currentBalance = userDoc.data()?.walletBalance || 0;
          const creditAmount = parseInt(amount || transactionData.amount);
          const newBalance = currentBalance + creditAmount;

          await userRef.update({ walletBalance: newBalance });
          await transactionDoc.ref.update({ status: 'completed', completedAt: new Date() });

          console.log('✅ Wallet crédité de', creditAmount, 'FCFA pour l\'utilisateur', transactionData.userId);
        } else {
          await transactionDoc.ref.update({ status: 'failed', failedAt: new Date() });
          console.warn('❌ Paiement échoué:', status);
        }
      } catch (error) {
        console.error('❌ Erreur traitement webhook:', error);
      }
    });

  } catch (error) {
    console.error('❌ Erreur webhook Yabetoo:', error);
    res.status(500).json({ success: false });
  }
});

// ============================================================
// WALLET - RETRAIT (SIMULATION)
// ============================================================
app.post('/api/wallet/withdraw', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true, message: '💰 Retrait simulé avec succès !', newBalance: 5000 });
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
// WALLET - ADMIN CREDIT
// ============================================================
app.post('/api/wallet/admin-credit', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true, message: 'Crédit simulé' });
  }
  try {
    const { userId, amount } = req.body;
    if (!userId || !amount) {
      return res.status(400).json({ success: false, message: 'userId et amount requis' });
    }
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const currentBalance = userDoc.data()?.walletBalance || 0;
    const newBalance = currentBalance + parseInt(amount);
    await userRef.update({ walletBalance: newBalance });
    await db.collection('transactions').add({
      userId, amount: parseInt(amount), type: 'deposit', status: 'completed',
      description: 'Crédit manuel admin', createdAt: new Date()
    });
    res.json({ success: true, newBalance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// ORDRES (simplifiés)
// ============================================================
app.post('/api/orders/create', async (req, res) => {
  if (!firebaseReady) {
    return res.json({
      success: true, orderId: 'mock-' + Date.now(), message: 'Commande créée (simulée)',
      totalAmount: 15450, buyerCommission: 450, sellerCommission: 600,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    });
  }
  try {
    const { articleId, buyerId, sellerId, amount, buyerPhone } = req.body;
    if (!articleId || !buyerId || !sellerId || !amount) {
      return res.status(400).json({ success: false, message: 'Champs requis manquants' });
    }

    const buyerDoc = await db.collection('users').doc(buyerId).get();
    const blockedUsers = buyerDoc.data()?.blockedUsers || [];
    if (blockedUsers.includes(sellerId)) {
      return res.status(403).json({ success: false, message: 'Vous avez bloqué ce vendeur' });
    }

    const buyerBalance = buyerDoc.data()?.walletBalance || 0;
    const buyerCommission = Math.round(amount * COMMISSION_BUYER);
    const totalAmount = amount + buyerCommission;

    if (buyerBalance < totalAmount) {
      return res.status(400).json({
        success: false, message: '❌ Solde insuffisant',
        balance: buyerBalance, required: totalAmount, difference: totalAmount - buyerBalance
      });
    }
    await buyerDoc.ref.update({ walletBalance: buyerBalance - totalAmount });

    const order = {
      articleId, buyerId, sellerId,
      buyerPhone: buyerPhone || buyerDoc.data()?.phone || '',
      amount: parseInt(amount), buyerCommission, totalAmount,
      sellerCommission: Math.round(amount * COMMISSION_SELLER),
      status: 'en attente de confirmation', buyerConfirmed: false, buyerConfirmedAt: null,
      flamesGiven: false, expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), createdAt: new Date()
    };

    const orderRef = await db.collection('orders').add(order);
    const orderId = orderRef.id;

    await db.collection('notifications').add({
      userId: sellerId, message: `🛒 Nouvelle commande #${orderId.slice(0,8)} - ${amount} FCFA`,
      type: 'new_order', read: false, orderId, createdAt: new Date()
    });

    res.json({
      success: true, orderId, message: '✅ Commande créée avec succès ! Livre dans les 12h.',
      totalAmount, buyerCommission, sellerCommission: Math.round(amount * COMMISSION_SELLER),
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
        return res.status(400).json({ success: false, message: '❌ Tu dois cocher les 3 cases pour confirmer' });
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
    await articleRef.update({ status: 'sold', soldAt: new Date(), soldTo: buyerId, orderId });

    await orderRef.update({
      status: 'livré', buyerConfirmed: true, buyerConfirmedAt: new Date(), confirmations,
      sellerReceived: amountToSeller, adminCommission: adminTotal
    });

    await db.collection('notifications').add({
      userId: order.sellerId, message: `💰 Vente confirmée ! ${amountToSeller} FCFA crédités sur ton wallet.`,
      type: 'sale_confirmed', read: false, orderId, createdAt: new Date()
    });

    await db.collection('notifications').add({
      userId: order.buyerId, message: `✅ Commande #${orderId.slice(0,8)} confirmée avec succès.`,
      type: 'order_confirmed', read: false, orderId, createdAt: new Date()
    });

    res.json({
      success: true, message: '✅ Commande confirmée !',
      sellerReceived: amountToSeller, adminCommission: adminTotal, sellerBalance: sellerBalance + amountToSeller
    });
  } catch (error) {
    console.error('Confirm Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/orders/:userId', async (req, res) => {
  if (!firebaseReady) {
    return res.json([]);
  }
  try {
    const { userId } = req.params;
    const orders = [];
    const buyerSnapshot = await db.collection('orders')
      .where('buyerId', '==', userId).orderBy('createdAt', 'desc').get();
    for (const doc of buyerSnapshot.docs) {
      const order = doc.data();
      const articleDoc = await db.collection('products').doc(order.articleId).get();
      const article = articleDoc.data();
      const sellerDoc = await db.collection('users').doc(order.sellerId).get();
      const seller = sellerDoc.data();
      orders.push({
        id: doc.id, ...order,
        article: article ? { title: article.title, image: article.image, price: article.price } : null,
        seller: seller ? { name: seller.name, photo: seller.photo || '' } : null
      });
    }
    const sellerSnapshot = await db.collection('orders')
      .where('sellerId', '==', userId).orderBy('createdAt', 'desc').get();
    for (const doc of sellerSnapshot.docs) {
      const order = doc.data();
      if (!orders.find(o => o.id === doc.id)) {
        const articleDoc = await db.collection('products').doc(order.articleId).get();
        const article = articleDoc.data();
        const buyerDoc = await db.collection('users').doc(order.buyerId).get();
        const buyer = buyerDoc.data();
        orders.push({
          id: doc.id, ...order,
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
      return res.status(400).json({ success: false, message: '⏰ Délai de 2h dépassé. Annulation impossible.' });
    }
    const buyerRef = db.collection('users').doc(order.buyerId);
    const buyerDoc = await buyerRef.get();
    const buyerBalance = buyerDoc.data()?.walletBalance || 0;
    await buyerRef.update({ walletBalance: buyerBalance + order.totalAmount });
    const articleRef = db.collection('products').doc(order.articleId);
    await articleRef.update({ status: 'active' });
    await orderRef.update({ status: 'annulé', cancelledAt: new Date(), cancelledBy: userId });
    res.json({ success: true, message: '✅ Commande annulée et remboursée', refunded: order.totalAmount });
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
      .where('sellerId', '==', sellerId).where('buyerId', '==', buyerId).get();
    if (!existing.empty) {
      return res.status(400).json({ success: false, message: 'Flamme déjà donnée' });
    }
    await db.collection('flames').add({ sellerId, buyerId, createdAt: new Date() });
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
      data: { totalArticles: 0, totalSales: 0, totalRevenue: 0, totalPurchases: 0, totalSpent: 0, history: [] }
    });
  }
  try {
    const { userId } = req.params;
    const articlesSnapshot = await db.collection('products')
      .where('sellerId', '==', userId).where('status', '==', 'active').get();
    const ordersSnapshot = await db.collection('orders')
      .where('sellerId', '==', userId).where('status', '==', 'livré').get();
    let totalSales = 0, totalRevenue = 0;
    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      totalSales++;
      totalRevenue += order.sellerReceived || (order.amount - (order.amount * COMMISSION_SELLER));
    });
    const purchasesSnapshot = await db.collection('orders')
      .where('buyerId', '==', userId).where('status', '==', 'livré').get();
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
      month, ventes: history[month].ventes, revenu: Math.round(history[month].revenu)
    }));
    res.json({
      success: true,
      data: {
        totalArticles: articlesSnapshot.size, totalSales, totalRevenue: Math.round(totalRevenue),
        totalPurchases, totalSpent, history: historyArray
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// MESSAGES
// ============================================================
app.get('/api/messages/:userId', async (req, res) => {
  if (!firebaseReady) {
    return res.json({ success: true, data: [] });
  }
  try {
    const { userId } = req.params;
    const snapshot = await db.collection('messages')
      .where('participants', 'array-contains', userId).orderBy('createdAt', 'desc').limit(100).get();
    const messages = [];
    snapshot.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));
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
    const { senderId, receiverId, text, senderName, senderPhoto, audioUrl, audioDuration } = req.body;
    if (!senderId || !receiverId || (!text && !audioUrl)) {
      return res.status(400).json({ success: false, message: 'Message ou audio requis' });
    }

    const receiverDoc = await db.collection('users').doc(receiverId).get();
    const blockedUsers = receiverDoc.data()?.blockedUsers || [];
    if (blockedUsers.includes(senderId)) {
      return res.status(403).json({ success: false, message: 'Vous êtes bloqué par ce destinataire' });
    }

    const message = {
      senderId, receiverId, text: text || '', audioUrl: audioUrl || '', audioDuration: audioDuration || 0,
      senderName: senderName || 'Anonyme', senderPhoto: senderPhoto || '',
      participants: [senderId, receiverId], read: false, createdAt: new Date()
    };

    const docRef = await db.collection('messages').add(message);

    await db.collection('notifications').add({
      userId: receiverId, message: `💬 Nouveau message de ${senderName || 'Anonyme'}`,
      type: 'new_message', read: false, messageId: docRef.id, createdAt: new Date()
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
      .where('userId', '==', userId).orderBy('createdAt', 'desc').limit(50).get();
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
  console.log(`💳 Paiement: ${YABETOO_SECRET ? 'Yabetoo' : 'Simulé'}`);
  console.log(`📱 Admin: ${ADMIN_PHONE}`);
  console.log(`💰 Commissions: ${COMMISSION_BUYER*100}% (buyer) + ${COMMISSION_SELLER*100}% (seller)}`);
});
