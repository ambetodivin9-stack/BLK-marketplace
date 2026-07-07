const express = require('express'); 
const app = express(); 
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => { 
res.json({ status: 'OK', message: 'BLK API - MINIMAL' }); 
});

app.get('/api/articles', (req, res) => { 
res.json({ success: true, data: [] }); 
});

app.get('/api/wallet/:userId', (req, res) => { 
res.json({ balance: 0 }); 
});

app.listen(PORT, () => { 
console.log('✅ API tourne sur le port ' + PORT); 
});
