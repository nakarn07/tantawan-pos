/**
 * =========================================================================
 * TANTAWAN COFFEE & CAFÉ - SUPABASE CLOUD & REALTIME CLIENT
 * =========================================================================
 * จัดการการเชื่อมต่อฐานข้อมูลบน Cloud, ซิงค์ยอดขาย, และเชื่อมสัญญาณ Realtime
 * ระหว่างหน้าจอผู้ขาย (index.html) และหน้าจอลูกค้า (customer.html) ข้ามอุปกรณ์
 */

const SUPABASE_CONFIG = {
  url: 'https://gvsxlrvgaalotksccyxg.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c3hscnZnYWFsb3Rrc2NjeXhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTY5NTksImV4cCI6MjEwNDk5Mjk1OX0.vVAPzWbYPAVUOeIV3j7YtrWqFSxQUih49Z4gkg-VMHs'
};

let dbClient = null;
let realtimeChannel = null;
let isCloudConnected = false;
let cloudSyncListeners = [];

// 1. INITIALIZE SUPABASE CLIENT
function initSupabase() {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      dbClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        auth: { persistSession: false },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });
      isCloudConnected = true;
      initRealtimeChannel();
      initDbChangeListener();
      notifyCloudStatus(true);
      console.log('✅ Supabase Client Initialized Successfully');
      
      // Auto sync pending orders after init
      setTimeout(syncAllPendingOrders, 1500);
    } catch (err) {
      console.warn('⚠️ Supabase Init Warning:', err);
      isCloudConnected = false;
      notifyCloudStatus(false);
    }
  } else {
    setTimeout(initSupabase, 500);
  }
}

// 2. REALTIME CHANNEL SETUP (ข้ามเครื่อง ข้ามเครือข่าย)
function initRealtimeChannel() {
  if (!dbClient) return;

  try {
    realtimeChannel = dbClient.channel('tantawan-pos-realtime', {
      config: { broadcast: { self: false } }
    });

    realtimeChannel
      .on('broadcast', { event: 'display-event' }, (payload) => {
        if (payload && payload.payload) {
          // ส่งต่อให้ฟังก์ชันหน้าจอลูกค้า handleDisplayEvent
          if (typeof window.handleDisplayEvent === 'function') {
            window.handleDisplayEvent(payload.payload);
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('📡 Connected to Supabase Realtime Channel: tantawan-pos-realtime');
          notifyCloudStatus(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn('📡 Realtime status:', status);
        }
      });
  } catch (err) {
    console.error('Realtime Channel Error:', err);
  }
}

// 2.1 REALTIME DATABASE LISTENER (ซิงค์ยอดขายระหว่างเครื่องแบบเรียลไทม์)
function initDbChangeListener() {
  if (!dbClient) return;

  try {
    dbClient
      .channel('tantawan-db-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        console.log('📡 Realtime DB change received:', payload.eventType);
        if (payload.eventType === 'INSERT' && payload.new) {
          const newOrd = {
            id: payload.new.id,
            orderNumber: payload.new.order_number,
            createdAt: payload.new.created_at,
            dateStr: payload.new.date_str,
            timeStr: payload.new.time_str,
            date: payload.new.date_str,
            time: payload.new.time_str,
            timestamp: new Date(payload.new.created_at).getTime(),
            items: payload.new.items || [],
            subtotal: Number(payload.new.subtotal || 0),
            discount: Number(payload.new.discount || 0),
            total: Number(payload.new.total || 0),
            paymentMethod: payload.new.payment_method || 'cash',
            cashReceived: Number(payload.new.cash_received || 0),
            cashChange: Number(payload.new.change_amount || 0),
            changeAmount: Number(payload.new.change_amount || 0),
            cashierId: payload.new.cashier_id,
            cashierName: payload.new.cashier_name,
            shiftId: payload.new.shift_id,
            notes: payload.new.notes,
            status: payload.new.status || 'completed'
          };
          if (window.orders && !window.orders.some(o => o.id === newOrd.id)) {
            window.orders.unshift(newOrd);
            try {
              localStorage.setItem('coffeeshop_orders', JSON.stringify(window.orders));
            } catch (e) {}
            if (typeof window.renderRecentOrders === 'function') window.renderRecentOrders();
            if (typeof window.calculateReportStats === 'function') window.calculateReportStats();
            if (typeof window.updateDashboardStats === 'function') window.updateDashboardStats();
          }
        }
      })
      .subscribe();
  } catch (err) {
    console.warn('DB Change Listener Error:', err);
  }
}

// 3. BROADCAST DISPLAY EVENTS TO CUSTOMER SCREEN
// ส่งสัญญาณจากแคชเชียร์ไปยังหน้าจอลูกค้า (ทำงานทั้งข้ามเครื่องผ่านเน็ต และในเครื่องเดียวกัน)
function broadcastToCustomerScreen(eventData) {
  if (!eventData) return;

  // 3.1 ส่งผ่าน Supabase Realtime (สำหรับเปิดคนละเครื่อง เช่น iPad แคชเชียร์ + จอลูกค้าหน้าร้าน)
  if (realtimeChannel && isCloudConnected) {
    realtimeChannel.send({
      type: 'broadcast',
      event: 'display-event',
      payload: eventData
    }).catch(err => console.warn('Supabase Realtime Send Error:', err));
  }

  // 3.2 ส่งผ่าน Local BroadcastChannel (สำหรับเปิด 2 จอบน PC เครื่องเดียวกัน ไวสุดไม่พึ่งเน็ต)
  try {
    if (window.__localDisplayChannel) {
      window.__localDisplayChannel.postMessage(eventData);
    }
  } catch (e) {}

  // 3.3 ส่งผ่าน LocalStorage Fallback
  try {
    localStorage.setItem('tantawan_customer_display_event', JSON.stringify({
      ...eventData,
      _syncTimestamp: Date.now()
    }));
  } catch (e) {}
}

// 4. CLOUD DATABASE SYNC: ORDERS (บันทึกและซิงค์บิลขาย)
async function syncOrderToCloud(order) {
  if (!order) return false;

  // เซฟในเครื่อง (Local First) ก่อนเสมอ เพื่อให้ขายได้ตลอดเวลาแม้ออฟไลน์
  try {
    const localOrders = JSON.parse(localStorage.getItem('coffeeshop_orders')) || [];
    const exists = localOrders.some(o => o.id === order.id);
    if (!exists) {
      localOrders.unshift(order);
      localStorage.setItem('coffeeshop_orders', JSON.stringify(localOrders));
    }
  } catch (e) {}

  // หากไม่มี Cloud Client ให้คืนค่าไว้ซิงค์ภายหลัง
  if (!dbClient || !isCloudConnected) {
    markOrderPendingSync(order);
    return false;
  }

  try {
    const row = {
      id: String(order.id),
      order_number: String(order.orderNumber || order.id),
      created_at: order.createdAt || (order.timestamp ? new Date(order.timestamp).toISOString() : new Date().toISOString()),
      date_str: order.dateStr || (order.date ? order.date : new Date().toLocaleDateString('th-TH')),
      time_str: order.timeStr || (order.time ? order.time : new Date().toLocaleTimeString('th-TH')),
      items: order.items || [],
      subtotal: Number(order.subtotal || 0),
      discount: Number(order.discount || 0),
      total: Number(order.total || 0),
      payment_method: order.paymentMethod || 'cash',
      cash_received: Number(order.cashReceived || 0),
      change_amount: Number(order.cashChange || order.changeAmount || 0),
      cashier_id: order.cashierId || 'user-owner',
      cashier_name: order.cashierName || 'เจ้าของร้าน',
      shift_id: order.shiftId || null,
      notes: order.notes || '',
      status: order.status || 'completed'
    };

    const { error } = await dbClient.from('orders').upsert(row);
    if (error) {
      console.warn('⚠️ Order upload failed, queued for retry:', error.message);
      markOrderPendingSync(order);
      return false;
    } else {
      removeOrderPendingSync(order.id);
      console.log('☁️ Order synced to Supabase successfully:', order.id);
      return true;
    }
  } catch (err) {
    console.error('Error syncing order to Supabase:', err);
    markOrderPendingSync(order);
    return false;
  }
}

// คิวสำหรับบิลที่ยังไม่ได้ซิงค์ (ทำงานอัตโนมัติเมื่อกลับมาต่อเน็ต)
function markOrderPendingSync(order) {
  try {
    const pending = JSON.parse(localStorage.getItem('pending_cloud_orders') || '[]');
    if (!pending.some(p => p.id === order.id)) {
      pending.push(order);
      localStorage.setItem('pending_cloud_orders', JSON.stringify(pending));
    }
  } catch (e) {}
}

function removeOrderPendingSync(orderId) {
  try {
    let pending = JSON.parse(localStorage.getItem('pending_cloud_orders') || '[]');
    pending = pending.filter(p => p.id !== orderId);
    localStorage.setItem('pending_cloud_orders', JSON.stringify(pending));
  } catch (e) {}
}

// 5. SYNC ALL PENDING ORDERS WHEN ONLINE
async function syncAllPendingOrders() {
  if (!dbClient || !isCloudConnected) return;

  try {
    const pending = JSON.parse(localStorage.getItem('pending_cloud_orders') || '[]');
    if (pending.length === 0) return;

    console.log(`🔄 Syncing ${pending.length} pending orders to Supabase...`);
    for (const ord of pending) {
      await syncOrderToCloud(ord);
    }
  } catch (e) {}
}

// 6. FETCH ORDERS FROM CLOUD ON STARTUP
async function fetchOrdersFromCloud() {
  if (!dbClient || !isCloudConnected) return null;

  try {
    const { data, error } = await dbClient
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.warn('Could not fetch orders from Supabase:', error.message);
      return null;
    }

    if (Array.isArray(data) && data.length > 0) {
      // แปลงข้อมูลกลับเป็นรูปแบบที่ระบบ POS ใช้
      const formatted = data.map(row => ({
        id: row.id,
        orderNumber: row.order_number,
        createdAt: row.created_at,
        dateStr: row.date_str,
        timeStr: row.time_str,
        date: row.date_str,
        time: row.time_str,
        timestamp: new Date(row.created_at).getTime(),
        items: row.items,
        subtotal: Number(row.subtotal),
        discount: Number(row.discount),
        total: Number(row.total),
        paymentMethod: row.payment_method,
        cashReceived: Number(row.cash_received),
        cashChange: Number(row.change_amount),
        changeAmount: Number(row.change_amount),
        cashierId: row.cashier_id,
        cashierName: row.cashier_name,
        shiftId: row.shift_id,
        notes: row.notes,
        status: row.status
      }));

      // Merge กับ Local
      localStorage.setItem('coffeeshop_orders', JSON.stringify(formatted));
      return formatted;
    }
  } catch (err) {
    console.error('fetchOrdersFromCloud error:', err);
  }
  return null;
}

// 7. SYNC PRODUCTS TO CLOUD
async function syncProductsToCloud(prods) {
  if (!dbClient || !isCloudConnected || !Array.isArray(prods)) return;
  try {
    const rows = prods.map(p => ({
      id: String(p.id),
      name: p.name,
      category: p.category,
      base_price: Number(p.basePrice || 0),
      image: p.image || null,
      option_group_ids: p.optionGroupIds || [],
      has_temp: !!p.hasTemp,
      temp_prices: p.tempPrices || { hot: 0, cold: 5, frappe: 10 },
      has_sweetness: !!p.hasSweetness,
      has_extras: !!p.hasExtras,
      extras: p.extras || [],
      active: p.active !== false
    }));
    await dbClient.from('products').upsert(rows);
    console.log('☁️ Products synced to Supabase');
  } catch (e) {
    console.warn('Sync products error:', e);
  }
}

// 8. SYNC SETTINGS TO CLOUD
async function syncSettingsToCloud(st) {
  if (!dbClient || !isCloudConnected || !st) return;
  try {
    await dbClient.from('shop_settings').upsert({
      key: 'general',
      value: st
    });
    console.log('☁️ Settings synced to Supabase');
  } catch (e) {
    console.warn('Sync settings error:', e);
  }
}

// 9. CLOUD STATUS LISTENER & UI INDICATOR
function onCloudStatusChange(callback) {
  if (typeof callback === 'function') {
    cloudSyncListeners.push(callback);
    callback(isCloudConnected);
  }
}

function notifyCloudStatus(status) {
  isCloudConnected = status;
  const badge = document.getElementById('cloudSyncBadge');
  const dot = document.getElementById('cloudSyncDot');
  const txt = document.getElementById('cloudSyncText');

  if (badge && dot && txt) {
    if (status) {
      badge.className = "px-2 sm:px-2.5 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer";
      badge.title = "Supabase Cloud: เชื่อมต่อสำเร็จ ซิงค์ข้อมูลเรียลไทม์";
      dot.className = "inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
      txt.innerText = "คลาวด์ออนไลน์";
    } else {
      badge.className = "px-2 sm:px-2.5 py-1.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer";
      badge.title = "โหมดออฟไลน์: บันทึกข้อมูลในเครื่องอัตโนมัติ (จะซิงค์ขึ้น Cloud เมื่อต่อเน็ต)";
      dot.className = "inline-block w-2 h-2 rounded-full bg-amber-500";
      txt.innerText = "ออฟไลน์ (เซฟในเครื่อง)";
    }
  }

  cloudSyncListeners.forEach(cb => {
    try { cb(status); } catch (e) {}
  });
}

// ตรวจสอบสถานะเน็ตออนไลน์/ออฟไลน์ของบราวเซอร์
window.addEventListener('online', () => {
  console.log('🌐 Browser went online. Re-checking Supabase & syncing pending orders...');
  initSupabase();
  setTimeout(syncAllPendingOrders, 2000);
});

window.addEventListener('offline', () => {
  console.warn('⚠️ Browser went offline. POS running in Local-Only mode.');
  notifyCloudStatus(false);
});

// เริ่มต้นเชื่อมต่อทันทีที่โหลดสคริปต์
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupabase);
} else {
  initSupabase();
}
