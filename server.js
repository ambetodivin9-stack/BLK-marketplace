const express = require('express'); 
const app = express(); 
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => { 
res.send('BLK API is running!'); 
});

app.get('/ping', (req, res) => { 
res.send('pong'); 
});

// Démarrer le serveur sur 0.0.0.0 pour Render 
app.listen(PORT, '0.0.0.0', () => { 
console.log(✅ BLK API running on port ${PORT}); 
});
