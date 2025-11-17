const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fileRoutes = require('./routes/files');
require('dotenv').config();

const app = express();

// parsers (optional)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve static files (html/css/js) from the project folder
// (later you can move your front-end into /public and change this path)
app.use(express.static(__dirname));
app.use('/api/files', fileRoutes);

// a home route so "/" works
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html')); // you have home.html
});

const pageRoutes = [
  'home',
  'mydrive',
  'shared',
  'starred',
  'trash',
  'login',
  'signup',
];

pageRoutes.forEach((page) => {
  app.get(`/${page}`, (_req, res) => {
    res.sendFile(path.join(__dirname, `${page}.html`));
  });
});

// quick health check
app.get('/health', (req, res) => res.json({ ok: true }));

// generic error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
    app.listen(process.env.PORT || 3000, () =>
      console.log(`✅ http://localhost:${process.env.PORT || 3000}`)
    );
  } catch (e) {
    console.error('❌ Mongo error:', e.message);
    process.exit(1);
  }
}
start();