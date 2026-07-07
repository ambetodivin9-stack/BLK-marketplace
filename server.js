const express = require('express'); 
const cors = require('cors'); 
const admin = require('firebase-admin'); 
const axios = require('axios'); 
const FormData = require('form-data');

const app = express(); 
const PORT = process.env.PORT || 10000;

app.use(cors()); 
app.use(express.json({ limit: '10mb' }));

console.log('✅ BLK Marketplace - Démarrage...');

//  
// FIREBASE (seulement si la variable existe) 
//  
let db = null; 
try { 
if (process.env.FIREBASE_SERVICE_ACCOUNT) { 
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); 
admin.initializeApp({ 
credential: admin.credential.cert(serviceAccount) 
}); 
db = admin.firestore(); 
console.log('✅ Firebase connecté'); 
} else { 
console.log('⚠️ Firebase non configuré (mode dégradé)'); 
} 
} catch (error) { 
console.log('⚠️ Erreur Firebase:', error.message); 
}

//  
// CONFIGURATION 
//  
const IMG_BB_KEY = process.env.IMG_BB_KEY || ''; 
const YABETOO_SECRET = process.env.YABETOO_SECRET_KEY || ''; 
const ADMIN_PHONE = process.env.ADMIN_PHONE || '065918166';

console.log('✅ Admin Phone: ' + ADMIN_PHONE); 
console.log('✅ ImgBB: ' + (IMG_BB_KEY ? 'OK' : 'MANQUANT')); 
console.log('✅ Yabetoo: ' + (YABETOO_SECRET ? 'OK' : 'MANQUANT'));

//  
// ROUTE PRINCIPALE 
//  
app.get('/', (req, res) => { 
res.json({ 
status: 'OK', 
message: 'BLK Marketplace API', 
services: { 
firebase: db ? '✅' : '❌', 
imgbb: IMG_BB_KEY ? '✅' : '❌', 
yabetoo: YABETOO_SECRET ? '✅' : '❌' 
} 
}); 
});

//  
// SANTÉ 
//  
app.get('/health', (req, res) => { 
res.json({ status: 'healthy', timestamp: new Date().toISOString() }); 
});

//  
// ARTICLES 
//  
app.get('/api/articles', async (req, res) => { 
if (!db) return res.json({ success: true, data: [] }); 
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

app.post('/api/articles', async (req, res) => { 
if (!db) return res.status(500).json({ success: false, message: 'Base de données non disponible' }); 
try { 
const { title, description, price, category, image, sellerId, sellerName } = req.body; 
const article = { 
title, 
description, 
price: parseInt(price), 
category: category || 'autres', 
image: image || '', 
sellerId, 
sellerName: sellerName || 'Anonyme', 
status: 'active', 
createdAt: new Date() 
}; 
const docRef = await db.collection('articles').add(article); 
res.json({ success: true, id: docRef.id }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.get('/api/articles/seller/:sellerId', async (req, res) => { 
if (!db) return res.json({ success: true, data: [] }); 
try { 
const snapshot = await db.collection('articles') 
.where('sellerId', '', req.params.sellerId) 
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

app.delete('/api/articles/:id', async (req, res) => { 
if (!db) return res.status(500).json({ success: false, message: 'Base de données non disponible' }); 
try { 
await db.collection('articles').doc(req.params.id).update({ status: 'inactive' }); 
res.json({ success: true }); 
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
if (!db) return res.status(500).json({ success: false, message: 'Base de données non disponible' }); 
try { 
const doc = await db.collection('users').doc(req.params.userId).get(); 
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
if (!db) return res.status(500).json({ success: false, message: 'Base de données non disponible' }); 
try { 
const { name, email, phone, photo } = req.body; 
const updateData = {}; 
if (name) updateData.name = name; 
if (email) updateData.email = email; 
if (phone) updateData.phone = phone; 
if (photo) updateData.photo = photo; 
await db.collection('users').doc(req.params.userId).update(updateData); 
res.json({ success: true }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

//  
// WALLET 
//  
app.get('/api/wallet/:userId', async (req, res) => { 
if (!db) return res.json({ balance: 0 }); 
try { 
const doc = await db.collection('users').doc(req.params.userId).get(); 
res.json({ balance: doc.data()?.walletBalance || 0 }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.post('/api/wallet/deposit', async (req, res) => { 
if (!db) return res.status(500).json({ success: false, message: 'Base de données non disponible' }); 
try { 
const { userId, amount, phone } = req.body; 
if (!userId || !amount || !phone) { 
return res.status(400).json({ success: false, message: 'userId, amount et phone requis' }); 
}

// Simuler un dépôt (sans Yabetoo pour l'instant)
const userRef = db.collection('users').doc(userId);
const doc = await userRef.get();
const currentBalance = doc.data()?.walletBalance || 0;
await userRef.update({
  walletBalance: currentBalance + parseInt(amount)
});

await db.collection('transactions').add({
  userId,
  amount: parseInt(amount),
  phone,
  type: 'deposit',
  status: 'completed',
  createdAt: new Date()
});

res.json({
  success: true,
  message: '💰 Dépôt simulé avec succès !',
  newBalance: currentBalance + parseInt(amount)
});
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.post('/api/wallet/withdraw', async (req, res) => { 
if (!db) return res.status(500).json({ success: false, message: 'Base de données non disponible' }); 
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

await userRef.update({
  walletBalance: currentBalance - parseInt(amount)
});

await db.collection('transactions').add({
  userId,
  amount: parseInt(amount),
  phone,
  type: 'withdraw',
  status: 'completed',
  createdAt: new Date()
});

res.json({
  success: true,
  message: '💰 Retrait simulé avec succès !',
  newBalance: currentBalance - parseInt(amount)
});
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

//  
// ORDRES 
//  
app.post('/api/orders/create', async (req, res) => { 
if (!db) return res.status(500).json({ success: false, message: 'Base de données non disponible' }); 
try { 
const { articleId, buyerId, sellerId, amount } = req.body; 
if (!articleId || !buyerId || !sellerId || !amount) { 
return res.status(400).json({ success: false, message: 'Champs requis manquants' }); 
}

const buyerDoc = await db.collection('users').doc(buyerId).get();
const buyerBalance = buyerDoc.data()?.walletBalance || 0;
const totalAmount = amount + Math.round(amount * 0.03);

if (buyerBalance < totalAmount) {
  return res.status(400).json({
    success: false,
    message: 'Solde insuffisant',
    balance: buyerBalance,
    required: totalAmount
  });
}

await db.collection('users').doc(buyerId).update({
  walletBalance: buyerBalance - totalAmount
});

const order = {
  articleId,
  buyerId,
  sellerId,
  amount: parseInt(amount),
  totalAmount,
  status: 'en attente de confirmation',
  expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
  createdAt: new Date()
};

const orderRef = await db.collection('orders').add(order);

res.json({
  success: true,
  orderId: orderRef.id,
  message: '✅ Commande créée avec succès !'
});
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.get('/api/orders/:userId', async (req, res) => { 
if (!db) return res.json([]); 
try { 
const snapshot = await db.collection('orders') 
.where('buyerId', '', req.params.userId) 
.orderBy('createdAt', 'desc') 
.get(); 
const orders = []; 
snapshot.forEach(doc => { 
orders.push({ id: doc.id, ...doc.data() }); 
});

const sellerSnapshot = await db.collection('orders')
  .where('sellerId', '==', req.params.userId)
  .orderBy('createdAt', 'desc')
  .get();
sellerSnapshot.forEach(doc => {
  const order = doc.data();
  if (!orders.find(o => o.id === doc.id)) {
    orders.push({ id: doc.id, ...order });
  }
});

orders.sort((a, b) => {
  const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
  const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
  return dateB - dateA;
});

res.json(orders);
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.post('/api/orders/confirm', async (req, res) => { 
if (!db) return res.status(500).json({ success: false, message: 'Base de données non disponible' }); 
try { 
const { orderId, buyerId, confirmations } = req.body; 
if (!orderId || !buyerId || !confirmations) { 
return res.status(400).json({ success: false, message: 'Champs requis' }); 
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

await orderRef.update({
  status: 'livré',
  buyerConfirmed: true,
  buyerConfirmedAt: new Date()
});

await db.collection('articles').doc(order.articleId).update({
  status: 'sold'
});

// Créditer le vendeur (moins commission 4%)
const sellerCommission = Math.round(order.amount * 0.04);
const amountToSeller = order.amount - sellerCommission;
const sellerRef = db.collection('users').doc(order.sellerId);
const sellerDoc = await sellerRef.get();
const sellerBalance = sellerDoc.data()?.walletBalance || 0;
await sellerRef.update({
  walletBalance: sellerBalance + amountToSeller
});

res.json({
  success: true,
  message: '✅ Commande confirmée !',
  sellerReceived: amountToSeller
});
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.post('/api/orders/cancel/:orderId', async (req, res) => { 
if (!db) return res.status(500).json({ success: false, message: 'Base de données non disponible' }); 
try { 
const orderRef = db.collection('orders').doc(req.params.orderId); 
const orderDoc = await orderRef.get(); 
if (!orderDoc.exists) { 
return res.status(404).json({ success: false, message: 'Commande non trouvée' }); 
}

const order = orderDoc.data();
const now = new Date();
const createdAt = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);

if (hoursSinceCreation > 2) {
  return res.status(400).json({
    success: false,
    message: '⏰ Délai de 2h dépassé. Annulation impossible.'
  });
}

// Rembourser l'acheteur
const buyerRef = db.collection('users').doc(order.buyerId);
const buyerDoc = await buyerRef.get();
const buyerBalance = buyerDoc.data()?.walletBalance || 0;
await buyerRef.update({
  walletBalance: buyerBalance + order.totalAmount
});

await orderRef.update({
  status: 'annulé'
});

res.json({
  success: true,
  message: '✅ Commande annulée et remboursée'
});
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

//  
// FLAMMES 
//  
app.post('/api/flames', async (req, res) => { 
if (!db) return res.status(500).json({ success: false, message: 'Base de données non disponible' }); 
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
if (!db) return res.json({ flames: 0 }); 
try { 
const doc = await db.collection('users').doc(req.params.userId).get(); 
res.json({ flames: doc.data()?.flames || 0 }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

//  
// STATISTIQUES 
//  
app.get('/api/stats/:userId', async (req, res) => { 
if (!db) return res.json({ success: true, data: {} }); 
try { 
const articlesSnapshot = await db.collection('articles') 
.where('sellerId', '', req.params.userId) 
.where('status', '', 'active') 
.get();

const ordersSnapshot = await db.collection('orders')
  .where('sellerId', '==', req.params.userId)
  .where('status', '==', 'livré')
  .get();

let totalSales = 0;
let totalRevenue = 0;
ordersSnapshot.forEach(doc => {
  const order = doc.data();
  totalSales += 1;
  totalRevenue += order.amount || 0;
});

const history = {};
ordersSnapshot.forEach(doc => {
  const order = doc.data();
  const date = order.createdAt?.toDate?.() || new Date(order.createdAt);
  const month = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  if (!history[month]) {
    history[month] = { ventes: 0, revenu: 0 };
  }
  history[month].ventes += 1;
  history[month].revenu += order.amount || 0;
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
    history: historyArray
  }
});
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

//  
// TRANSACTIONS 
//  
app.get('/api/transactions/:userId', async (req, res) => { 
if (!db) return res.json({ success: true, data: [] }); 
try { 
const snapshot = await db.collection('transactions') 
.where('userId', '', req.params.userId) 
.orderBy('createdAt', 'desc') 
.limit(50) 
.get();

const transactions = [];
snapshot.forEach(doc => {
  transactions.push({ id: doc.id, ...doc.data() });
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
if (!db) return res.json({ success: true, data: [] }); 
try { 
const snapshot = await db.collection('messages') 
.where('participants', 'array-contains', req.params.userId) 
.orderBy('createdAt', 'desc') 
.limit(100) 
.get();

const messages = [];
snapshot.forEach(doc => {
  messages.push({ id: doc.id, ...doc.data() });
});

res.json({ success: true, data: messages });
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.post('/api/messages', async (req, res) => { 
if (!db) return res.status(500).json({ success: false, message: 'Base de données non disponible' }); 
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
res.json({ success: true, id: docRef.id });
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

//  
// NOTIFICATIONS 
//  
app.get('/api/notifications/:userId', async (req, res) => { 
if (!db) return res.json({ success: true, data: [] }); 
try { 
const snapshot = await db.collection('notifications') 
.where('userId', '', req.params.userId) 
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
if (!db) return res.status(500).json({ success: false, message: 'Base de données non disponible' }); 
try { 
await db.collection('notifications').doc(req.params.id).update({ read: true }); 
res.json({ success: true }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

//  
// DÉMARRAGE 
// == 
app.listen(PORT, () => { 
console.log('✅ BLK API running on port ' + PORT); 
console.log('📦 Mode: ' + (db ? 'COMPLET' : 'DÉGRADÉ (sans Firebase)')); 
console.log('💳 Paiement: ' + (YABETOO_SECRET ? 'Yabetoo (MTN)' : 'Simulé')); 
console.log('📱 Admin: ' + ADMIN_PHONE); 
});
