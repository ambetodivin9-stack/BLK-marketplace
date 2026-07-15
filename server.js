const express = require('express'); 
const cors = require('cors'); 
const admin = require('firebase-admin'); 
const axios = require('axios'); 
const FormData = require('form-data');

const app = express(); 
const PORT = process.env.PORT || 10000;

app.use(cors()); 
app.use(express.json({ limit: '10mb' }));

//  
// FIREBASE 
//  
if (!process.env.FIREBASE_SERVICE_ACCOUNT) { 
console.error('❌ FIREBASE_SERVICE_ACCOUNT manquant'); 
process.exit(1); 
} 
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); 
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }); 
const db = admin.firestore();

//  
// CONFIGURATION 
//  
console.log('✅ BLK API - 100% RÉEL (simulation paiement)'); 
console.log('✅ Admin Phone:', process.env.ADMIN_PHONE || '065918166');

const COMMISSION_BUYER = 0.03; 
const COMMISSION_SELLER = 0.04; 
const ADMIN_PHONE = process.env.ADMIN_PHONE || '065918166';

//  
// ROUTES PRINCIPALES 
//  
app.get('/', (req, res) => res.json({ status: 'OK', message: 'BLK API' })); 
app.get('/api', (req, res) => res.json({ success: true, message: 'API OK' }));

//  
// UTILISATEURS 
//  
app.post('/api/users/online', async (req, res) => { 
try { 
const { userId, online } = req.body; 
if (!userId) return res.status(400).json({ success: false, message: 'userId requis' }); 
await db.collection('users').doc(userId).set({ online: online || false }, { merge: true }); 
res.json({ success: true }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.get('/api/users/:userId', async (req, res) => { 
try { 
const doc = await db.collection('users').doc(req.params.userId).get(); 
if (!doc.exists) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' }); 
const data = doc.data(); 
res.json({ success: true, data: { 
name: data.name, 
photo: data.photo || '', 
flames: data.flames || 0, 
walletBalance: data.walletBalance || 0, 
phone: data.phone || '', 
email: data.email || '', 
isSeller: data.isSeller || false, 
blockedUsers: data.blockedUsers || [], 
online: data.online || false 
}}); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.put('/api/users/:userId', async (req, res) => { 
try { 
const { userId } = req.params; 
const { name, email, phone, photo, isSeller } = req.body; 
const updateData = {}; 
if (name) updateData.name = name; 
if (email) updateData.email = email; 
if (phone) updateData.phone = phone; 
if (photo) updateData.photo = photo; 
if (isSeller ! undefined) updateData.isSeller = isSeller; 
await db.collection('users').doc(userId).update(updateData); 
res.json({ success: true }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
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
snapshot.forEach(doc => articles.push({ id: doc.id, ...doc.data() })); 
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
.where('status', '', 'active') 
.orderBy('createdAt', 'desc') 
.get(); 
const articles = []; 
snapshot.forEach(doc => articles.push({ id: doc.id, ...doc.data() })); 
res.json({ success: true, data: articles }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.post('/api/articles', async (req, res) => { 
try { 
const { title, description, price, category, image, sellerId, sellerName, sellerPhoto } = req.body; 
if (!title || !description || !price || !category || !sellerId) { 
return res.status(400).json({ success: false, message: 'Champs requis' }); 
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

//  
// UPLOAD IMAGE 
//  
app.post('/api/upload', async (req, res) => { 
try { 
const { base64 } = req.body; 
if (!base64) return res.status(400).json({ success: false, message: 'Aucune image' }); 
const API_KEY = process.env.IMG_BB_KEY; 
if (!API_KEY) return res.status(500).json({ success: false, message: 'Clé ImgBB manquante' }); 
const base64Data = base64.includes('base64,') ? base64.split('base64,')[1] : base64; 
const formData = new FormData(); 
formData.append('key', API_KEY); 
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
res.status(500).json({ success: false, message: 'Erreur upload' }); 
} 
});

//  
// WALLET 
//  
app.get('/api/wallet/:userId', async (req, res) => { 
try { 
const doc = await db.collection('users').doc(req.params.userId).get(); 
res.json({ balance: doc.data()?.walletBalance || 0 }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

//  
// DÉPÔT (SIMULATION) 
//  
app.post('/api/wallet/deposit', async (req, res) => { 
console.log('📩 Dépôt reçu:', req.body); 
try { 
const userId = req.body.userId || req.body.userid; 
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
lastDeposit: admin.firestore.FieldValue.serverTimestamp() 
}, { merge: true }); 
await db.collection('transactions').add({ 
userId, amount, phone, 
type: 'deposit', 
status: 'completed', 
description: 'Dépôt (simulé)', 
createdAt: new Date() 
}); 
console.log(💰 Wallet mis à jour: ${currentBalance} → ${newBalance}); 
res.json({ success: true, message: '💰 Dépôt effectué !', newBalance }); 
} catch (error) { 
console.error('❌ Erreur dépôt:', error.message); 
res.status(500).json({ success: false, message: 'Erreur interne' }); 
} 
});

//  
// ADMIN - CRÉDIT MANUEL 
//  
app.post('/api/wallet/admin-credit', async (req, res) => { 
console.log('📩 Crédit admin reçu:', req.body); 
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
lastDeposit: admin.firestore.FieldValue.serverTimestamp() 
}, { merge: true }); 
await db.collection('transactions').add({ 
userId, amount, 
phone: phone || '065918166', 
type: 'deposit', 
status: 'completed', 
description: 'Dépôt manuel (admin)', 
createdAt: new Date() 
}); 
console.log(💰 Wallet admin mis à jour: ${currentBalance} → ${newBalance}); 
res.json({ success: true, message: 'Wallet crédité', newBalance }); 
} catch (error) { 
console.error('❌ Erreur crédit admin:', error.message); 
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
return res.status(400).json({ success: false, message: 'Champs requis' }); 
} 
const buyerDoc = await db.collection('users').doc(buyerId).get(); 
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
await buyerDoc.ref.update({ walletBalance: buyerBalance - totalAmount }); 
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
message: 🛒 Nouvelle commande #${orderId.slice(0,8)} - ${amount} FCFA, 
type: 'new_order', 
read: false, 
orderId: orderId, 
createdAt: new Date() 
}); 
res.json({ 
success: true, 
orderId, 
message: '✅ Commande créée !', 
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

app.post('/api/orders/confirm-by-qr', async (req, res) => { 
console.log('📩 Confirmation QR reçue:', req.body); 
try { 
const { orderId, buyerId } = req.body; 
if (!orderId || !buyerId) { 
return res.status(400).json({ success: false, message: 'orderId et buyerId requis' }); 
} 
const orderRef = db.collection('orders').doc(orderId); 
const orderDoc = await orderRef.get(); 
if (!orderDoc.exists) { 
return res.status(404).json({ success: false, message: 'Commande non trouvée' }); 
} 
const order = orderDoc.data(); 
if (order.buyerId ! buyerId) { 
return res.status(403).json({ success: false, message: 'Non autorisé' }); 
} 
if (order.status ! 'en attente de confirmation') { 
return res.status(400).json({ success: false, message: 'Commande déjà traitée' }); 
} 
const now = new Date(); 
const expiresAt = order.expiresAt.toDate ? order.expiresAt.toDate() : new Date(order.expiresAt); 
if (now > expiresAt) { 
return res.status(400).json({ success: false, message: '⏰ Délai expiré' }); 
} 
const sellerCommission = order.sellerCommission || Math.round(order.amount * COMMISSION_SELLER); 
const buyerCommission = order.buyerCommission || Math.round(order.amount * COMMISSION_BUYER); 
const amountToSeller = order.amount - sellerCommission; 
const adminTotal = buyerCommission + sellerCommission; 
const sellerRef = db.collection('users').doc(order.sellerId); 
const sellerDoc = await sellerRef.get(); 
const sellerBalance = sellerDoc.data()?.walletBalance || 0; 
await sellerRef.update({ walletBalance: sellerBalance + amountToSeller }); 
await db.collection('articles').doc(order.articleId).update({ 
status: 'sold', 
soldAt: new Date(), 
soldTo: buyerId, 
orderId: orderId 
}); 
await orderRef.update({ 
status: 'livré', 
buyerConfirmed: true, 
buyerConfirmedAt: new Date(), 
sellerReceived: amountToSeller, 
adminCommission: adminTotal 
}); 
await db.collection('notifications').add({ 
userId: order.sellerId, 
message: 💰 Vente confirmée par QR ! ${amountToSeller} FCFA crédités., 
type: 'sale_confirmed', 
read: false, 
orderId: orderId, 
createdAt: new Date() 
}); 
await db.collection('notifications').add({ 
userId: order.buyerId, 
message: ✅ Commande #${orderId.slice(0,8)} confirmée par QR., 
type: 'order_confirmed', 
read: false, 
orderId: orderId, 
createdAt: new Date() 
}); 
console.log(💰 Commission admin ${adminTotal} FCFA (simulée)); 
res.json({ 
success: true, 
message: '✅ Commande confirmée par QR !', 
sellerReceived: amountToSeller, 
adminCommission: adminTotal, 
sellerBalance: sellerBalance + amountToSeller 
}); 
} catch (error) { 
console.error('❌ Erreur confirmation QR:', error.message); 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.get('/api/orders/:userId', async (req, res) => { 
try { 
const { userId } = req.params; 
const orders = []; 
const buyerSnapshot = await db.collection('orders') 
.where('buyerId', '', userId) 
.orderBy('createdAt', 'desc') 
.get(); 
for (const doc of buyerSnapshot.docs) { 
const order = doc.data(); 
const articleDoc = await db.collection('articles').doc(order.articleId).get(); 
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
const sellerSnapshot = await db.collection('orders') 
.where('sellerId', '', userId) 
.orderBy('createdAt', 'desc') 
.get(); 
for (const doc of sellerSnapshot.docs) { 
const order = doc.data(); 
if (!orders.find(o => o.id = doc.id)) { 
const articleDoc = await db.collection('articles').doc(order.articleId).get(); 
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
res.status(500).json([]); 
} 
});

//  
// FLAMMES, STATS, TRANSACTIONS, MESSAGES, NOTIFICATIONS 
//  
app.post('/api/flames', async (req, res) => { 
try { 
const { sellerId, buyerId } = req.body; 
if (!sellerId || !buyerId) { 
return res.status(400).json({ success: false, message: 'sellerId et buyerId requis' }); 
} 
const existing = await db.collection('flames') 
.where('sellerId', '', sellerId) 
.where('buyerId', '', buyerId) 
.get(); 
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
try { 
const doc = await db.collection('users').doc(req.params.userId).get(); 
res.json({ flames: doc.data()?.flames || 0 }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.get('/api/stats/:userId', async (req, res) => { 
try { 
const { userId } = req.params; 
const articlesSnapshot = await db.collection('articles') 
.where('sellerId', '', userId) 
.where('status', '', 'active') 
.get(); 
const ordersSnapshot = await db.collection('orders') 
.where('sellerId', '', userId) 
.where('status', '', 'livré') 
.get(); 
let totalSales = 0, totalRevenue = 0; 
ordersSnapshot.forEach(doc => { 
const order = doc.data(); 
totalSales += 1; 
totalRevenue += order.sellerReceived || (order.amount - (order.amount * COMMISSION_SELLER)); 
}); 
const purchasesSnapshot = await db.collection('orders') 
.where('buyerId', '', userId) 
.where('status', '', 'livré') 
.get(); 
let totalPurchases = 0, totalSpent = 0; 
purchasesSnapshot.forEach(doc => { 
const order = doc.data(); 
totalPurchases += 1; 
totalSpent += order.totalAmount || order.amount; 
}); 
const history = {}; 
ordersSnapshot.forEach(doc => { 
const order = doc.data(); 
const date = order.createdAt?.toDate?.() || new Date(order.createdAt); 
const month = ${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}; 
if (!history[month]) history[month] = { ventes: 0, revenu: 0 }; 
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

app.get('/api/transactions/:userId', async (req, res) => { 
try { 
const snapshot = await db.collection('transactions') 
.where('userId', '', req.params.userId) 
.orderBy('createdAt', 'desc') 
.limit(100) 
.get(); 
const transactions = []; 
snapshot.forEach(doc => transactions.push({ id: doc.id, ...doc.data() })); 
res.json({ success: true, data: transactions }); 
} catch (error) { 
res.status(500).json({ success: false, data: [] }); 
} 
});

app.get('/api/messages/:userId', async (req, res) => { 
try { 
const snapshot = await db.collection('messages') 
.where('participants', 'array-contains', req.params.userId) 
.orderBy('createdAt', 'desc') 
.limit(100) 
.get(); 
const messages = []; 
snapshot.forEach(doc => messages.push({ id: doc.id, ...doc.data() })); 
res.json({ success: true, data: messages }); 
} catch (error) { 
res.status(500).json({ success: false, data: [] }); 
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
message: 💬 Nouveau message de ${senderName || 'Anonyme'}, 
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

app.get('/api/notifications/:userId', async (req, res) => { 
try { 
const snapshot = await db.collection('notifications') 
.where('userId', '', req.params.userId) 
.orderBy('createdAt', 'desc') 
.limit(50) 
.get(); 
const notifications = []; 
snapshot.forEach(doc => notifications.push({ id: doc.id, ...doc.data() })); 
res.json({ success: true, data: notifications }); 
} catch (error) { 
res.status(500).json({ success: false, data: [] }); 
} 
});

app.post('/api/notifications/read/:id', async (req, res) => { 
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
app.listen(PORT, '0.0.0.0', () => { 
console.log('✅ BLK API running on port', PORT); 
});
