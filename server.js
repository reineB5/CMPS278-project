const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fileRoutes = require('./routes/files');
const authRoutes = require('./routes/auth');
const cookieParser = require('./middleware/cookies');
const { attachUser, requireAuth, ensureGuest } = require('./middleware/auth');
require('dotenv').config();

const app = express();

// parsers (optional)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser);
app.use(attachUser);

const publicHtmlFiles = new Set(['/login.html', '/signup.html', '/reset-password.html']);
app.use((req, res, next) => {
  if (req.path.endsWith('.html') && !publicHtmlFiles.has(req.path) && !req.user) {
    return res.redirect('/login');
  }
  next();
});

// serve static files (html/css/js) from the project folder
// (later you can move your front-end into /public and change this path)
app.use(express.static(__dirname));
app.use('/api/auth', authRoutes);
app.use('/api/files', requireAuth, fileRoutes);

// a home route so "/" works
app.get('/', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

const protectedPages = ['home', 'mydrive', 'shared', 'starred', 'trash', 'profile'];
protectedPages.forEach((page) => {
  app.get(`/${page}`, requireAuth, (_req, res) => {
    res.sendFile(path.join(__dirname, `${page}.html`));
  });
});

app.get('/login', ensureGuest, (_req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/signup', ensureGuest, (_req, res) => {
  res.sendFile(path.join(__dirname, 'signup.html'));
});

app.get('/reset-password', (_req, res) => {
  res.sendFile(path.join(__dirname, 'reset-password.html'));
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
