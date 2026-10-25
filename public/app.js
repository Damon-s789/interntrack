const state = { token: localStorage.getItem('interntrack_token'), user: null, applications: [] };
const statusOrder = ['Wishlist', 'Applied', 'Interview', 'Offer', 'Rejected'];
const $ = (selector) => document.querySelector(selector);

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function dateValue(value) { return value ? String(value).slice(0, 10) : ''; }
function displayDate(value, fallback = 'No deadline') {
  if (!value) return fallback;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${dateValue(value)}T12:00:00`));
}
function deadlineParts(value) {
  const date = new Date(`${dateValue(value)}T12:00:00`);
  return { day: date.getDate(), month: new Intl.DateTimeFormat('en', { month: 'short' }).format(date) };
}
function authHeaders() { return state.token ? { Authorization: `Bearer ${state.token}` } : {}; }
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...authHeaders(), ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.token) signOut();
    throw new Error(data.error || 'Something went wrong.');
  }
  return data;
}
function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.add('hidden'), 3000);
}
function setAuthScreen(screen) {
  $('#login-card').classList.toggle('hidden', screen !== 'login');
  $('#register-card').classList.toggle('hidden', screen !== 'register');
}
function showApp() {
  $('#auth-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  $('#user-name').textContent = state.user.name;
  $('#user-email').textContent = state.user.email;
  $('#avatar').textContent = state.user.name.slice(0, 1).toUpperCase();
  $('#greeting-name').textContent = state.user.name.split(' ')[0];
  loadDashboard();
  loadApplications();
}
function signOut() {
  localStorage.removeItem('interntrack_token');
  state.token = null;
  state.user = null;
  $('#app-view').classList.add('hidden');
  $('#auth-view').classList.remove('hidden');
  setAuthScreen('login');
}
async function authenticate(event, type) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Please wait…';
  try {
    const result = await api(`/api/auth/${type}`, { method: 'POST', body: JSON.stringify(data) });
    state.token = result.token;
    state.user = result.user;
    localStorage.setItem('interntrack_token', state.token);
    form.reset();
    showApp();
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; button.innerHTML = type === 'login' ? 'Sign in <span>→</span>' : 'Create account <span>→</span>'; }
}
function switchPage(page) {
  document.querySelectorAll('.page').forEach((item) => item.classList.toggle('active-page', item.id === `${page}-page`));
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
  $('#page-heading').style.display = page === 'dashboard' ? '' : 'none';
  $('#new-application').classList.toggle('hidden', page === 'applications');
  if (page === 'applications') loadApplications(); else loadDashboard();
  $('.sidebar').classList.remove('open');
}
function statusClass(status) { return `status-${status}`; }
function renderEmpty(target, text) { target.innerHTML = `<div class="empty-state">${escapeHtml(text)}</div>`; }
async function loadDashboard() {
  try {
    const data = await api('/api/dashboard');
    $('#total-count').textContent = data.total;
    $('#interview-count').textContent = data.byStatus.Interview;
    $('#offer-count').textContent = data.byStatus.Offer;
    const responded = data.byStatus.Interview + data.byStatus.Offer;
    const applied = data.byStatus.Applied + responded + data.byStatus.Rejected;
    $('#response-rate').textContent = applied ? `${Math.round((responded / applied) * 100)}%` : '0%';
    const max = Math.max(...Object.values(data.byStatus), 1);
    $('#pipeline').innerHTML = statusOrder.map((status) => `<div class="pipe-col"><div class="pipe-bar"><div class="pipe-fill" style="height:${Math.max(5, (data.byStatus[status] / max) * 100)}%"></div></div><p class="pipe-label">${status}</p><p class="pipe-count">${data.byStatus[status]}</p></div>`).join('');
    const deadlines = $('#deadlines');
    if (!data.upcoming.length) renderEmpty(deadlines, 'No upcoming deadlines. Add one to stay ahead.');
    else deadlines.innerHTML = data.upcoming.map((item) => { const date = deadlineParts(item.deadline); return `<button class="deadline-item detail-trigger" data-id="${item.id}"><span class="date-badge"><b>${date.day}</b><small>${date.month}</small></span><span class="deadline-copy"><strong>${escapeHtml(item.company)}</strong><small>${escapeHtml(item.role)}</small></span></button>`; }).join('');
    const recent = $('#recent-applications');
    if (!data.recent.length) renderEmpty(recent, 'Your latest applications will appear here.');
    else recent.innerHTML = data.recent.map((item) => `<button class="recent-card detail-trigger" data-id="${item.id}"><div class="recent-company">${escapeHtml(item.company)}</div><div class="recent-role">${escapeHtml(item.role)}</div><span class="status-pill ${statusClass(item.status)}">${item.status}</span></button>`).join('');
  } catch (error) { toast(error.message); }
}
async function loadApplications() {
  if (!state.token) return;
  const params = new URLSearchParams();
  const search = $('#search-input')?.value.trim();
  const status = $('#status-filter')?.value;
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  try {
    const data = await api(`/api/applications?${params}`);
    state.applications = data.applications;
    const list = $('#applications-list');
    if (!data.applications.length) return renderEmpty(list, search || status ? 'No applications match these filters.' : 'No applications yet. Add the first opportunity in your pipeline.');
    list.innerHTML = data.applications.map((item) => `<button class="application-row detail-trigger" data-id="${item.id}"><span class="company-cell"><strong>${escapeHtml(item.company)}</strong><small>${escapeHtml(item.location || item.work_mode)}</small></span><span class="row-role">${escapeHtml(item.role)}</span><span class="status-pill ${statusClass(item.status)}">${item.status}</span><span class="row-meta">${displayDate(item.deadline)}</span><span class="row-meta">${escapeHtml(item.work_mode)}</span><span class="row-arrow">→</span></button>`).join('');
  } catch (error) { toast(error.message); }
}
function openApplicationModal(application = null) {
  const form = $('#application-form');
  form.reset();
  form.id.value = application?.id || '';
  if (application) {
    $('#modal-eyebrow').textContent = 'EDIT APPLICATION';
    $('#modal-title').textContent = 'Keep this opportunity current.';
    Object.entries({ company: application.company, role: application.role, location: application.location, workMode: application.work_mode, status: application.status, appliedDate: dateValue(application.applied_date), deadline: dateValue(application.deadline), jobUrl: application.job_url, salary: application.salary, notes: application.notes }).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value || ''; });
    $('#delete-application').classList.remove('hidden');
  } else {
    $('#modal-eyebrow').textContent = 'NEW APPLICATION';
    $('#modal-title').textContent = 'Add an opportunity.';
    form.elements.status.value = 'Wishlist'; form.elements.workMode.value = 'Remote';
    $('#delete-application').classList.add('hidden');
  }
  $('#application-modal').classList.remove('hidden');
}
function closeModals() { $('#application-modal').classList.add('hidden'); $('#detail-modal').classList.add('hidden'); }
async function saveApplication(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.id.value;
  const data = Object.fromEntries(new FormData(form));
  delete data.id;
  try {
    await api(`/api/applications${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
    closeModals(); toast(id ? 'Application updated.' : 'Application added.');
    loadDashboard(); loadApplications();
  } catch (error) { toast(error.message); }
}
async function deleteApplication() {
  const id = $('#application-form').id.value;
  if (!id || !confirm('Delete this application and its activity history?')) return;
  try { await api(`/api/applications/${id}`, { method: 'DELETE' }); closeModals(); toast('Application deleted.'); loadDashboard(); loadApplications(); }
  catch (error) { toast(error.message); }
}
async function openDetail(id) {
  try {
    const data = await api(`/api/applications/${id}`);
    const item = data.application;
    const jobLink = item.job_url ? `<a class="text-button" target="_blank" rel="noreferrer" href="${escapeHtml(item.job_url)}">Open job posting ↗</a>` : '';
    $('#detail-content').innerHTML = `<div class="detail-header"><p class="eyebrow">${escapeHtml(item.status)} OPPORTUNITY</p><h2>${escapeHtml(item.company)}</h2><p>${escapeHtml(item.role)}${item.location ? ` · ${escapeHtml(item.location)}` : ''}</p></div><div class="detail-tags"><span class="status-pill ${statusClass(item.status)}">${item.status}</span><span class="status-pill">${escapeHtml(item.work_mode)}</span></div><div class="detail-grid"><div><small>Applied</small><strong>${displayDate(item.applied_date, 'Not yet')}</strong></div><div><small>Deadline</small><strong>${displayDate(item.deadline)}</strong></div><div><small>Compensation</small><strong>${escapeHtml(item.salary || 'Not specified')}</strong></div><div><small>Job posting</small><strong>${jobLink || 'Not added'}</strong></div></div>${item.notes ? `<div class="detail-note">${escapeHtml(item.notes)}</div>` : ''}<section class="activity-section"><h3>Activity timeline</h3><form id="activity-form" class="activity-form"><input required name="body" maxlength="1000" placeholder="e.g. Reached out to recruiter" /><input name="activityDate" type="date" value="${new Date().toISOString().slice(0, 10)}"/><button class="button primary" type="submit">Add</button></form><div class="activity-list">${data.activities.length ? data.activities.map((activity) => `<div class="activity-item"><span class="activity-date">${displayDate(activity.activity_date)}</span><p>${escapeHtml(activity.body)}</p></div>`).join('') : '<p class="empty-state">No activity yet. Record your next step here.</p>'}</div></section><div class="detail-actions"><button id="edit-from-detail" class="button secondary">Edit application</button></div>`;
    $('#detail-modal').dataset.application = JSON.stringify(item);
    $('#detail-modal').classList.remove('hidden');
  } catch (error) { toast(error.message); }
}
async function addActivity(event) {
  event.preventDefault();
  const application = JSON.parse($('#detail-modal').dataset.application);
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try { await api(`/api/applications/${application.id}/activities`, { method: 'POST', body: JSON.stringify(data) }); toast('Activity added.'); openDetail(application.id); loadDashboard(); }
  catch (error) { toast(error.message); }
}
function bindEvents() {
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('.detail-trigger');
    if (trigger) openDetail(trigger.dataset.id);
    const nav = event.target.closest('.nav-item');
    if (nav) switchPage(nav.dataset.page);
    if (event.target.closest('[data-new-application]') || event.target.closest('#new-application')) openApplicationModal();
    if (event.target.closest('[data-go-applications]')) switchPage('applications');
    if (event.target.closest('[data-close-modal]')) $('#application-modal').classList.add('hidden');
    if (event.target.closest('[data-close-detail]')) $('#detail-modal').classList.add('hidden');
    if (event.target.closest('#edit-from-detail')) { const app = JSON.parse($('#detail-modal').dataset.application); $('#detail-modal').classList.add('hidden'); openApplicationModal(app); }
  });
  document.querySelectorAll('[data-auth-toggle]').forEach((button) => button.addEventListener('click', () => setAuthScreen(button.dataset.authToggle)));
  $('#login-form').addEventListener('submit', (event) => authenticate(event, 'login'));
  $('#register-form').addEventListener('submit', (event) => authenticate(event, 'register'));
  $('#application-form').addEventListener('submit', saveApplication);
  $('#delete-application').addEventListener('click', deleteApplication);
  $('#detail-content').addEventListener('submit', (event) => { if (event.target.id === 'activity-form') addActivity(event); });
  $('#logout-btn').addEventListener('click', signOut);
  $('#mobile-menu').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
  let searchTimer;
  $('#search-input').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadApplications, 250); });
  $('#status-filter').addEventListener('change', loadApplications);
}
async function init() {
  bindEvents();
  if (!state.token) return setAuthScreen('login');
  try { const result = await api('/api/me'); state.user = result.user; showApp(); }
  catch { signOut(); }
}
init();
