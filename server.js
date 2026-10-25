require('dotenv').config();

const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;
const STATUSES = ['Wishlist', 'Applied', 'Interview', 'Offer', 'Rejected'];
const WORK_MODES = ['Remote', 'Hybrid', 'On-site'];
let db;
let client;

if (!MONGODB_URI) throw new Error('MONGODB_URI is required. Copy .env.example to .env and configure MongoDB.');
if (!JWT_SECRET || JWT_SECRET.length < 16) throw new Error('JWT_SECRET must be set to a value of at least 16 characters.');

app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function asyncHandler(handler) { return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next); }
function cleanText(value, maxLength = 1000) { return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''; }
function cleanDate(value) { if (!value) return null; const date = new Date(`${value}T00:00:00Z`); return Number.isNaN(date.getTime()) ? null : value; }
function idFrom(value) { if (!ObjectId.isValid(value)) { const error = new Error('Invalid application ID.'); error.status = 400; throw error; } return new ObjectId(value); }
function serializeApplication(item) {
  if (!item) return null;
  return { id: item._id.toString(), company: item.company, role: item.role, location: item.location, work_mode: item.workMode, status: item.status, applied_date: item.appliedDate, deadline: item.deadline, job_url: item.jobUrl, salary: item.salary, notes: item.notes, created_at: item.createdAt, updated_at: item.updatedAt };
}
function serializeActivity(item) { return { id: item._id.toString(), application_id: item.applicationId.toString(), body: item.body, activity_date: item.activityDate, created_at: item.createdAt }; }
function toApplicationInput(body) {
  const data = { company: cleanText(body.company, 120), role: cleanText(body.role, 160), location: cleanText(body.location, 120) || null, workMode: WORK_MODES.includes(body.workMode) ? body.workMode : 'Remote', status: STATUSES.includes(body.status) ? body.status : 'Wishlist', appliedDate: cleanDate(body.appliedDate), deadline: cleanDate(body.deadline), jobUrl: cleanText(body.jobUrl, 1000) || null, salary: cleanText(body.salary, 80) || null, notes: cleanText(body.notes, 4000) || null };
  if (!data.company || !data.role) { const error = new Error('Company and role are required.'); error.status = 400; throw error; }
  if (data.jobUrl && !/^https?:\/\//i.test(data.jobUrl)) { const error = new Error('Job link must start with http:// or https://.'); error.status = 400; throw error; }
  return data;
}
function signToken(user) { return jwt.sign({ sub: user._id.toString(), name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' }); }
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  try { req.user = jwt.verify(token, JWT_SECRET); req.userId = idFrom(req.user.sub); return next(); }
  catch { return res.status(401).json({ error: 'Your session has expired. Please sign in again.' }); }
}
async function initializeDatabase() {
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db();
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('applications').createIndex({ userId: 1, status: 1 }),
    db.collection('applications').createIndex({ userId: 1, deadline: 1 }),
    db.collection('activities').createIndex({ applicationId: 1, userId: 1, activityDate: -1 })
  ]);
  console.log('MongoDB connection and indexes are ready.');
}

app.get('/api/health', asyncHandler(async (req, res) => { await db.command({ ping: 1 }); res.json({ status: 'ok' }); }));
app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const name = cleanText(req.body.name, 80); const email = cleanText(req.body.email, 255).toLowerCase(); const password = String(req.body.password || '');
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter your name and a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Use a password with at least 8 characters.' });
  const user = { name, email, passwordHash: await bcrypt.hash(password, 12), createdAt: new Date() };
  try { const result = await db.collection('users').insertOne(user); user._id = result.insertedId; res.status(201).json({ token: signToken(user), user: { id: user._id.toString(), name, email } }); }
  catch (error) { if (error.code === 11000) return res.status(409).json({ error: 'An account with that email already exists.' }); throw error; }
}));
app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const email = cleanText(req.body.email, 255).toLowerCase(); const password = String(req.body.password || '');
  const user = await db.collection('users').findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Incorrect email or password.' });
  res.json({ token: signToken(user), user: { id: user._id.toString(), name: user.name, email: user.email } });
}));
app.get('/api/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await db.collection('users').findOne({ _id: req.userId }, { projection: { name: 1, email: 1 } });
  if (!user) return res.status(401).json({ error: 'Account not found.' });
  res.json({ user: { id: user._id.toString(), name: user.name, email: user.email } });
}));
app.get('/api/applications', requireAuth, asyncHandler(async (req, res) => {
  const filter = { userId: req.userId };
  if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
  const search = cleanText(req.query.search, 100);
  if (search) { const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); filter.$or = [{ company: regex }, { role: regex }, { location: regex }]; }
  const applications = await db.collection('applications').find(filter).sort({ deadline: 1, updatedAt: -1 }).toArray();
  res.json({ applications: applications.map(serializeApplication) });
}));
app.post('/api/applications', requireAuth, asyncHandler(async (req, res) => {
  const now = new Date(); const application = { ...toApplicationInput(req.body), userId: req.userId, createdAt: now, updatedAt: now };
  const result = await db.collection('applications').insertOne(application); application._id = result.insertedId;
  res.status(201).json({ application: serializeApplication(application) });
}));
app.get('/api/applications/:id', requireAuth, asyncHandler(async (req, res) => {
  const applicationId = idFrom(req.params.id); const application = await db.collection('applications').findOne({ _id: applicationId, userId: req.userId });
  if (!application) return res.status(404).json({ error: 'Application not found.' });
  const activities = await db.collection('activities').find({ applicationId, userId: req.userId }).sort({ activityDate: -1, createdAt: -1 }).toArray();
  res.json({ application: serializeApplication(application), activities: activities.map(serializeActivity) });
}));
app.put('/api/applications/:id', requireAuth, asyncHandler(async (req, res) => {
  const applicationId = idFrom(req.params.id);
  const result = await db.collection('applications').findOneAndUpdate({ _id: applicationId, userId: req.userId }, { $set: { ...toApplicationInput(req.body), updatedAt: new Date() } }, { returnDocument: 'after' });
  if (!result) return res.status(404).json({ error: 'Application not found.' });
  res.json({ application: serializeApplication(result) });
}));
app.delete('/api/applications/:id', requireAuth, asyncHandler(async (req, res) => {
  const applicationId = idFrom(req.params.id); const result = await db.collection('applications').deleteOne({ _id: applicationId, userId: req.userId });
  if (!result.deletedCount) return res.status(404).json({ error: 'Application not found.' });
  await db.collection('activities').deleteMany({ applicationId, userId: req.userId }); res.status(204).end();
}));
app.post('/api/applications/:id/activities', requireAuth, asyncHandler(async (req, res) => {
  const applicationId = idFrom(req.params.id); const body = cleanText(req.body.body, 1000); const activityDate = cleanDate(req.body.activityDate) || new Date().toISOString().slice(0, 10);
  if (!body) return res.status(400).json({ error: 'Activity details are required.' });
  const owner = await db.collection('applications').findOne({ _id: applicationId, userId: req.userId }, { projection: { _id: 1 } });
  if (!owner) return res.status(404).json({ error: 'Application not found.' });
  const activity = { applicationId, userId: req.userId, body, activityDate, createdAt: new Date() }; const result = await db.collection('activities').insertOne(activity); activity._id = result.insertedId;
  await db.collection('applications').updateOne({ _id: applicationId }, { $set: { updatedAt: new Date() } }); res.status(201).json({ activity: serializeActivity(activity) });
}));
app.get('/api/dashboard', requireAuth, asyncHandler(async (req, res) => {
  const applications = db.collection('applications');
  const [counts, upcoming, recent] = await Promise.all([
    applications.aggregate([{ $match: { userId: req.userId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
    applications.find({ userId: req.userId, deadline: { $gte: new Date().toISOString().slice(0, 10) }, status: { $nin: ['Offer', 'Rejected'] } }).sort({ deadline: 1 }).limit(5).toArray(),
    applications.find({ userId: req.userId }).sort({ updatedAt: -1 }).limit(5).toArray()
  ]);
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0])); counts.forEach((item) => { if (STATUSES.includes(item._id)) byStatus[item._id] = item.count; });
  res.json({ byStatus, total: Object.values(byStatus).reduce((sum, count) => sum + count, 0), upcoming: upcoming.map(serializeApplication), recent: recent.map(serializeApplication) });
}));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((error, req, res, next) => { console.error(error); res.status(error.status || 500).json({ error: error.status ? error.message : 'Something went wrong. Please try again.' }); });
initializeDatabase().then(() => app.listen(PORT, () => console.log(`InternTrack is running on port ${PORT}`))).catch((error) => { console.error('Unable to initialize MongoDB:', error.message); process.exit(1); });
process.on('SIGTERM', () => client?.close().finally(() => process.exit(0)));
