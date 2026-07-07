const express = require('express'); 
const cors = require('cors'); 
const admin = require('firebase-admin'); 
const axios = require('axios'); 
const FormData = require('form-data'); 
const cron = require('node-cron');

const app = express(); 
const PORT = process.env.PORT || 10000;

app.use(cors()); 
app.use(express.json({ limit: '10mb' }));

//  
// FIREBASE 
//  
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); 
admin.initializeApp({ 
credential: admin.credential.cert(serviceAccount) 
}); 
const db = admin.firestore();

//  
// CONFIGURATION 
//  
const IMG_BB_KEY = process.env.IMG_BB_KEY; 
const YABETOO_PUBLIC = process.env.YABETOO_PUBLIC_KEY; 
const YABETOO_SECRET = process.env.YABETOO_SECRET_KEY; 
const ADMIN_PHONE = process.env.ADMIN_PHONE || '065918166';

const COMMISSION_BUYER = 0.03; 
const COMMISSION_SELLER = 0.04;

const ALLOWED_CATEGORIES = [ 
'vêtements', 
'chaussures', 
'sacs', 
'bijoux', 
'accessoires' 
];

console.log('✅ BLK Marketplace - 100% RÉEL'); 
console.log(✅ Admin Phone: ${ADMIN_PHONE});

//  
// CRON - REMBOURSEMENT 12h (toutes les heures) 
//  
cron.schedule('0 * * * *', async () => { 
console.log('⏰ Vérification des commandes expirées...'); 
try { 
const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000); 
const snapshot = await db.collection('orders') 
.where('status', '', 'en attente de confirmation') 
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

async function refundOrder(orderId, order) { 
try { 
const buyerRef = db.collection('users').doc(order.buyerId); 
const buyerDoc = await buyerRef.get(); 
const buyerBalance = buyerDoc.data()?.walletBalance || 0;

await buyerRef.update({
  walletBalance: buyerBalance + order.totalAmount
});

await db.collection('orders').doc(orderId).update({
  status: 'remboursé',
  refundedAt: new Date()
});

await db.collection('notifications').add({
  userId: order.buyerId,
  message: `💰 Remboursement de ${order.totalAmount} FCFA pour la commande #${orderId.slice(0, 8)}`,
  type: 'refund',
  read: false,
  createdAt: new Date()
});

console.log(`✅ Remboursement effectué pour ${orderId}`);
} catch (error) { 
console.error(❌ Erreur remboursement ${orderId}:, error.message); 
} 
}

//  
// ROUTE PRINCIPALE 
//  
app.get('/', (req, res) => { 
res.json({ 
status: 'OK', 
message: 'BLK Marketplace API - 100% RÉEL', 
services: { 
imgbb: IMG_BB_KEY ? '✅' : '❌', 
yabetoo: YABETOO_SECRET ? '✅' : '❌', 
firebase: '✅' 
} 
}); 
});

//  
// CATÉGORIES 
//  
app.get('/api/categories', (req, res) => { 
res.json({ success: true, data: ALLOWED_CATEGORIES }); 
});

//  
// ARTICLES 
//  
app.get('/api/articles', async (req, res) => { 
try { 
const snapshot = await db.collection('articles') 
.where('status', '', 'active') 
.orderBy('createdAt', 'desc') 
.get(); 
const articles = []; 
snapshot.forEach(doc => { 
articles.push({ id: doc.id, ...doc.data() }); 
}); 
res.json({ success: true, data: articles }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.get('/api/articles/seller/:sellerId', async (req, res) => { 
try { 
const { sellerId } = req.params; 
const snapshot = await db.collection('articles') 
.where('sellerId', '', sellerId) 
.orderBy('createdAt', 'desc') 
.get(); 
const articles = []; 
snapshot.forEach(doc => { 
articles.push({ id: doc.id, ...doc.data() }); 
}); 
res.json({ success: true, data: articles }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.post('/api/articles', async (req, res) => { 
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

const docRef = await db.collection('articles').add(article);
res.json({ success: true, id: docRef.id });
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.delete('/api/articles/:id', async (req, res) => { 
try { 
const { id } = req.params; 
await db.collection('articles').doc(id).update({ status: 'inactive' }); 
res.json({ success: true }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.post('/api/articles/view/:id', async (req, res) => { 
try { 
const { id } = req.params; 
const doc = await db.collection('articles').doc(id).get(); 
const views = (doc.data()?.views || 0) + 1; 
await db.collection('articles').doc(id).update({ views }); 
res.json({ success: true, views }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

//  
// UPLOAD IMAGE (ImgBB) 
//  
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

//  
// UTILISATEURS 
//  
app.get('/api/users/:userId', async (req, res) => { 
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

//  
// WALLET 
//  
app.get('/api/wallet/:userId', async (req, res) => { 
try { 
const { userId } = req.params; 
const doc = await db.collection('users').doc(userId).get(); 
res.json({ balance: doc.data()?.walletBalance || 0 }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.post('/api/wallet/deposit', async (req, res) => { 
try { 
const { userId, amount, phone } = req.body; 
if (!userId || !amount || !phone) { 
return res.status(400).json({ success: false, message: 'userId, amount et phone requis' }); 
}

if (!YABETOO_SECRET) {
  return res.status(500).json({ success: false, message: 'Yabetoo non configuré' });
}

const reference = `DEP-${userId.slice(0, 8)}-${Date.now().toString().slice(-6)}`;

const yabResponse = await axios.post('https://api.yabetoo.com/v1/payment/initiate', {
  amount: parseInt(amount),
  phone: phone,
  reference: reference,
  description: 'Dépôt BLK Wallet',
  callback_url: `https://blk-marketplace-7vig.onrender.com/api/payment/callback`
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
  res.status(400).json({
    success: false,
    message: yabResponse.data?.message || 'Erreur Yabetoo'
  });
}
} catch (error) { 
console.error('Deposit Error:', error.response?.data || error.message); 
res.status(500).json({ 
success: false, 
message: error.response?.data?.message || 'Erreur dépôt' 
}); 
} 
});

app.post('/api/wallet/withdraw', async (req, res) => { 
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

const reference = `WTH-${userId.slice(0, 8)}-${Date.now().toString().slice(-6)}`;

const yabResponse = await axios.post('https://api.yabetoo.com/v1/withdraw', {
  amount: parseInt(amount),
  phone: phone,
  reference: reference,
  callback_url: `https://blk-marketplace-7vig.onrender.com/api/payment/callback`
}, {
  headers: {
    'Authorization': `Bearer ${YABETOO_SECRET}`,
    'Content-Type': 'application/json'
  }
});

if (yabResponse.data && yabResponse.data.status === 'success') {
  await userRef.update({
    walletBalance: currentBalance - amount
  });

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
  res.status(400).json({
    success: false,
    message: yabResponse.data?.message || 'Erreur Yabetoo'
  });
}
} catch (error) { 
console.error('Withdraw Error:', error.response?.data || error.message); 
res.status(500).json({ 
success: false, 
message: error.response?.data?.message || 'Erreur retrait' 
}); 
} 
});

//  
// PAIEMENT CALLBACK (Webhook Yabetoo) 
//  
app.post('/api/payment/callback', async (req, res) => { 
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
    await userRef.update({
      walletBalance: currentBalance + data.amount
    });
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

//  
// ORDRES 
//  
app.post('/api/orders/create', async (req, res) => { 
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

await buyerRef.update({
  walletBalance: buyerBalance - totalAmount
});

const order = {
  articleId,
  buyerId,
  sellerId,
  buyerPhone: buyerPhone || buyerDoc.data()?.phone || '',
  amount: parseInt(amount),
  buyerCommission: buyerCommission,
  totalAmount: totalAmount,
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
  message: `🛒 Nouvelle commande #${orderId.slice(0, 8)} - ${amount} FCFA`,
  type: 'new_order',
  read: false,
  orderId: orderId,
  createdAt: new Date()
});

res.json({
  success: true,
  orderId: orderId,
  message: '✅ Commande créée avec succès ! Livre dans les 12h.',
  totalAmount: totalAmount,
  buyerCommission: buyerCommission,
  sellerCommission: Math.round(amount * COMMISSION_SELLER),
  expiresAt: order.expiresAt
});
} catch (error) { 
console.error('Order Error:', error.message); 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.post('/api/orders/confirm', async (req, res) => { 
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
await sellerRef.update({
  walletBalance: sellerBalance + amountToSeller
});

// MARQUER L'ARTICLE COMME VENDU
const articleRef = db.collection('articles').doc(order.articleId);
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
      reference: `COM-${orderId.slice(0, 8)}-${adminRef}`,
      callback_url: `https://blk-marketplace-7vig.onrender.com/api/payment/callback`
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
  confirmations: confirmations,
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
  message: `✅ Commande #${orderId.slice(0, 8)} confirmée avec succès.`,
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
try { 
const { userId } = req.params; 
const snapshot = await db.collection('orders') 
.where('buyerId', '', userId) 
.orderBy('createdAt', 'desc') 
.get();

const orders = [];
for (const doc of snapshot.docs) {
  const order = doc.data();
  const articleDoc = await db.collection('articles').doc(order.articleId).get();
  const article = articleDoc.data();
  const sellerDoc = await db.collection('users').doc(order.sellerId).get();
  const seller = sellerDoc.data();

  orders.push({
    id: doc.id,
    ...order,
    article: article ? {
      title: article.title,
      image: article.image,
      price: article.price
    } : null,
    seller: seller ? {
      name: seller.name,
      photo: seller.photo || ''
    } : null
  });
}

const sellerSnapshot = await db.collection('orders')
  .where('sellerId', '==', userId)
  .orderBy('createdAt', 'desc')
  .get();

for (const doc of sellerSnapshot.docs) {
  const order = doc.data();
  if (!orders.find(o => o.id === doc.id)) {
    const articleDoc = await db.collection('articles').doc(order.articleId).get();
    const article = articleDoc.data();
    const buyerDoc = await db.collection('users').doc(order.buyerId).get();
    const buyer = buyerDoc.data();

    orders.push({
      id: doc.id,
      ...order,
      article: article ? {
        title: article.title,
        image: article.image,
        price: article.price
      } : null,
      buyer: buyer ? {
        name: buyer.name,
        photo: buyer.photo || ''
      } : null
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
await buyerRef.update({
  walletBalance: buyerBalance + order.totalAmount
});

// Restaurer l'article
const articleRef = db.collection('articles').doc(order.articleId);
await articleRef.update({
  status: 'active'
});

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

//  
// FLAMMES 
//  
app.post('/api/flames', async (req, res) => { 
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
try { 
const { userId } = req.params; 
const doc = await db.collection('users').doc(userId).get(); 
res.json({ flames: doc.data()?.flames || 0 }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

//  
// STATISTIQUES 
//  
app.get('/api/stats/:userId', async (req, res) => { 
try { 
const { userId } = req.params;

const articlesSnapshot = await db.collection('articles')
  .where('sellerId', '==', userId)
  .where('status', '==', 'active')
  .get();

const ordersSnapshot = await db.collection('orders')
  .where('sellerId', '==', userId)
  .where('status', '==', 'livré')
  .get();

let totalSales = 0;
let totalRevenue = 0;
ordersSnapshot.forEach(doc => {
  const order = doc.data();
  totalSales += 1;
  totalRevenue += order.sellerReceived || (order.amount - (order.amount * COMMISSION_SELLER));
});

const purchasesSnapshot = await db.collection('orders')
  .where('buyerId', '==', userId)
  .where('status', '==', 'livré')
  .get();

let totalPurchases = 0;
let totalSpent = 0;
purchasesSnapshot.forEach(doc => {
  const order = doc.data();
  totalPurchases += 1;
  totalSpent += order.totalAmount || order.amount;
});

// Historique des ventes par mois (pour graphique)
const history = {};
ordersSnapshot.forEach(doc => {
  const order = doc.data();
  const date = order.createdAt?.toDate?.() || new Date(order.createdAt);
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  if (!history[month]) {
    history[month] = { ventes: 0, revenu: 0 };
  }
  history[month].ventes += 1;
  history[month].revenu += order.sellerReceived || (order.amount - (order.amount * COMMISSION_SELLER));
});

res.json({
  success: true,
  data: {
    totalArticles: articlesSnapshot.size,
    totalSales,
    totalRevenue: Math.round(totalRevenue),
    totalPurchases,
    totalSpent,
    history: Object.keys(history).sort().map(month => ({
      month,
      ventes: history[month].ventes,
      revenu: Math.round(history[month].revenu)
    }))
  }
});
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

//  
// TRANSACTIONS (Historique dans le profil) 
//  
app.get('/api/transactions/:userId', async (req, res) => { 
try { 
const { userId } = req.params; 
const snapshot = await db.collection('transactions') 
.where('userId', '', userId) 
.orderBy('createdAt', 'desc') 
.limit(100) 
.get();

const transactions = [];
snapshot.forEach(doc => {
  transactions.push({ id: doc.id, ...doc.data() });
});

// Ajouter les commandes comme transactions
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
    description: `Achat #${doc.id.slice(0, 8)} - ${order.amount} FCFA + commission`,
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
    description: `Vente #${doc.id.slice(0, 8)} - ${order.amount} FCFA - commission ${Math.round(order.amount * COMMISSION_SELLER)} FCFA`,
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

//  
// MESSAGES 
//  
app.get('/api/messages/:userId', async (req, res) => { 
try { 
const { userId } = req.params; 
const snapshot = await db.collection('messages') 
.where('participants', 'array-contains', userId) 
.orderBy('createdAt', 'desc') 
.limit(100) 
.get();

const messages = [];
snapshot.forEach(doc => {
  messages.push({ id: doc.id, ...doc.data() });
});

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

//  
// NOTIFICATIONS 
//  
app.get('/api/notifications/:userId', async (req, res) => { 
try { 
const { userId } = req.params; 
const snapshot = await db.collection('notifications') 
.where('userId', '', userId) 
.orderBy('createdAt', 'desc') 
.limit(50) 
.get();

const notifications = [];
snapshot.forEach(doc => {
  notifications.push({ id: doc.id, ...doc.data() });
});

res.json({ success: true, data: notifications });
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.post('/api/notifications/read/:id', async (req, res) => { 
try { 
const { id } = req.params; 
await db.collection('notifications').doc(id).update({ read: true }); 
res.json({ success: true }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

//  
// DÉMARRAGE 
//  
app.listen(PORT, () => { 
console.log(✅ BLK API running on port ${PORT}); 
console.log(📦 Mode: 100% RÉEL); 
console.log(💳 Paiement: MTN Mobile Money (Yabetoo)); 
console.log(📱 Admin: ${ADMIN_PHONE}); 
console.log(💰 Commissions: ${COMMISSION_BUYER*100}% (buyer) + ${COMMISSION_SELLER*100}% (seller)); 
});
