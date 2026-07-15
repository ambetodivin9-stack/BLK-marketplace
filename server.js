const express = require('express'); 
const cors = require('cors'); 
const app = express(); 
const PORT = process.env.PORT || 10000;

app.use(cors()); 
app.use(express.json({ limit: '10mb' }));

// Routes de base 
app.get('/', (req, res) => { 
res.json({ status: 'OK', message: 'BLK API - LIVE' }); 
});

app.get('/ping', (req, res) => { 
res.send('pong'); 
});

// Routes API simulées (en attendant Firebase) 
app.get('/api', (req, res) => { 
res.json({ success: true, message: 'API OK' }); 
});

app.get('/api/users', (req, res) => { 
res.json({ success: true, users: [] }); 
});

app.post('/api/login', (req, res) => { 
const { phone, name } = req.body; 
if (!phone) { 
return res.status(400).json({ success: false, message: 'Numéro requis' }); 
} 
res.json({ success: true, message: 'Connexion réussie', user: { phone, name: name || 'Anonyme' } }); 
});

app.get('/api/articles', (req, res) => { 
res.json({ success: true, data: [] }); 
});

app.post('/api/articles', (req, res) => { 
res.json({ success: true, id: 'mock-' + Date.now() }); 
});

app.get('/api/articles/seller/:sellerId', (req, res) => { 
res.json({ success: true, data: [] }); 
});

app.delete('/api/articles/:id', (req, res) => { 
res.json({ success: true }); 
});

app.post('/api/upload', (req, res) => { 
res.json({ success: true, url: 'https://via.placeholder.com/150' }); 
});

app.get('/api/wallet/:userId', (req, res) => { 
res.json({ balance: 0 }); 
});

app.post('/api/wallet/deposit', (req, res) => { 
res.json({ success: true, message: 'Dépôt simulé' }); 
});

app.post('/api/wallet/withdraw', (req, res) => { 
res.json({ success: true, message: 'Retrait simulé' }); 
});

app.post('/api/orders/create', (req, res) => { 
res.json({ success: true, orderId: 'mock-' + Date.now() }); 
});

app.get('/api/orders/:userId', (req, res) => { 
res.json([]); 
});

app.post('/api/orders/confirm', (req, res) => { 
res.json({ success: true, message: 'Commande confirmée' }); 
});

app.post('/api/orders/cancel/:orderId', (req, res) => { 
res.json({ success: true, message: 'Commande annulée' }); 
});

app.post('/api/flames', (req, res) => { 
res.json({ success: true, flames: 1 }); 
});

app.get('/api/flames/:userId', (req, res) => { 
res.json({ flames: 0 }); 
});

app.get('/api/stats/:userId', (req, res) => { 
res.json({ success: true, data: { totalSales: 0, totalPurchases: 0, totalArticles: 0, history: [] } }); 
});

app.get('/api/transactions/:userId', (req, res) => { 
res.json({ success: true, data: [] }); 
});

app.get('/api/messages/:userId', (req, res) => { 
res.json({ success: true, data: [] }); 
});

app.post('/api/messages', (req, res) => { 
res.json({ success: true, id: 'mock-' + Date.now() }); 
});

app.listen(PORT, () => { 
console.log('✅ BLK API tourne sur le port ' + PORT); 
});
