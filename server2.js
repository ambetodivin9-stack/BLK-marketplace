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
console.error('FIREBASE_SERVICE_ACCOUNT manquant'); 
process.exit(1); 
} 
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); 
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }); 
const db = admin.firestore();

console.log('BLK API demarree');

//  
// CONFIG MONEYUNIFY 
//  
const MONEYUNIFY_AUTH_ID = process.env.MONEYUNIFY_AUTH_ID || '01KXKPX5Y8J7ARK619BT1A07GP';

//  
// ROUTES DE BASE 
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
if (!doc.exists) return res.status(404).json({ success: false, message: 'Utilisateur non trouve' }); 
const data = doc.data(); 
const followersSnap = await db.collection('follows') 
.where('followingId', '', req.params.userId) 
.get(); 
const followingSnap = await db.collection('follows') 
.where('followerId', '', req.params.userId) 
.get(); 
res.json({ 
success: true, 
data: { 
...data, 
followersCount: followersSnap.size, 
followingCount: followingSnap.size 
} 
}); 
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
if ('isSeller' in req.body) { 
updateData.isSeller = req.body.isSeller; 
} 
await db.collection('users').doc(userId).update(updateData); 
res.json({ success: true }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

//  
// ARTICLES (filtrage en mémoire) 
//  
app.get('/api/articles', async (req, res) => { 
try { 
const snapshot = await db.collection('products').get(); 
const articles = []; 
snapshot.forEach(doc => { 
const data = doc.data(); 
if (data.status = 'active') { 
articles.push({ id: doc.id, ...data }); 
} 
}); 
articles.sort((a, b) => { 
const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt); 
const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt); 
return dateB - dateA; 
}); 
res.json({ success: true, data: articles }); 
} catch (error) { 
console.error('Erreur /api/articles:', error.message); 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.get('/api/articles/seller/:sellerId', async (req, res) => { 
try { 
const { sellerId } = req.params; 
const snapshot = await db.collection('products') 
.where('sellerId', '', sellerId) 
.get(); 
const articles = []; 
snapshot.forEach(doc => { 
const data = doc.data(); 
if (data.status = 'active') { 
articles.push({ id: doc.id, ...data }); 
} 
}); 
articles.sort((a, b) => { 
const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt); 
const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt); 
return dateB - dateA; 
}); 
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
const docRef = await db.collection('products').add(article); 
res.json({ success: true, id: docRef.id }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.delete('/api/articles/:id', async (req, res) => { 
try { 
const { id } = req.params; 
const doc = await db.collection('products').doc(id).get(); 
if (!doc.exists) return res.status(404).json({ success: false, message: 'Article non trouve' }); 
if (doc.data().status = 'sold') { 
return res.status(400).json({ success: false, message: 'Cet article a deja ete vendu' }); 
} 
await db.collection('products').doc(id).update({ status: 'inactive' }); 
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

    const API_KEY = process.env.IMG_BB_KEY || '2b3e869d8b6f382027e70cd216f65580';
    const base64Data = base64.includes('base64,') ? base64.split('base64,')[1] : base64;

    if (base64Data.length > 1.5 * 1024 * 1024) {
        return res.status(400).json({ success: false, message: 'Image trop volumineuse (max 1.5 Mo)' });
    }

    const formData = new FormData();
    formData.append('key', API_KEY);
    formData.append('image', base64Data);

    const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
        headers: formData.getHeaders(),
        timeout: 10000
    });

    if (response.data.success) {
        res.json({ success: true, url: response.data.data.url });
    } else {
        console.error('Erreur ImgBB:', response.data);
        res.status(400).json({ success: false, message: 'Erreur ImgBB: ' + (response.data.error?.message || 'inconnue') });
    }
} catch (error) {
    console.error('Erreur upload:', error.message);
    res.status(500).json({ success: false, message: 'Erreur upload: ' + error.message });
}
});

//  
// STATISTIQUES 
//  
app.get('/api/stats/:userId', async (req, res) => { 
try { 
const { userId } = req.params;

    const allArticlesSnapshot = await db.collection('products')
        .where('sellerId', '==', userId)
        .get();
    let totalArticles = 0;
    allArticlesSnapshot.forEach(doc => {
        if (doc.data().status === 'active') totalArticles++;
    });

    const ordersSnapshot = await db.collection('orders')
        .where('sellerId', '==', userId)
        .get();

    let totalSales = 0;
    let totalRevenue = 0;
    const history = {};
    
    ordersSnapshot.forEach(doc => {
        const order = doc.data();
        if (order.status === 'livre') {
            totalSales += 1;
            totalRevenue += order.sellerReceived || (order.amount - (order.amount * 0.04));
            
            const date = order.createdAt?.toDate?.() || new Date(order.createdAt);
            const month = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
            if (!history[month]) history[month] = { ventes: 0, revenu: 0 };
            history[month].ventes += 1;
            history[month].revenu += order.sellerReceived || (order.amount - (order.amount * 0.04));
        }
    });

    const purchasesSnapshot = await db.collection('orders')
        .where('buyerId', '==', userId)
        .get();
    
    let totalPurchases = 0;
    let totalSpent = 0;
    purchasesSnapshot.forEach(doc => {
        const order = doc.data();
        if (order.status === 'livre') {
            totalPurchases += 1;
            totalSpent += order.totalAmount || order.amount;
        }
    });

    const historyArray = Object.keys(history).sort().map(month => ({
        month,
        ventes: history[month].ventes,
        revenu: Math.round(history[month].revenu)
    }));

    res.json({
        success: true,
        data: {
            totalArticles,
            totalSales,
            totalRevenue: Math.round(totalRevenue),
            totalPurchases,
            totalSpent: Math.round(totalSpent),
            history: historyArray
        }
    });
} catch (error) {
    console.error('Erreur stats:', error.message);
    res.status(500).json({ success: false, message: error.message });
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
// MONEYUNIFY - PAIEMENT REEL 
//  
app.post('/api/payment/initiate', async (req, res) => { 
try { 
const { userId, amount, phone } = req.body; 
if (!userId || !amount || !phone) { 
return res.status(400).json({ success: false, message: 'userId, amount et phone requis' }); 
}

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
        return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    console.log('📤 Envoi à MoneyUnify:', { phone, amount, auth_id: MONEYUNIFY_AUTH_ID });

    const response = await axios.post(
        'https://api.moneyunify.one/payments/request',
        new URLSearchParams({
            from_payer: phone,
            amount: parseInt(amount),
            auth_id: MONEYUNIFY_AUTH_ID
        }),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
        }
    );

    console.log('✅ Réponse MoneyUnify:', response.data);

    if (response.data.status === 'success') {
        await db.collection('transactions').add({
            userId: userId,
            amount: parseInt(amount),
            phone: phone,
            transactionId: response.data.transaction_id || 'N/A',
            status: 'pending',
            type: 'deposit',
            createdAt: new Date()
        });

        res.json({
            success: true,
            transactionId: response.data.transaction_id,
            message: 'Demande de paiement envoyée. Confirmez sur votre téléphone.'
        });
    } else {
        res.status(400).json({
            success: false,
            message: response.data.message || 'Erreur MoneyUnify'
        });
    }
} catch (error) {
    console.error('❌ Erreur MoneyUnify:', error.response?.data || error.message);
    res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'initiation du paiement: ' + (error.response?.data?.message || error.message)
    });
}
});

//  
// MONEYUNIFY - WEBHOOK REEL 
//  
app.post('/api/payment/webhook', async (req, res) => { 
try { 
const { transaction_id, status, amount, phone, reference } = req.body; 
console.log('📥 Webhook reçu:', req.body);

    const snapshot = await db.collection('transactions')
        .where('transactionId', '==', transaction_id)
        .get();

    if (snapshot.empty) {
        console.warn('⚠️ Transaction non trouvée:', transaction_id);
        return res.status(404).json({ success: false });
    }

    const transactionDoc = snapshot.docs[0];
    const transactionData = transactionDoc.data();

    if (status === 'success') {
        const userRef = db.collection('users').doc(transactionData.userId);
        const userDoc = await userRef.get();
        const currentBalance = userDoc.data()?.walletBalance || 0;
        const newBalance = currentBalance + parseInt(amount);

        await userRef.update({ walletBalance: newBalance });

        await transactionDoc.ref.update({
            status: 'completed',
            completedAt: new Date()
        });

        console.log('✅ Wallet crédité de', amount, 'pour', transactionData.userId);
    } else {
        await transactionDoc.ref.update({
            status: 'failed',
            failedAt: new Date()
        });
    }

    res.json({ success: true });
} catch (error) {
    console.error('❌ Erreur webhook:', error);
    res.status(500).json({ success: false });
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
const buyerCommission = Math.round(amount * 0.03); 
const totalAmount = amount + buyerCommission; 
if (buyerBalance < totalAmount) { 
return res.status(400).json({ success: false, message: 'Solde insuffisant' }); 
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
sellerCommission: Math.round(amount * 0.04), 
status: 'en attente de confirmation', 
buyerConfirmed: false, 
buyerConfirmedAt: null, 
flamesGiven: false, 
expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), 
createdAt: new Date() 
}; 
const orderRef = await db.collection('orders').add(order); 
const orderId = orderRef.id; 
await db.collection('products').doc(articleId).update({ status: 'sold' }); 
res.json({ success: true, orderId, message: 'Commande creee', totalAmount }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.post('/api/orders/confirm-by-qr', async (req, res) => { 
try { 
const { orderId, buyerId } = req.body; 
if (!orderId || !buyerId) { 
return res.status(400).json({ success: false, message: 'orderId et buyerId requis' }); 
}

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    
    if (!orderDoc.exists) {
        return res.status(404).json({ success: false, message: 'Commande non trouvee' });
    }
    
    const order = orderDoc.data();
    
    if (order.buyerId.toString() !== buyerId.toString()) {
        return res.status(403).json({ success: false, message: 'Non autorise' });
    }
    
    if (order.status !== 'en attente de confirmation') {
        return res.status(400).json({ success: false, message: 'Commande deja traitee' });
    }
    
    const now = new Date();
    const expiresAt = order.expiresAt.toDate ? order.expiresAt.toDate() : new Date(order.expiresAt);
    if (now > expiresAt) {
        return res.status(400).json({ success: false, message: 'Delai expire' });
    }

    const sellerCommission = order.sellerCommission || Math.round(order.amount * 0.04);
    const buyerCommission = order.buyerCommission || Math.round(order.amount * 0.03);
    const amountToSeller = order.amount - sellerCommission;
    const adminTotal = buyerCommission + sellerCommission;

    const sellerRef = db.collection('users').doc(order.sellerId);
    const sellerDoc = await sellerRef.get();
    const sellerBalance = sellerDoc.data()?.walletBalance || 0;
    await sellerRef.update({ walletBalance: sellerBalance + amountToSeller });

    await orderRef.update({
        status: 'livre',
        buyerConfirmed: true,
        buyerConfirmedAt: new Date(),
        sellerReceived: amountToSeller,
        adminCommission: adminTotal
    });

    res.json({ success: true, message: 'Commande confirmee par QR', sellerReceived: amountToSeller });
} catch (error) {
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
const productDoc = await db.collection('products').doc(order.articleId).get(); 
const product = productDoc.data(); 
orders.push({ id: doc.id, ...order, article: product ? { title: product.title, image: product.image, price: product.price } : null }); 
} 
const sellerSnapshot = await db.collection('orders') 
.where('sellerId', '', userId) 
.orderBy('createdAt', 'desc') 
.get(); 
for (const doc of sellerSnapshot.docs) { 
const order = doc.data(); 
if (!orders.find(o => o.id = doc.id)) { 
const productDoc = await db.collection('products').doc(order.articleId).get(); 
const product = productDoc.data(); 
orders.push({ id: doc.id, ...order, article: product ? { title: product.title, image: product.image, price: product.price } : null }); 
} 
} 
orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); 
res.json(orders); 
} catch (error) { 
res.status(500).json([]); 
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
const data = doc.data(); 
if (data.receiverId = userId && !data.read) { 
doc.ref.update({ read: true }); 
} 
messages.push({ id: doc.id, ...data }); 
}); 
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
const receiverDoc = await db.collection('users').doc(receiverId).get(); 
const blockedUsers = receiverDoc.data()?.blockedUsers || []; 
if (blockedUsers.includes(senderId)) { 
return res.status(403).json({ success: false, message: 'Vous etes bloque par ce destinataire' }); 
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
message: 'Nouveau message de ' + (senderName || 'Anonyme'), 
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

app.post('/api/messages/read/:id', async (req, res) => { 
try { 
await db.collection('messages').doc(req.params.id).update({ read: true }); 
res.json({ success: true }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

//  
// FOLLOW 
//  
app.post('/api/follow', async (req, res) => { 
try { 
const { followerId, followingId } = req.body; 
if (!followerId || !followingId) return res.status(400).json({ success: false, message: 'IDs requis' }); 
if (followerId = followingId) return res.status(400).json({ success: false, message: 'Vous ne pouvez pas vous abonner a vous-meme' }); 
const existing = await db.collection('follows') 
.where('followerId', '', followerId) 
.where('followingId', '', followingId) 
.get(); 
if (!existing.empty) return res.status(400).json({ success: false, message: 'Deja abonne' }); 
await db.collection('follows').add({ followerId, followingId, createdAt: new Date() }); 
res.json({ success: true, message: 'Abonne' }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.delete('/api/follow', async (req, res) => { 
try { 
const { followerId, followingId } = req.body; 
if (!followerId || !followingId) return res.status(400).json({ success: false, message: 'IDs requis' }); 
const snapshot = await db.collection('follows') 
.where('followerId', '', followerId) 
.where('followingId', '', followingId) 
.get(); 
if (snapshot.empty) return res.status(404).json({ success: false, message: 'Abonnement non trouve' }); 
snapshot.forEach(doc => doc.ref.delete()); 
res.json({ success: true, message: 'Desabonne' }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.get('/api/followers/:userId', async (req, res) => { 
try { 
const snapshot = await db.collection('follows') 
.where('followingId', '', req.params.userId) 
.get(); 
const followers = []; 
snapshot.forEach(doc => followers.push({ id: doc.id, ...doc.data() })); 
res.json({ success: true, data: followers }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.get('/api/following/:userId', async (req, res) => { 
try { 
const snapshot = await db.collection('follows') 
.where('followerId', '', req.params.userId) 
.get(); 
const following = []; 
snapshot.forEach(doc => following.push({ id: doc.id, ...doc.data() })); 
res.json({ success: true, data: following }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.get('/api/feed/:userId', async (req, res) => { 
try { 
const userId = req.params.userId; 
const followSnapshot = await db.collection('follows') 
.where('followerId', '', userId) 
.get(); 
const followingIds = []; 
followSnapshot.forEach(doc => followingIds.push(doc.data().followingId)); 
if (followingIds.length = 0) { 
return res.json({ success: true, data: [] }); 
} 
const articles = []; 
for (const id of followingIds) { 
const snapshot = await db.collection('products') 
.where('sellerId', '', id) 
.get(); 
snapshot.forEach(doc => { 
const data = doc.data(); 
if (data.status = 'active') { 
articles.push({ id: doc.id, ...data }); 
} 
}); 
} 
articles.sort((a, b) => { 
const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt); 
const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt); 
return dateB - dateA; 
}); 
res.json({ success: true, data: articles }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.post('/api/flames', (req, res) => res.json({ success: true })); 
app.get('/api/flames/:userId', (req, res) => res.json({ flames: 0 })); 
app.get('/api/transactions/:userId', (req, res) => res.json({ success: true, data: [] }));

//  
// WALLET - DEPOT MANUEL (pour admin) 
//  
app.post('/api/wallet/deposit', async (req, res) => { 
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
await userRef.set({ walletBalance: newBalance, phone: phone, lastDeposit: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }); 
await db.collection('transactions').add({ userId, amount, phone, type: 'deposit', status: 'completed', description: 'Depot (simule)', createdAt: new Date() }); 
res.json({ success: true, message: 'Depot effectue', newBalance }); 
} catch (error) { 
res.status(500).json({ success: false, message: 'Erreur interne' }); 
} 
});

app.post('/api/wallet/admin-credit', async (req, res) => { 
try { 
const { userId, amount, phone } = req.body; 
if (!userId || !amount) return res.status(400).json({ success: false, message: 'userId et amount requis' }); 
const userRef = db.collection('users').doc(userId); 
const doc = await userRef.get(); 
const currentBalance = doc.data()?.walletBalance || 0; 
const newBalance = currentBalance + amount; 
await userRef.set({ walletBalance: newBalance, phone: phone || doc.data()?.phone || '', lastDeposit: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }); 
await db.collection('transactions').add({ userId, amount, phone: phone || '065918166', type: 'deposit', status: 'completed', description: 'Depot manuel (admin)', createdAt: new Date() }); 
res.json({ success: true, message: 'Wallet credite', newBalance }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

//  
// DEMARRAGE 
// == 
app.listen(PORT, '0.0.0.0', () => { 
console.log('BLK API running on port ' + PORT); 
});
