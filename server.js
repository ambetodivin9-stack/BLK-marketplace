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
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); 
admin.initializeApp({ 
credential: admin.credential.cert(serviceAccount) 
}); 
const db = admin.firestore();

//  
// CONFIGURATION 
//  
const IMG_BB_KEY = process.env.IMG_BB_KEY; 
const YABETOO_SECRET = process.env.YABETOO_SECRET_KEY; 
const ADMIN_PHONE = process.env.ADMIN_PHONE || '065918166';

const COMMISSION_BUYER = 0.03; 
const COMMISSION_SELLER = 0.04;

const ALLOWED_CATEGORIES = [ 
'vêtements', 
'chaussures', 
'sacs', 
'bijoux', 
'accessoires' 
];

console.log('✅ BLK Marketplace - 100% RÉEL'); 
console.log('✅ Admin Phone: ' + ADMIN_PHONE); 
console.log('✅ ImgBB: ' + (IMG_BB_KEY ? 'OK' : 'MANQUANT')); 
console.log('✅ Yabetoo: ' + (YABETOO_SECRET ? 'OK' : 'MANQUANT'));

//  
// ROUTE PRINCIPALE 
//  
app.get('/', (req, res) => { 
res.json({ 
status: 'OK', 
message: 'BLK Marketplace API - 100% RÉEL', 
services: { 
firebase: '✅', 
imgbb: IMG_BB_KEY ? '✅' : '❌', 
yabetoo: YABETOO_SECRET ? '✅' : '❌' 
} 
}); 
});

//  
// ARTICLES 
//  
app.get('/api/articles', async (req, res) => { 
try { 
const snapshot = await db.collection('articles') 
.where('status', '', 'active') 
.orderBy('createdAt', 'desc') 
.get(); 
const articles = []; 
snapshot.forEach(doc => { 
articles.push({ id: doc.id, ...doc.data() }); 
}); 
res.json({ success: true, data: articles }); 
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

app.post('/api/articles', async (req, res) => { 
try { 
const { title, description, price, category, image, sellerId, sellerName, sellerPhoto } = req.body;

if (!ALLOWED_CATEGORIES.includes(category)) {
  return res.status(400).json({
    success: false,
    message: 'Catégorie non autorisée. Autorise: ' + ALLOWED_CATEGORIES.join(', ')
  });
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

const docRef = await db.collection('articles').add(article);
res.json({ success: true, id: docRef.id });
} catch (error) { 
res.status(500).json({ success: false, message: error.message }); 
} 
});

//  
// UPLOAD IMAGE (ImgBB) 
//  
app.post('/api/upload', async (req, res) => { 
try { 
const { base64 } = req.body; 
if (!base64) return res.status(400).json({ success: false, message: 'Aucune image' }); 
if (!IMG_BB_KEY) return res.status(500).json({ success: false, message: 'Clé ImgBB manquante' });

const base64Data = base64.includes('base64,') ? base64.split('base64,')[1] : base64;
const formData = new FormData();
formData.append('key', IMG_BB_KEY);
formData.append('image', base64Data);

const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
  headers: formData.getHeaders()
});

if (response.data.success) {
  res.json({ success: true, url: response.data.data.url });
} else {
  res.status(400).json({ success: false, message: 'Erreur ImgBB' });
}
} catch (error) { 
console.error('ImgBB Error:', error.message); 
res.status(500).json({ success: false, message: 'Erreur upload' }); 
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
// DÉMARRAGE 
// == 
app.listen(PORT, () => { 
console.log('✅ BLK API running on port ' + PORT); 
console.log('📦 Mode: 100% RÉEL'); 
console.log('💳 Paiement: MTN Mobile Money (Yabetoo)'); 
console.log('📱 Admin: ' + ADMIN_PHONE); 
});
