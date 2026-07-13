const express = require('express'); 
const cors = require('cors');

const app = express(); 
const PORT = process.env.PORT || 10000;

app.use(cors()); 
app.use(express.json());

// Route de base 
app.get('/', (req, res) => { 
res.json({ status: 'OK', message: 'BLK API - LIVE' }); 
});

app.get('/ping', (req, res) => { 
res.send('pong'); 
});

// Routes API minimales (simulation) 
app.get('/api', (req, res) => { 
res.json({ success: true, message: 'API OK' }); 
});

app.get('/api/articles', (req, res) => { 
res.json({ success: true, data: [] }); 
});

app.post('/api/articles', (req, res) => { 
res.json({ success: true, id: 'mock-' + Date.now() }); 
});

app.get('/api/wallet/:userId', (req, res) => { 
res.json({ balance: 0 }); 
});

app.post('/api/wallet/deposit', (req, res) => { 
res.json({ success: true, message: 'Dépôt simulé' }); 
});

app.post('/api/wallet/admin-credit', (req, res) => { 
res.json({ success: true, message: 'Wallet crédité (simulé)' }); 
});

app.get('/api/orders/:userId', (req, res) => { 
res.json([]); 
});

app.post('/api/orders/create', (req, res) => { 
res.json({ success: true, orderId: 'mock-' + Date.now() }); 
});

app.get('/api/messages/:userId', (req, res) => { 
res.json({ success: true, data: [] }); 
});

app.post('/api/messages', (req, res) => { 
res.json({ success: true, id: 'mock-' + Date.now() }); 
});

// DÉMARRAGE CORRECT (0.0.0.0 pour Render) 
app.listen(PORT, '0.0.0.0', () => { 
console.log(✅ BLK API running on port ${PORT}); 
});
