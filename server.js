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
// CONFIG 
//  
console.log('✅ BLK API - MODE SIMULATION'); 
console.log('✅ Admin Phone:', process.env.ADMIN_PHONE || '065918166');

//  
// ROUTES 
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
res.json({ success: true, data: doc.data() }); 
} catch (error) { 
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
// DÉPÔT (SIMULATION DIRECTE - SANS YABETOO) 
//  
app.post('/api/wallet/deposit', async (req, res) => { 
console.log('📩 Dépôt reçu:', req.body);

try {
    // ✅ Accepte userId (camelCase) ou userid (minuscule)
    const userId = req.body.userId || req.body.userid;
    const amount = parseInt(req.body.amount);
    const phone = req.body.phone;

    if (!userId || !amount || !phone) {
        console.log('❌ Champs manquants:', { userId, amount, phone });
        return res.status(400).json({ success: false, message: 'userId, amount et phone requis' });
    }

    const userRef = db.collection('users').doc(userId);
    const doc = await userRef.get();
    const currentBalance = doc.data()?.walletBalance || 0;
    const newBalance = currentBalance + amount;

    // ✅ Créditer directement le wallet
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
    res.status(500).json({ success: false, message: 'Erreur interne: ' + error.message });
}
});

//  
// ADMIN - CRÉDIT MANUEL (PAGE ADMIN) 
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

    console.log(`💰 Wallet admin mis à jour: ${currentBalance} → ${newBalance}`);
    res.json({ success: true, message: 'Wallet crédité', newBalance });
} catch (error) {
    console.error('❌ Erreur crédit admin:', error.message);
    res.status(500).json({ success: false, message: error.message });
}
});

//  
// ORDRES, TRANSACTIONS, MESSAGES (simplifiés) 
//  
app.get('/api/orders/:userId', async (req, res) => { 
try { 
const snapshot = await db.collection('orders') 
.where('buyerId', '', req.params.userId) 
.orderBy('createdAt', 'desc') 
.get(); 
const orders = []; 
snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() })); 
res.json(orders); 
} catch (error) { 
res.status(500).json([]); 
} 
});

app.get('/api/messages/:userId', async (req, res) => { 
try { 
const snapshot = await db.collection('messages') 
.where('participants', 'array-contains', req.params.userId) 
.orderBy('createdAt', 'desc') 
.limit(50) 
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
const { senderId, receiverId, text, senderName } = req.body; 
if (!senderId || !receiverId || !text) { 
return res.status(400).json({ success: false, message: 'Champs requis' }); 
} 
const docRef = await db.collection('messages').add({ 
senderId, 
receiverId, 
text, 
senderName: senderName || 'Anonyme', 
participants: [senderId, receiverId], 
read: false, 
createdAt: new Date() 
}); 
res.json({ success: true, id: docRef.id }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.get('/api/transactions/:userId', async (req, res) => { 
try { 
const snapshot = await db.collection('transactions') 
.where('userId', '', req.params.userId) 
.orderBy('createdAt', 'desc') 
.limit(50) 
.get(); 
const transactions = []; 
snapshot.forEach(doc => transactions.push({ id: doc.id, ...doc.data() })); 
res.json({ success: true, data: transactions }); 
} catch (error) { 
res.status(500).json({ success: false, data: [] }); 
} 
});

//  
// DÉMARRAGE 
//  
app.listen(PORT, '0.0.0.0', () => { 
console.log('✅ BLK API running on port', PORT); 
});
