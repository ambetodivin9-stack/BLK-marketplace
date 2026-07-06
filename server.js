const express = require('express'); 
const cors = require('cors'); 
const admin = require('firebase-admin'); 
const fetch = require('node-fetch'); 
const FormData = require('form-data');

const app = express(); 
const PORT = process.env.PORT || 10000;

app.use(cors()); 
app.use(express.json({ limit: '10mb' }));

// Firebase 
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); 
admin.initializeApp({ 
credential: admin.credential.cert(serviceAccount) 
}); 
const db = admin.firestore();

// = ROUTES =

// Health check 
app.get('/', (req, res) => { 
res.json({ status: 'OK', message: 'BLK Marketplace API' }); 
});

// Get all articles 
app.get('/api/articles', async (req, res) => { 
try { 
const snapshot = await db.collection('articles').orderBy('createdAt', 'desc').get(); 
const articles = []; 
snapshot.forEach(doc => { 
articles.push({ id: doc.id, ...doc.data() }); 
}); 
res.json({ success: true, data: articles }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

// Create article 
app.post('/api/articles', async (req, res) => { 
try { 
const { title, description, price, category, image, sellerId, sellerName } = req.body; 
const article = { 
title, 
description, 
price, 
category, 
image: image || '', 
sellerId, 
sellerName: sellerName || 'Anonyme', 
createdAt: new Date(), 
status: 'active' 
}; 
const docRef = await db.collection('articles').add(article); 
res.json({ success: true, id: docRef.id }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

// Upload image (base64) 
app.post('/api/upload', async (req, res) => { 
try { 
const { base64 } = req.body; 
// Pour l'instant, on retourne juste l'image en base64 
res.json({ success: true, url: base64 }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

// Get wallet balance 
app.get('/api/wallet/:userId', async (req, res) => { 
try { 
const { userId } = req.params; 
const doc = await db.collection('users').doc(userId).get(); 
if (!doc.exists) { 
return res.json({ balance: 0 }); 
} 
res.json({ balance: doc.data().walletBalance || 0 }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

// Withdraw 
app.post('/api/wallet/withdraw', async (req, res) => { 
try { 
const { userId, amount } = req.body; 
const userRef = db.collection('users').doc(userId); 
const doc = await userRef.get(); 
const currentBalance = doc.data()?.walletBalance || 0;

if (currentBalance < amount) {
  return res.status(400).json({ success: false, message: 'Solde insuffisant' });
}

await userRef.update({
  walletBalance: currentBalance - amount
});

res.json({ success: true, newBalance: currentBalance - amount });
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

// Payment initiate (simulation) 
app.post('/api/payment/initiate', async (req, res) => { 
try { 
const { amount, phone, userId, type } = req.body; 
const userRef = db.collection('users').doc(userId); 
const doc = await userRef.get(); 
const currentBalance = doc.data()?.walletBalance || 0;

await userRef.update({
  walletBalance: currentBalance + amount
});

res.json({ success: true, message: 'Paiement initié' });
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

// Get orders 
app.get('/api/orders/:userId', async (req, res) => { 
try { 
const { userId } = req.params; 
const snapshot = await db.collection('orders').where('userId', '==', userId).get(); 
const orders = []; 
snapshot.forEach(doc => { 
orders.push({ id: doc.id, ...doc.data() }); 
}); 
res.json(orders); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

// Cancel order 
app.post('/api/orders/:id/cancel', async (req, res) => { 
try { 
const { id } = req.params; 
await db.collection('orders').doc(id).update({ status: 'annulé' }); 
res.json({ success: true }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

// Extend order 
app.post('/api/orders/:id/extend', async (req, res) => { 
try { 
const { id } = req.params; 
const doc = await db.collection('orders').doc(id).get(); 
const currentExpires = doc.data()?.expiresAt?.toDate() || new Date(); 
const newExpires = new Date(currentExpires.getTime() + 24 * 60 * 60 * 1000); 
await db.collection('orders').doc(id).update({ expiresAt: newExpires }); 
res.json({ success: true }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

// Get flames (reliability) 
app.get('/api/seller/:userId/flames', async (req, res) => { 
try { 
const { userId } = req.params; 
const doc = await db.collection('users').doc(userId).get(); 
res.json({ flames: doc.data()?.flames || 0 }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

// Démarrer le serveur 
app.listen(PORT, () => { 
console.log(✅ BLK API running on port ${PORT}); 
});
