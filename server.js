require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const STATUSES = ['Received', 'Confirmed', 'Preparing', 'Ready for pickup', 'Completed', 'Cancelled'];

for (const dir of [DATA_DIR, UPLOAD_DIR]) fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]', 'utf8');

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  name: 'dpstudio.sid',
  secret: process.env.SESSION_SECRET || 'college-project-demo-secret-change-before-deploying',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 12
  }
}));
app.use(express.static(PUBLIC));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic' })[file.mimetype] || '';
    cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Please upload a JPG, PNG, WEBP or HEIC image.'), allowed.includes(file.mimetype));
  }
});

function readOrders() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Could not read orders file:', err.message);
    return [];
  }
}
function writeOrders(orders) {
  // Atomic replace keeps the JSON file valid if the process is interrupted mid-write.
  const temp = `${ORDERS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(orders, null, 2), 'utf8');
  fs.renameSync(temp, ORDERS_FILE);
}
function requireRole(role) {
  return (req, res, next) => req.session && req.session.role === role
    ? next()
    : res.status(401).json({ error: 'Please sign in to continue.' });
}
function clean(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

app.get('/api/session', (req, res) => {
  res.json({
    signedIn: Boolean(req.session.role),
    role: req.session.role || null,
    name: req.session.name || null,
    phone: req.session.phone || null
  });
});

app.post('/api/consumer/login', (req, res) => {
  const name = clean(req.body.name, 80);
  const phone = clean(req.body.phone, 20).replace(/[\s()-]/g, '');
  const indianMobile = /^(?:\+91)?[6-9]\d{9}$/;
  if (!indianMobile.test(phone)) return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.' });
  const normalizedPhone = phone.startsWith('+91') ? phone.slice(3) : phone;
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not start your session. Please try again.' });
    req.session.role = 'consumer';
    req.session.name = name || 'Cake Lover';
    req.session.phone = normalizedPhone;
    req.session.save(saveErr => saveErr ? res.status(500).json({ error: 'Could not save your session.' }) : res.json({ ok: true, name: req.session.name, phone: normalizedPhone }));
  });
});

app.post('/api/admin/login', (req, res) => {
  const pin = String(req.body.pin ?? '').trim();
  const expected = String(process.env.ADMIN_PIN || '135581');
  if (!/^\d{6}$/.test(pin) || pin !== expected) return res.status(401).json({ error: 'Incorrect six-digit studio PIN.' });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not start studio session.' });
    req.session.role = 'admin';
    req.session.name = 'DP Cake Studio';
    req.session.save(saveErr => saveErr ? res.status(500).json({ error: 'Could not save studio session.' }) : res.json({ ok: true }));
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Unable to sign out. Please try again.' });
    res.clearCookie('dpstudio.sid');
    res.json({ ok: true });
  });
});

app.post('/api/orders', requireRole('consumer'), (req, res, next) => {
  upload.single('referencePhoto')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message || 'Could not upload the photo.' });
    next();
  });
}, (req, res) => {
  const body = req.body || {};
  const cakeName = clean(body.cakeName, 100);
  const flavour = clean(body.flavour, 60);
  const size = clean(body.size, 30);
  const quantity = Number(body.quantity);
  const deliveryDate = clean(body.deliveryDate, 10);
  const deliveryTime = clean(body.deliveryTime, 30);
  const fulfillment = clean(body.fulfillment, 30);
  const address = clean(body.address, 400);
  const message = clean(body.message, 100);
  const notes = clean(body.notes, 1000);
  if (!cakeName || !flavour || !size || !Number.isInteger(quantity) || quantity < 1 || quantity > 10 || !validDate(deliveryDate) || !deliveryTime) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Please complete the required cake, quantity and delivery fields.' });
  }
  if (!['Pickup', 'Delivery'].includes(fulfillment)) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Choose pickup or delivery.' });
  }
  if (fulfillment === 'Delivery' && !address) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Please add a delivery address.' });
  }
  const order = {
    id: `DP-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    customerName: clean(req.session.name, 80) || 'Cake Lover',
    phone: req.session.phone,
    cakeName, flavour, size, quantity, deliveryDate, deliveryTime,
    fulfillment, address: fulfillment === 'Delivery' ? address : '',
    message, notes,
    referencePhoto: req.file ? `/api/admin/photos/${encodeURIComponent(path.basename(req.file.filename))}` : null,
    status: 'Received',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const orders = readOrders();
  orders.unshift(order);
  try {
    writeOrders(orders);
    res.status(201).json({ ok: true, order });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error('Could not save order:', err.message);
    res.status(500).json({ error: 'Order could not be saved. Please try again.' });
  }
});

app.get('/api/orders/mine', requireRole('consumer'), (req, res) => {
  const orders = readOrders().filter(o => o.phone === req.session.phone).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ orders });
});

app.get('/api/admin/orders', requireRole('admin'), (_req, res) => {
  const orders = readOrders().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ orders, statuses: STATUSES });
});

app.get('/api/admin/photos/:filename', requireRole('admin'), (req, res) => {
  const requested = req.params.filename;
  const filename = path.basename(requested);
  if (!filename || filename !== requested) return res.status(400).json({ error: 'Invalid photo path.' });
  const imagePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(imagePath)) return res.status(404).json({ error: 'Reference photo not found.' });
  res.sendFile(imagePath, { headers: { 'Cache-Control': 'private, max-age=300' } });
});

app.patch('/api/admin/orders/:id/status', requireRole('admin'), (req, res) => {
  const status = clean(req.body.status, 40);
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Select a valid order status.' });
  const orders = readOrders();
  const order = orders.find(item => item.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  order.status = status;
  order.updatedAt = new Date().toISOString();
  writeOrders(orders);
  res.json({ ok: true, order });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'DP Cake Studio', time: new Date().toISOString() }));

app.use((err, _req, res, _next) => {
  console.error(err.stack || err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

app.listen(PORT, () => {
  console.log(`DP Cake Studio is running at http://localhost:${PORT}`);
  console.log('Studio PIN is configured by ADMIN_PIN (demo default: 135581).');
});
