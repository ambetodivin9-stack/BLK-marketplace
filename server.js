const express = require('express'); 
const cors = require('cors'); 
const admin = require('firebase-admin');

const app = express(); 
const PORT = process.env.PORT || 10000;

app.use(cors()); 
app.use(express.json());

console.log('✅ Démarrage du serveur...');

//  
// FIREBASE 
//  
try { 
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); 
admin.initializeApp({ 
credential: admin.credential.cert(serviceAccount) 
}); 
const db = admin.firestore(); 
console.log('✅ Firebase connecté'); 
} catch (error) { 
console.log('❌ Erreur Firebase :', error.message); 
process.exit(1); // Plante proprement pour voir l'erreur 
}

//  
// ROUTE 
//  
app.get('/', (req, res) => { 
res.json({ status: 'OK', message: 'Firebase OK' }); 
});

app.listen(PORT, () => { 
console.log('✅ API tourne sur le port ' + PORT); 
});
