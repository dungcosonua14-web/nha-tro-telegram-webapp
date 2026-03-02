/* =============================================
   NHÀ TRỌ EDEN - Telegram Web App JS
   4-Tab: Dashboard | Phòng | Người Thuê | Hóa Đơn
   ============================================= */

const firebaseConfig = {
    apiKey: "AIzaSyApSkAZZL9y5fYbF7h8yIaTtssCGNoMMQU",
    authDomain: "nhatroeden.firebaseapp.com",
    projectId: "nhatroeden",
    storageBucket: "nhatroeden.firebasestorage.app",
    messagingSenderId: "287791247707",
    appId: "1:287791247707:web:4e7e4c5fdf239e1a0e2a7e",
    measurementId: "G-ER75LSTRVH"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const tg = window.Telegram?.WebApp;

function refreshIcons() {
    if (window.lucide && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
}

function formatVND(amount) {
    const n = Number(amount) || 0;
    return new Intl.NumberFormat('vi-VN').format(n) + '₫';
}

function formatMonth(m) {
    if (!m) return '—';
    const [y, mo] = m.split('-');
    return `Tháng ${parseInt(mo)}/${y}`;
}

const App = {
    // ─── Data ───
    rooms: [],
    tenants: [],
    invoices: [],
    settings: {},

    // ─── State ───
    currentTab: 'dashboard',
    tenantFilter: 'hasRoom',
    tenantSearch: '',
    invoiceMonth: null,

    OWNER_IDS: ['320838772'],

    // ─── Init ───
    async init() {
        if (tg) { tg.ready(); tg.expand(); }

        try {
            const authorized = await this.checkAuth();
            if (!authorized) { this.showAccessDenied(); return; }

            // Load all data
            await Promise.all([
                this.loadCollection('rooms'),
                this.loadCollection('tenants'),
                this.loadCollection('invoices'),
                this.loadSettings()
            ]);

            // Set default invoice month to current month
            const now = new Date();
            this.invoiceMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            // Show header user info
            const user = tg?.initDataUnsafe?.user;
            if (user) {
                const el = document.getElementById('headerUser');
                if (el) el.textContent = user.first_name || 'User';
            }

            // Update header subtitle
            const occupied = this.rooms.filter(r => r.status === 'occupied').length;
            const sub = document.getElementById('headerSubtitle');
            if (sub) sub.textContent = `${occupied} phòng đang thuê`;

            this.switchScreen('mainScreen');
            this.switchTab('dashboard');
        } catch (err) {
            console.error('Init failed:', err);
        }
    },

    // ─── Auth ───
    async checkAuth() {
        const user = tg?.initDataUnsafe?.user;
        const userId = user ? String(user.id) : null;
        if (!userId) return false;
        if (this.OWNER_IDS.includes(userId)) return true;
        try {
            const snap = await db.collection('payment_bot_users').doc(userId).get();
            if (snap.exists) return true;
        } catch (e) { }
        return false;
    },

    showAccessDenied() {
        const user = tg?.initDataUnsafe?.user;
        const userId = user ? user.id : null;
        document.getElementById('deniedScreen').style.display = 'flex';
        this.switchScreen('deniedScreen');
        if (!userId) {
            document.getElementById('deniedTitle').textContent = 'Chỉ mở trong Telegram';
            document.getElementById('deniedMessage').textContent = 'Vui lòng mở ứng dụng này qua Telegram Bot.';
            document.getElementById('deniedIdBox').style.display = 'none';
        } else {
            document.getElementById('deniedUserId').textContent = userId;
            document.getElementById('deniedUserName').textContent = (user.first_name || '') + ' ' + (user.last_name || '');
        }
        refreshIcons();
    },

    // ─── Firebase ───
    async loadCollection(name) {
        const snap = await db.collection(name).get();
        const items = [];
        snap.forEach(doc => items.push({ ...doc.data(), id: doc.id }));
        this[name] = items;
    },

    async loadSettings() {
        const doc = await db.collection('settings').doc('main').get();
        this.settings = doc.exists ? doc.data() : {};
    },

    // ─── Screen ───
    switchScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        refreshIcons();
    },

    // ─── Tabs ───
    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        const content = document.getElementById('tabContent');
        switch (tab) {
            case 'dashboard': content.innerHTML = this.renderDashboard(); break;
            case 'rooms': content.innerHTML = this.renderRooms(); break;
            case 'tenants': content.innerHTML = this.renderTenants(); break;
            case 'invoices': content.innerHTML = this.renderInvoices(); break;
        }
        refreshIcons();
    },

    // ══════════════════════════════
    //  DASHBOARD
    // ══════════════════════════════
    renderDashboard() {
        const now = new Date();
        const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthInvs = this.invoices.filter(i => i.month === curMonth);
        const getTotal = i => (i.roomPrice || 0) + (i.electricCost || 0) + (i.waterCost || 0) + (i.serviceCost || 0);

        const revenue = monthInvs.reduce((s, i) => s + getTotal(i), 0);
        const paid = monthInvs.filter(i => i.paid).length;
        const unpaid = monthInvs.filter(i => !i.paid);
        const occupied = this.rooms.filter(r => r.status === 'occupied').length;
        const available = this.rooms.filter(r => r.status === 'available').length;
        const activeT = this.tenants.filter(t => t.roomId && !t.moveOutDate).length;

        const unpaidItems = unpaid.slice(0, 5).map(i => {
            const room = this.rooms.find(r => r.id === i.roomId);
            const t = this.tenants.find(t => t.roomId === i.roomId && !t.moveOutDate) ||
                (i.tenantNames ? { name: i.tenantNames } : null);
            return `
            <div class="unpaid-item">
                <div class="unpaid-dot"></div>
                <div class="unpaid-info">
                    <div class="unpaid-room">${room?.name || '—'}</div>
                    <div class="unpaid-month">${t?.name || '—'} · ${formatMonth(i.month)}</div>
                </div>
                <div class="unpaid-amount">${formatVND(getTotal(i))}</div>
            </div>`;
        }).join('');

        return `
        <div style="padding-bottom:8px">
            <div class="dash-hero">
                <div class="dash-hero-label">Doanh thu ${formatMonth(curMonth)}</div>
                <div class="dash-hero-amount">${formatVND(revenue)}</div>
                <div class="dash-hero-sub">${monthInvs.length} hóa đơn · ${paid} đã thu</div>
                <div class="dash-hero-badge">
                    <i data-lucide="trending-up" style="width:12px;height:12px"></i>
                    ${Math.round(paid / (monthInvs.length || 1) * 100)}% hoàn thành
                </div>
            </div>

            <div class="dash-stats-row">
                <div class="dash-stat-card">
                    <div class="dash-stat-icon" style="background:var(--primary-light)">
                        <i data-lucide="door-open" style="color:var(--primary)"></i>
                    </div>
                    <div>
                        <div class="dash-stat-val">${occupied}</div>
                        <div class="dash-stat-lbl">Phòng đang thuê</div>
                    </div>
                </div>
                <div class="dash-stat-card">
                    <div class="dash-stat-icon" style="background:var(--success-light)">
                        <i data-lucide="circle-check" style="color:var(--success)"></i>
                    </div>
                    <div>
                        <div class="dash-stat-val">${available}</div>
                        <div class="dash-stat-lbl">Phòng trống</div>
                    </div>
                </div>
                <div class="dash-stat-card">
                    <div class="dash-stat-icon" style="background:var(--info-light)">
                        <i data-lucide="users" style="color:var(--info)"></i>
                    </div>
                    <div>
                        <div class="dash-stat-val">${activeT}</div>
                        <div class="dash-stat-lbl">Người thuê</div>
                    </div>
                </div>
                <div class="dash-stat-card">
                    <div class="dash-stat-icon" style="background:var(--danger-light)">
                        <i data-lucide="alert-circle" style="color:var(--danger)"></i>
                    </div>
                    <div>
                        <div class="dash-stat-val">${unpaid.length}</div>
                        <div class="dash-stat-lbl">Chưa thanh toán</div>
                    </div>
                </div>
            </div>

            ${unpaid.length > 0 ? `
            <div class="dash-section">
                <div class="dash-section-title">
                    <i data-lucide="alert-triangle"></i>
                    Chưa thanh toán tháng này
                </div>
                ${unpaidItems}
                ${unpaid.length > 5 ? `<div style="text-align:center;font-size:12px;color:var(--text-muted);padding:8px">và ${unpaid.length - 5} phòng khác...</div>` : ''}
            </div>` : `
            <div class="dash-section">
                <div style="text-align:center;padding:24px;color:var(--success);font-size:15px;font-weight:700">
                    🎉 Tất cả đã thanh toán tháng này!
                </div>
            </div>`}
        </div>`;
    },

    // ══════════════════════════════
    //  ROOMS
    // ══════════════════════════════
    renderRooms() {
        const rooms = [...this.rooms].sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', 'vi', { numeric: true }));

        const occupied = rooms.filter(r => r.status === 'occupied').length;
        const available = rooms.filter(r => r.status === 'available').length;

        // Group by floor
        const floors = {};
        rooms.forEach(r => {
            const fl = r.floor || '?';
            if (!floors[fl]) floors[fl] = [];
            floors[fl].push(r);
        });

        const floorHTML = Object.entries(floors)
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([floor, fRooms]) => {
                const cards = fRooms.map(room => {
                    const tenants = this.tenants.filter(t => t.roomId === room.id && !t.moveOutDate);
                    const tNames = tenants.map(t => t.name).join(', ') || 'Trống';
                    const curMonth = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; })();
                    const inv = this.invoices.find(i => i.roomId === room.id && i.month === curMonth);
                    const paidBadge = inv ? (inv.paid
                        ? `<span style="font-size:10px;background:var(--success-light);color:var(--success);padding:2px 7px;border-radius:10px;font-weight:700">Đã TT</span>`
                        : `<span style="font-size:10px;background:var(--danger-light);color:var(--danger);padding:2px 7px;border-radius:10px;font-weight:700">Chưa TT</span>`) : '';

                    return `
                    <div class="room-card-item">
                        <div class="room-status-dot ${room.status}"></div>
                        <div class="room-card-body">
                            <div class="room-card-name">${room.name} ${paidBadge}</div>
                            <div class="room-card-meta">
                                <span>Tầng ${room.floor}</span>
                                <span>·</span>
                                <span>${room.area} m²</span>
                            </div>
                            <div class="room-card-tenants">
                                <i data-lucide="user" style="width:11px;height:11px"></i> ${tNames}
                            </div>
                        </div>
                        <div class="room-card-price">${formatVND(room.price)}</div>
                    </div>`;
                }).join('');

                return `
                <div class="floor-group">
                    <div class="floor-label">
                        <i data-lucide="building-2" style="width:12px;height:12px"></i>
                        Tầng ${floor}
                    </div>
                    ${cards}
                </div>`;
            }).join('');

        return `
        <div class="rooms-wrap">
            <div class="room-summary-pills">
                <div class="room-pill occupied">
                    <div class="room-pill-val">${occupied}</div>
                    <div class="room-pill-lbl">Đang thuê</div>
                </div>
                <div class="room-pill available">
                    <div class="room-pill-val">${available}</div>
                    <div class="room-pill-lbl">Còn trống</div>
                </div>
                <div class="room-pill" style="flex:1;border-color:var(--border)">
                    <div class="room-pill-val" style="color:var(--text)">${rooms.length}</div>
                    <div class="room-pill-lbl">Tổng phòng</div>
                </div>
            </div>
            ${floorHTML || '<div class="empty-state"><i data-lucide="door-open"></i><p>Chưa có phòng nào</p></div>'}
        </div>`;
    },

    // ══════════════════════════════
    //  TENANTS
    // ══════════════════════════════
    renderTenants() {
        const hasRoom = this.tenants.filter(t => t.roomId && !t.moveOutDate);
        const noRoom = this.tenants.filter(t => !t.roomId && !t.moveOutDate);
        const checkedOut = this.tenants.filter(t => t.moveOutDate);

        const tabs = [
            { key: 'all', label: 'Tất cả', count: this.tenants.length },
            { key: 'hasRoom', label: 'Đang thuê', count: hasRoom.length },
            { key: 'noRoom', label: 'Chưa gán', count: noRoom.length },
            { key: 'checkedOut', label: 'Đã trả', count: checkedOut.length },
        ];

        const tabsHTML = tabs.map(t => `
            <button class="tenant-tab-btn ${this.tenantFilter === t.key ? 'active' : ''}"
                    onclick="App.setTenantFilter('${t.key}')">
                ${t.label}
                <span class="tenant-tab-count">${t.count}</span>
            </button>`).join('');

        return `
        <div class="tenants-wrap">
            <div class="search-box">
                <span class="search-icon"><i data-lucide="search"></i></span>
                <input type="text" placeholder="Tên, SĐT, biển số xe..."
                       value="${this.tenantSearch}"
                       oninput="App.onTenantSearch(this.value)">
            </div>
            <div class="tenant-tabs">${tabsHTML}</div>
            <div id="tenantCards">${this.renderTenantCards()}</div>
        </div>`;
    },

    renderTenantCards() {
        let tenants = [...this.tenants];

        // Filter by tab
        if (this.tenantFilter === 'hasRoom') tenants = tenants.filter(t => t.roomId && !t.moveOutDate);
        else if (this.tenantFilter === 'noRoom') tenants = tenants.filter(t => !t.roomId && !t.moveOutDate);
        else if (this.tenantFilter === 'checkedOut') tenants = tenants.filter(t => t.moveOutDate);

        // Filter by search
        const q = (this.tenantSearch || '').toLowerCase().trim();
        if (q) {
            tenants = tenants.filter(t =>
                (t.name || '').toLowerCase().includes(q) ||
                (t.phone || '').includes(q) ||
                (t.vehiclePlate || '').toLowerCase().replace(/[^a-z0-9]/g, '').includes(q.replace(/[^a-z0-9]/g, ''))
            );
        }

        if (tenants.length === 0) {
            return `<div class="empty-state">
                <i data-lucide="user-x"></i>
                <p>${q ? 'Không tìm thấy kết quả' : 'Không có người thuê nào'}</p>
            </div>`;
        }

        return tenants.map(t => {
            const room = this.rooms.find(r => r.id === t.roomId);
            let statusBadge, avatarClass = '';

            if (t.moveOutDate) {
                statusBadge = `<span class="tenant-status-badge checkout"><i data-lucide="log-out"></i> Đã trả phòng</span>`;
                avatarClass = 'checkout';
            } else if (t.roomId) {
                statusBadge = `<span class="tenant-status-badge active"><i data-lucide="check-circle"></i> Đang thuê</span>`;
            } else {
                statusBadge = `<span class="tenant-status-badge nroom"><i data-lucide="alert-circle"></i> Chưa gán phòng</span>`;
            }

            const initial = (t.name || '?').trim()[0].toUpperCase();
            const roomBadge = room
                ? `<span class="tenant-room-badge"><i data-lucide="door-open"></i>${room.name}</span>`
                : '';

            const plateBadge = t.vehiclePlate
                ? `<span class="plate-badge"><i data-lucide="bike"></i>${t.vehiclePlate}</span>`
                : '<span style="color:var(--text-muted);font-size:12px">—</span>';

            const moveoutBar = t.moveOutDate
                ? `<div class="tenant-moveout-bar">
                    <i data-lucide="calendar-x"></i>
                    Ngày trả phòng: ${new Date(t.moveOutDate).toLocaleDateString('vi-VN')}
                   </div>` : '';

            return `
            <div class="tenant-card">
                <div class="tenant-card-top">
                    <div class="tenant-avatar ${avatarClass}">${initial}</div>
                    <div class="tenant-info">
                        <div class="tenant-name">${t.name}</div>
                        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
                            ${roomBadge}
                            ${statusBadge}
                        </div>
                    </div>
                </div>

                <div class="tenant-card-grid">
                    <div class="tenant-info-row">
                        <div class="tenant-info-lbl"><i data-lucide="phone"></i> SĐT</div>
                        <div class="tenant-info-val">${t.phone || '—'}</div>
                    </div>
                    <div class="tenant-info-row">
                        <div class="tenant-info-lbl"><i data-lucide="credit-card"></i> CCCD</div>
                        <div class="tenant-info-val">${t.idCard || '—'}</div>
                    </div>
                    <div class="tenant-info-row" style="grid-column:1/-1">
                        <div class="tenant-info-lbl"><i data-lucide="bike"></i> Biển số xe</div>
                        <div class="tenant-info-val">${plateBadge}</div>
                    </div>
                    ${t.moveInDate ? `
                    <div class="tenant-info-row">
                        <div class="tenant-info-lbl"><i data-lucide="calendar"></i> Ngày vào</div>
                        <div class="tenant-info-val">${new Date(t.moveInDate).toLocaleDateString('vi-VN')}</div>
                    </div>` : ''}
                </div>
                ${moveoutBar}
            </div>`;
        }).join('');
    },

    setTenantFilter(filter) {
        this.tenantFilter = filter;
        this.switchTab('tenants');
    },

    onTenantSearch(val) {
        this.tenantSearch = val;
        document.getElementById('tenantCards').innerHTML = this.renderTenantCards();
        refreshIcons();
    },

    // ══════════════════════════════
    //  INVOICES
    // ══════════════════════════════
    renderInvoices() {
        const months = [...new Set(this.invoices.map(i => i.month))]
            .filter(Boolean).sort().reverse();

        if (!this.invoiceMonth || !months.includes(this.invoiceMonth)) {
            this.invoiceMonth = months[0] || null;
        }

        const monthsHTML = months.map(m => `
            <button class="month-chip ${this.invoiceMonth === m ? 'active' : ''}"
                    onclick="App.setInvoiceMonth('${m}')">
                ${formatMonth(m)}
            </button>`).join('');

        const filtered = this.invoices.filter(i => i.month === this.invoiceMonth);
        const paidCount = filtered.filter(i => i.paid).length;
        const unpaidCount = filtered.filter(i => !i.paid).length;

        const cards = filtered.length === 0
            ? `<div class="empty-state"><i data-lucide="receipt"></i><p>Chưa có hóa đơn nào</p></div>`
            : filtered.map(inv => {
                const room = this.rooms.find(r => r.id === inv.roomId);
                const tenantName = inv.tenantNames ||
                    this.tenants.find(t => t.roomId === inv.roomId && !t.moveOutDate)?.name || '—';
                const total = (inv.roomPrice || 0) + (inv.electricCost || 0) +
                    (inv.waterCost || 0) + (inv.serviceCost || 0) - (inv.discount || 0);

                return `
                <div class="inv-card">
                    <div class="inv-card-header">
                        <div>
                            <div class="inv-card-room-num">${room?.name || '—'}</div>
                            <div class="inv-card-tenant-name">${tenantName}</div>
                        </div>
                        <div class="inv-paid-badge ${inv.paid ? 'paid' : 'unpaid'}">
                            <i data-lucide="${inv.paid ? 'check-circle' : 'clock'}"></i>
                            ${inv.paid ? 'Đã TT' : 'Chưa TT'}
                        </div>
                    </div>
                    <div class="inv-card-body">
                        <div class="inv-line">
                            <span class="inv-line-label"><i data-lucide="home"></i> Tiền phòng</span>
                            <span class="inv-line-value">${formatVND(inv.roomPrice || 0)}</span>
                        </div>
                        <div class="inv-line">
                            <span class="inv-line-label"><i data-lucide="zap"></i> Điện (${inv.electricUsage || 0} kWh)</span>
                            <span class="inv-line-value">${formatVND(inv.electricCost || 0)}</span>
                        </div>
                        <div class="inv-line">
                            <span class="inv-line-label"><i data-lucide="droplets"></i> Nước (${inv.waterUsage || 0} m³)</span>
                            <span class="inv-line-value">${formatVND(inv.waterCost || 0)}</span>
                        </div>
                        ${(inv.serviceCost || 0) > 0 ? `
                        <div class="inv-line">
                            <span class="inv-line-label"><i data-lucide="package"></i> Dịch vụ</span>
                            <span class="inv-line-value">${formatVND(inv.serviceCost)}</span>
                        </div>` : ''}
                        ${(inv.discount || 0) > 0 ? `
                        <div class="inv-line">
                            <span class="inv-line-label" style="color:var(--success)"><i data-lucide="tag"></i> Giảm giá</span>
                            <span class="inv-line-value" style="color:var(--success)">-${formatVND(inv.discount)}</span>
                        </div>` : ''}
                    </div>
                    <div class="inv-total-row">
                        <span class="inv-total-label">Tổng cộng</span>
                        <span class="inv-total-value">${formatVND(total)}</span>
                    </div>
                </div>`;
            }).join('');

        return `
        <div class="invoices-wrap">
            <div class="month-filter-row">${monthsHTML || '<div style="color:var(--text-muted);font-size:13px">Chưa có dữ liệu</div>'}</div>

            ${filtered.length > 0 ? `
            <div class="inv-summary-row">
                <div class="inv-summary-chip paid">
                    <div class="inv-summary-val">${paidCount}</div>
                    <div class="inv-summary-lbl">Đã thanh toán</div>
                </div>
                <div class="inv-summary-chip unpaid">
                    <div class="inv-summary-val">${unpaidCount}</div>
                    <div class="inv-summary-lbl">Chưa thanh toán</div>
                </div>
            </div>` : ''}

            ${cards}
        </div>`;
    },

    setInvoiceMonth(month) {
        this.invoiceMonth = month;
        this.switchTab('invoices');
    },
};

// ─── Start ───
document.addEventListener('DOMContentLoaded', async () => {
    await App.init();
});
