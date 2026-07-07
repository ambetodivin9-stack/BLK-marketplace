const express = require('express'); 
const cors = require('cors'); 
const app = express(); 
const PORT = process.env.PORT || 10000;

app.use(cors()); 
app.use(express.json());

// Route principale 
app.get('/', (req, res) => { 
res.json({ status: 'OK', message: 'BLK API - SIMULATION' }); 
});

// Route ping 
app.get('/ping', (req, res) => { 
res.send('pong'); 
});

// Articles simulés 
app.get('/api/articles', (req, res) => { 
const articles = [ 
{ id: '1', title: 'Robe vintage', description: 'Belle robe des années 80', price: 15000, category: 'vêtements', image: '', sellerName: 'Marie K.', sellerId: 'seller1', status: 'active', createdAt: new Date() }, 
{ id: '2', title: 'Talons rouges', description: 'Escarpins en cuir rouge', price: 25000, category: 'chaussures', image: '', sellerName: 'Sophie L.', sellerId: 'seller2', status: 'active', createdAt: new Date() }, 
{ id: '3', title: 'Sac en cuir', description: 'Sac à main en cuir noir', price: 35000, category: 'sacs', image: '', sellerName: 'Jean P.', sellerId: 'seller3', status: 'active', createdAt: new Date() } 
]; 
res.json({ success: true, data: articles }); 
});

// Articles d'un vendeur 
app.get('/api/articles/seller/:sellerId', (req, res) => { 
const articles = [ 
{ id: '1', title: 'Robe vintage', price: 15000, image: '', status: 'active' }, 
{ id: '2', title: 'Talons rouges', price: 25000, image: '', status: 'active' } 
]; 
res.json({ success: true, data: articles }); 
});

// Créer un article (simulé) 
app.post('/api/articles', (req, res) => { 
res.json({ success: true, id: 'mock-' + Date.now() }); 
});

// Supprimer un article (simulé) 
app.delete('/api/articles/:id', (req, res) => { 
res.json({ success: true }); 
});

// Upload image (simulé) 
app.post('/api/upload', (req, res) => { 
res.json({ success: true, url: 'https://via.placeholder.com/150' }); 
});

// Wallet 
app.get('/api/wallet/:userId', (req, res) => { 
res.json({ balance: 5000 }); 
});

// Dépôt 
app.post('/api/wallet/deposit', (req, res) => { 
res.json({ success: true, message: 'Dépôt simulé' }); 
});

// Retrait 
app.post('/api/wallet/withdraw', (req, res) => { 
res.json({ success: true, message: 'Retrait simulé' }); 
});

// Commandes 
app.post('/api/orders/create', (req, res) => { 
res.json({ success: true, orderId: 'mock-' + Date.now(), message: 'Commande créée (simulée)' }); 
});

app.get('/api/orders/:userId', (req, res) => { 
const orders = [ 
{ id: '1', articleId: '1', buyerId: 'buyer1', sellerId: 'seller1', amount: 15000, totalAmount: 15450, status: 'en attente de confirmation', expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), createdAt: new Date(), article: { title: 'Robe vintage', price: 15000, image: '' }, seller: { name: 'Marie K.' } }, 
{ id: '2', articleId: '2', buyerId: 'buyer2', sellerId: 'seller2', amount: 35000, totalAmount: 36050, status: 'livré', expiresAt: new Date(), createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), article: { title: 'Sac en cuir', price: 35000, image: '' }, buyer: { name: 'Jean P.' }, sellerReceived: 33600, buyerConfirmedAt: new Date() } 
]; 
res.json(orders); 
});

// Confirmer commande 
app.post('/api/orders/confirm', (req, res) => { 
res.json({ success: true, message: 'Commande confirmée (simulée)' }); 
});

// Annuler commande 
app.post('/api/orders/cancel/:orderId', (req, res) => { 
res.json({ success: true, message: 'Commande annulée (simulée)' }); 
});

// Flammes 
app.post('/api/flames', (req, res) => { 
res.json({ success: true, flames: 5 }); 
});

app.get('/api/flames/:userId', (req, res) => { 
res.json({ flames: 3 }); 
});

// Statistiques 
app.get('/api/stats/:userId', (req, res) => { 
res.json({ 
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
});

// Transactions 
app.get('/api/transactions/:userId', (req, res) => { 
const transactions = [ 
{ type: 'deposit', amount: 10000, description: 'Dépôt', date: new Date() }, 
{ type: 'achat', amount: -15300, description: 'Achat #BLK-12345', date: new Date(Date.now() - 86400000) }, 
{ type: 'vente', amount: 9600, description: 'Vente #BLK-67890', date: new Date(Date.now() - 172800000) } 
]; 
res.json({ success: true, data: transactions }); 
});

// Messages 
app.get('/api/messages/:userId', (req, res) => { 
const messages = [ 
{ id: '1', senderId: 'user1', senderName: 'Marie K.', senderPhoto: '', text: 'Bonjour, je suis intéressé par la robe vintage', createdAt: new Date() }, 
{ id: '2', senderId: 'user2', senderName: 'Jean P.', senderPhoto: '', text: 'Le sac est-il encore disponible ?', createdAt: new Date(Date.now() - 3600000) } 
]; 
res.json({ success: true, data: messages }); 
});

// Envoyer message 
app.post('/api/messages', (req, res) => { 
res.json({ success: true, id: 'mock-' + Date.now() }); 
});

// Notifications 
app.get('/api/notifications/:userId', (req, res) => { 
res.json({ success: true, data: [] }); 
});

// Démarrer le serveur 
app.listen(PORT, () => { 
console.log('✅ BLK API (simulée) tourne sur le port ' + PORT); 
});
