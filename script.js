// ==================== DATA MANAGEMENT ====================

// Initialize data structures
let currentUser = null;
let users = JSON.parse(localStorage.getItem('users')) || [];
let posts = JSON.parse(localStorage.getItem('posts')) || [];
let events = JSON.parse(localStorage.getItem('events')) || [];
let talents = JSON.parse(localStorage.getItem('talents')) || [];
let questions = JSON.parse(localStorage.getItem('questions')) || [];
let resources = JSON.parse(localStorage.getItem('resources')) || [];
let messages = JSON.parse(localStorage.getItem('messages')) || [];
let notifications = JSON.parse(localStorage.getItem('notifications')) || [];
let skillPosts = JSON.parse(localStorage.getItem('skillPosts')) || [];
let bazaarType = 'Offering';
// Backend API (server) - enable if you run the Express server
const BAZAAR_API = 'http://localhost:4000/api/bazaar';
let ENABLE_BAZAAR_API = true; // set false to use localStorage-only mode
// Ensure all users have skillPoints field (default 0)
users = users.map(u => {
    if (typeof u.skillPoints === 'undefined' || u.skillPoints === null) u.skillPoints = 0;
    return u;
});
saveData();
let notificationAutoCloseTimer = null;
let studentRegistry = JSON.parse(localStorage.getItem('studentRegistry')) || [];
let studentTodos = JSON.parse(localStorage.getItem('studentTodos')) || [];
let currentMonth = new Date();
// Silent Alert System data
let assessments = JSON.parse(localStorage.getItem('assessments')) || []; // {id, studentId, subject, chapter, score, ts}
let silentAlerts = JSON.parse(localStorage.getItem('silentAlerts')) || []; // private alerts

// Disciplinary / profanity filter data
let abusiveWords = JSON.parse(localStorage.getItem('abusiveWords')) || [
    "idiot",
    "stupid",
    "dumb",
    "shut up",
    "hate",
    "loser",
    "moron",
    "fool",
    "suck",
    "trash",
    "ugly",
    "nonsense",
    "jerk",
    "crap",
    "damn",
    "bastard",
    "hell"
];
let disciplinaryRecords = JSON.parse(localStorage.getItem('disciplinaryRecords')) || {}; // { userId: { strikes: n, lastStrike: ts, lockedUntil: ts|null } }

function saveDisciplinaryRecords() {
    try { localStorage.setItem('disciplinaryRecords', JSON.stringify(disciplinaryRecords)); } catch (e) {}
}

function saveAlertsAndAssessments() {
    try { localStorage.setItem('assessments', JSON.stringify(assessments)); } catch (e) {}
    try { localStorage.setItem('silentAlerts', JSON.stringify(silentAlerts)); } catch (e) {}
}

function sanitizeMessageText(text) {
    if (!text) return { cleanText: text, hadProfanity: false, profaneWords: [] };
    const found = new Set();
    let clean = text;
    abusiveWords.forEach(w => {
        try {
            const pattern = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`\\b${pattern}\\b`, 'ig');
            if (re.test(clean)) {
                found.add(w);
                // replace each char of the word with * to preserve spacing
                clean = clean.replace(re, (m) => '*'.repeat(m.length));
            }
        } catch (e) {}
    });
    return { cleanText: clean, hadProfanity: found.size > 0, profaneWords: Array.from(found) };
}

function recordDisciplinary(userId, profaneWords) {
    if (!userId) return;
    const rec = disciplinaryRecords[userId] || { strikes: 0, lastStrike: null, lockedUntil: null };
    rec.strikes = (rec.strikes || 0) + 1;
    rec.lastStrike = new Date().toISOString();
    // Lock messaging for 24h after 3 strikes
    if (rec.strikes >= 3) {
        const until = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
        rec.lockedUntil = new Date(until).toISOString();
        // mark user as messagingLocked in user record for quick checks
        const uidx = users.findIndex(u => u.id === userId);
        if (uidx !== -1) { users[uidx].messagingLocked = true; saveData(); }
        addNotification('discipline', 'Messaging locked', `User ${users[uidx]?.name || userId} locked for abusive messages`);
        showMessage('Your messaging has been locked for 24 hours due to repeated abusive language', true);
    } else {
        showMessage(`Message blocked: please avoid abusive language. Strike ${rec.strikes}/3`, true);
    }
    disciplinaryRecords[userId] = rec;
    saveDisciplinaryRecords();
    // notify admins/principal
    try { addNotification('discipline', 'Abusive message blocked', `User ${users.find(u=>u.id===userId)?.name || userId} attempted to send abusive words: ${profaneWords.join(', ')}`); } catch (e) {}
}

function isUserMessagingLocked(userId) {
    const rec = disciplinaryRecords[userId];
    if (!rec) return false;
    if (rec.lockedUntil && new Date(rec.lockedUntil) > new Date()) return true;
    // clear lock if time passed
    if (rec.lockedUntil && new Date(rec.lockedUntil) <= new Date()) {
        rec.lockedUntil = null; rec.strikes = 0; saveDisciplinaryRecords();
        const uidx = users.findIndex(u => u.id === userId);
        if (uidx !== -1) { users[uidx].messagingLocked = false; saveData(); }
        return false;
    }
    return false;
}

// Save all data to localStorage
function saveData() {
    localStorage.setItem('users', JSON.stringify(users));
    localStorage.setItem('posts', JSON.stringify(posts));
    localStorage.setItem('events', JSON.stringify(events));
    localStorage.setItem('talents', JSON.stringify(talents));
    localStorage.setItem('questions', JSON.stringify(questions));
    try { localStorage.setItem('resources', JSON.stringify(resources)); } catch (e) {}
    localStorage.setItem('messages', JSON.stringify(messages));
    try { localStorage.setItem('assessments', JSON.stringify(assessments)); } catch (e) {}
    try { localStorage.setItem('silentAlerts', JSON.stringify(silentAlerts)); } catch (e) {}
    // Persist notifications alongside app data
    localStorage.setItem('notifications', JSON.stringify(notifications));
    try { localStorage.setItem('skillPosts', JSON.stringify(skillPosts)); } catch (e) {}
}

// ==================== NOTIFICATIONS ====================
function saveNotifications() {
    try { localStorage.setItem('notifications', JSON.stringify(notifications)); } catch (e) {}
}

function addNotification(type, title, message) {
    const n = { id: Date.now(), type, title, message, ts: new Date().toISOString() };
    notifications.unshift(n);
    // keep recent 100
    if (notifications.length > 100) notifications = notifications.slice(0,100);
    saveNotifications();
    renderNotifications();
}

function clearNotifications() {
    if (!confirm('Clear all notifications?')) return;
    notifications = [];
    saveNotifications();
    renderNotifications();
}

function renderNotifications() {
    const list = document.getElementById('notificationList');
    if (!list) return;
    list.innerHTML = '';
    if (!notifications || notifications.length === 0) { list.innerHTML = '<div class="empty-state">No latest notifications</div>'; return; }
    // show up to 8
    notifications.slice(0,8).forEach(n => {
        const item = document.createElement('div');
        item.className = 'notification-item';
        const timeAgo = getTimeAgo(new Date(n.ts));
        item.innerHTML = `<div class="n-title">${escapeHtml(n.title)}</div><div class="n-msg">${escapeHtml(n.message)}</div><div class="n-time">${timeAgo}</div>`;
        list.appendChild(item);
    });
    // update navbar badge
    try { updateNotificationBadge(); } catch (e) {}
}

function updateNotificationBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    const count = notifications ? notifications.length : 0;
    if (count > 0) { badge.style.display = 'inline-block'; badge.textContent = count > 99 ? '99+' : String(count); }
    else { badge.style.display = 'none'; }
}

function toggleNotificationBar() {
    const bar = document.getElementById('notificationBar');
    if (!bar) return;
    // toggle visibility (bar hidden by default)
    const open = bar.classList.toggle('open');
    if (open) {
        try { renderNotifications(); } catch (e) {}
        // small highlight when opened
        bar.classList.add('notification-highlight');
        setTimeout(() => bar.classList.remove('notification-highlight'), 800);
        // auto-close after 8 seconds
        try { if (notificationAutoCloseTimer) clearTimeout(notificationAutoCloseTimer); } catch (e) {}
        notificationAutoCloseTimer = setTimeout(() => {
            try { bar.classList.remove('open'); } catch (e) {}
        }, 8000);
    }
    else {
        // if manually closed, clear any pending auto-close timer
        try { if (notificationAutoCloseTimer) { clearTimeout(notificationAutoCloseTimer); notificationAutoCloseTimer = null; } } catch (e) {}
    }
}

function closeNotificationBar() {
    const bar = document.getElementById('notificationBar');
    if (!bar) return;
    bar.classList.remove('open');
    try { if (notificationAutoCloseTimer) { clearTimeout(notificationAutoCloseTimer); notificationAutoCloseTimer = null; } } catch (e) {}
}

// ==================== RULE-BASED STUDY ASSISTANT ====================
let assistantHistory = JSON.parse(localStorage.getItem('assistantHistory')) || [];

function saveAssistantHistory() { try { localStorage.setItem('assistantHistory', JSON.stringify(assistantHistory)); } catch (e) {} }

function toggleAssistant() {
    const panel = document.getElementById('assistantPanel');
    if (!panel) return;
    const open = panel.classList.toggle('open');
    panel.setAttribute('aria-hidden', String(!open));
    if (open) renderAssistantHistory();
}

function closeAssistant() {
    const panel = document.getElementById('assistantPanel');
    if (!panel) return;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
}

function renderAssistantHistory() {
    const container = document.getElementById('assistantHistory');
    if (!container) return;
    container.innerHTML = '';
    if (!assistantHistory || assistantHistory.length === 0) { container.innerHTML = '<div class="empty-state">Ask me for tips or formulas</div>'; return; }
    assistantHistory.slice(-50).forEach(entry => {
        const el = document.createElement('div');
        el.className = 'assistant-entry' + (entry.source === 'user' ? ' user' : '');
        el.innerHTML = `<div class="text">${escapeHtml(entry.text)}</div><div class="time">${getTimeAgo(new Date(entry.ts))}</div>`;
        container.appendChild(el);
    });
    // ensure newest messages are visible; scroll the last entry into view (more reliable)
    try {
        requestAnimationFrame(() => {
            const last = container.lastElementChild;
            if (last && typeof last.scrollIntoView === 'function') {
                try { last.scrollIntoView({ behavior: 'smooth', block: 'end' }); }
                catch (e) { container.scrollTop = container.scrollHeight; }
                // extra rAF to handle late layout shifts
                try { requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; }); } catch (e) {}
            } else {
                container.scrollTop = container.scrollHeight;
            }
        });
    } catch (e) { container.scrollTop = container.scrollHeight; }
}

function selectAssistantCategory(cat) {
    const input = document.getElementById('assistantInput');
    if (!input) return;
    if (cat === 'study') input.value = 'Give me study tips for learning topics effectively';
    if (cat === 'time') input.value = 'Help me plan my study schedule and time management tips';
    if (cat === 'math') input.value = 'Show me common math formulas (quadratic, circle area, Pythagoras)';
    if (cat === 'exam') input.value = 'How do I prepare for exams and manage revision?';
}

function handleAssistantQuery() {
    const input = document.getElementById('assistantInput');
    if (!input) return;
    const q = input.value.trim();
    if (!q) { showMessage('Please enter a question for the assistant', true); return; }
    // record user message
    assistantHistory.push({ source: 'user', text: q, ts: new Date().toISOString() });
    saveAssistantHistory();
    renderAssistantHistory();
    input.value = '';

    // compute response (rule-based)
    setTimeout(() => {
        const resp = computeAssistantResponse(q);
        assistantHistory.push({ source: 'assistant', text: resp, ts: new Date().toISOString() });
        saveAssistantHistory();
        renderAssistantHistory();
    }, 200); // small delay for UX
}

function computeAssistantResponse(q) {
    const text = (q || '').toLowerCase();

    // Math formulas
    const mathResp = tryMathFormula(text);
    if (mathResp) return mathResp;

    // Time management
    if (/(time|schedule|plan|timetable|manage time|study schedule)/.test(text)) {
        return `Time Management Tips:\n1. Use Pomodoro (25m study / 5m break).\n2. Prioritize tasks by importance and deadline.\n3. Block deep-focus sessions for difficult topics.\n4. Review notes daily for 15-20 minutes.\n5. Plan weekly goals and track progress.`;
    }

    // Study tips
    if (/(study|learn|memor|tips|technique|revision)/.test(text)) {
        return `Study Tips:\n- Active recall: test yourself frequently.\n- Spaced repetition: revisit material over increasing intervals.\n- Teach it: explain topics to a peer or out loud.\n- Make concise notes and use diagrams.\n- Mix practice problems with reading for mastery.`;
    }

    // Exam prep
    if (/(exam|test|prepare|revision plan)/.test(text)) {
        return `Exam Preparation:\n1. Create a revision timetable splitting topics by weight.\n2. Solve past papers under timed conditions.\n3. Focus on weak areas while maintaining strengths.\n4. Use summary sheets one week before the exam.\n5. Get adequate sleep and light exercise before exam days.`;
    }

    // Fallback: general study guide
    return `I can help with study tips, time management, and common math formulas. Try asking 'study tips for biology', 'plan my study schedule', or 'quadratic formula'.`;
}

function tryMathFormula(text) {
    // Basic formula lookup
    if (/quadratic/.test(text)) return `Quadratic Formula:\nFor ax^2 + bx + c = 0 → x = (-b ± sqrt(b^2 - 4ac)) / (2a)`;
    if (/pythagor|pythagoras/.test(text)) return `Pythagoras Theorem:\nIn a right triangle: a^2 + b^2 = c^2 (c = hypotenuse)`;
    if (/circle|area of circle|area circle/.test(text)) return `Area of a Circle:\nA = π r^2\nCircumference: C = 2 π r`;
    if (/triangle area|area of triangle/.test(text)) return `Area of Triangle:\nA = 1/2 × base × height`;
    if (/perimeter/.test(text)) return `Perimeter depends on shape: e.g., rectangle P = 2(l + w)`;
    if (/slope|line equation|straight line/.test(text)) return `Slope-intercept form:\ny = mx + c (m = slope, c = intercept)`;
    if (/factor|factorization|expand/.test(text)) return `Common factorization:\n(x+a)(x+b) = x^2 + (a+b)x + ab`;
    if (/pythagoras|cose|sine|cosine|tan|trig/.test(text)) return `Trigonometry basics:\nsin(θ)=opp/hyp, cos(θ)=adj/hyp, tan(θ)=opp/adj`;
    return null;
}

// Clear assistant chat history
function clearAssistantHistory() {
    if (!confirm('Clear assistant chat history? This cannot be undone.')) return;
    assistantHistory = [];
    saveAssistantHistory();
    renderAssistantHistory();
    showMessage('Assistant chat cleared');
}

function showMessage(text, isError = false) {
    const messageClass = isError ? 'error-message' : 'success-message';
    const message = document.createElement('div');
    message.className = messageClass;
    message.textContent = text;
    document.body.appendChild(message);
    setTimeout(() => message.remove(), 3000);
}

// ==================== AUTHENTICATION ====================

function switchAuthTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    // mark the corresponding tab button active (avoid relying on global `event`)
    const selector = `.tab-btn[onclick="switchAuthTab('${tab}')"]`;
    const targetBtn = document.querySelector(selector);
    if (targetBtn) targetBtn.classList.add('active');
    if (tab === 'login') {
        document.getElementById('loginForm').classList.add('active');
    } else {
        document.getElementById('signupForm').classList.add('active');
    }
}

function handleSignup() {
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const role = document.getElementById('signupRole').value;
    const classSection = document.getElementById('signupClass').value.trim();

    if (!name || !email || !password || !role) {
        showMessage('Please fill all required fields', true);
        return;
    }

    if (users.find(u => u.email === email)) {
        showMessage('Email already registered', true);
        return;
    }

    const newUser = {
        id: Date.now(),
        name,
        email,
        password: btoa(password), // Simple encoding (not secure for production)
        role,
        class: classSection,
        profilePic: 'https://via.placeholder.com/150',
        skillPoints: 0,
        bio: '',
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveData();
    showMessage('Account created successfully! Please login.');
    
    // Clear form and switch to login
    document.getElementById('signupName').value = '';
    document.getElementById('signupEmail').value = '';
    document.getElementById('signupPassword').value = '';
    document.getElementById('signupRole').value = '';
    document.getElementById('signupClass').value = '';
    
    switchAuthTab('login');
}

function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    const user = users.find(u => u.email === email && u.password === btoa(password));
    
    if (!user) {
        showMessage('Invalid email or password', true);
        return;
    }

    currentUser = user;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    // Switch to dashboard
    document.getElementById('authPage').classList.add('hidden');
    document.getElementById('dashboardPage').classList.remove('hidden');
    
    // Load user data
    loadUserProfile();
    loadFeed();
    initializeCalendar();
    loadTalents();
    loadQuestions();
    updateCreatorProfile();
    loadRoleDashboard();
    loadInbox();
    renderNotifications();
    
    showMessage(`Welcome back, ${user.name}!`);
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    
    // Clear form
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('postInput').value = '';
    
    // Switch to auth page
    document.getElementById('dashboardPage').classList.add('hidden');
    document.getElementById('authPage').classList.remove('hidden');
    
    showMessage('Logged out successfully');
}

// Check if user is logged in on page load
function checkAuthStatus() {
    const stored = localStorage.getItem('currentUser');
    if (stored) {
        currentUser = JSON.parse(stored);
        const userExists = users.find(u => u.id === currentUser.id);
        if (userExists) {
            document.getElementById('authPage').classList.add('hidden');
            document.getElementById('dashboardPage').classList.remove('hidden');
            loadUserProfile();
            loadFeed();
            initializeCalendar();
            loadTalents();
            loadQuestions();
            updateCreatorProfile();
            loadRoleDashboard();
            loadInbox();
            renderNotifications();
        }
    }
}

// ==================== PAGE NAVIGATION ====================

function switchPage(page) {
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    // try to set the clicked nav button active if available (inline handlers may not provide event)
    try {
        if (event && event.target) event.target.classList.add('active');
        else {
            const selector = `.nav-btn[onclick=\"switchPage('${page}')\"]`;
            const btn = document.querySelector(selector);
            if (btn) btn.classList.add('active');
        }
    } catch (e) {}
    
    // Hide all content pages
    document.querySelectorAll('.content-page').forEach(p => p.classList.remove('active'));
    
    // Show selected page
    if (page === 'feed') {
        document.getElementById('feedPage').classList.add('active');
        loadFeed();
    } else if (page === 'calendar') {
        document.getElementById('calendarPage').classList.add('active');
        initializeCalendar();
    } else if (page === 'talent') {
        document.getElementById('talentPage').classList.add('active');
        loadTalents();
    } else if (page === 'helpCenter') {
        document.getElementById('helpCenterPage').classList.add('active');
        loadQuestions();
    } else if (page === 'roleDashboard') {
        document.getElementById('roleDashboardPage').classList.add('active');
        loadRoleDashboard();
    } else if (page === 'resources') {
        document.getElementById('resourcesPage').classList.add('active');
        loadResources();
    } else if (page === 'messages') {
        document.getElementById('messagesPage').classList.add('active');
        loadInbox();
    } else if (page === 'profile') {
        document.getElementById('profilePage').classList.add('active');
        loadUserProfile();
    } else if (page === 'assistant') {
        // Show the Study Assistant page
        document.getElementById('assistantPage').classList.add('active');
        try { renderAssistantHistory(); } catch (e) {}
        try { const input = document.getElementById('assistantInput'); if (input) input.focus(); } catch (e) {}
    } else if (page === 'bazaar') {
        document.getElementById('bazaarPage').classList.add('active');
        loadBazaar();
    }
}

// ==================== FEED FUNCTIONALITY ====================

function updateCreatorProfile() {
    if (currentUser) {
        const img = document.getElementById('creatorProfileImg');
        img.src = currentUser.profilePic;
    }
}

function createPost() {
    const text = document.getElementById('postInput').value.trim();
    const category = document.getElementById('postCategory').value;
    const imageInput = document.getElementById('postImage');

    if (!text) {
        showMessage('Please write something', true);
        return;
    }

    if (!category) {
        showMessage('Please select a category', true);
        return;
    }

    let imageData = null;
    if (imageInput.files.length > 0) {
        const reader = new FileReader();
        reader.onload = (e) => {
            imageData = e.target.result;
            savePost(text, category, imageData);
        };
        reader.readAsDataURL(imageInput.files[0]);
    } else {
        savePost(text, category, null);
    }
}

function savePost(text, category, imageData) {
    const post = {
        id: Date.now(),
        userId: currentUser.id,
        userName: currentUser.name,
        userProfilePic: currentUser.profilePic,
        userRole: currentUser.role,
        text,
        category,
        image: imageData,
        likes: 0,
        comments: [],
        createdAt: new Date().toISOString()
    };

    posts.unshift(post);
    saveData();
    
    // Clear form
    document.getElementById('postInput').value = '';
    document.getElementById('postCategory').value = '';
    document.getElementById('postImage').value = '';
    
    showMessage('Post created successfully!');
    loadFeed();
    try { addNotification('post', 'New post', `${currentUser.name} posted in ${category}`); } catch (e) {}
}

function loadFeed() {
    const feedContainer = document.getElementById('feedContainer');
    feedContainer.innerHTML = '';

    if (posts.length === 0) {
        feedContainer.innerHTML = '<div class="empty-state"><p>No posts yet. Be the first to share!</p></div>';
        return;
    }

    posts.forEach(post => {
        const postCard = document.createElement('div');
        postCard.className = 'post-card';
        
        const timeAgo = getTimeAgo(new Date(post.createdAt));
        
        postCard.innerHTML = `
            <div class="post-header">
                <img src="${post.userProfilePic}" alt="Profile" class="profile-img-small">
                <div class="post-author-info">
                    <h4>${post.userName}</h4>
                    <div class="post-meta">${timeAgo} • ${post.userRole}</div>
                </div>
            </div>
            <span class="post-category">#${post.category}</span>
            <div class="post-content">${escapeHtml(post.text)}</div>
            ${post.image ? `<img src="${post.image}" alt="Post" class="post-image">` : ''}
            <div class="post-actions">
                <button class="post-action-btn" onclick="likePost(${post.id})">👍 Like</button>
                <button class="post-action-btn">💬 Comment</button>
                <button class="post-action-btn">⤴️ Share</button>
            </div>
        `;
        
        feedContainer.appendChild(postCard);
    });
}

function likePost(postId) {
    const post = posts.find(p => p.id === postId);
    if (post) {
        post.likes++;
        saveData();
        loadFeed();
    }
}

// ==================== CALENDAR FUNCTIONALITY ====================

function initializeCalendar() {
    if (currentUser.role === 'teacher') {
        document.getElementById('eventCreator').classList.remove('hidden');
    }
    
    renderCalendar();
    displayEvents();
}

function renderCalendar() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    // Update month/year display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('monthYear').textContent = `${monthNames[month]} ${year}`;
    
    const calendarGrid = document.getElementById('calendarGrid');
    calendarGrid.innerHTML = '';
    
    // Get first day and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    // Previous month's days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const dayEl = createDayElement(day, true);
        calendarGrid.appendChild(dayEl);
    }
    
    // Current month's days
    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = createDayElement(day, false, new Date(year, month, day));
        calendarGrid.appendChild(dayEl);
    }
    
    // Next month's days
    const totalCells = calendarGrid.children.length;
    const remainingCells = 42 - totalCells; // 6 weeks * 7 days
    for (let day = 1; day <= remainingCells; day++) {
        const dayEl = createDayElement(day, true);
        calendarGrid.appendChild(dayEl);
    }
}

function createDayElement(day, isOtherMonth = false, date = null) {
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';
    
    if (isOtherMonth) {
        dayEl.classList.add('other-month');
        dayEl.textContent = day;
    } else {
        const dayEvents = events.filter(e => {
            const eventDate = new Date(e.date);
            return eventDate.getDate() === day &&
                   eventDate.getMonth() === currentMonth.getMonth() &&
                   eventDate.getFullYear() === currentMonth.getFullYear();
        });
        
        if (dayEvents.length > 0) {
            dayEl.classList.add('has-event');
            dayEl.classList.add(dayEvents[0].type.toLowerCase());
        }
        
        dayEl.innerHTML = `<span>${day}</span>`;
        
        if (dayEvents.length > 0) {
            const dot = document.createElement('div');
            dot.className = `event-dot ${dayEvents[0].type.toLowerCase()}`;
            dayEl.appendChild(dot);
        }
        
        dayEl.onclick = () => showDayEvents(date);
    }
    
    return dayEl;
}

function previousMonth() {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    renderCalendar();
}

function addEvent() {
    if (currentUser.role !== 'teacher') {
        showMessage('Only teachers can add events', true);
        return;
    }
    
    const date = document.getElementById('eventDate').value;
    const title = document.getElementById('eventTitle').value.trim();
    const description = document.getElementById('eventDescription').value.trim();
    const type = document.getElementById('eventType').value;
    
    if (!date || !title || !description || !type) {
        showMessage('Please fill all fields', true);
        return;
    }
    
    const event = {
        id: Date.now(),
        date,
        title,
        description,
        type,
        createdBy: currentUser.id
    };
    
    events.push(event);
    saveData();
    
    // Clear form
    document.getElementById('eventDate').value = '';
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventDescription').value = '';
    document.getElementById('eventType').value = '';
    
    showMessage('Event added successfully!');
    initializeCalendar();
    try { addNotification('event', 'New event', `${currentUser.name} added: ${title}`); } catch (e) {}
}

// ==================== SILENT ALERT SYSTEM ====================

function addAssessment(studentId, subject, chapter, score) {
    if (!studentId || typeof score !== 'number') return { ok: false, message: 'Invalid assessment' };
    const a = { id: Date.now(), studentId, subject: subject||'General', chapter: chapter||'Unknown', score, ts: new Date().toISOString() };
    assessments.unshift(a);
    saveData();
    saveAlertsAndAssessments();
    // analyze for risk
    analyzeStudentPerformance(studentId);
    return { ok: true, assessment: a };
}

// ==================== BAZAAR / SKILL-SWAP ====================
function setBazaarType(type){
    bazaarType = type;
    // highlight buttons
    document.getElementById('bazaarTeachingBtn')?.classList.toggle('active', type === 'Offering');
    document.getElementById('bazaarLearningBtn')?.classList.toggle('active', type === 'Requesting');
    renderBazaarPosts();
}

function loadBazaar(){
    // ensure buttons reflect current state
    setBazaarType(bazaarType);
    renderBazaarPosts();
}

function renderBazaarPosts(){
    const container = document.getElementById('bazaarList');
    if(!container) return;
    container.innerHTML = '';

    // filter by type
    let list = skillPosts.filter(s => s.type === bazaarType);

    // populate user info and sort by user.skillPoints desc
    list = list.map(p => {
        const user = users.find(u => u.id === p.userId) || { name: 'Unknown', skillPoints: 0 };
        return { ...p, user };
    }).sort((a,b) => (b.user.skillPoints || 0) - (a.user.skillPoints || 0));

    if(list.length === 0){
        container.innerHTML = '<div class="empty-state">No entries yet in the Bazaar.</div>';
        return;
    }

    const topUserId = list[0]?.user?.id;

    list.forEach(p => {
        const card = document.createElement('div');
        const categoryClass = p.category === 'Creative' ? 'category-creative' : (p.category === 'Academic' ? 'category-academic' : 'category-tech');
        card.className = `bazaar-card ${categoryClass} ${p.user.id === topUserId ? 'top-tutor' : ''}`;
        card.innerHTML = `
            <div class="header">
                <div>
                    <div style="display:flex; align-items:center; gap:8px;"><strong>${escapeHtml(p.user.name)}</strong> ${p.user.id === topUserId ? '<span class="trophy">🏆</span>' : ''}</div>
                    <div class="small-muted">${escapeHtml(p.skillName)} • ${escapeHtml(p.category)}</div>
                </div>
                <div class="badge-points">${p.user.skillPoints || 0} pts</div>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:10px; align-items:center;">
                <div class="small-muted">${p.type}</div>
                <div><button class="btn-small" onclick="openBazaarRequestModal(${p.id})">Request Help</button></div>
            </div>
        `;
        container.appendChild(card);
    });
}

function openBazaarRequestModal(postId){
    const post = skillPosts.find(p => p.id === postId);
    if(!post){ showMessage('Post not found', true); return; }
    // create modal
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'bazaarModalOverlay';
    overlay.innerHTML = `
        <div class="modal">
            <h3>Request help for ${escapeHtml(post.skillName)}</h3>
            <p class="small-muted">To: ${escapeHtml((users.find(u=>u.id===post.userId)||{}).name || 'Tutor')}</p>
            <textarea id="bazaarRequestMessage">Hi, I'd like some help with this skill.</textarea>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
                <button onclick="closeBazaarModal()" class="btn-small">Cancel</button>
                <button onclick="sendBazaarRequest(${postId})" class="btn-primary-small">Send Request</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function closeBazaarModal(){
    const el = document.getElementById('bazaarModalOverlay');
    if(el) el.remove();
}

function sendBazaarRequest(postId){
    const textarea = document.getElementById('bazaarRequestMessage');
    const msg = textarea ? textarea.value.trim() : '';
    const post = skillPosts.find(p => p.id === postId);
    if(!post){ showMessage('Post not found', true); return; }
    if(!currentUser){ showMessage('Please login to request help', true); return; }

    // Try server endpoint first (if enabled), otherwise fallback to local
    if (ENABLE_BAZAAR_API) {
        fetch(`${BAZAAR_API}/request/${postId}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, fromName: currentUser.name })
        }).then(r=>r.json()).then(data=>{
            if (data && data.success) {
                addNotification('bazaar', 'Help request sent', `${currentUser.name} requested help from ${data.to?.name || 'Tutor'}`);
                showMessage('Request sent!');
            } else {
                showMessage('Request queued locally (server error)', true);
            }
        }).catch(err=>{
            console.error('Request error', err);
            showMessage('Unable to contact Bazaar server — saved locally', true);
            const m = { id: Date.now(), fromId: currentUser.id, toId: post.userId, text: msg, ts: new Date().toISOString() };
            messages.unshift(m);
            saveData();
        }).finally(()=> closeBazaarModal());
    } else {
        const m = { id: Date.now(), fromId: currentUser.id, toId: post.userId, text: msg, ts: new Date().toISOString() };
        messages.unshift(m);
        saveData();
        addNotification('bazaar', 'Help request sent', `${currentUser.name} requested help from ${(users.find(u=>u.id===post.userId)||{}).name}`);
        showMessage('Request sent!');
        closeBazaarModal();
    }
}

// completeSwap: add 10 skillPoints to tutor
function completeSwap(tutorId){
    const tutor = users.find(u => u.id === tutorId);
    if(!tutor) return { success: false, error: 'Tutor not found' };

    if (ENABLE_BAZAAR_API && tutor.mongoId) {
        // if the local user has a `mongoId` mapped, call server endpoint
        fetch(`${BAZAAR_API}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tutorId: tutor.mongoId }) })
            .then(r=>r.json()).then(data=>{
                if (data && data.success) {
                    showMessage('Swap completed; tutor awarded +10 points');
                    // Try to sync local tutor points if returned
                    if (data.tutor && data.tutor.skillPoints != null) {
                        tutor.skillPoints = data.tutor.skillPoints;
                        saveData();
                        renderBazaarPosts();
                    }
                } else showMessage('Server failed to complete swap', true);
            }).catch(err=>{
                console.error(err);
                showMessage('Server unreachable; applied locally', true);
                tutor.skillPoints = (tutor.skillPoints || 0) + 10; saveData(); renderBazaarPosts();
            });
        return { success: true };
    }

    tutor.skillPoints = (tutor.skillPoints || 0) + 10;
    saveData();
    renderBazaarPosts();
    return { success: true, tutor };
}

// Open modal to create a new skill post
function openCreateSkillModal(){
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'createSkillModal';
    overlay.innerHTML = `
        <div class="modal">
            <h3>Create Skill Post</h3>
            <input id="newSkillName" placeholder="Skill name (e.g., 'Intro to Python')" />
            <select id="newSkillCategory">
                <option value="Academic">Academic</option>
                <option value="Creative">Creative</option>
                <option value="Tech">Tech</option>
            </select>
            <select id="newSkillType">
                <option value="Offering">Offering</option>
                <option value="Requesting">Requesting</option>
            </select>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
                <button onclick="closeCreateSkillModal()" class="btn-small">Cancel</button>
                <button onclick="createSkillPost()" class="btn-primary-small">Create</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function closeCreateSkillModal(){
    const el = document.getElementById('createSkillModal'); if(el) el.remove();
}

function createSkillPost(){
    const name = document.getElementById('newSkillName')?.value.trim();
    const category = document.getElementById('newSkillCategory')?.value;
    const type = document.getElementById('newSkillType')?.value;
    if (!name || !category || !type) { showMessage('Please fill all fields', true); return; }
    if (!currentUser) { showMessage('Login first to create a post', true); return; }

    const localPost = { id: Date.now(), skillName: name, category, type, userId: currentUser.id, createdAt: new Date().toISOString() };

    if (ENABLE_BAZAAR_API && currentUser.mongoId) {
        // try server create
        fetch(`${BAZAAR_API}/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skillName: name, category, type, userId: currentUser.mongoId }) })
            .then(r=>r.json()).then(data=>{
                if (data && data.success && data.data) {
                    showMessage('Post created on server');
                    // we won't attempt to sync server posts to localStorage here; reload will prefer server
                    closeCreateSkillModal(); loadBazaar();
                } else {
                    showMessage('Server refused create; saved locally', true);
                    skillPosts.unshift(localPost); saveData(); closeCreateSkillModal(); renderBazaarPosts();
                }
            }).catch(err=>{
                console.error(err);
                showMessage('Server unreachable; saved locally', true);
                skillPosts.unshift(localPost); saveData(); closeCreateSkillModal(); renderBazaarPosts();
            });
    } else {
        skillPosts.unshift(localPost); saveData(); closeCreateSkillModal(); renderBazaarPosts();
    }
}

// Seed demo data locally (users and skillPosts) for quick testing
function seedLocalBazaar(){
    // create demo users if not present
    const demoUsers = [
        { id: 1001, name: 'Alice Demo', email: 'alice@demo.com', skillPoints: 120, profilePic: 'https://via.placeholder.com/100' },
        { id: 1002, name: 'Brian Demo', email: 'brian@demo.com', skillPoints: 95, profilePic: 'https://via.placeholder.com/100' },
        { id: 1003, name: 'Carla Demo', email: 'carla@demo.com', skillPoints: 60, profilePic: 'https://via.placeholder.com/100' }
    ];
    demoUsers.forEach(d => { if (!users.find(u=>u.id===d.id)) users.push(d); });
    skillPosts = [
        { id: Date.now()+1, skillName: 'Calculus Tutoring', category: 'Academic', type: 'Offering', userId: 1001 },
        { id: Date.now()+2, skillName: 'Guitar Basics', category: 'Creative', type: 'Offering', userId: 1002 },
        { id: Date.now()+3, skillName: 'Intro to Python', category: 'Tech', type: 'Offering', userId: 1003 }
    ];
    saveData();
    showMessage('Demo Bazaar seeded');
    renderBazaarPosts();
}

function analyzeStudentPerformance(studentId) {
    try {
        const studentAssess = assessments.filter(a => a.studentId === studentId).sort((x,y)=> new Date(x.ts)-new Date(y.ts));
        if (studentAssess.length < 2) return;

        // Check for two or more consecutive declines (last three scores descending)
        const scores = studentAssess.map(a=>a.score);
        const last = scores.slice(-3);
        if (last.length >= 3 && last[0] > last[1] && last[1] > last[2]) {
            const message = 'Recent consecutive assessment declines detected. Consider targeted revision.';
            const teachers = getAssignedTeachersForStudent(studentId);
            generateSilentAlert(studentId, teachers, message, { type: 'consecutive_decline', scores: last });
            return;
        }

        // Check for weak chapters: chapters with avg score < 50
        const chapterMap = {};
        studentAssess.forEach(a=>{
            const key = `${a.subject}::${a.chapter}`;
            chapterMap[key] = chapterMap[key] || { total:0, count:0, subject:a.subject, chapter:a.chapter };
            chapterMap[key].total += a.score; chapterMap[key].count += 1;
        });
        const weakChapters = Object.values(chapterMap).filter(c => (c.total/c.count) < 50).slice(0,10);
        if (weakChapters.length >= 3) {
            const chapList = weakChapters.map(c=>`${c.subject} - ${c.chapter}`);
            const message = `Multiple weak chapters identified: ${chapList.join(', ')}. Recommend focused practice.`;
            const teachers = getAssignedTeachersForStudent(studentId);
            generateSilentAlert(studentId, teachers, message, { type: 'weak_chapters', chapters: chapList });
            return;
        }

        // Sharp drop: compare average of previous 5 to last score
        if (studentAssess.length >= 6) {
            const lastScore = scores[scores.length-1];
            const prevFive = scores.slice(-6, -1);
            const avgPrev = prevFive.reduce((s,x)=>s+x,0)/prevFive.length;
            if ((avgPrev - lastScore) >= 20) {
                const message = `Sharp performance drop detected (Δ ${Math.round(avgPrev - lastScore)}). Consider review session.`;
                const teachers = getAssignedTeachersForStudent(studentId);
                generateSilentAlert(studentId, teachers, message, { type: 'sharp_drop', delta: Math.round(avgPrev - lastScore) });
                return;
            }
        }
    } catch (e) { console.error('analyzeStudentPerformance error', e); }
}

function getAssignedTeachersForStudent(studentId) {
    const student = users.find(u=>u.id===studentId) || {};
    // Simple mapping: teachers who share the same class
    const teachers = users.filter(u=>u.role==='teacher' && u.class && student.class && u.class === student.class).map(t=>t.id);
    // Fallback to all teachers if none matched
    if (teachers.length === 0) teachers.push(...users.filter(u=>u.role==='teacher').map(t=>t.id));
    return teachers;
}

function generateSilentAlert(studentId, teacherIds, message, meta = {}) {
    const alert = { id: Date.now(), studentId, teacherIds: Array.isArray(teacherIds)?teacherIds:[], message, meta, ts: new Date().toISOString(), acknowledged: { student:false, teachers: {} } };
    silentAlerts.unshift(alert);
    saveData(); saveAlertsAndAssessments();
    // non-public notification: add internal notification for teachers (not shown publicly)
    try { teacherIds.forEach(tid=> addNotification('silent_alert', 'Student insight', `Private alert for ${users.find(u=>u.id===studentId)?.name || 'Student'}`)); } catch(e){}
}

function loadSilentAlertsForUser(user) {
    if (!user) return [];
    if (user.role === 'student') return silentAlerts.filter(a=>a.studentId === user.id);
    if (user.role === 'teacher') return silentAlerts.filter(a=> a.teacherIds && a.teacherIds.includes(user.id));
    if (user.role === 'principal' || user.role === 'admin') return silentAlerts.slice(0,50);
    return [];
}

function renderSilentAlertsForCurrentUser() {
    try {
        if (!currentUser) return;
        const alerts = loadSilentAlertsForUser(currentUser);
        // student: render in profile area
        if (currentUser.role === 'student') {
            const container = document.getElementById('silentAlertsStudent');
            if (!container) return;
            container.innerHTML = '';
            if (alerts.length === 0) { container.innerHTML = '<div class="empty-state">No private guidance at this time.</div>'; return; }
            alerts.forEach(a=>{
                const el = document.createElement('div'); el.className = 'silent-alert';
                el.innerHTML = `<div class="sa-top"><span class="sa-icon">📌</span><div class="sa-time">${getTimeAgo(new Date(a.ts))}</div></div><div class="sa-msg">${escapeHtml(a.message)}</div>`;
                container.appendChild(el);
            });
            return;
        }
        // teacher: render in role dashboard area
        if (currentUser.role === 'teacher') {
            const container = document.getElementById('teacherAlertsList');
            if (!container) return;
            container.innerHTML = '';
            if (alerts.length === 0) { container.innerHTML = '<div class="empty-state">No alerts for your students.</div>'; return; }
            alerts.forEach(a=>{
                const st = users.find(u=>u.id===a.studentId) || { name: 'Student' };
                const el = document.createElement('div'); el.className = 'silent-alert teacher-view';
                el.innerHTML = `<div class="sa-header"><span class="sa-icon">📌</span><strong>${escapeHtml(st.name)}</strong> • <span class="sa-time">${getTimeAgo(new Date(a.ts))}</span></div>
                    <div class="sa-msg">${escapeHtml(a.message)}</div>
                    <div class="sa-actions"><button class="btn-small" onclick="acknowledgeAlert(${a.id}, 'teacher', ${currentUser.id})">Acknowledge</button></div>`;
                container.appendChild(el);
            });
            return;
        }
    } catch (e) { console.error('renderSilentAlertsForCurrentUser error', e); }
}

function acknowledgeAlert(alertId, role, userId) {
    const aidx = silentAlerts.findIndex(x=>x.id===alertId);
    if (aidx === -1) return;
    if (role === 'student') silentAlerts[aidx].acknowledged.student = true;
    if (role === 'teacher') silentAlerts[aidx].acknowledged.teachers = silentAlerts[aidx].acknowledged.teachers || {}; silentAlerts[aidx].acknowledged.teachers[userId] = true;
    saveData(); saveAlertsAndAssessments();
    renderSilentAlertsForCurrentUser();
}

// Persistent drawer/toggle for silent alerts (bottom-left pin)
function toggleSilentAlertDrawer() {
    const drawer = document.getElementById('silentAlertDrawer');
    if (!drawer) return;
    if (drawer.classList.contains('hidden')) openSilentAlertDrawer(); else closeSilentAlertDrawer();
}

function openSilentAlertDrawer() {
    if (!currentUser) { showMessage('Please login to view private guidance', true); return; }
    const drawer = document.getElementById('silentAlertDrawer');
    const list = document.getElementById('silentAlertDrawerList');
    if (!drawer || !list) return;
    // populate drawer with same logic as renderSilentAlertsForCurrentUser but into drawer list
    list.innerHTML = '';
    const alerts = loadSilentAlertsForUser(currentUser);
    if (!alerts || alerts.length === 0) { list.innerHTML = '<div class="empty-state">No private guidance at this time.</div>'; }
    else {
        alerts.forEach(a => {
            const st = users.find(u=>u.id===a.studentId) || { name: 'Student' };
            const el = document.createElement('div'); el.className = 'silent-alert';
            if (currentUser.role === 'teacher') {
                el.innerHTML = `<div class="sa-header"><span class="sa-icon">📌</span><strong>${escapeHtml(st.name)}</strong> • <span class="sa-time">${getTimeAgo(new Date(a.ts))}</span></div><div class="sa-msg">${escapeHtml(a.message)}</div><div class="sa-actions"><button class="btn-small" onclick="acknowledgeAlert(${a.id}, 'teacher', ${currentUser.id})">Acknowledge</button></div>`;
            } else {
                el.innerHTML = `<div class="sa-top"><span class="sa-icon">📌</span><div class="sa-time">${getTimeAgo(new Date(a.ts))}</div></div><div class="sa-msg">${escapeHtml(a.message)}</div>`;
            }
            list.appendChild(el);
        });
    }
    drawer.classList.remove('hidden');
    drawer.setAttribute('aria-hidden','false');
}

function closeSilentAlertDrawer() {
    const drawer = document.getElementById('silentAlertDrawer');
    if (!drawer) return;
    drawer.classList.add('hidden');
    drawer.setAttribute('aria-hidden','true');
}

function displayEvents() {
    const eventsList = document.getElementById('eventsList');
    eventsList.innerHTML = '';
    
    const sortedEvents = [...events].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    if (sortedEvents.length === 0) {
        eventsList.innerHTML = '<p class="empty-state">No events scheduled</p>';
        return;
    }
    
    sortedEvents.forEach(event => {
        const eventDate = new Date(event.date);
        const dateStr = eventDate.toLocaleDateString('en-US', { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
        
        const eventCard = document.createElement('div');
        eventCard.className = `event-card ${event.type.toLowerCase()}`;
        eventCard.innerHTML = `
            <div class="event-date">${dateStr}</div>
            <div class="event-title">${escapeHtml(event.title)}</div>
            <div class="event-desc">${escapeHtml(event.description)}</div>
        `;
        
        eventsList.appendChild(eventCard);
    });
}

function showDayEvents(date) {
    if (!date) return;
    
    const dayEvents = events.filter(e => {
        const eventDate = new Date(e.date);
        return eventDate.getDate() === date.getDate() &&
               eventDate.getMonth() === date.getMonth() &&
               eventDate.getFullYear() === date.getFullYear();
    });
    
    if (dayEvents.length === 0) {
        showMessage('No events on this day');
    } else {
        showMessage(`${dayEvents.length} event(s) on this day`);
    }
}

// ==================== TALENT SHOWCASE ====================

function uploadTalent() {
    const title = document.getElementById('talentTitle').value.trim();
    const description = document.getElementById('talentDescription').value.trim();
    const category = document.getElementById('talentCategory').value;
    const fileInput = document.getElementById('talentFile');
    
    if (!title || !description || !category || fileInput.files.length === 0) {
        showMessage('Please fill all fields and select a file', true);
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const talent = {
            id: Date.now(),
            userId: currentUser.id,
            userName: currentUser.name,
            userProfilePic: currentUser.profilePic,
            title,
            description,
            category,
            media: e.target.result,
            likes: 0,
            comments: [],
            createdAt: new Date().toISOString()
        };
        
        talents.push(talent);
        saveData();
        
        // Clear form
        document.getElementById('talentTitle').value = '';
        document.getElementById('talentDescription').value = '';
        document.getElementById('talentCategory').value = '';
        document.getElementById('talentFile').value = '';
        
        showMessage('Talent uploaded successfully!');
        loadTalents();
        try { addNotification('upload', 'New upload', `${currentUser.name} uploaded talent: ${title}`); } catch (e) {}
    };
    
    reader.readAsDataURL(fileInput.files[0]);
}

function loadTalents() {
    const talentsContainer = document.getElementById('talentsContainer');
    talentsContainer.innerHTML = '';
    
    if (talents.length === 0) {
        talentsContainer.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;"><p>No talents shared yet. Be the first!</p></div>';
        return;
    }
    
    talents.forEach(talent => {
        const talentCard = document.createElement('div');
        talentCard.className = 'talent-card';
        
        talentCard.innerHTML = `
            <img src="${talent.media}" alt="Talent" class="talent-media">
            <div class="talent-info">
                <h4>${escapeHtml(talent.title)}</h4>
                <p style="font-size: 12px; color: #999;">by ${talent.userName}</p>
                <div class="talent-category">${talent.category}</div>
                <p class="talent-desc">${escapeHtml(talent.description)}</p>
                <div class="talent-actions">
                    <button class="talent-action-btn" onclick="likeTalent(${talent.id})">👍 ${talent.likes}</button>
                    <button class="talent-action-btn">💬 Comment</button>
                </div>
            </div>
        `;
        
        talentsContainer.appendChild(talentCard);
    });
}

function likeTalent(talentId) {
    const talent = talents.find(t => t.id === talentId);
    if (talent) {
        talent.likes++;
        saveData();
        loadTalents();
    }
}

// ==================== HELP CENTER ====================

function postQuestion() {
    const title = document.getElementById('questionTitle').value.trim();
    const description = document.getElementById('questionDescription').value.trim();
    const category = document.getElementById('questionCategory').value;
    
    if (!title || !description || !category) {
        showMessage('Please fill all fields', true);
        return;
    }
    
    const question = {
        id: Date.now(),
        userId: currentUser.id,
        userName: currentUser.name,
        userProfilePic: currentUser.profilePic,
        userRole: currentUser.role,
        title,
        description,
        category,
        answers: [],
        createdAt: new Date().toISOString()
    };
    
    questions.unshift(question);
    saveData();
    
    // Clear form
    document.getElementById('questionTitle').value = '';
    document.getElementById('questionDescription').value = '';
    document.getElementById('questionCategory').value = '';
    
    showMessage('Question posted successfully!');
    loadQuestions();
    try { addNotification('question', 'New question', `${currentUser.name} asked: ${title}`); } catch (e) {}
}

function postAnswer(questionId) {
    const answerInput = document.querySelector(`#answerInput-${questionId}`);
    const answerText = answerInput.value.trim();
    
    if (!answerText) {
        showMessage('Please write an answer', true);
        return;
    }
    
    const question = questions.find(q => q.id === questionId);
    if (question) {
        const answer = {
            id: Date.now(),
            userId: currentUser.id,
            userName: currentUser.name,
            userRole: currentUser.role,
            text: answerText,
            createdAt: new Date().toISOString()
        };
        
        question.answers.push(answer);
        saveData();
        answerInput.value = '';
        loadQuestions();
        showMessage('Answer posted successfully!');
    }
}

function loadQuestions() {
    const questionsContainer = document.getElementById('questionsContainer');
    questionsContainer.innerHTML = '';
    
    if (questions.length === 0) {
        questionsContainer.innerHTML = '<div class="empty-state"><p>No questions yet. Ask something!</p></div>';
        return;
    }
    
    questions.forEach(question => {
        const questionCard = document.createElement('div');
        questionCard.className = 'question-card';
        
        const timeAgo = getTimeAgo(new Date(question.createdAt));
        
        let answersHtml = '';
        if (question.answers.length > 0) {
            answersHtml = '<div class="answers-container"><h5>Answers:</h5>';
            question.answers.forEach(answer => {
                const answerTime = getTimeAgo(new Date(answer.createdAt));
                answersHtml += `
                    <div class="answer-item">
                        <div class="answer-author">${answer.userName} (${answer.userRole})</div>
                        <div class="answer-text">${escapeHtml(answer.text)}</div>
                        <div class="answer-time">${answerTime}</div>
                    </div>
                `;
            });
            answersHtml += '</div>';
        }
        
        questionCard.innerHTML = `
            <div class="question-header">
                <div>
                    <div class="question-title">${escapeHtml(question.title)}</div>
                    <div class="question-meta">by ${question.userName} • ${timeAgo}</div>
                    <span class="question-category">${question.category}</span>
                </div>
            </div>
            <div class="question-desc">${escapeHtml(question.description)}</div>
            ${answersHtml}
            <div class="answer-form">
                <input type="text" id="answerInput-${question.id}" placeholder="Write an answer...">
                <button onclick="postAnswer(${question.id})">Answer</button>
            </div>
        `;
        
        questionsContainer.appendChild(questionCard);
    });
}

// ==================== PROFILE MANAGEMENT ====================

function changeProfilePicture() {
    document.getElementById('profilePictureInput').click();
}

function loadUserProfile() {
    if (!currentUser) return;
    
    const profilePic = document.getElementById('profilePicture');
    const creatorImg = document.getElementById('creatorProfileImg');
    
    profilePic.src = currentUser.profilePic;
    creatorImg.src = currentUser.profilePic;
    
    document.getElementById('profileName').textContent = currentUser.name;
    document.getElementById('profileRole').textContent = `Role: ${currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)}`;
    document.getElementById('profileClass').textContent = `Class/Section: ${currentUser.class || 'Not set'}`;
    
    // Pre-fill edit form
    document.getElementById('editName').value = currentUser.name;
    document.getElementById('editClass').value = currentUser.class || '';
    document.getElementById('editBio').value = currentUser.bio || '';
    
    // Update stats
    const userPosts = posts.filter(p => p.userId === currentUser.id).length;
    const userTalents = talents.filter(t => t.userId === currentUser.id).length;
    const userQuestions = questions.filter(q => q.userId === currentUser.id).length;
    
    document.getElementById('postCount').textContent = userPosts;
    document.getElementById('talentCount').textContent = userTalents;
    document.getElementById('questionCount').textContent = userQuestions;
    
    // Handle profile picture change
    document.getElementById('profilePictureInput').onchange = (e) => {
        if (e.target.files.length > 0) {
            const reader = new FileReader();
            reader.onload = (event) => {
                currentUser.profilePic = event.target.result;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                saveData();
                profilePic.src = currentUser.profilePic;
                creatorImg.src = currentUser.profilePic;
                updateCreatorProfile();
                loadFeed();
                showMessage('Profile picture updated!');
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };
}

        // Render any private silent alerts for this student
        try { renderSilentAlertsForCurrentUser(); } catch (e) {}

function saveProfile() {
    const name = document.getElementById('editName').value.trim();
    const classSection = document.getElementById('editClass').value.trim();
    const bio = document.getElementById('editBio').value.trim();
    
    if (!name) {
        showMessage('Name cannot be empty', true);
        return;
    }
    
    currentUser.name = name;
    currentUser.class = classSection;
    currentUser.bio = bio;
    
    // Update in users array
    const userIndex = users.findIndex(u => u.id === currentUser.id);
    if (userIndex !== -1) {
        users[userIndex] = currentUser;
    }
    
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    saveData();
    
    // Update all posts with new name
    posts.forEach(post => {
        if (post.userId === currentUser.id) {
            post.userName = currentUser.name;
            post.userProfilePic = currentUser.profilePic;
        }
    });
    
    // Update all talents with new name
    talents.forEach(talent => {
        if (talent.userId === currentUser.id) {
            talent.userName = currentUser.name;
            talent.userProfilePic = currentUser.profilePic;
        }
    });
    
    saveData();
    loadUserProfile();
    loadFeed();
    loadTalents();
    
    showMessage('Profile updated successfully!');
}

// ==================== UTILITY FUNCTIONS ====================

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Theme toggle: apply saved theme & update icon/state
function updateThemeIcon() {
    const btn = document.getElementById('themeToggle');
    const state = document.getElementById('themeState');
    if (!btn || !state) return;
    const isDark = document.body.classList.contains('dark-theme');
    btn.textContent = isDark ? '🌙' : '☀️';
    btn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    state.textContent = isDark ? 'Dark' : 'Light';
    if (isDark) btn.classList.add('on'); else btn.classList.remove('on');
}

function toggleTheme() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const isDark = document.body.classList.toggle('dark-theme');
    try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch (e) {}
    updateThemeIcon();
    btn.classList.add('animate');
    setTimeout(() => btn.classList.remove('animate'), 650);
}

function initThemeOnLoad() {
    try {
        const saved = localStorage.getItem('theme');
        if (saved === 'dark') document.body.classList.add('dark-theme');
        else if (saved === 'light') document.body.classList.remove('dark-theme');
        else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-theme');
        }
    } catch (e) { }
    updateThemeIcon();
}

// ==================== ROLE DASHBOARD & MESSAGING EXTENSIONS ====================

function sendMessageFromUI() {
    if (!currentUser) { showMessage('Please login to send messages', true); return; }
    if (isUserMessagingLocked(currentUser.id)) { showMessage('Your messaging is currently locked. Contact admin.', true); return; }
    const name = document.getElementById('msgReceiverName').value.trim();
    const classVal = document.getElementById('msgClass').value.trim();
    const roll = document.getElementById('msgRoll').value.trim();
    const text = document.getElementById('msgText').value.trim();
    if (!name || !text) { showMessage('Receiver name and message required', true); return; }

    const recipient = findRecipientByDetails(name, classVal, roll);
    if (!recipient) { showMessage('Recipient not found', true); return; }

    // Permission checks
    const allowed = (() => {
        if (currentUser.role === 'principal') return true;
        if (currentUser.role === 'teacher') return ['student','parent','principal'].includes(recipient.role) || recipient.role === 'teacher';
        if (currentUser.role === 'student') return ['teacher','student'].includes(recipient.role);
        if (currentUser.role === 'parent') return ['teacher','principal'].includes(recipient.role);
        return false;
    })();

    if (!allowed) { showMessage('You are not allowed to message this user', true); return; }

    sendMessage(currentUser.id, recipient.id, text, { receiverName: recipient.name, class: recipient.class, roll: recipient.roll || '' });
    document.getElementById('msgText').value = '';
    showMessage('Message sent');
    try { addNotification('message', 'Message sent', `${currentUser.name} → ${recipient.name}`); } catch (e) {}
    loadInbox();
}

function sendMessage(senderId, receiverId, text, meta = {}) {
    // Prevent messaging if user is locked
    if (isUserMessagingLocked(senderId)) { showMessage('Your messaging is currently locked. Contact admin.', true); return; }

    // Character limit
    if (text && text.length > 800) { showMessage('Message too long (max 800 characters)', true); return; }

    // Sanitize / detect profanity
    const check = sanitizeMessageText(text);
    if (check.hadProfanity) {
        recordDisciplinary(senderId, check.profaneWords);
        return; // block sending
    }

    const msg = {
        id: Date.now(),
        senderId,
        receiverId,
        text: check.cleanText,
        meta,
        createdAt: new Date().toISOString(),
        read: false
    };
    messages.unshift(msg);
    saveData();
}

// ==================== STUDENT REGISTRY (ADDITIVE) ====================

function saveStudentRegistry() {
    localStorage.setItem('studentRegistry', JSON.stringify(studentRegistry));
}

function saveStudentTodos() {
    localStorage.setItem('studentTodos', JSON.stringify(studentTodos));
}


function addTodoForCurrentStudent(text) {
    if (!currentUser || currentUser.role !== 'student') return { ok: false, message: 'Only students can add todos' };
    const todo = { id: Date.now(), studentId: currentUser.id, text: text.trim(), done: false, createdAt: new Date().toISOString() };
    studentTodos.unshift(todo);
    saveStudentTodos();
    return { ok: true, todo };
}

function toggleTodo(id) {
    const t = studentTodos.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    saveStudentTodos();
    renderStudentTodos();
}

function removeTodo(id) {
    studentTodos = studentTodos.filter(x => x.id !== id);
    saveStudentTodos();
    renderStudentTodos();
}

function editTodo(id, newText) {
    const t = studentTodos.find(x => x.id === id);
    if (!t) return;
    t.text = newText;
    saveStudentTodos();
    renderStudentTodos();
}

function renderStudentTodos() {
    const listEl = document.getElementById('studentTodoList');
    if (!listEl) return;
    const myTodos = studentTodos.filter(t => t.studentId === currentUser.id);
    if (myTodos.length === 0) { listEl.innerHTML = '<p class="empty-state">No todos yet. Add one!</p>'; return; }
    listEl.innerHTML = '';
    myTodos.forEach(t => {
        const item = document.createElement('div');
        item.className = 'todo-item';
        item.innerHTML = `
            <label class="todo-row">
                <input type="checkbox" ${t.done? 'checked' : ''} onchange="toggleTodo(${t.id})">
                <span class="todo-text ${t.done? 'done' : ''}">${escapeHtml(t.text)}</span>
            </label>
            <div class="todo-actions">
                <button class="btn-small" onclick="(function(){ const nt = prompt('Edit todo', '${escapeHtml(t.text).replace(/'/g,"\\'")}'); if (nt!==null) editTodo(${t.id}, nt); })()">Edit</button>
                <button class="btn-danger" onclick="removeTodo(${t.id})">Delete</button>
            </div>
        `;
        listEl.appendChild(item);
    });
}

function addStudentToRegistry({ fullName, className, section, roll, addedBy }) {
    // enforce unique roll per class+section
    const exists = studentRegistry.find(s => s.className === className && s.section === section && String(s.roll) === String(roll));
    if (exists) return { ok: false, message: 'Roll number already exists for this class/section' };
    const student = { id: Date.now(), fullName, className, section, roll: String(roll), addedBy };
    studentRegistry.push(student);
    saveStudentRegistry();
    return { ok: true, student };
}

function getStudentFromRegistry(className, roll, section) {
    return studentRegistry.find(s => s.className === className && String(s.roll) === String(roll) && (!section || s.section === section));
}

function findUserByStudentRecord(record) {
    if (!record) return null;
    return users.find(u => u.role === 'student' && (u.name.toLowerCase() === record.fullName.toLowerCase() || (u.class === record.className && (u.roll ? String(u.roll) === String(record.roll) : false))));
}

function validateStudentIdentityForUser(user) {
    if (!user || user.role !== 'student') return true;
    // best-effort match: name + class + roll
    const roll = user.roll || '';
    const record = studentRegistry.find(s => s.fullName.toLowerCase() === (user.name || '').toLowerCase() && s.className === (user.class || '') && String(s.roll) === String(roll));
    if (!record) {
        // Show a warning but do NOT completely disable posting — allow students to participate
        showMessage('Warning: Student identity not found in registry. Some features may be restricted, but you can still post.', true);
        // ensure post input remains enabled (allow posting) and add a visual marker
        const pc = document.getElementById('postInput');
        if (pc) pc.disabled = false;
        const postCreator = document.querySelector('.post-creator');
        if (postCreator) postCreator.classList.add('unverified-student');
        return false;
    }
    // enable if previously disabled
    const pc = document.getElementById('postInput'); if (pc) pc.disabled = false;
    const postCreator = document.querySelector('.post-creator');
    if (postCreator) postCreator.classList.remove('unverified-student');
    return true;
}

// ==================== CALENDAR PERMISSIONS UPDATE (ADDITIVE) ====================

function updateCalendarPermissions() {
    if (!currentUser) return;
    const creator = document.getElementById('eventCreator');
    if (!creator) return;
    if (currentUser.role === 'teacher' || currentUser.role === 'principal') {
        creator.classList.remove('hidden');
    } else {
        creator.classList.add('hidden');
    }
}

function findRecipientByDetails(name, classVal, roll) {
    // Try exact user match first
    const exact = users.find(u => u.name.toLowerCase() === name.toLowerCase() && (classVal ? (u.class || '').toLowerCase() === classVal.toLowerCase() : true) && (roll ? String(u.roll||'') === String(roll) : true));
    if (exact) return exact;

    // Try name contains
    const partial = users.find(u => u.name.toLowerCase().includes(name.toLowerCase()));
    if (partial) return partial;

    // If not found in users, try student registry and map to user account
    const record = getStudentFromRegistry(classVal, roll);
    if (record) {
        const mapped = findUserByStudentRecord(record);
        if (mapped) return mapped;
    }

    return null;
}

function loadInbox() {
    if (!currentUser) return;
    const inbox = document.getElementById('inboxList');
    if (!inbox) return;
    inbox.innerHTML = '';

    // Show messaging lock banner if user is locked
    if (isUserMessagingLocked(currentUser.id)) {
        const banner = document.createElement('div');
        banner.className = 'warning-banner';
        banner.textContent = 'Your messaging is currently locked due to policy violations. Contact admin.';
        inbox.appendChild(banner);
    }

    const list = messages.filter(m => m.receiverId === currentUser.id || m.senderId === currentUser.id);
    if (list.length === 0) { inbox.innerHTML = '<p class="empty-state">No messages</p>'; return; }

    list.forEach(m => {
        const from = users.find(u => u.id === m.senderId) || { name: m.meta?.receiverName || 'Unknown' };
        const to = users.find(u => u.id === m.receiverId) || { name: m.meta?.receiverName || 'Unknown' };
        const item = document.createElement('div');
        item.className = 'inbox-item';
        item.innerHTML = `<div class="inbox-item-header"><strong>${m.senderId===currentUser.id? 'To: ' + to.name : 'From: ' + from.name}</strong><span class="inbox-time">${getTimeAgo(new Date(m.createdAt))}</span></div>
            <div class="inbox-snippet">${escapeHtml(m.text.substring(0,120))}${m.text.length>120? '…':''}</div>`;
        item.onclick = () => openMessage(m.id);
        inbox.appendChild(item);
    });
}

// ==================== RESOURCES (Notes / Cheat Sheets) ====================

function uploadResource() {
    if (!currentUser) { showMessage('Please login to upload resources', true); return; }
    const title = document.getElementById('resTitle').value.trim();
    const subject = document.getElementById('resSubject').value.trim();
    const type = document.getElementById('resType').value;
    const desc = document.getElementById('resDesc').value.trim();
    const fileInput = document.getElementById('resFile');

    if (!title || !fileInput || fileInput.files.length === 0) { showMessage('Please provide a title and select a file', true); return; }

    // Role-based validation
    if (currentUser.role === 'student' && type !== 'Note') { showMessage('Students can only upload Notes', true); return; }
    if (currentUser.role === 'parent' && currentUser.role !== 'teacher' && currentUser.role !== 'principal' && currentUser.role !== 'student') { showMessage('You are not allowed to upload resources', true); return; }

    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
        const res = {
            id: Date.now(),
            userId: currentUser.id,
            userName: currentUser.name,
            userRole: currentUser.role,
            title,
            subject: subject || 'General',
            type,
            description: desc,
            fileName: file.name,
            fileType: file.type,
            fileData: e.target.result,
            createdAt: new Date().toISOString()
        };
        resources.unshift(res);
        saveData();
        showMessage('Item added to Library&Lagecy');
        // clear form
        document.getElementById('resTitle').value = '';
        document.getElementById('resSubject').value = '';
        document.getElementById('resDesc').value = '';
        document.getElementById('resFile').value = '';
        loadResources();
    };
    reader.readAsDataURL(file);
}

function loadResources() {
    const container = document.getElementById('resourcesContainer');
    if (!container) return;
    container.innerHTML = '';
    if (!resources || resources.length === 0) { container.innerHTML = '<div class="empty-state">No Library&Lagecy items uploaded yet.</div>'; return; }
    resources.forEach(r => {
        const el = document.createElement('div'); el.className = 'resource-card';
        el.innerHTML = `<h4>${escapeHtml(r.title)}</h4>
            <div class="resource-meta">${escapeHtml(r.subject)} • ${escapeHtml(r.type)} • by ${escapeHtml(r.userName)} • ${getTimeAgo(new Date(r.createdAt))}</div>
            <div class="resource-desc">${escapeHtml(r.description || '')}</div>
            <div class="resource-actions">
                <button class="btn-small" onclick="downloadResource(${r.id})">Download</button>
                ${ (currentUser && (currentUser.id===r.userId || currentUser.role==='principal')) ? `<button class="btn-danger" onclick="deleteResource(${r.id})">Delete</button>` : '' }
            </div>`;
        container.appendChild(el);
    });
}

function downloadResource(id) {
    const r = resources.find(x=>x.id===id);
    if (!r) return showMessage('Resource not found', true);
    const a = document.createElement('a');
    a.href = r.fileData;
    a.download = r.fileName || 'resource';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function deleteResource(id) {
    const idx = resources.findIndex(x=>x.id===id);
    if (idx === -1) return;
    const r = resources[idx];
    if (!currentUser) return showMessage('Login required', true);
    if (!(currentUser.id === r.userId || currentUser.role === 'principal')) return showMessage('Not allowed to delete', true);
    if (!confirm('Delete this resource?')) return;
    resources.splice(idx,1);
    saveData();
    loadResources();
    showMessage('Item removed from Library&Lagecy');
}

function openMessage(id) {
    const m = messages.find(x => x.id === id);
    if (!m) return;
    m.read = true; saveData();
    // Simple inline modal-like view
    const inbox = document.getElementById('inboxList');
    const sender = users.find(u => u.id === m.senderId) || { name: 'Unknown' };
    const receiver = users.find(u => u.id === m.receiverId) || { name: 'Unknown' };
    inbox.innerHTML = `
        <div class="message-view">
            <div class="message-meta"><strong>From:</strong> ${sender.name} • <strong>To:</strong> ${receiver.name} • <span>${getTimeAgo(new Date(m.createdAt))}</span></div>
            <div class="message-body">${escapeHtml(m.text)}</div>
            <div class="message-actions">
                <button onclick="loadInbox()" class="btn-small">Back</button>
                <button onclick="(function(){ messages = messages.filter(x=>x.id!==${m.id}); saveData(); loadInbox(); })()" class="btn-danger">Delete</button>
            </div>
        </div>`;
}

// Role dashboards
function loadRoleDashboard() {
    const container = document.getElementById('roleDashboardContainer');
    if (!container || !currentUser) return;
    container.innerHTML = '';
    // Update calendar permissions for principal/teacher
    updateCalendarPermissions();
    // Validate student identity when student logs in
    if (currentUser.role === 'student') validateStudentIdentityForUser(currentUser);
    // Parents are view-only: hide posting UI
    const postCreator = document.querySelector('.post-creator');
    if (postCreator) {
        if (currentUser.role === 'parent') postCreator.style.display = 'none';
        else postCreator.style.display = '';
    }
    if (currentUser.role === 'principal') return renderPrincipalDashboard(container);
    if (currentUser.role === 'teacher') return renderTeacherDashboard(container);
    if (currentUser.role === 'student') return renderStudentDashboard(container);
    if (currentUser.role === 'parent') return renderParentDashboard(container);
    container.innerHTML = '<p>Role-specific dashboard is not configured for your role.</p>';

    // Render any private alerts for teachers/principals
    try { renderSilentAlertsForCurrentUser(); } catch (e) {}
}

function renderPrincipalDashboard(container) {
    const totalUsers = users.length;
    const teachers = users.filter(u=>u.role==='teacher').length;
    const students = users.filter(u=>u.role==='student').length;
    const parents = users.filter(u=>u.role==='parent').length;
    const summary = document.createElement('div');
    summary.className = 'principal-summary';
    summary.innerHTML = `
        <div class="cards-row">
            <div class="stat-card"><h3>${totalUsers}</h3><p>Total Users</p></div>
            <div class="stat-card"><h3>${teachers}</h3><p>Teachers</p></div>
            <div class="stat-card"><h3>${students}</h3><p>Students</p></div>
            <div class="stat-card"><h3>${parents}</h3><p>Parents</p></div>
            <div class="stat-card"><h3>${events.length}</h3><p>Events</p></div>
            <div class="stat-card"><h3>${messages.length}</h3><p>Messages</p></div>
        </div>
    `;
    container.appendChild(summary);

    // User management table
    const mgmt = document.createElement('div');
    mgmt.className = 'user-management';
    let rows = '';
    users.forEach(u => {
        rows += `<div class="user-row"><div><strong>${escapeHtml(u.name)}</strong> (${u.role || 'n/a'}) • ${u.class||''}</div>
            <div class="user-actions">
                <button onclick="viewUser(${u.id})" class="btn-small">View</button>
                <button onclick="editUser(${u.id})" class="btn-small">Edit</button>
                <button onclick="changeUserRolePrompt(${u.id})" class="btn-small">Change Role</button>
                <button onclick="removeUser(${u.id})" class="btn-danger">Remove</button>
            </div></div>`;
    });
    mgmt.innerHTML = `<h3>Manage Users</h3>${rows}`;
    container.appendChild(mgmt);
}

function renderTeacherDashboard(container) {
    const cls = currentUser.class || 'All Classes';
    const studentsInClass = users.filter(u=>u.role==='student' && (currentUser.class? u.class===currentUser.class : true));
    let html = `<div class='teacher-summary'><h3>Class: ${cls}</h3><p>Students: ${studentsInClass.length}</p><ul>`;
    studentsInClass.slice(0,10).forEach(s => html += `<li>${escapeHtml(s.name)} ${s.roll? '• Roll: '+s.roll : ''}</li>`);
    html += `</ul></div>`;

    // Manage Students (new additive UI)
    html += `
        <div class="manage-students">
            <h4>Manage Students</h4>
            <div class="manage-form">
                <input type="text" id="newStudentName" placeholder="Full Name">
                <input type="text" id="newStudentClass" placeholder="Class (e.g., 10A)" value="${currentUser.class || ''}">
                <input type="text" id="newStudentSection" placeholder="Section">
                <input type="text" id="newStudentRoll" placeholder="Roll Number">
                <button onclick="handleAddStudent()" class="btn-primary-small">Add Student</button>
            </div>
            <div id="teacherStudentList" class="teacher-student-list"></div>
        </div>`;

    container.innerHTML = html;
    renderTeacherStudentList();
}

function handleAddStudent() {
    const fullName = document.getElementById('newStudentName').value.trim();
    const className = document.getElementById('newStudentClass').value.trim();
    const section = document.getElementById('newStudentSection').value.trim();
    const roll = document.getElementById('newStudentRoll').value.trim();
    if (!fullName || !className || !roll) { showMessage('Name, class and roll are required', true); return; }
    const res = addStudentToRegistry({ fullName, className, section, roll, addedBy: currentUser.id });
    if (!res.ok) { showMessage(res.message, true); return; }
    showMessage('Student added to registry');
    document.getElementById('newStudentName').value = '';
    document.getElementById('newStudentClass').value = currentUser.class || '';
    document.getElementById('newStudentSection').value = '';
    document.getElementById('newStudentRoll').value = '';
    renderTeacherStudentList();
}

function renderTeacherStudentList() {
    const listEl = document.getElementById('teacherStudentList');
    if (!listEl) return;
    const myStudents = studentRegistry.filter(s => s.addedBy === currentUser.id || s.className === currentUser.class);
    if (myStudents.length === 0) { listEl.innerHTML = '<p class="empty-state">No students in registry yet.</p>'; return; }
    let html = '<ul>';
    myStudents.forEach(s => html += `<li>${escapeHtml(s.fullName)} • Class: ${s.className} ${s.section? '• ' + s.section : ''} • Roll: ${s.roll}</li>`);
    html += '</ul>';
    listEl.innerHTML = html;
}

function renderStudentDashboard(container) {
    const userPosts = posts.filter(p=>p.userId===currentUser.id);
    const inboxCount = messages.filter(m=>m.receiverId===currentUser.id && !m.read).length;
    let html = `<div class='student-dashboard'><h3>Welcome, ${escapeHtml(currentUser.name)}</h3>
        <p>Unread Messages: ${inboxCount}</p>
        <h4>Recent Personal Posts</h4><ul>`;
    userPosts.slice(0,5).forEach(p=> html += `<li>${escapeHtml(p.text.substring(0,80))}</li>`);
    html += `</ul></div>`;
    
    // Student Todo section
    html += `
        <div class="student-todo">
            <h4>My Todo List</h4>
            <div class="todo-add">
                <input id="newTodoText" class="fancy-input" placeholder="Add a new todo...">
                <button class="btn-primary-small" onclick="(function(){ const t = document.getElementById('newTodoText').value.trim(); if(!t) { showMessage('Please enter todo text', true); return; } const res = addTodoForCurrentStudent(t); if(res.ok){ document.getElementById('newTodoText').value=''; renderStudentTodos(); } })()">Add</button>
            </div>
            <div id="studentTodoList" class="student-todo-list"></div>
        </div>
    `;
    
    

    container.innerHTML = html;
    // Render todos after injecting container
    renderStudentTodos();
}

function renderParentDashboard(container) {
    // Parent linking UI
    const linked = currentUser.childIds || (currentUser.childId ? [currentUser.childId] : []);
    let html = `<div class='parent-dashboard'><h3>Child Overview</h3>
        <div class="parent-link-form">
            <input type="text" id="parentLinkClass" placeholder="Child Class (e.g., 10A)">
            <input type="text" id="parentLinkRoll" placeholder="Child Roll Number">
            <button onclick="handleParentLink()" class="btn-primary-small">Link Child</button>
        </div>`;

    if (!linked || linked.length === 0) {
        html += '<p>No child linked to this parent account yet.</p>';
    } else {
        linked.forEach(cid => {
            // cid may be a user id or registry id
            const childUser = users.find(u => u.id === cid);
            if (childUser) {
                const studentPosts = posts.filter(p => p.userId === childUser.id).length;
                html += `<div class='child-card'><strong>${escapeHtml(childUser.name)}</strong> • Class: ${childUser.class||''} • Posts: ${studentPosts}</div>`;
            } else {
                const reg = studentRegistry.find(s => s.id === cid);
                if (reg) html += `<div class='child-card'><strong>${escapeHtml(reg.fullName)}</strong> • Class: ${reg.className} ${reg.section? '• '+reg.section : ''} • Roll: ${reg.roll}</div>`;
            }
        });
    }
    html += `</div>`;
    container.innerHTML = html;
}

function handleParentLink() {
    const className = document.getElementById('parentLinkClass').value.trim();
    const roll = document.getElementById('parentLinkRoll').value.trim();
    if (!className || !roll) { showMessage('Provide class and roll to link child', true); return; }
    const record = getStudentFromRegistry(className, roll);
    if (!record) { showMessage('Student not found in registry', true); return; }
    // Try map to user
    const mappedUser = findUserByStudentRecord(record);
    if (!currentUser.childIds) currentUser.childIds = [];
    const linkId = mappedUser ? mappedUser.id : record.id;
    if (!currentUser.childIds.includes(linkId)) currentUser.childIds.push(linkId);
    // persist currentUser in users array
    const idx = users.findIndex(u=>u.id===currentUser.id);
    if (idx !== -1) { users[idx] = currentUser; saveData(); }
    showMessage('Child linked to parent account');
    loadRoleDashboard();
}

// (Academic Risk Predictor removed)

// Principal user actions
function viewUser(id) {
    const u = users.find(x=>x.id===id);
    if (!u) return showMessage('User not found', true);
    alert(`${u.name}\nRole: ${u.role}\nClass: ${u.class||'N/A'}\nEmail: ${u.email}`);
}

function editUser(id) {
    const u = users.find(x=>x.id===id);
    if (!u) return showMessage('User not found', true);
    const newName = prompt('Edit name', u.name);
    if (newName) { u.name = newName; saveData(); loadRoleDashboard(); }
}

function changeUserRolePrompt(id) {
    const u = users.find(x=>x.id===id);
    if (!u) return;
    const newRole = prompt('Enter new role (principal/teacher/student/parent)', u.role);
    if (newRole) changeUserRole(id, newRole);
}

function changeUserRole(id, role) {
    const idx = users.findIndex(x=>x.id===id);
    if (idx === -1) return showMessage('User not found', true);
    users[idx].role = role;
    saveData();
    showMessage('Role updated');
    // If current user updated their own role, refresh UI and permissions immediately
    if (currentUser && users[idx].id === currentUser.id) {
        currentUser.role = role;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        // Update calendar and dashboard permissions
        try { updateCalendarPermissions(); initializeCalendar(); } catch (e) {}
    }
    loadRoleDashboard();
}

function removeUser(id) {
    if (!confirm('Remove user? This cannot be undone.')) return;
    users = users.filter(u=>u.id!==id);
    // Remove related messages, posts
    posts = posts.filter(p=>p.userId!==id);
    talents = talents.filter(t=>t.userId!==id);
    questions = questions.filter(q=>q.userId!==id);
    messages = messages.filter(m=>m.senderId!==id && m.receiverId!==id);
    saveData();
    loadRoleDashboard();
    showMessage('User removed');
}


// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initThemeOnLoad();
    checkAuthStatus();
    observeCalendarActivation();
    initEnhancements();
});

// ---------------- AI Chat Widget (frontend) ----------------
// (AI chat widget removed)

function observeCalendarActivation() {
    const target = document.getElementById('calendarPage');
    if (!target) return;
    const mo = new MutationObserver(muts => {
        muts.forEach(m => {
            if (m.attributeName === 'class') {
                if (target.classList.contains('active')) updateCalendarPermissions();
            }
        });
    });
    mo.observe(target, { attributes: true });
}

// ==================== ENHANCEMENTS (ADDITIVE) ====================

function initEnhancements() {
    try {
        initAccessibility();
        attachFormValidators();
        enhanceMessagingBindings();
        injectDevSeedButton();
        observeRoleDashboardForParentUX();
        attachSignupRoleHandler();
        observeProfileActivation();
    } catch (e) { console.error('Enhancements init failed', e); }
}

function updateProfileClassVisibility() {
    try {
        const profileClassEl = document.getElementById('profileClass');
        const editClassEl = document.getElementById('editClass');
        if (!profileClassEl && !editClassEl) return;
        const isStudent = currentUser && currentUser.role === 'student';
        if (profileClassEl) profileClassEl.style.display = isStudent ? '' : 'none';
        if (editClassEl) {
            editClassEl.style.display = isStudent ? '' : 'none';
            if (!isStudent) {
                editClassEl.removeAttribute('required');
                editClassEl.value = editClassEl.value || '';
            } else {
                editClassEl.setAttribute('required','');
            }
        }
    } catch (e) { console.error('updateProfileClassVisibility error', e); }
}

function observeProfileActivation() {
    const target = document.getElementById('profilePage');
    if (!target) return;
    const mo = new MutationObserver(muts => {
        muts.forEach(m => {
            if (m.attributeName === 'class') {
                if (target.classList.contains('active')) updateProfileClassVisibility();
            }
        });
    });
    mo.observe(target, { attributes: true });
    // Also call once in case profile is already active
    updateProfileClassVisibility();
}

function attachSignupRoleHandler() {
    const roleSelect = document.getElementById('signupRole');
    const classInput = document.getElementById('signupClass');
    if (!roleSelect || !classInput) return;

    function updateVisibility() {
        const role = roleSelect.value;
        // Show class input for students and teachers (teachers may specify class they teach)
        if (role === 'student' || role === 'teacher') {
            classInput.style.display = '';
            classInput.setAttribute('required','');
            classInput.placeholder = role === 'student' ? 'Class/Section' : 'Class you teach (e.g., 10A)';
        } else {
            classInput.style.display = 'none';
            classInput.value = '';
            classInput.removeAttribute('required');
        }
    }

    // Initialize on load
    updateVisibility();

    // Attach listener
    roleSelect.addEventListener('change', updateVisibility);
}

function initAccessibility() {
    // Add ARIA and accessible names dynamically without changing HTML
    const map = [
        ['loginEmail','Login email input'],
        ['loginPassword','Login password input'],
        ['signupName','Full name'],
        ['signupEmail','Signup email'],
        ['signupPassword','Signup password'],
        ['signupRole','Signup role selector'],
        ['signupClass','Signup class input'],
        ['postInput','Create post input'],
        ['postCategory','Post category selector'],
        ['msgReceiverName','Message receiver name'],
        ['msgClass','Message receiver class'],
        ['msgRoll','Message receiver roll'],
        ['msgText','Message body']
    ];
    map.forEach(([id,label]) => {
        const el = document.getElementById(id);
        if (el && !el.getAttribute('aria-label')) el.setAttribute('aria-label', label);
    });

    // Make nav buttons keyboard friendly
    document.querySelectorAll('.nav-btn, .btn-primary, .btn-small, .btn-danger').forEach(b => {
        if (!b.getAttribute('role')) b.setAttribute('role','button');
        b.tabIndex = 0;
    });
}

function attachFormValidators() {
    // Replace inline onclick handlers at runtime with validated handlers
    // Signup
    const signupBtn = document.querySelector('#signupForm .btn-primary');
    if (signupBtn) {
        signupBtn.removeAttribute('onclick');
        signupBtn.addEventListener('click', (e) => {
            const name = document.getElementById('signupName').value.trim();
            const email = document.getElementById('signupEmail').value.trim();
            const password = document.getElementById('signupPassword').value;
            const role = document.getElementById('signupRole').value;
            if (!name || !email || !password || !role) { showMessage('Please fill all required signup fields', true); return; }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMessage('Enter a valid email', true); return; }
            handleSignup();
        });
    }

    // Login
    const loginBtn = document.querySelector('#loginForm .btn-primary');
    if (loginBtn) {
        loginBtn.removeAttribute('onclick');
        loginBtn.addEventListener('click', (e) => {
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            if (!email || !password) { showMessage('Please enter email and password', true); return; }
            handleLogin();
        });
    }

    // Message send button will be replaced in enhanceMessagingBindings
}

function enhanceMessagingBindings() {
    const sendBtn = document.querySelector('#messagesPage .btn-primary');
    if (!sendBtn) return;
    sendBtn.removeAttribute('onclick');
    sendBtn.addEventListener('click', () => sendMessageEnhanced());
}

function sendMessageEnhanced() {
    if (!currentUser) { showMessage('Please login to send messages', true); return; }
    if (isUserMessagingLocked(currentUser.id)) { showMessage('Your messaging is currently locked. Contact admin.', true); return; }
    const name = document.getElementById('msgReceiverName').value.trim();
    const classVal = document.getElementById('msgClass').value.trim();
    const roll = document.getElementById('msgRoll').value.trim();
    const text = document.getElementById('msgText').value.trim();
    if (!name || !text) { showMessage('Receiver name and message required', true); return; }

    // Try find user first
    const userRecipient = users.find(u => u.name.toLowerCase() === name.toLowerCase() && (classVal ? (u.class||'').toLowerCase() === classVal.toLowerCase() : true) && (roll ? String(u.roll||'') === String(roll) : true));
    if (userRecipient) {
        // use existing permission rules
        const allowed = checkMessagingAllowed(currentUser.role, userRecipient.role);
        if (!allowed) return showMessage('You are not allowed to message this user', true);
        sendMessage(currentUser.id, userRecipient.id, text, { receiverName: userRecipient.name, class: userRecipient.class, roll: userRecipient.roll || '' });
        document.getElementById('msgText').value = '';
        showMessage('Message sent to user');
        loadInbox();
        return;
    }

    // Try student registry mapping
    const registryRecord = getStudentFromRegistry(classVal, roll);
    if (registryRecord && registryRecord.fullName.toLowerCase().includes(name.toLowerCase())) {
        // Validate permissions: who can target registry-only students?
        if (!['principal','teacher','student'].includes(currentUser.role)) return showMessage('You cannot message this student', true);
        // Store message targeted at registry (no receiver user account)
        sendMessageAdvanced({ senderId: currentUser.id, receiverRegistryId: registryRecord.id, text });
        showMessage('Message sent to student registry entry (will deliver if/when they have an account)');
        document.getElementById('msgText').value = '';
        loadInbox();
        return;
    }

    showMessage('Recipient not found', true);
}

function checkMessagingAllowed(senderRole, recipientRole) {
    if (senderRole === 'principal') return true;
    if (senderRole === 'teacher') return ['student','parent','principal','teacher'].includes(recipientRole);
    if (senderRole === 'student') return ['teacher','student'].includes(recipientRole);
    if (senderRole === 'parent') return ['teacher','principal'].includes(recipientRole);
    return false;
}

function sendMessageAdvanced({ senderId, receiverId = null, receiverRegistryId = null, text, meta = {} }) {
    // Prevent messaging if locked
    if (isUserMessagingLocked(senderId)) { showMessage('Your messaging is currently locked. Contact admin.', true); return; }
    if (text && text.length > 800) { showMessage('Message too long (max 800 characters)', true); return; }
    const check = sanitizeMessageText(text);
    if (check.hadProfanity) { recordDisciplinary(senderId, check.profaneWords); return; }
    const msg = { id: Date.now(), senderId, receiverId, receiverRegistryId, text: check.cleanText, meta, createdAt: new Date().toISOString(), read: false };
    messages.unshift(msg);
    saveData();
}

// Extend loadInbox to show registry-targeted messages relevant to the current user
const _origLoadInbox = window.loadInbox;
function loadInboxWrapper() {
    if (typeof _origLoadInbox === 'function') _origLoadInbox();
    // Append registry-targeted messages where currentUser is the mapped user or parent
    if (!currentUser) return;
    const inbox = document.getElementById('inboxList');
    if (!inbox) return;
    // list registry-only messages that match parent's linked children or mapped to this user
    const extra = messages.filter(m => m.receiverRegistryId && ( (currentUser.childIds && currentUser.childIds.includes(m.receiverRegistryId)) || users.find(u=>u.id===currentUser.id && (u.role==='student' && studentRegistry.find(s=>s.id===m.receiverRegistryId && (s.fullName.toLowerCase()===u.name.toLowerCase())))) ));
    extra.forEach(m => {
        const item = document.createElement('div');
        item.className = 'inbox-item registry-targeted';
        const reg = studentRegistry.find(s=>s.id===m.receiverRegistryId) || { fullName:'Student' };
        item.innerHTML = `<div class="inbox-item-header"><strong>From: ${escapeHtml((users.find(u=>u.id===m.senderId)||{name:'Unknown'}).name)}</strong><span class="inbox-time">${getTimeAgo(new Date(m.createdAt))}</span></div>
            <div class="inbox-snippet">[To registry: ${escapeHtml(reg.fullName)}] ${escapeHtml(m.text.substring(0,120))}</div>`;
        item.onclick = () => openMessage(m.id);
        inbox.appendChild(item);
    });
}
window.loadInbox = loadInboxWrapper;

function injectDevSeedButton() {
    // Add small developer seed button to auth card for convenience (additive)
    const authCard = document.querySelector('.auth-card');
    if (!authCard || document.getElementById('seedDataBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'seedDataBtn';
    btn.className = 'btn-small';
    btn.style.marginTop = '12px';
    btn.textContent = 'Seed Demo Data';
    btn.title = 'Add demo users and students for testing';
    btn.onclick = () => { if (confirm('Add demo users/data?')) seedDemoData(); };
    authCard.appendChild(btn);
}

function seedDemoData() {
    // Only add demo data if no users exist to avoid accidental duplicates
    if (users.length > 0 || studentRegistry.length > 0) { if (!confirm('Users or registry already exist. Still add demo data?')) return; }
    // Principal
    const principal = { id: Date.now()+1, name: 'Principal One', email: 'principal@example.com', password: btoa('principal'), role: 'principal', class: '', profilePic: 'https://via.placeholder.com/150', bio: '' };
    // Teacher
    const teacher = { id: Date.now()+2, name: 'Teacher Amy', email: 'amy.teacher@example.com', password: btoa('teacher'), role: 'teacher', class: '10A', profilePic: 'https://via.placeholder.com/150', bio: '' };
    // Student
    const student = { id: Date.now()+3, name: 'Student John', email: 'john.student@example.com', password: btoa('student'), role: 'student', class: '10A', roll: '5', profilePic: 'https://via.placeholder.com/150', bio: '' };
    // Parent
    const parent = { id: Date.now()+4, name: 'Parent Rita', email: 'rita.parent@example.com', password: btoa('parent'), role: 'parent', class: '', profilePic: 'https://via.placeholder.com/150', bio: '' };
    users.push(principal, teacher, student, parent);
    // Add student registry entry
    studentRegistry.push({ id: Date.now()+11, fullName: 'Student John', className: '10A', section: '', roll: '5', addedBy: teacher.id });
    // Link parent to student registry entry
    parent.childIds = [ studentRegistry[0].id ];
    saveData();
    saveStudentRegistry();
    showMessage('Demo data seeded');
}

function observeRoleDashboardForParentUX() {
    const container = document.getElementById('roleDashboardContainer');
    if (!container) return;
    const mo = new MutationObserver(() => {
        // If parent link inputs exist, attach autocompletion
        const classInput = document.getElementById('parentLinkClass');
        const rollInput = document.getElementById('parentLinkRoll');
        if (classInput && rollInput) attachParentLinkSuggest(classInput, rollInput);
    });
    mo.observe(container, { childList: true, subtree: true });
}

function attachParentLinkSuggest(classInput, rollInput) {
    function suggest() {
        const classVal = classInput.value.trim();
        const rollVal = rollInput.value.trim();
        const suggestionBoxId = 'parentLinkSuggestion';
        let box = document.getElementById(suggestionBoxId);
        if (!box) { box = document.createElement('div'); box.id = suggestionBoxId; box.style.marginTop = '8px'; classInput.parentNode.appendChild(box); }
        box.innerHTML = '';
        if (!classVal || !rollVal) return;
        const rec = getStudentFromRegistry(classVal, rollVal);
        if (rec) box.innerHTML = `<div class="child-card">Match: ${escapeHtml(rec.fullName)} • Class: ${rec.className} • Roll: ${rec.roll}</div>`;
        else box.innerHTML = '<div class="empty-state">No matching student found in registry</div>';
    }
    classInput.addEventListener('input', suggest);
    rollInput.addEventListener('input', suggest);
}

