const express = require('express'); 
const app = express(); 
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => { 
res.json({ status: 'OK', message: 'BLK API - LIVE' }); 
});

app.listen(PORT, () => { 
console.log('✅ API tourne sur le port ' + PORT); 
});
