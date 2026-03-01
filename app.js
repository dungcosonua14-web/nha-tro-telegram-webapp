/* =============================================
   NHÀ TRỌ EDEN - Telegram Web App
   Ghi dịch vụ phát sinh — Firebase connected
   ============================================= */

// Firebase config (same as desktop app)
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

// ─── Telegram Web App ───
const tg = window.Telegram?.WebApp;

// Safe Lucide icons refresh
function refreshIcons() {
    if (window.lucide && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
}

const App = {
    rooms: [],
    services: [],
    roomServices: [],
    settings: {},
    selectedRoomId: null,
    selectedServiceId: null,
    selectedServiceData: null,

    // ─── Init ───
    async init() {
        // Init Telegram Web App
        if (tg) {
            tg.ready();
            tg.expand();
            tg.enableClosingConfirmation();
        }

        try {
            // Load data from Firebase
            await Promise.all([
                this.loadCollection('rooms'),
                this.loadCollection('services'),
                this.loadCollection('roomServices'),
                this.loadSettings()
            ]);

            this.renderMonthPicker();
            this.renderRooms();
            this.renderServices();
            this.updateStats();

            // Show main screen
            this.switchScreen('mainScreen');
            refreshIcons();
        } catch (err) {
            console.error('Init failed:', err);
            this.toast('Lỗi kết nối Firebase!', 'error');
        }
    },

    // ─── Firebase loaders ───
    async loadCollection(name) {
        const snapshot = await db.collection(name).get();
        const items = [];
        snapshot.forEach(doc => items.push({ ...doc.data(), id: doc.id }));
        this[name] = items;
        console.log(`[Firebase] Loaded ${name}: ${items.length} items`);
    },

    async loadSettings() {
        const doc = await db.collection('settings').doc('main').get();
        this.settings = doc.exists ? doc.data() : {};
    },

    // ─── Screen management ───
    switchScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        // Ensure loading screen is hidden
        document.getElementById('loadingScreen').classList.remove('active');
        if (screenId !== 'loadingScreen') {
            document.getElementById(screenId).classList.add('active');
        }
        refreshIcons();
    },

    showMain() {
        this.switchScreen('mainScreen');
    },

    showHistory() {
        this.renderHistory();
        this.switchScreen('historyScreen');
    },

    // ─── Render Month Picker ───
    renderMonthPicker() {
        const now = new Date();
        const monthSel = document.getElementById('selMonth');
        const yearSel = document.getElementById('selYear');

        monthSel.innerHTML = '';
        for (let m = 1; m <= 12; m++) {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = `Tháng ${m}`;
            if (m === now.getMonth() + 1) opt.selected = true;
            monthSel.appendChild(opt);
        }

        yearSel.innerHTML = '';
        const currentYear = now.getFullYear();
        for (let y = currentYear + 1; y >= currentYear - 2; y--) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            if (y === currentYear) opt.selected = true;
            yearSel.appendChild(opt);
        }
    },

    getSelectedMonth() {
        const m = parseInt(document.getElementById('selMonth').value);
        const y = parseInt(document.getElementById('selYear').value);
        return `${y}-${String(m).padStart(2, '0')}`;
    },

    // ─── Render Rooms ───
    renderRooms() {
        const grid = document.getElementById('roomGrid');
        const occupiedRooms = this.rooms
            .filter(r => r.status === 'occupied')
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi', { numeric: true }));

        if (occupiedRooms.length === 0) {
            grid.innerHTML = '<div style="text-align:center;padding:16px;color:var(--tg-theme-hint-color);font-size:13px">Chưa có phòng đang thuê</div>';
            return;
        }

        // Group by floor
        const floors = {};
        occupiedRooms.forEach(r => {
            const num = (r.name || '').replace(/[^0-9]/g, '');
            const floor = num.length >= 2 ? num[0] : '?';
            if (!floors[floor]) floors[floor] = [];
            floors[floor].push(r);
        });

        let html = '';
        const floorEntries = Object.entries(floors).sort((a, b) => a[0] - b[0]);

        floorEntries.forEach(([floor, fRooms]) => {
            html += `<div class="floor-divider">Tầng ${floor}</div>`;
            fRooms.forEach(room => {
                const tenant = this.getTenantForRoom(room.id);
                const tName = tenant ? this.truncate(tenant.name, 8) : '·';
                html += `
                    <div class="room-chip" data-room-id="${room.id}" onclick="App.selectRoom('${room.id}')">
                        <div class="room-chip-name">${room.name}</div>
                        <div class="room-chip-tenant">${tName}</div>
                    </div>`;
            });
        });

        grid.innerHTML = html;
    },

    getTenantForRoom(roomId) {
        // tenants are loaded along with rooms if available; 
        // fallback: use roomServices or inline. Let's load separately.
        if (!this.tenants) return null;
        return this.tenants.find(t => t.roomId === roomId);
    },

    truncate(str, len) {
        if (!str) return '';
        return str.length > len ? str.substring(0, len) + '…' : str;
    },

    // ─── Render Services ───
    renderServices() {
        const list = document.getElementById('serviceList');
        const svcs = this.services.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));

        if (svcs.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:16px;color:var(--tg-theme-hint-color);font-size:13px">Chưa có dịch vụ nào</div>';
            return;
        }

        list.innerHTML = svcs.map(svc => {
            const icon = svc.icon || 'package';
            const isFixed = svc.chargeType !== 'quantity';
            const typeLabel = isFixed ? 'Cố định' : `Theo SL (${svc.unit})`;
            return `
                <div class="service-item" data-service-id="${svc.id}" onclick="App.selectService('${svc.id}')">
                    <div class="service-item-icon">
                        <i data-lucide="${icon}"></i>
                    </div>
                    <div class="service-item-info">
                        <div class="service-item-name">${svc.name}</div>
                        <div class="service-item-price">${this.formatVND(svc.price)}/${svc.unit} · ${typeLabel}</div>
                    </div>
                    <div class="service-item-check">
                        <i data-lucide="check"></i>
                    </div>
                </div>`;
        }).join('');
    },

    // ─── Selection handlers ───
    selectRoom(roomId) {
        this.selectedRoomId = roomId;
        document.getElementById('selectedRoom').value = roomId;

        // Update visual
        document.querySelectorAll('.room-chip').forEach(chip => {
            chip.classList.toggle('selected', chip.dataset.roomId === roomId);
        });

        // Haptic
        if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();

        this.checkFormReady();
    },

    selectService(serviceId) {
        this.selectedServiceId = serviceId;
        this.selectedServiceData = this.services.find(s => s.id === serviceId);
        document.getElementById('selectedService').value = serviceId;

        // Update visual
        document.querySelectorAll('.service-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.serviceId === serviceId);
        });

        // Show/hide quantity
        const qtyGroup = document.getElementById('qtyGroup');
        if (this.selectedServiceData) {
            const isFixed = this.selectedServiceData.chargeType !== 'quantity';
            if (isFixed) {
                qtyGroup.style.display = 'none';
                document.getElementById('qtyInput').value = 1;
            } else {
                qtyGroup.style.display = 'block';
                document.getElementById('qtyUnit').textContent = `(${this.selectedServiceData.unit})`;
                document.getElementById('qtyInput').value = 1;
                this.updateQtyPreview();
            }
        }

        // Haptic
        if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();

        this.checkFormReady();
        refreshIcons();
    },

    adjustQty(delta) {
        const input = document.getElementById('qtyInput');
        let val = parseFloat(input.value) || 0;
        val = Math.max(0, val + delta);
        input.value = val;
        this.updateQtyPreview();
        if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
    },

    updateQtyPreview() {
        const preview = document.getElementById('qtyPreview');
        const qty = parseFloat(document.getElementById('qtyInput').value) || 0;
        if (this.selectedServiceData && qty > 0) {
            const total = qty * this.selectedServiceData.price;
            preview.textContent = `${qty} × ${this.formatVND(this.selectedServiceData.price)} = ${this.formatVND(total)}`;
        } else {
            preview.textContent = '';
        }
    },

    checkFormReady() {
        const ready = this.selectedRoomId && this.selectedServiceId;
        document.getElementById('submitBtn').disabled = !ready;
    },

    // ─── Submit ───
    async submitForm(e) {
        e.preventDefault();

        if (!this.selectedRoomId || !this.selectedServiceId) {
            this.toast('Vui lòng chọn phòng và dịch vụ!', 'warning');
            return;
        }

        const month = this.getSelectedMonth();
        const qty = parseFloat(document.getElementById('qtyInput').value) || 1;
        const svc = this.selectedServiceData;

        // Create roomService record
        const id = 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
        const data = {
            id: id,
            roomId: this.selectedRoomId,
            serviceId: this.selectedServiceId,
            quantity: qty,
            type: 'onetime',
            month: month,
            createdAt: new Date().toISOString(),
            source: 'telegram-webapp' // Track origin
        };

        try {
            // Write to Firebase
            await db.collection('roomServices').doc(id).set(data);

            // Also sync invoices for this room
            await this.syncInvoiceForRoom(this.selectedRoomId, month, data);

            // Show success
            const room = this.rooms.find(r => r.id === this.selectedRoomId);
            const detail = `${room?.name || '—'} · ${svc?.name || '—'} · SL: ${qty}\n${this.formatVND(qty * (svc?.price || 0))}`;
            this.showSuccess(detail);

            // Haptic
            if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');

            // Update local data
            this.roomServices.push(data);
            this.updateStats();

            // Reset form
            this.resetForm();
        } catch (err) {
            console.error('Submit failed:', err);
            this.toast('Lỗi khi lưu! Thử lại sau.', 'error');
            if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        }
    },

    async syncInvoiceForRoom(roomId, month) {
        try {
            // Find existing invoice for this room+month
            const snapshot = await db.collection('invoices')
                .where('roomId', '==', roomId)
                .where('month', '==', month)
                .get();

            if (snapshot.empty) return; // No invoice to update

            // Calc new service cost
            const rsSnapshot = await db.collection('roomServices')
                .where('roomId', '==', roomId)
                .get();

            let svcCost = 0;
            rsSnapshot.forEach(doc => {
                const rs = doc.data();
                // Include recurring and onetime for this month
                if (rs.type === 'onetime' && rs.month !== month) return;
                const svc = this.services.find(s => s.id === rs.serviceId);
                if (svc) svcCost += svc.price * (rs.quantity || 1);
            });

            // Update each invoice
            snapshot.forEach(async (doc) => {
                const inv = doc.data();
                if (inv.paid) return; // Don't touch paid invoices
                const newTotal = (inv.roomPrice || 0) + (inv.electricCost || 0) + (inv.waterCost || 0) + svcCost;
                await db.collection('invoices').doc(doc.id).update({
                    serviceCost: svcCost,
                    total: newTotal,
                    updatedAt: new Date().toISOString()
                });
                console.log(`[Sync] Updated invoice ${doc.id}: svcCost=${svcCost}, total=${newTotal}`);
            });
        } catch (err) {
            console.warn('[Sync] Invoice sync failed:', err);
        }
    },

    resetForm() {
        this.selectedRoomId = null;
        this.selectedServiceId = null;
        this.selectedServiceData = null;
        document.getElementById('selectedRoom').value = '';
        document.getElementById('selectedService').value = '';
        document.getElementById('qtyInput').value = 1;
        document.getElementById('qtyGroup').style.display = 'none';
        document.getElementById('qtyPreview').textContent = '';
        document.getElementById('submitBtn').disabled = true;

        document.querySelectorAll('.room-chip').forEach(c => c.classList.remove('selected'));
        document.querySelectorAll('.service-item').forEach(s => s.classList.remove('selected'));
    },

    // ─── Success Overlay ───
    showSuccess(detail) {
        document.getElementById('successDetail').textContent = detail;
        document.getElementById('successOverlay').classList.add('active');
        refreshIcons();
        setTimeout(() => {
            document.getElementById('successOverlay').classList.remove('active');
        }, 2000);
    },

    // ─── Stats ───
    updateStats() {
        const occupiedRooms = this.rooms.filter(r => r.status === 'occupied');
        document.getElementById('statRooms').textContent = `${occupiedRooms.length} phòng`;
        document.getElementById('statServices').textContent = `${this.services.length} dịch vụ`;

        const now = new Date();
        const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const thisMonthCount = this.roomServices.filter(rs => rs.type === 'onetime' && rs.month === curMonth).length;
        document.getElementById('statThisMonth').textContent = `${thisMonthCount} PS tháng này`;
    },

    // ─── History ───
    renderHistory() {
        const container = document.getElementById('historyList');

        // Get onetime services sorted by date
        const onetime = this.roomServices
            .filter(rs => rs.type === 'onetime')
            .sort((a, b) => (b.month || '').localeCompare(a.month || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));

        if (onetime.length === 0) {
            container.innerHTML = `
                <div class="history-empty">
                    <i data-lucide="inbox"></i>
                    <p>Chưa có phát sinh nào</p>
                </div>`;
            refreshIcons();
            return;
        }

        // Group by month
        const groups = {};
        onetime.forEach(rs => {
            const m = rs.month || 'unknown';
            if (!groups[m]) groups[m] = [];
            groups[m].push(rs);
        });

        let html = '';
        const now = new Date();
        const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        Object.entries(groups).forEach(([month, items]) => {
            const [y, m] = month.split('-');
            const label = month === curMonth ? 'Tháng này' : `Tháng ${parseInt(m)}/${y}`;
            html += `<div class="history-month-label">${label} (${items.length})</div>`;

            items.forEach(rs => {
                const room = this.rooms.find(r => r.id === rs.roomId);
                const svc = this.services.find(s => s.id === rs.serviceId);
                const icon = svc?.icon || 'package';
                const amount = (svc?.price || 0) * (rs.quantity || 1);
                const date = rs.createdAt ? new Date(rs.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '';
                const source = rs.source === 'telegram-webapp' ? ' · 📱' : '';

                html += `
                    <div class="history-item" data-id="${rs.id}">
                        <div class="history-item-icon">
                            <i data-lucide="${icon}"></i>
                        </div>
                        <div class="history-item-info">
                            <div class="history-item-title">${svc?.name || '—'}</div>
                            <div class="history-item-detail">${room?.name || '—'} · SL: ${rs.quantity}${date ? ' · ' + date : ''}${source}</div>
                        </div>
                        <div class="history-item-amount">${this.formatVND(amount)}</div>
                    </div>`;
            });
        });

        container.innerHTML = html;

        // Update subtitle
        const curMonthItems = groups[curMonth] || [];
        document.getElementById('historySubtitle').textContent =
            `${onetime.length} phát sinh · ${this.formatVND(this.calcTotal(onetime))}`;

        refreshIcons();
    },

    calcTotal(items) {
        return items.reduce((sum, rs) => {
            const svc = this.services.find(s => s.id === rs.serviceId);
            return sum + (svc ? svc.price * (rs.quantity || 1) : 0);
        }, 0);
    },

    // ─── Utilities ───
    formatVND(amount) {
        const n = Number(amount) || 0;
        return new Intl.NumberFormat('vi-VN').format(n) + '₫';
    },

    toast(message, type = 'success') {
        // Remove existing
        document.querySelectorAll('.toast').forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }
};

// ─── Start ───
document.addEventListener('DOMContentLoaded', async () => {
    // Load tenants too for room names
    try {
        const snapshot = await db.collection('tenants').get();
        App.tenants = [];
        snapshot.forEach(doc => App.tenants.push({ ...doc.data(), id: doc.id }));
    } catch (e) {
        App.tenants = [];
    }

    await App.init();

    // Listen for qty changes
    document.getElementById('qtyInput').addEventListener('input', () => {
        App.updateQtyPreview();
    });
});
