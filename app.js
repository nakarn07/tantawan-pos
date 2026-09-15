/**
 * ==========================================================================
 * CoffeeCraft POS - Application Logic
 * Pure Client-side JS managing state, checkout, database, SVG charts,
 * PromptPay EMVCo QR code calculations, and receipt formatting.
 * ==========================================================================
 */

// Global State
let products = [];
let categories = [];
let optionGroups = [];
let promotions = [];
let orders = [];
let settings = {};
let cart = [];
let heldBills = [];
let pendingRestoreBillId = null;

let currentActiveTab = 'cashier';
let selectedCategory = 'all';
let selectedDateRange = 'today';
let selectedPaymentFilter = 'all'; // 'all', 'cash', 'transfer'
let selectedCashierFilter = 'all'; // 'all' or user.id
let reassignTargetOrderId = null;
let reassignSelectedCashierId = null;

// User Authentication & Role-Based Access Control State
let users = [];
let currentUser = null;
let isScreenLocked = false;
let pinModalTargetUser = null;
let pinCurrentInput = '';
let pinOnSuccessCallback = null;

const DEFAULT_USERS = [
  { id: 'user-owner', name: 'เจ้าของร้าน (Owner)', pin: '1234', role: 'owner', active: true },
  { id: 'user-staff1', name: 'พนักงานกะ 1 (Staff)', pin: '0000', role: 'staff', active: true }
];

// Cashier Cart Discount State
let cartDiscountDetail = { type: 'none', value: 0, name: '', amount: 0 };
let quickDiscountCurrentMode = 'percent'; // 'percent' or 'fixed'

// Modal State
let currentCustomizingProduct = null;
let modalSelectedOptions = {}; // { [groupId]: optionId | [optionId, ...] }
let modalSelectedTemp = null; // Hot, Cold, Frappe (backward compat)
let modalSelectedSweetness = null; // 100%, 50%, 0% (backward compat)
let modalSelectedExtras = []; // Array of extra objects {name, price} (backward compat)
let modalQty = 1;
let modalCustomPrice = null; // Overridden item price (null = standard calculated price)
let modalCustomPriceNote = ''; // Note for overridden item price (e.g. 'แลกแต้ม 10 แก้ว')
let customItemQty = 1; // Quantity for custom / open item modal
let editingCartItemIndex = null; // Index of cart item being edited in editCartItemModal

let checkoutMethod = 'cash';
let checkoutCashReceived = 0;
let currentPreviewOrder = null;
let receiptPreviewSize = '80mm';
let currentProductEditingImage = null; // Base64 data URL for product image
let reportBestSellerCategory = 'all'; // Active category filter for best sellers
let latestProductSalesStats = {}; // Cached product sales stats

// Global constants for legacy extras options (fallback)
const AVAILABLE_EXTRAS = [
  { name: 'เพิ่มช็อตกาแฟ (Extra Shot)', price: 15 },
  { name: 'วิปครีม (Whipped Cream)', price: 15 },
  { name: 'ไข่มุก (Boba)', price: 10 },
  { name: 'คาราเมลซอส (Caramel)', price: 10 },
  { name: 'คอนเลค (Cornflakes)', price: 10 },
  { name: 'บุกน้ำผึ้ง (Honey Jelly)', price: 15 }
];

// Default Data Setup
const DEFAULT_CATEGORIES = ['กาแฟ', 'ชา', 'เครื่องดื่มอื่นๆ', 'รายการอื่นๆ'];

const DEFAULT_OPTION_GROUPS = [
  {
    id: 'optgrp-beans',
    name: 'เมล็ดกาแฟ',
    type: 'single',
    required: true,
    options: [
      { id: 'opt-b-dark', name: 'คั่วเข้ม (Dark Roast)', price: 0 },
      { id: 'opt-b-med', name: 'คั่วกลาง (Medium Roast)', price: 0 },
      { id: 'opt-b-light', name: 'คั่วอ่อน (Light Roast)', price: 10 },
      { id: 'opt-b-spec', name: 'เมล็ดพิเศษ (Specialty Single Origin)', price: 20 }
    ]
  },
  {
    id: 'optgrp-temp',
    name: 'อุณหภูมิ / ประเภท',
    type: 'single',
    required: true,
    options: [
      { id: 'opt-t-1', name: 'ร้อน (Hot)', price: 0 },
      { id: 'opt-t-2', name: 'เย็น (Iced)', price: 5 },
      { id: 'opt-t-3', name: 'ปั่น (Frappe)', price: 10 }
    ]
  },
  {
    id: 'optgrp-sweet',
    name: 'ระดับความหวาน',
    type: 'single',
    required: false,
    options: [
      { id: 'opt-s-0', name: 'หวานมาก (125%)', price: 0 },
      { id: 'opt-s-1', name: 'หวานปกติ (100%)', price: 0 },
      { id: 'opt-s-75', name: 'หวานกำลังดี (75%)', price: 0 },
      { id: 'opt-s-2', name: 'หวานน้อย (50%)', price: 0 },
      { id: 'opt-s-3', name: 'หวานน้อยมาก (25%)', price: 0 },
      { id: 'opt-s-4', name: 'ไม่หวาน (0%)', price: 0 }
    ]
  },
  {
    id: 'optgrp-toppings',
    name: 'ท็อปปิ้ง / ส่วนผสมเพิ่มเติม',
    type: 'multiple',
    required: false,
    options: [
      { id: 'opt-top-honey', name: 'น้ำผึ้งแท้เดือน 5 (Honey)', price: 15 },
      { id: 'opt-top-choco', name: 'ช็อกโกแลตซอสเข้มข้น (Rich Chocolate Sauce)', price: 15 },
      { id: 'opt-top-straw', name: 'ซอสสตรอเบอร์รี่ (Strawberry Sauce)', price: 15 },
      { id: 'opt-top-lemon', name: 'เลมอนสดสไลซ์ (Fresh Lemon)', price: 10 },
      { id: 'opt-top-caramel', name: 'คาราเมลซอส (Caramel)', price: 10 },
      { id: 'opt-top-matcha', name: 'ช็อตมัทฉะแท้ (Matcha Shot)', price: 20 },
      { id: 'opt-top-shot', name: 'เพิ่มช็อตกาแฟ (Extra Shot)', price: 15 },
      { id: 'opt-top-whip', name: 'วิปครีม (Whipped Cream)', price: 15 },
      { id: 'opt-top-boba', name: 'บุกน้ำผึ้ง / ไข่มุก (Honey Jelly / Boba)', price: 10 }
    ]
  }
];

const DEFAULT_PROMOTIONS = [
  { id: 'promo-1', name: 'ส่วนลดเปิดร้านใหม่ 10%', type: 'percent', value: 10 },
  { id: 'promo-2', name: 'ส่วนลดลูกค้าประจำ 15%', type: 'percent', value: 15 },
  { id: 'promo-3', name: 'นำแก้วมาเอง (Eco cup)', type: 'fixed', value: 5 },
  { id: 'promo-4', name: 'ส่วนลดพิเศษท้ายบิล 20 บาท', type: 'fixed', value: 20 }
];

const DEFAULT_PRODUCTS = [
  {
    id: 'prod-1',
    name: 'เอสเพรสโซ่ (Espresso)',
    category: 'กาแฟ',
    basePrice: 35,
    image: 'assets/coffee/hot_espresso.jpg',
    optionGroupIds: ['optgrp-beans', 'optgrp-temp', 'optgrp-sweet', 'optgrp-toppings'],
    hasTemp: true,
    tempPrices: { hot: 0, cold: 15, frappe: 20 },
    hasSweetness: true,
    hasExtras: true,
    extras: ['เพิ่มช็อตกาแฟ (Extra Shot)', 'คาราเมลซอส (Caramel)']
  },
  {
    id: 'prod-2',
    name: 'อเมริกาโน่ (Americano)',
    category: 'กาแฟ',
    basePrice: 40,
    image: 'assets/coffee/iced_americano.jpg',
    optionGroupIds: ['optgrp-beans', 'optgrp-temp', 'optgrp-sweet', 'optgrp-toppings'],
    hasTemp: true,
    tempPrices: { hot: 0, cold: 5, frappe: 10 },
    hasSweetness: true,
    hasExtras: true,
    extras: ['เพิ่มช็อตกาแฟ (Extra Shot)']
  },
  {
    id: 'prod-3',
    name: 'คาปูชิโน่ (Cappuccino)',
    category: 'กาแฟ',
    basePrice: 45,
    image: 'assets/coffee/iced_cappuccino.jpg',
    optionGroupIds: ['optgrp-beans', 'optgrp-temp', 'optgrp-sweet', 'optgrp-toppings'],
    hasTemp: true,
    tempPrices: { hot: 0, cold: 5, frappe: 10 },
    hasSweetness: true,
    hasExtras: true,
    extras: ['เพิ่มช็อตกาแฟ (Extra Shot)', 'วิปครีม (Whipped Cream)']
  },
  {
    id: 'prod-4',
    name: 'ลาเต้ (Latte)',
    category: 'กาแฟ',
    basePrice: 45,
    image: 'assets/coffee/iced_latte.jpg',
    optionGroupIds: ['optgrp-beans', 'optgrp-temp', 'optgrp-sweet', 'optgrp-toppings'],
    hasTemp: true,
    tempPrices: { hot: 0, cold: 5, frappe: 10 },
    hasSweetness: true,
    hasExtras: true,
    extras: ['เพิ่มช็อตกาแฟ (Extra Shot)', 'คาราเมลซอส (Caramel)']
  },
  {
    id: 'prod-12',
    name: 'มอคค่า (Mocha)',
    category: 'กาแฟ',
    basePrice: 45,
    image: 'assets/coffee/iced_mocha.jpg',
    optionGroupIds: ['optgrp-beans', 'optgrp-temp', 'optgrp-sweet', 'optgrp-toppings'],
    hasTemp: true,
    tempPrices: { hot: 0, cold: 5, frappe: 10 },
    hasSweetness: true,
    hasExtras: true,
    extras: ['วิปครีม (Whipped Cream)', 'ช็อกโกแลตซอส (Chocolate)']
  },
  {
    id: 'prod-affogato',
    name: 'อัฟโฟกาโต (Affogato)',
    category: 'กาแฟ',
    basePrice: 65,
    image: 'assets/coffee/iced_affogato.jpg',
    optionGroupIds: ['optgrp-beans', 'optgrp-toppings'],
    hasTemp: false,
    hasSweetness: false,
    hasExtras: true,
    extras: ['เพิ่มช็อตกาแฟ (Extra Shot)', 'คาราเมลซอส (Caramel)']
  },
  {
    id: 'prod-dirty',
    name: 'เดอร์ตี้ (Dirty)',
    category: 'กาแฟ',
    basePrice: 60,
    image: 'assets/coffee/iced_dirty.jpg',
    optionGroupIds: ['optgrp-beans', 'optgrp-sweet', 'optgrp-toppings'],
    hasTemp: false,
    hasSweetness: true,
    hasExtras: true,
    extras: ['เพิ่มช็อตกาแฟ (Extra Shot)']
  },
  {
    id: 'prod-5',
    name: 'ชาเขียวมัทฉะ (Matcha Latte)',
    category: 'ชา',
    basePrice: 70,
    image: 'assets/coffee/iced_matcha.jpg',
    optionGroupIds: ['optgrp-temp', 'optgrp-sweet', 'optgrp-toppings'],
    hasTemp: true,
    tempPrices: { hot: 0, cold: 0, frappe: 5 },
    hasSweetness: true,
    hasExtras: true,
    extras: ['วิปครีม (Whipped Cream)', 'บุกน้ำผึ้ง (Honey Jelly)']
  },
  {
    id: 'prod-6',
    name: 'ชาไทยพรีเมียม (Thai Tea)',
    category: 'ชา',
    basePrice: 40,
    image: 'assets/coffee/thai_tea.png',
    optionGroupIds: ['optgrp-temp', 'optgrp-sweet', 'optgrp-toppings'],
    hasTemp: true,
    tempPrices: { hot: 0, cold: 0, frappe: 5 },
    hasSweetness: true,
    hasExtras: true,
    extras: ['วิปครีม (Whipped Cream)', 'ไข่มุก (Boba)']
  },
  {
    id: 'prod-9',
    name: 'โกโก้เข้มข้น (Cocoa)',
    category: 'เครื่องดื่มอื่นๆ',
    basePrice: 40,
    optionGroupIds: ['optgrp-temp', 'optgrp-sweet', 'optgrp-toppings'],
    hasTemp: true,
    tempPrices: { hot: 0, cold: 0, frappe: 5 },
    hasSweetness: true,
    hasExtras: true,
    extras: ['วิปครีม (Whipped Cream)', 'คาราเมลซอส (Caramel)']
  },
  {
    id: 'prod-11',
    name: 'ชากุหลาบนม (Rose Milk Tea)',
    category: 'ชา',
    basePrice: 50,
    optionGroupIds: ['optgrp-temp', 'optgrp-sweet', 'optgrp-toppings'],
    hasTemp: true,
    tempPrices: { hot: 0, cold: 0, frappe: 5 },
    hasSweetness: true,
    hasExtras: true,
    extras: ['วิปครีม (Whipped Cream)', 'บุกน้ำผึ้ง (Honey Jelly)', 'ไข่มุก (Boba)']
  }
];

const THAI_BANKS = [
  { code: '004', name: 'ธนาคารกสิกรไทย (KBANK)', short: 'กสิกรไทย', color: '#138f2d' },
  { code: '014', name: 'ธนาคารไทยพาณิชย์ (SCB)', short: 'ไทยพาณิชย์', color: '#4e2a84' },
  { code: '002', name: 'ธนาคารกรุงเทพ (BBL)', short: 'กรุงเทพ', color: '#1e3888' },
  { code: '006', name: 'ธนาคารกรุงไทย (KTB)', short: 'กรุงไทย', color: '#00a3e0' },
  { code: '025', name: 'ธนาคารกรุงศรีอยุธยา (BAY)', short: 'กรุงศรี', color: '#8a6500' },
  { code: '011', name: 'ธนาคารทหารไทยธนชาต (TTB)', short: 'ttb', color: '#002d63' },
  { code: '030', name: 'ธนาคารออมสิน (GSB)', short: 'ออมสิน', color: '#eb1985' },
  { code: '034', name: 'ธนาคารเพื่อการเกษตรฯ (ธ.ก.ส.)', short: 'ธ.ก.ส.', color: '#005b38' },
  { code: '024', name: 'ธนาคารยูโอบี (UOB)', short: 'ยูโอบี', color: '#0b2046' },
  { code: '069', name: 'ธนาคารเกียรตินาคินภัทร (KKP)', short: 'เกียรตินาคินภัทร', color: '#194f91' },
  { code: '022', name: 'ธนาคารซีไอเอ็มบีไทย (CIMB)', short: 'CIMB', color: '#7d151a' },
  { code: '073', name: 'ธนาคารแลนด์ แอนด์ เฮ้าส์ (LH Bank)', short: 'LH Bank', color: '#6d6e71' },
  { code: '067', name: 'ธนาคารทิสโก้ (TISCO)', short: 'ทิสโก้', color: '#003399' }
];

const DEFAULT_SETTINGS = {
  shopName: 'ร้านทานตะวัน',
  shopSubtitle: 'TANTAWAN COFFEE & CAFÉ',
  shopPhone: '081-234-5678',
  shopAddress: 'ร้านทานตะวัน TANTAWAN COFFEE & CAFÉ',
  receiptFooter: 'ขอบคุณที่แวะมาเติมความสดใสที่ร้านทานตะวันนะคะ / Thank you',
  promptPayType: 'mobile', // 'mobile', 'bank', 'natid', 'image'
  bankCode: '014',
  bankAccountNo: '1234567890',
  bankAccountName: 'ร้านทานตะวัน',
  promptPayNo: '0812345678',
  bankQrImage: '',
  paperSize: '80mm',
  printQrMode: 'auto', // 'auto', 'always', 'never'
  printLogoMode: 'compact', // 'compact', 'normal', 'hide'
  autoCutFix: true,
  theme: 'dark',
  soundEnabled: true,
  voiceEnabled: true,
  voiceGender: 'female'
};

// --------------------------------------------------------------------------
// THEME MANAGEMENT (DARK / LIGHT THEME)
// --------------------------------------------------------------------------
let currentTheme = localStorage.getItem('coffeeshop_theme') || 'dark';

function initTheme() {
  applyTheme(currentTheme);

  const toggleBtn = document.getElementById('btnThemeToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleTheme);
  }

  const select = document.getElementById('settingsThemeMode');
  if (select) {
    select.addEventListener('change', (e) => onThemeSettingChange(e.target.value));
  }
}

function applyTheme(theme) {
  currentTheme = theme;
  localStorage.setItem('coffeeshop_theme', theme);
  const html = document.documentElement;
  const icon = document.getElementById('themeToggleIcon');
  const select = document.getElementById('settingsThemeMode');

  if (theme === 'dark') {
    html.classList.add('dark');
    if (icon) icon.textContent = '🌙';
    if (select) select.value = 'dark';
  } else {
    html.classList.remove('dark');
    if (icon) icon.textContent = '☀️';
    if (select) select.value = 'light';
  }

  // If reports tab is active, re-render SVG chart with updated theme colors
  if (currentActiveTab === 'reports') {
    const filteredOrders = getFilteredOrders();
    renderSVGChart(filteredOrders);
  }
}

function toggleTheme() {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

function onThemeSettingChange(val) {
  applyTheme(val);
}

// ==========================================================================
// MASTER STORE ACCESS GATE (USERNAME & PASSWORD AUTHENTICATION)
// ==========================================================================
const STORE_MASTER_USERNAME = 'TANTAWANCOFFEE';
const STORE_MASTER_PASSWORD = '07101120';
const STORE_AUTH_STORAGE_KEY = 'tantawan_store_access_v1';

function checkMasterStoreAuth() {
  const overlay = document.getElementById('masterStoreGateOverlay');
  if (!overlay) return;

  const authData = localStorage.getItem(STORE_AUTH_STORAGE_KEY) || sessionStorage.getItem(STORE_AUTH_STORAGE_KEY);
  if (authData) {
    try {
      const parsed = JSON.parse(authData);
      if (parsed && parsed.authenticated === true) {
        overlay.classList.add('hidden');
        return;
      }
    } catch (e) {
      console.error('Failed to parse store auth data:', e);
    }
  }

  // Not authenticated: ensure overlay is visible and focus username
  overlay.classList.remove('hidden');
  setTimeout(() => {
    const userIn = document.getElementById('masterInputUsername');
    if (userIn) userIn.focus();
  }, 150);
}

function handleMasterStoreLogin(e) {
  if (e) e.preventDefault();
  const userIn = document.getElementById('masterInputUsername');
  const passIn = document.getElementById('masterInputPassword');
  const rememberIn = document.getElementById('masterRememberMe');
  const errBox = document.getElementById('masterLoginError');

  const username = (userIn?.value || '').trim().toUpperCase();
  const password = (passIn?.value || '').trim();
  const remember = rememberIn ? rememberIn.checked : true;

  if (username === STORE_MASTER_USERNAME && password === STORE_MASTER_PASSWORD) {
    const payload = JSON.stringify({
      authenticated: true,
      user: username,
      loginAt: Date.now()
    });

    if (remember) {
      localStorage.setItem(STORE_AUTH_STORAGE_KEY, payload);
    } else {
      sessionStorage.setItem(STORE_AUTH_STORAGE_KEY, payload);
    }

    const overlay = document.getElementById('masterStoreGateOverlay');
    if (overlay) overlay.classList.add('hidden');
    if (errBox) errBox.classList.add('hidden');

    showToast('🌻 ยินดีต้อนรับสู่ระบบร้านทานตะวัน (TANTAWAN COFFEE)', 'success');
  } else {
    if (errBox) {
      errBox.innerText = '❌ ชื่อผู้ใช้งานหรือรหัสผ่านร้านค้าไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง';
      errBox.classList.remove('hidden');
    }
    if (passIn) {
      passIn.value = '';
      passIn.focus();
    }
  }
}

function masterStoreLogout() {
  localStorage.removeItem(STORE_AUTH_STORAGE_KEY);
  sessionStorage.removeItem(STORE_AUTH_STORAGE_KEY);
  closeUserDropdown();

  const overlay = document.getElementById('masterStoreGateOverlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    const userIn = document.getElementById('masterInputUsername');
    const passIn = document.getElementById('masterInputPassword');
    const errBox = document.getElementById('masterLoginError');
    if (userIn) { userIn.value = ''; userIn.focus(); }
    if (passIn) passIn.value = '';
    if (errBox) errBox.classList.add('hidden');
  }
  showToast('🔒 ออกจากระบบร้านค้าเรียบร้อยแล้ว กรุณาเข้าสู่ระบบใหม่', 'info');
}

function toggleMasterPasswordVisibility() {
  const passIn = document.getElementById('masterInputPassword');
  const icon = document.getElementById('masterEyeIcon');
  if (!passIn) return;
  if (passIn.type === 'password') {
    passIn.type = 'text';
    if (icon) icon.innerText = '🙈';
  } else {
    passIn.type = 'password';
    if (icon) icon.innerText = '👁️';
  }
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  init();
});

function init() {
  // 1. Check Master Store Access Gate First!
  checkMasterStoreAuth();

  // Initialize theme first (Default Dark Theme)
  initTheme();

  // Load data from LocalStorage
  loadFromLocalStorage();

  // Apply user role permissions (hiding tabs/reports according to owner or staff)
  applyUserRolePermissions();

  // Set default Date Range to 'today'
  setDateRange('today');

  // Render initial layouts
  renderCategoryFilters();
  renderProductsGrid();
  renderMenuConfigTable();
  loadSettingsInputs();
  renderStaffList();
  
  // Set default view tab
  switchTab(currentActiveTab);

  // Initialize Held Bills queue & badge
  updateHeldBillsBadge();
  initHoldBillEvents();
  initPinModalKeyboardEvents();
}

// --------------------------------------------------------------------------
// LOCAL STORAGE DATABASE SYNC
// --------------------------------------------------------------------------
function loadFromLocalStorage() {
  try {
    categories = JSON.parse(localStorage.getItem('coffeeshop_categories')) || DEFAULT_CATEGORIES;
    if (Array.isArray(categories)) {
      categories = categories.filter(c => c !== 'เบเกอรี่');
      if (!categories.includes('รายการอื่นๆ')) {
        categories.push('รายการอื่นๆ');
      }
      saveToStorage('coffeeshop_categories', categories);
    }
    optionGroups = JSON.parse(localStorage.getItem('coffeeshop_option_groups')) || DEFAULT_OPTION_GROUPS;
    promotions = JSON.parse(localStorage.getItem('coffeeshop_promotions')) || DEFAULT_PROMOTIONS;
    products = JSON.parse(localStorage.getItem('coffeeshop_products')) || DEFAULT_PRODUCTS;
    if (Array.isArray(products)) {
      const lenBefore = products.length;
      products = products.filter(p => p.id !== 'prod-7' && p.id !== 'prod-8' && p.category !== 'เบเกอรี่' && !(p.name || '').includes('บลูเบอร์รี่') && !(p.name || '').includes('ครัวซองต์'));
      if (products.length !== lenBefore) {
        saveToStorage('coffeeshop_products', products);
        if (typeof deleteProductFromCloud === 'function') {
          deleteProductFromCloud('prod-7');
          deleteProductFromCloud('prod-8');
        }
      }
    }
    // Auto-migrate products to Tantawan official menu prices if still on legacy mock prices
    if (Array.isArray(products)) {
      let prodsUpdated = false;
      products.forEach(p => {
        if (p.id === 'prod-1' && p.basePrice === 50) {
          p.basePrice = 35;
          p.tempPrices = { hot: 0, cold: 15, frappe: 20 };
          prodsUpdated = true;
        } else if (p.id === 'prod-2' && p.basePrice === 50) {
          p.basePrice = 40;
          p.tempPrices = { hot: 0, cold: 5, frappe: 10 };
          prodsUpdated = true;
        } else if (p.id === 'prod-3' && p.basePrice === 55) {
          p.basePrice = 45;
          p.tempPrices = { hot: 0, cold: 5, frappe: 10 };
          prodsUpdated = true;
        } else if (p.id === 'prod-4' && p.basePrice === 55) {
          p.basePrice = 45;
          p.tempPrices = { hot: 0, cold: 5, frappe: 10 };
          prodsUpdated = true;
        } else if (p.id === 'prod-12' && p.basePrice === 60) {
          p.basePrice = 45;
          p.tempPrices = { hot: 0, cold: 5, frappe: 10 };
          prodsUpdated = true;
        } else if (p.id === 'prod-affogato' && p.basePrice === 70) {
          p.basePrice = 65;
          prodsUpdated = true;
        } else if (p.id === 'prod-dirty' && p.basePrice === 65) {
          p.basePrice = 60;
          prodsUpdated = true;
        } else if (p.id === 'prod-5' && p.basePrice === 60) {
          p.basePrice = 70;
          p.tempPrices = { hot: 0, cold: 0, frappe: 5 };
          prodsUpdated = true;
        } else if (p.id === 'prod-6' && p.basePrice === 50) {
          p.basePrice = 40;
          p.tempPrices = { hot: 0, cold: 0, frappe: 5 };
          prodsUpdated = true;
        } else if (p.id === 'prod-9' && p.basePrice === 50) {
          p.basePrice = 40;
          p.tempPrices = { hot: 0, cold: 0, frappe: 5 };
          prodsUpdated = true;
        }
      });
      if (prodsUpdated) {
        saveToStorage('coffeeshop_products', products);
      }
    }
    orders = JSON.parse(localStorage.getItem('coffeeshop_orders')) || [];
    settings = JSON.parse(localStorage.getItem('coffeeshop_settings')) || DEFAULT_SETTINGS;
    if (settings.shopName && settings.shopName.includes('(TANTAWAN COFFEE & CAFÉ)')) {
      settings.shopName = 'ร้านทานตะวัน';
      settings.shopSubtitle = 'TANTAWAN COFFEE & CAFÉ';
      saveToStorage('coffeeshop_settings', settings);
    }
    heldBills = JSON.parse(localStorage.getItem('coffeeshop_held_bills')) || [];

    // Load users & session
    users = JSON.parse(localStorage.getItem('coffeeshop_users')) || DEFAULT_USERS;
    if (!Array.isArray(users) || users.length === 0) {
      users = JSON.parse(JSON.stringify(DEFAULT_USERS));
    }
    
    // Auto-migrate legacy default PINs so existing browser storage works seamlessly with 1234 and 0000
    users.forEach(u => {
      if (u.id === 'user-owner' && (u.pin === '9999' || !u.pin)) {
        u.pin = '1234';
      }
      if (u.id === 'user-staff1' && (u.pin === '1111' || !u.pin)) {
        u.pin = '0000';
      }
    });

    // Ensure at least one active owner exists
    if (!users.some(u => u.role === 'owner' && u.active !== false)) {
      users.unshift({ id: 'user-owner', name: 'เจ้าของร้าน (Owner)', pin: '1234', role: 'owner', active: true });
    }
    saveToStorage('coffeeshop_users', users);
    
    // Auto-migrate orders to ensure cashier attribution fields exist
    let ordersMigrated = false;
    orders.forEach(o => {
      if (!o.cashierId) {
        o.cashierId = 'user-owner';
        o.cashierName = o.cashierName || 'เจ้าของร้าน (Owner)';
        o.cashierRole = o.cashierRole || 'owner';
        ordersMigrated = true;
      }
    });
    if (ordersMigrated) {
      saveToStorage('coffeeshop_orders', orders);
    }

    const savedUserId = localStorage.getItem('coffeeshop_current_user_id');
    currentUser = users.find(u => u.id === savedUserId && u.active !== false) 
               || users.find(u => u.role === 'owner' && u.active !== false) 
               || users[0];

    window.products = products;
    window.orders = orders;
    window.categories = categories;
    window.users = users;
    window.currentUser = currentUser;

    // Sync remote orders from Supabase on startup
    if (typeof fetchOrdersFromCloud === 'function') {
      fetchOrdersFromCloud().then(cloudOrders => {
        if (cloudOrders && cloudOrders.length > 0) {
          orders = cloudOrders;
          window.orders = orders;
          if (typeof renderRecentOrders === 'function') renderRecentOrders();
          if (typeof calculateReportStats === 'function') calculateReportStats();
          if (typeof updateDashboardStats === 'function') updateDashboardStats();
        }
      }).catch(() => {});
    }

    // Sync remote products from Supabase on startup
    if (typeof fetchProductsFromCloud === 'function') {
      fetchProductsFromCloud().then(cloudProds => {
        if (cloudProds && cloudProds.length > 0) {
          products = cloudProds;
          window.products = products;
          saveToStorage('coffeeshop_products', products);
          if (typeof renderProductsGrid === 'function') renderProductsGrid();
          if (typeof renderMenuConfigTable === 'function') renderMenuConfigTable();
        }
      }).catch(() => {});
    }

    // Sync remote categories from Supabase on startup
    if (typeof fetchCategoriesFromCloud === 'function') {
      fetchCategoriesFromCloud().then(cloudCats => {
        if (cloudCats && cloudCats.length > 0) {
          categories = cloudCats;
          window.categories = categories;
          saveToStorage('coffeeshop_categories', categories);
          if (typeof renderCategoryFilters === 'function') renderCategoryFilters();
          if (typeof renderMenuConfigTable === 'function') renderMenuConfigTable();
        }
      }).catch(() => {});
    }
    
    // Auto-migrate products to optionGroupIds if missing
    let productsMigrated = false;
    products.forEach(p => {
      if (!p.optionGroupIds) {
        p.optionGroupIds = [];
        if (p.hasTemp) p.optionGroupIds.push('optgrp-temp');
        if (p.hasSweetness) p.optionGroupIds.push('optgrp-sweet');
        if (p.hasExtras) p.optionGroupIds.push('optgrp-toppings');
        productsMigrated = true;
      }
    });

    // 1. Remove Pistachio Latte (พิซตาชิโอ้ลาเต้ ฿75) completely from products
    const countBeforeFilter = products.length;
    products = products.filter(p => {
      const n = (p.name || '').toLowerCase();
      return !n.includes('พิซตาชิโอ') && !n.includes('pistachio') && p.id !== 'prod-10';
    });
    if (products.length !== countBeforeFilter) {
      productsMigrated = true;
    }

    // 2. Remove unwanted category 'กาแฟ' if it has no products or was only used by Pistachio Latte
    if (categories && categories.includes('กาแฟ')) {
      const hasCoffeeProducts = products.some(p => p.category === 'กาแฟ');
      if (!hasCoffeeProducts) {
        categories = categories.filter(c => c !== 'กาแฟ');
        saveToStorage('coffeeshop_categories', categories);
        if (typeof selectedCategory !== 'undefined' && selectedCategory === 'กาแฟ') {
          selectedCategory = 'all';
        }
        if (typeof menuConfigSelectedCategory !== 'undefined' && menuConfigSelectedCategory === 'กาแฟ') {
          menuConfigSelectedCategory = 'all';
        }
      }
    }

    // 3. If user doesn't have category 'ชา', do not auto-inject prod-11 into their custom menu
    if (categories && !categories.includes('ชา')) {
      const p11Index = products.findIndex(p => p.id === 'prod-11' && p.category === 'ชา');
      if (p11Index > -1) {
        products.splice(p11Index, 1);
        productsMigrated = true;
      }
    }



    // Auto-migrate option groups if missing honey/lemon/beans
    let optionGroupsMigrated = false;
    let beansGroup = optionGroups.find(g => g.id === 'optgrp-beans' || (g.name && g.name.includes('เมล็ด')));
    if (beansGroup && beansGroup.options) {
      const hasDark = beansGroup.options.some(o => o.name.includes('เข้ม'));
      const hasMed = beansGroup.options.some(o => o.name.includes('กลาง'));
      const hasLight = beansGroup.options.some(o => o.name.includes('อ่อน'));
      if (!hasDark || !hasMed || !hasLight) {
        beansGroup.options = [
          { id: 'opt-b-dark', name: 'คั่วเข้ม (Dark Roast)', price: 0 },
          { id: 'opt-b-med', name: 'คั่วกลาง (Medium Roast)', price: 0 },
          { id: 'opt-b-light', name: 'คั่วอ่อน (Light Roast)', price: 10 },
          { id: 'opt-b-spec', name: 'เมล็ดพิเศษ (Specialty Single Origin)', price: 20 }
        ];
        optionGroupsMigrated = true;
      }
    }
    let toppingsGroup = optionGroups.find(g => g.id === 'optgrp-toppings' || (g.name && (g.name.includes('ท็อป') || g.name.includes('ส่วนผสม'))));
    if (toppingsGroup && toppingsGroup.options) {
      const hasHoney = toppingsGroup.options.some(o => o.name.includes('น้ำผึ้ง'));
      const hasLemon = toppingsGroup.options.some(o => o.name.includes('มะนาว') || o.name.includes('lemon') || o.name.includes('เลมอน'));
      if (!hasHoney || !hasLemon) {
        toppingsGroup.options = [
          { id: 'opt-top-honey', name: 'น้ำผึ้งแท้เดือน 5 (Honey)', price: 15 },
          { id: 'opt-top-choco', name: 'ช็อกโกแลตซอสเข้มข้น (Rich Chocolate Sauce)', price: 15 },
          { id: 'opt-top-straw', name: 'ซอสสตรอเบอร์รี่ (Strawberry Sauce)', price: 15 },
          { id: 'opt-top-lemon', name: 'เลมอนสดสไลซ์ (Fresh Lemon)', price: 10 },
          { id: 'opt-top-caramel', name: 'คาราเมลซอส (Caramel)', price: 10 },
          { id: 'opt-top-matcha', name: 'ช็อตมัทฉะแท้ (Matcha Shot)', price: 20 },
          { id: 'opt-top-shot', name: 'เพิ่มช็อตกาแฟ (Extra Shot)', price: 15 },
          { id: 'opt-top-whip', name: 'วิปครีม (Whipped Cream)', price: 15 },
          { id: 'opt-top-boba', name: 'บุกน้ำผึ้ง / ไข่มุก (Honey Jelly / Boba)', price: 10 }
        ];
        optionGroupsMigrated = true;
      } else {
        // Ensure chocolate & strawberry exist in existing options
        if (!toppingsGroup.options.some(o => o.name.includes('ช็อก') || o.name.includes('ช็อค') || o.name.includes('choco'))) {
          toppingsGroup.options.splice(1, 0, { id: 'opt-top-choco', name: 'ช็อกโกแลตซอสเข้มข้น (Rich Chocolate Sauce)', price: 15 });
          optionGroupsMigrated = true;
        }
        if (!toppingsGroup.options.some(o => o.name.includes('สตรอ') || o.name.includes('straw') || o.name.includes('berry'))) {
          toppingsGroup.options.splice(2, 0, { id: 'opt-top-straw', name: 'ซอสสตรอเบอร์รี่ (Strawberry Sauce)', price: 15 });
          optionGroupsMigrated = true;
        } else {
          // Clean existing strawberry option name from 'สด'
          toppingsGroup.options.forEach(o => {
            if (o.name && o.name.includes('สตรอเบอร์รี่สด')) {
              o.name = o.name.replace('สตรอเบอร์รี่สด', 'ซอสสตรอเบอร์รี่').replace('ซอสซอส', 'ซอส');
              if (o.name.includes('Fresh Strawberry')) {
                o.name = o.name.replace('Fresh Strawberry', 'Strawberry');
              }
              optionGroupsMigrated = true;
            }
          });
        }
      }
    }
    let sweetGroup = optionGroups.find(g => g.id === 'optgrp-sweet' || (g.name && g.name.includes('หวาน')));
    if (sweetGroup && sweetGroup.options) {
      // Deduplicate options that might have duplicate percentages (e.g. two 100% options)
      const seenPcts = new Set();
      const cleanOpts = [];
      sweetGroup.options.forEach(o => {
        const raw = (o.name || '').toLowerCase();
        const m = raw.match(/(\d+)%/);
        const key = m ? m[1] : (raw.includes('ไม่หวาน') ? '0' : raw.trim());
        if (!seenPcts.has(key)) {
          seenPcts.add(key);
          cleanOpts.push(o);
        } else {
          optionGroupsMigrated = true;
        }
      });
      sweetGroup.options = cleanOpts;

      const has125 = sweetGroup.options.some(o => o.name.includes('125%') || o.name.includes('หวานมาก'));
      if (!has125) {
        sweetGroup.options.unshift({ id: 'opt-s-0', name: 'หวานมาก (125%)', price: 0 });
        optionGroupsMigrated = true;
      }

      const has75 = sweetGroup.options.some(o => o.name.includes('75%'));
      if (!has75) {
        const idx100 = sweetGroup.options.findIndex(o => o.name.includes('100%') || o.name.includes('ปกติ'));
        const insertIdx = idx100 >= 0 ? idx100 + 1 : 2;
        sweetGroup.options.splice(insertIdx, 0, { id: 'opt-s-75', name: 'หวานกำลังดี (75%)', price: 0 });
        optionGroupsMigrated = true;
      }
    }
    if (optionGroupsMigrated) {
      saveToStorage('coffeeshop_option_groups', optionGroups);
    }

    // Auto-migrate branding if old default was stored
    if (!settings.shopName || settings.shopName.includes('CoffeeCraft')) {
      settings.shopName = DEFAULT_SETTINGS.shopName;
      if (!settings.shopAddress || settings.shopAddress.includes('สุขุมวิท')) {
        settings.shopAddress = DEFAULT_SETTINGS.shopAddress;
      }
      if (!settings.receiptFooter || settings.receiptFooter.includes('ขอบคุณที่ใช้บริการ')) {
        settings.receiptFooter = DEFAULT_SETTINGS.receiptFooter;
      }
      if (!settings.bankAccountName || settings.bankAccountName === 'ร้าน CoffeeCraft') {
        settings.bankAccountName = DEFAULT_SETTINGS.bankAccountName;
      }
      saveToStorage('coffeeshop_settings', settings);
    }

    // Save defaults to storage if missing
    if (!localStorage.getItem('coffeeshop_categories')) saveToStorage('coffeeshop_categories', categories);
    if (!localStorage.getItem('coffeeshop_option_groups')) saveToStorage('coffeeshop_option_groups', optionGroups);
    if (!localStorage.getItem('coffeeshop_promotions')) saveToStorage('coffeeshop_promotions', promotions);
    if (!localStorage.getItem('coffeeshop_products')) saveToStorage('coffeeshop_products', products);
    if (!localStorage.getItem('coffeeshop_settings')) saveToStorage('coffeeshop_settings', settings);
  } catch (e) {
    console.error('Error loading data from localStorage', e);
    showToast('โหลดข้อมูลไม่สำเร็จเนื่องจากความจุเบราว์เซอร์มีปัญหา', 'error');
  }
}

function saveToStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Storage limit reached!', e);
    showToast('บันทึกข้อมูลล้มเหลว! พื้นที่จัดเก็บเต็ม', 'error');
  }

  // Cloud Sync Hooks
  try {
    if (key === 'coffeeshop_products' && typeof syncProductsToCloud === 'function') {
      syncProductsToCloud(data);
    } else if (key === 'coffeeshop_settings' && typeof syncSettingsToCloud === 'function') {
      syncSettingsToCloud(data);
    }
  } catch (err) {}
}

// --------------------------------------------------------------------------
// TAB VIEW SWITCHING
// --------------------------------------------------------------------------
function switchTab(tabId) {
  // Permission guard for staff
  if (currentUser && currentUser.role !== 'owner') {
    if (['menu', 'promotions', 'settings'].includes(tabId)) {
      showToast('⚠️ สิทธิ์เข้าถึงถูกจำกัด: ส่วนนี้สำหรับเจ้าของร้าน (Owner) เท่านั้น', 'warning');
      promptOwnerPinOverride(() => {
        switchTab(tabId);
      }, 'กรุณาป้อนรหัส PIN ของเจ้าของร้าน (Owner) เพื่อเข้าถึงส่วนนี้');
      return;
    }
  }

  currentActiveTab = tabId;
  
  // Update Tab buttons styling
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.classList.remove('bg-white', 'dark:bg-slate-800', 'text-coffee-700', 'dark:text-amber-400', 'shadow-sm');
    btn.classList.add('text-slate-600', 'dark:text-slate-400', 'hover:text-slate-900', 'dark:hover:text-white');
  });
  
  const activeBtn = document.getElementById(`tab-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.classList.remove('text-slate-600', 'dark:text-slate-400', 'hover:text-slate-900', 'dark:hover:text-white');
    activeBtn.classList.add('bg-white', 'dark:bg-slate-800', 'text-coffee-700', 'dark:text-amber-400', 'shadow-sm');
  }

  // Toggle Tab content sections
  document.getElementById('content-cashier').classList.add('hidden');
  document.getElementById('content-reports').classList.add('hidden');
  document.getElementById('content-menu').classList.add('hidden');
  const promoContent = document.getElementById('content-promotions');
  if (promoContent) promoContent.classList.add('hidden');
  document.getElementById('content-settings').classList.add('hidden');
  
  const targetContent = document.getElementById(`content-${tabId}`);
  if (targetContent) targetContent.classList.remove('hidden');

  // Trigger content-specific re-renders
  if (tabId === 'reports') {
    calculateReportStats();
  } else if (tabId === 'menu') {
    renderMenuConfigTable();
  } else if (tabId === 'promotions') {
    renderPromotionsTab();
  } else if (tabId === 'cashier') {
    renderProductsGrid();
  } else if (tabId === 'settings') {
    renderStaffList();
  }
}

// --------------------------------------------------------------------------
// CASHIER MENU & FILTER LOGIC
// --------------------------------------------------------------------------
function renderCategoryFilters() {
  const container = document.getElementById('categoryContainer');
  container.innerHTML = '';

  // "ทั้งหมด" (All) button
  const allBtn = document.createElement('button');
  allBtn.className = `px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${selectedCategory === 'all' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'}`;
  allBtn.innerText = 'ทั้งหมด';
  allBtn.onclick = () => selectCategory('all');
  container.appendChild(allBtn);

  // Dynamic category pills
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${selectedCategory === cat ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'}`;
    btn.innerText = cat;
    btn.onclick = () => selectCategory(cat);
    container.appendChild(btn);
  });

  // Manage & Sort Categories button at the end
  const manageBtn = document.createElement('button');
  manageBtn.type = 'button';
  manageBtn.className = 'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-dashed border-slate-300 dark:border-slate-700 flex items-center space-x-1 flex-shrink-0';
  manageBtn.title = 'จัดการและจัดเรียงลำดับหมวดหมู่สินค้า';
  manageBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
    </svg>
    <span>จัดเรียงหมวดหมู่</span>
  `;
  manageBtn.onclick = () => openCategoryModal();
  container.appendChild(manageBtn);
}

function selectCategory(catName) {
  selectedCategory = catName;
  renderCategoryFilters();
  renderProductsGrid();
}

function getProductSalesMap() {
  const salesMap = {};
  (orders || []).forEach(ord => {
    (ord.items || []).forEach(it => {
      salesMap[it.id] = (salesMap[it.id] || 0) + (it.qty || 1);
    });
  });
  return salesMap;
}

function filterProducts() {
  renderProductsGrid();
}

function renderProductsGrid() {
  const grid = document.getElementById('productGrid');
  grid.innerHTML = '';
  
  const searchVal = document.getElementById('searchProducts').value.toLowerCase().trim();
  const sortMode = document.getElementById('productSortMode')?.value || 'custom';

  // Filter products by selected category and search input
  let filteredProducts = products.filter(p => {
    const matchesCat = (selectedCategory === 'all') || (p.category === selectedCategory);
    const matchesSearch = p.name.toLowerCase().includes(searchVal) || p.category.toLowerCase().includes(searchVal);
    return matchesCat && matchesSearch;
  });

  // Sort products according to sortMode (default 'custom' keeps products' manual arrangement)
  if (sortMode === 'best-seller') {
    const salesMap = getProductSalesMap();
    filteredProducts.sort((a, b) => {
      const soldA = salesMap[a.id] || 0;
      const soldB = salesMap[b.id] || 0;
      if (soldB !== soldA) return soldB - soldA;
      return a.name.localeCompare(b.name, 'th');
    });
  } else if (sortMode === 'price-asc') {
    filteredProducts.sort((a, b) => a.basePrice - b.basePrice);
  } else if (sortMode === 'price-desc') {
    filteredProducts.sort((a, b) => b.basePrice - a.basePrice);
  } else if (sortMode === 'name-asc') {
    filteredProducts.sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }

  if (filteredProducts.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-400 dark:text-slate-500">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <span class="text-sm">ไม่พบรายการสินค้าที่ค้นหา</span>
      </div>
    `;
    return;
  }

  filteredProducts.forEach(p => {
    const card = document.createElement('div');
    card.onclick = () => handleProductClick(p.id);
    const priceDisplay = Number.isInteger(p.basePrice) ? '฿' + p.basePrice : '฿' + p.basePrice.toFixed(2);

    if (p.image) {
      // 1:1 Aspect Ratio Card WITH Image
      card.className = 'aspect-square rounded-xl relative overflow-hidden cursor-pointer select-none transition-all duration-150 active:scale-95 border border-slate-200 dark:border-slate-800 hover:border-amber-500 hover:shadow-md group flex flex-col justify-between p-2';
      card.innerHTML = `
        <img src="${p.image}" alt="${p.name}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none">
        <div class="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent pointer-events-none"></div>
        
        <!-- Top row: Category tag & Price badge -->
        <div class="relative z-10 flex justify-between items-start w-full pointer-events-none">
          <span class="bg-black/60 backdrop-blur-sm text-[9px] font-semibold text-amber-300 px-1.5 py-0.5 rounded shadow-xs truncate max-w-[60%]">${p.category}</span>
          <span class="bg-amber-500 text-slate-950 text-[11px] font-black px-1.5 py-0.5 rounded shadow-sm">${priceDisplay}</span>
        </div>

        <!-- Bottom row: Product name -->
        <div class="relative z-10 w-full mt-auto pointer-events-none">
          <h4 class="text-xs sm:text-[13px] font-bold text-white leading-tight line-clamp-2 drop-shadow-sm">${p.name}</h4>
        </div>
      `;
    } else {
      // 1:1 Aspect Ratio Card WITHOUT Image (Clean POS Touch Tile)
      card.className = 'aspect-square rounded-xl relative overflow-hidden cursor-pointer select-none transition-all duration-150 active:scale-95 border border-slate-200 dark:border-slate-800 hover:border-amber-500/70 hover:shadow-md group bg-white dark:bg-slate-900 flex flex-col justify-between p-2 sm:p-2.5';
      card.innerHTML = `
        <!-- Top row: Category -->
        <div class="flex justify-between items-center w-full pointer-events-none">
          <span class="text-[9px] sm:text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate max-w-[80%]">${p.category}</span>
          <div class="w-1.5 h-1.5 rounded-full bg-amber-500/60 group-hover:bg-amber-500 transition-colors"></div>
        </div>

        <!-- Center: Product name -->
        <div class="flex-1 flex items-center justify-center text-center my-0.5 pointer-events-none">
          <h4 class="text-xs sm:text-[13px] font-bold text-slate-800 dark:text-slate-100 group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors line-clamp-3 leading-snug">${p.name}</h4>
        </div>

        <!-- Bottom row: Price badge -->
        <div class="w-full pt-1 border-t border-slate-100 dark:border-slate-800/80 flex justify-center items-center pointer-events-none">
          <span class="text-xs sm:text-[13px] font-black text-amber-600 dark:text-amber-400">${priceDisplay}</span>
        </div>
      `;
    }

    grid.appendChild(card);
  });
}

function handleProductClick(productId) {
  const p = products.find(prod => prod.id === productId);
  if (!p) return;

  if (Array.isArray(p.optionGroupIds)) {
    if (p.optionGroupIds.length > 0) {
      openCustomizationModal(p);
    } else {
      addToCartDirectly(p);
    }
    return;
  }

  // Fallback for legacy items without optionGroupIds array
  const hasLegacyOptions = (p.hasTemp || p.hasSweetness || p.hasExtras);
  if (hasLegacyOptions) {
    openCustomizationModal(p);
  } else {
    addToCartDirectly(p);
  }
}

function addToCartDirectly(product) {
  const itemIndex = cart.findIndex(item => 
    item.id === product.id && 
    (!item.selectedOptions || item.selectedOptions.length === 0)
  );

  if (itemIndex > -1) {
    cart[itemIndex].qty += 1;
    cart[itemIndex].itemTotal = cart[itemIndex].qty * cart[itemIndex].pricePerItem;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      basePrice: product.basePrice,
      pricePerItem: product.basePrice,
      selectedOptions: [],
      selectedTemp: null,
      selectedSweetness: null,
      selectedExtras: [],
      qty: 1,
      itemTotal: product.basePrice
    });
  }

  showToast(`เพิ่ม ${product.name} ในตะกร้าแล้ว`);
  renderCart();
}

// --------------------------------------------------------------------------
// DYNAMIC DRINK & PRODUCT CUSTOMIZATION MODAL
// --------------------------------------------------------------------------
function openCustomizationModal(product) {
  currentCustomizingProduct = product;
  modalQty = 1;
  modalSelectedOptions = {};

  // Find linked option groups strictly from product.optionGroupIds
  let linkedGroups = [];
  if (Array.isArray(product.optionGroupIds)) {
    linkedGroups = product.optionGroupIds
      .map(gid => optionGroups.find(g => g.id === gid))
      .filter(Boolean);
    linkedGroups.sort((a, b) => optionGroups.indexOf(a) - optionGroups.indexOf(b));
  } else {
    // Fallback for legacy items that don't have optionGroupIds array defined
    if (product.hasTemp) {
      const gTemp = optionGroups.find(g => g.id === 'optgrp-temp');
      if (gTemp) linkedGroups.push(gTemp);
    }
    if (product.hasSweetness) {
      const gSweet = optionGroups.find(g => g.id === 'optgrp-sweet');
      if (gSweet) linkedGroups.push(gSweet);
    }
    if (product.hasExtras) {
      const gTop = optionGroups.find(g => g.id === 'optgrp-toppings');
      if (gTop) linkedGroups.push(gTop);
    }
  }

  // If there are no linked option groups, add directly to cart without opening modal
  if (linkedGroups.length === 0) {
    addToCartDirectly(product);
    return;
  }

  currentCustomizingProduct._resolvedOptionGroups = linkedGroups;

  // Set default initial selections
  linkedGroups.forEach(group => {
    if (group.type === 'single') {
      modalSelectedOptions[group.id] = (group.options && group.options.length > 0) ? group.options[0].id : null;
    } else {
      modalSelectedOptions[group.id] = [];
    }
  });

  document.getElementById('customModalTitle').innerText = product.name;
  document.getElementById('modalQtyDisplay').innerText = modalQty;

  // Reset price override state & UI
  modalCustomPrice = null;
  modalCustomPriceNote = '';
  const chkCustom = document.getElementById('toggleCustomPriceCheckbox');
  if (chkCustom) chkCustom.checked = false;
  const areaCustom = document.getElementById('modalCustomPriceInputArea');
  if (areaCustom) areaCustom.classList.add('hidden');
  const btnResetCustom = document.getElementById('btnResetModalCustomPrice');
  if (btnResetCustom) btnResetCustom.classList.add('hidden');
  const inpCustomPrice = document.getElementById('modalCustomPriceInput');
  if (inpCustomPrice) inpCustomPrice.value = '';
  const inpCustomNote = document.getElementById('modalCustomPriceNote');
  if (inpCustomNote) inpCustomNote.value = '';

  renderCustomizationModalOptions(linkedGroups);
  updateModalPrice();

  const modal = document.getElementById('customizationModal');
  modal.classList.remove('hidden');
  modal.querySelector('.transform').classList.remove('scale-95');
  modal.querySelector('.transform').classList.add('scale-100');

  // Broadcast to Customer Display in real-time
  if (typeof broadcastCustomerCustomization === 'function') {
    broadcastCustomerCustomization('START', linkedGroups);
  }
}

function getOptionGroupIcon(groupName = '') {
  const gName = (groupName || '').toLowerCase();
  if (gName.includes('เมล็ด') || gName.includes('bean') || gName.includes('roast')) return '🫘';
  if (gName.includes('อุณหภูมิ') || gName.includes('ประเภท') || gName.includes('temp')) return '🌡️';
  if (gName.includes('หวาน') || gName.includes('sweet')) return '🍬';
  if (gName.includes('นม') || gName.includes('milk')) return '🥛';
  if (gName.includes('ท็อป') || gName.includes('ส่วนผสม') || gName.includes('extra') || gName.includes('topping')) return '🍨';
  if (gName.includes('ไซรัป') || gName.includes('ซอส') || gName.includes('รสชาติ') || gName.includes('flavor') || gName.includes('syrup')) return '🍓';
  return '✨';
}

function getOptionItemIcon(optName = '', groupName = '', isSingle = false, prodName = '') {
  const name = (optName || '').toLowerCase();
  const gName = (groupName || '').toLowerCase();
  const pName = (prodName || '').toLowerCase();

  // 1. Strawberry / Berry (สตรอเบอร์รี่)
  if (name.includes('สตรอ') || name.includes('straw') || name.includes('berry') || name.includes('เบอร์รี่')) return '🍓 ';

  // 2. Chocolate / Cocoa (ช็อกโกแลต / ช็อคโกแลต / โกโก้)
  if (name.includes('ช็อก') || name.includes('ช็อค') || name.includes('choco') || name.includes('โกโก้') || name.includes('cocoa')) return '🍫 ';

  // 3. Caramel (คาราเมล) - พุดดิ้งคาราเมล ไม่ปนกับน้ำผึ้ง
  if (name.includes('คาราเมล') || name.includes('caramel')) return '🍮 ';

  // 4. Honey (น้ำผึ้งแท้)
  if (name.includes('น้ำผึ้ง') || name.includes('honey') || name.includes('รังผึ้ง')) return '🍯 ';

  // 5. Lemon / Lime (มะนาว / เลมอนสด)
  if (name.includes('มะนาว') || name.includes('lemon') || name.includes('เลมอน') || name.includes('lime')) return '🍋 ';

  // 6. Orange / Citrus / Yuzu (ส้ม / ยูสุ)
  if (name.includes('ส้ม') || name.includes('orange') || name.includes('ยูสุ') || name.includes('yuzu')) return '🍊 ';

  // 7. Peach (พีช)
  if (name.includes('พีช') || name.includes('peach')) return '🍑 ';

  // 8. Coconut (มะพร้าว)
  if (name.includes('มะพร้าว') || name.includes('coconut')) return '🥥 ';

  // 9. Matcha / Green Tea (มัทฉะ / ชาเขียว)
  if (name.includes('มัทฉะ') || name.includes('ชาเขียว') || name.includes('matcha') || name.includes('green tea')) return '🍵 ';

  // 10. Whipped cream (วิปครีม)
  if (name.includes('วิป') || name.includes('whip') || name.includes('cream')) return '🍦 ';

  // 11. Boba / Jelly (บุกน้ำผึ้ง / ไข่มุก)
  if (name.includes('มุก') || name.includes('บุก') || name.includes('boba') || name.includes('jelly') || name.includes('pearl')) return '🧋 ';

  // 12. Oreo / Cookie / Crumble (คุกกี้ / โอริโอ้)
  if (name.includes('โอริโอ') || name.includes('oreo') || name.includes('คุกกี้') || name.includes('cookie') || name.includes('ครัมเบิล')) return '🍪 ';

  // 13. Cheese / Cream cheese / Cheese foam (ครีมชีส)
  if (name.includes('ชีส') || name.includes('cheese')) return '🧀 ';

  // 14. Mint / Peppermint (มิ้นท์สดชื่น)
  if (name.includes('มิ้นท์') || name.includes('มิ้น') || name.includes('mint')) return '🌿 ';

  // 15. Vanilla (วานิลลา)
  if (name.includes('วานิล') || name.includes('vanilla')) return '🌼 ';

  // 16. Hazelnut / Nuts (เฮเซลนัท / ถั่วอัลมอนด์)
  if (name.includes('เฮเซลนัท') || name.includes('hazelnut') || name.includes('ถั่ว') || name.includes('almond') || name.includes('อัลมอนด์')) return '🌰 ';

  // 17. Milk types (นมโอ๊ต / นมถั่วเหลือง / นมสด)
  if (name.includes('โอ๊ต') || name.includes('oat')) return '🌾 ';
  if (name.includes('ถั่วเหลือง') || name.includes('soy')) return '🫘 ';
  if (name.includes('นม') || name.includes('milk')) return '🥛 ';

  // 18. Espresso Shot / Extra Shot (ช็อตกาแฟ)
  if (name.includes('ช็อต') || name.includes('shot') || name.includes('espresso')) return '☕ ';

  // 18.1 Rose / Floral (กุหลาบ / ไซรัปกุหลาบ)
  if (name.includes('กุหลาบ') || name.includes('rose')) return '🌹 ';

  // 19. Temperature (ร้อน / เย็น / ปั่น)
  if (gName.includes('ประเภท') || gName.includes('อุณหภูมิ') || gName.includes('temp') || name.includes('ร้อน') || name.includes('เย็น') || name.includes('ปั่น') || name.includes('hot') || name.includes('iced') || name.includes('frappe')) {
    if (name.includes('ร้อน') || name.includes('hot')) {
      if ((pName.includes('ชา') || pName.includes('tea') || pName.includes('กุหลาบ') || pName.includes('rose')) && !pName.includes('นมสดแท้')) return '🫖 ';
      if (pName.includes('นม') || pName.includes('milk')) return '🥛 ';
      return '☕ ';
    }
    if (name.includes('ปั่น') || name.includes('frappe')) return '🌪️ ';
    return '🧊 ';
  }

  // 20. Coffee Beans / Roasts (เมล็ดกาแฟ)
  if (gName.includes('เมล็ด') || name.includes('คั่ว') || name.includes('bean') || name.includes('roast')) {
    if (name.includes('เข้ม') || name.includes('dark')) return '🫘 ';
    if (name.includes('กลาง') || name.includes('med')) return '🫘 ';
    if (name.includes('อ่อน') || name.includes('light')) return '🫘 ';
    if (name.includes('พิเศษ') || name.includes('special')) return '✨ ';
    return '🫘 ';
  }

  // 21. Sweetness Level (ระดับความหวาน)
  if (gName.includes('หวาน') || gName.includes('sweet') || name.includes('หวาน') || name.includes('%')) {
    if (name.includes('125%') || name.includes('หวานมาก')) return '🍬 ';
    if (name.includes('100%') || name.includes('ปกติ')) return '🍭 ';
    if (name.includes('75%')) return '✨ ';
    if (name.includes('50%') || name.includes('หวานน้อย')) return '💧 ';
    if (name.includes('25%')) return '🌿 ';
    if (name.includes('0%') || name.includes('ไม่หวาน')) return '🍃 ';
    return '🍬 ';
  }

  return '';
}

function renderCustomizationModalOptions(linkedGroups) {
  const container = document.getElementById('customModalBody');
  container.innerHTML = '';

  if (linkedGroups.length === 0) {
    container.innerHTML = `<p class="text-slate-400 dark:text-slate-500 text-sm text-center py-6">สินค้านี้ไม่มีกลุ่มตัวเลือกที่กำหนดไว้</p>`;
    return;
  }

  linkedGroups.forEach(group => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'space-y-2';

    const reqBadge = group.required
      ? `<span class="text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 px-1.5 py-0.5 rounded font-bold">จำเป็น</span>`
      : `<span class="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-medium">ไม่บังคับ</span>`;
    
    const typeBadge = group.type === 'single'
      ? `<span class="text-[10px] text-slate-500 dark:text-slate-400 font-normal">(เลือก 1 อย่าง)</span>`
      : `<span class="text-[10px] text-slate-500 dark:text-slate-400 font-normal">(เลือกได้หลายอย่าง)</span>`;

    const grpIcon = getOptionGroupIcon(group.name);

    groupDiv.innerHTML = `
      <div class="flex items-center justify-between">
        <label class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
          <span class="text-sm">${grpIcon}</span>
          <span>${group.name}</span>
          ${typeBadge}
        </label>
        ${reqBadge}
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2" id="modalGroupContainer-${group.id}"></div>
    `;
    container.appendChild(groupDiv);

    const itemsContainer = groupDiv.querySelector(`#modalGroupContainer-${group.id}`);
    const currentProdName = (currentCustomizingProduct && currentCustomizingProduct.name) ? currentCustomizingProduct.name : '';

    if (group.type === 'single') {
      group.options.forEach(opt => {
        const isSelected = modalSelectedOptions[group.id] === opt.id;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = `btn-opt-${group.id}-${opt.id}`;
        btn.className = isSelected
          ? 'py-2 px-3 border-2 border-coffee-600 dark:border-amber-500 bg-coffee-50/70 dark:bg-amber-950/40 text-coffee-800 dark:text-amber-200 rounded-xl font-bold text-xs transition text-left flex justify-between items-center shadow-sm'
          : 'py-2 px-3 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl font-medium text-xs transition text-left flex justify-between items-center';

        const priceTag = opt.price > 0 
          ? `<span class="text-[11px] font-bold ${isSelected ? 'text-coffee-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}">+฿${opt.price}</span>` 
          : `<span class="text-[11px] ${isSelected ? 'text-coffee-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}">+฿0</span>`;

        const iconPrefix = getOptionItemIcon(opt.name, group.name, true, currentProdName);

        btn.innerHTML = `
          <span class="truncate pr-1">${iconPrefix}${opt.name}</span>
          ${priceTag}
        `;
        btn.onclick = () => selectModalSingleOption(group.id, opt.id);
        itemsContainer.appendChild(btn);
      });
    } else {
      // Multiple selection cards
      group.options.forEach(opt => {
        const isSelected = (modalSelectedOptions[group.id] || []).includes(opt.id);
        const card = document.createElement('div');
        card.id = `card-opt-${group.id}-${opt.id}`;
        card.className = `p-2 rounded-xl border transition cursor-pointer select-none flex items-center justify-between text-xs ${
          isSelected 
            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 ring-1 ring-amber-300 dark:ring-amber-500/50 font-bold text-amber-950 dark:text-amber-200' 
            : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
        }`;

        const iconPrefix = getOptionItemIcon(opt.name, group.name, false, currentProdName);
        const priceTag = opt.price > 0 ? `+฿${opt.price}` : 'ฟรี';
        card.innerHTML = `
          <div class="flex items-center space-x-2 truncate">
            <input type="checkbox" ${isSelected ? 'checked' : ''} class="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer pointer-events-none">
            <span class="truncate">${iconPrefix}${opt.name}</span>
          </div>
          <span class="font-bold text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap ml-1">${priceTag}</span>
        `;
        card.onclick = () => toggleModalMultiOption(group.id, opt.id);
        itemsContainer.appendChild(card);
      });
    }
  });
}

function selectModalSingleOption(groupId, optId) {
  modalSelectedOptions[groupId] = optId;
  const group = optionGroups.find(g => g.id === groupId);
  if (!group) return;

  group.options.forEach(opt => {
    const btn = document.getElementById(`btn-opt-${groupId}-${opt.id}`);
    if (!btn) return;
    const isSelected = opt.id === optId;
    btn.className = isSelected
      ? 'py-2 px-3 border-2 border-coffee-600 dark:border-amber-500 bg-coffee-50/70 dark:bg-amber-950/40 text-coffee-800 dark:text-amber-200 rounded-xl font-bold text-xs transition text-left flex justify-between items-center shadow-sm'
      : 'py-2 px-3 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl font-medium text-xs transition text-left flex justify-between items-center';

    const priceSpan = btn.querySelector('span:last-child');
    if (priceSpan) {
      if (opt.price > 0) {
        priceSpan.className = `text-[11px] font-bold ${isSelected ? 'text-coffee-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`;
      } else {
        priceSpan.className = `text-[11px] ${isSelected ? 'text-coffee-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`;
      }
    }
  });

  updateModalPrice();
  if (typeof broadcastCustomerCustomization === 'function') {
    broadcastCustomerCustomization('UPDATE');
  }
}

function toggleModalMultiOption(groupId, optId) {
  if (!modalSelectedOptions[groupId]) modalSelectedOptions[groupId] = [];
  const idx = modalSelectedOptions[groupId].indexOf(optId);
  if (idx > -1) {
    modalSelectedOptions[groupId].splice(idx, 1);
  } else {
    modalSelectedOptions[groupId].push(optId);
  }

  const isSelected = modalSelectedOptions[groupId].includes(optId);
  const card = document.getElementById(`card-opt-${groupId}-${optId}`);
  if (card) {
    card.className = `p-2 rounded-xl border transition cursor-pointer select-none flex items-center justify-between text-xs ${
      isSelected 
        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 ring-1 ring-amber-300 dark:ring-amber-500/50 font-bold text-amber-950 dark:text-amber-200' 
        : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
    }`;
    const chk = card.querySelector('input[type="checkbox"]');
    if (chk) chk.checked = isSelected;
  }

  updateModalPrice();
  if (typeof broadcastCustomerCustomization === 'function') {
    broadcastCustomerCustomization('UPDATE');
  }
}

function closeCustomizationModal(isConfirmed = false) {
  const modal = document.getElementById('customizationModal');
  modal.querySelector('.transform').classList.remove('scale-100');
  modal.querySelector('.transform').classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 100);
  if (!isConfirmed && typeof broadcastCustomerCustomization === 'function') {
    broadcastCustomerCustomization('CANCEL');
  }
  currentCustomizingProduct = null;
  modalCustomPrice = null;
  modalCustomPriceNote = '';
}

// --------------------------------------------------------------------------
// PRICE OVERRIDE & POINT REDEMPTION (ปรับราคาเอง / แลกแต้ม ฿0)
// --------------------------------------------------------------------------
function toggleModalCustomPrice(checked) {
  const area = document.getElementById('modalCustomPriceInputArea');
  const btnReset = document.getElementById('btnResetModalCustomPrice');
  const inpPrice = document.getElementById('modalCustomPriceInput');
  const inpNote = document.getElementById('modalCustomPriceNote');

  if (checked) {
    if (area) area.classList.remove('hidden');
    if (btnReset) btnReset.classList.remove('hidden');
    if (inpPrice && (inpPrice.value === '' || isNaN(parseFloat(inpPrice.value)))) {
      // Default input to the standard calculated price
      inpPrice.value = calculateModalItemPrice();
    }
    modalCustomPrice = Math.max(0, parseFloat(inpPrice ? inpPrice.value : 0) || 0);
    modalCustomPriceNote = inpNote ? inpNote.value.trim() : '';
    if (inpPrice) inpPrice.focus();
  } else {
    if (area) area.classList.add('hidden');
    if (btnReset) btnReset.classList.add('hidden');
    modalCustomPrice = null;
    modalCustomPriceNote = '';
    if (inpPrice) inpPrice.value = '';
    if (inpNote) inpNote.value = '';
  }
  updateModalPrice();
  if (typeof broadcastCustomerCustomization === 'function') {
    broadcastCustomerCustomization('UPDATE');
  }
}

function setModalCustomPriceQuick(price, note = '') {
  const chk = document.getElementById('toggleCustomPriceCheckbox');
  const area = document.getElementById('modalCustomPriceInputArea');
  const btnReset = document.getElementById('btnResetModalCustomPrice');
  const inpPrice = document.getElementById('modalCustomPriceInput');
  const inpNote = document.getElementById('modalCustomPriceNote');

  if (chk) chk.checked = true;
  if (area) area.classList.remove('hidden');
  if (btnReset) btnReset.classList.remove('hidden');

  modalCustomPrice = Math.max(0, Number(price));
  if (inpPrice) inpPrice.value = modalCustomPrice;

  if (note) {
    modalCustomPriceNote = note;
    if (inpNote) inpNote.value = note;
  }

  updateModalPrice();
  if (typeof broadcastCustomerCustomization === 'function') {
    broadcastCustomerCustomization('UPDATE');
  }
}

function resetModalCustomPrice() {
  const chk = document.getElementById('toggleCustomPriceCheckbox');
  if (chk) chk.checked = false;
  toggleModalCustomPrice(false);
}

function onModalCustomPriceInput(val) {
  if (val === '' || isNaN(parseFloat(val))) {
    modalCustomPrice = 0;
  } else {
    modalCustomPrice = Math.max(0, parseFloat(val));
  }
  updateModalPrice();
  if (typeof broadcastCustomerCustomization === 'function') {
    broadcastCustomerCustomization('UPDATE');
  }
}

function onModalCustomPriceNoteInput(val) {
  modalCustomPriceNote = (val || '').trim();
}

function adjustModalQty(delta) {
  modalQty = Math.max(1, modalQty + delta);
  document.getElementById('modalQtyDisplay').innerText = modalQty;
  updateModalPrice();
  if (typeof broadcastCustomerCustomization === 'function') {
    broadcastCustomerCustomization('UPDATE');
  }
}

function calculateModalItemPrice() {
  if (modalCustomPrice !== null && !isNaN(modalCustomPrice)) {
    return Math.max(0, modalCustomPrice);
  }
  if (!currentCustomizingProduct) return 0;
  let price = currentCustomizingProduct.basePrice;

  const linkedGroups = currentCustomizingProduct._resolvedOptionGroups || (currentCustomizingProduct.optionGroupIds || [])
    .map(gid => optionGroups.find(g => g.id === gid))
    .filter(Boolean);

  linkedGroups.forEach(group => {
    if (group.type === 'single') {
      const selectedOptId = modalSelectedOptions[group.id];
      if (selectedOptId) {
        const opt = (group.options || []).find(o => o.id === selectedOptId);
        if (opt) price += (opt.price || 0);
      }
    } else {
      const selectedIds = modalSelectedOptions[group.id] || [];
      selectedIds.forEach(id => {
        const opt = (group.options || []).find(o => o.id === id);
        if (opt) price += (opt.price || 0);
      });
    }
  });

  return price;
}

function updateModalPrice() {
  const pricePerItem = calculateModalItemPrice();
  const totalPrice = pricePerItem * modalQty;
  const isCustom = (modalCustomPrice !== null);
  const tag = (pricePerItem === 0 && isCustom) ? ' (ฟรี ฿0.00)' : ` (฿${totalPrice.toFixed(2)})`;
  document.getElementById('modalAddButtonText').innerText = `ใส่ตะกร้า${tag}`;
}

function broadcastCustomerCustomization(action, linkedGroups = null) {
  if (action === 'CANCEL' || action === 'END') {
    if (typeof syncCustomerDisplay === 'function') {
      syncCustomerDisplay('CUSTOMIZE_' + action);
    }
    return;
  }

  if (!currentCustomizingProduct) return;

  let groups = linkedGroups || currentCustomizingProduct._resolvedOptionGroups;
  if (!groups) {
    if (Array.isArray(currentCustomizingProduct.optionGroupIds)) {
      groups = currentCustomizingProduct.optionGroupIds
        .map(gid => optionGroups.find(g => g.id === gid))
        .filter(Boolean);
      groups.sort((a, b) => optionGroups.indexOf(a) - optionGroups.indexOf(b));
    } else {
      groups = [];
      if (currentCustomizingProduct.hasTemp) {
        const gTemp = optionGroups.find(g => g.id === 'optgrp-temp');
        if (gTemp) groups.push(gTemp);
      }
      if (currentCustomizingProduct.hasSweetness) {
        const gSweet = optionGroups.find(g => g.id === 'optgrp-sweet');
        if (gSweet) groups.push(gSweet);
      }
      if (currentCustomizingProduct.hasExtras) {
        const gTop = optionGroups.find(g => g.id === 'optgrp-toppings');
        if (gTop) groups.push(gTop);
      }
    }
  }

  const pricePerItem = calculateModalItemPrice();

  // Create array of selected options for customer display
  const selectedOptionsList = [];
  groups.forEach(group => {
    if (group.type === 'single') {
      const optId = modalSelectedOptions[group.id];
      if (optId) {
        const opt = (group.options || []).find(o => o.id === optId);
        if (opt) {
          selectedOptionsList.push({
            groupId: group.id,
            groupName: group.name,
            optId: opt.id,
            optName: opt.name,
            price: opt.price || 0
          });
        }
      }
    } else {
      const optIds = modalSelectedOptions[group.id] || [];
      optIds.forEach(optId => {
        const opt = (group.options || []).find(o => o.id === optId);
        if (opt) {
          selectedOptionsList.push({
            groupId: group.id,
            groupName: group.name,
            optId: opt.id,
            optName: opt.name,
            price: opt.price || 0
          });
        }
      });
    }
  });

  const payload = {
    action: action,
    product: {
      id: currentCustomizingProduct.id,
      name: currentCustomizingProduct.name,
      category: currentCustomizingProduct.category,
      basePrice: currentCustomizingProduct.basePrice,
      image: currentCustomizingProduct.image || null
    },
    linkedGroups: groups.map(g => ({
      id: g.id,
      name: g.name,
      type: g.type,
      required: g.required,
      options: (g.options || []).map(o => ({
        id: o.id,
        name: o.name,
        price: o.price || 0
      }))
    })),
    selectedOptions: selectedOptionsList,
    selectedOptionsMap: JSON.parse(JSON.stringify(modalSelectedOptions)),
    pricePerItem: pricePerItem,
    totalPrice: pricePerItem * modalQty,
    qty: modalQty
  };

  if (typeof syncCustomerDisplay === 'function') {
    syncCustomerDisplay('CUSTOMIZE_' + action, payload);
  }
}

function addModalItemToCart() {
  if (!currentCustomizingProduct) return;

  const linkedGroups = currentCustomizingProduct._resolvedOptionGroups || (currentCustomizingProduct.optionGroupIds || [])
    .map(gid => optionGroups.find(g => g.id === gid))
    .filter(Boolean);

  // Validate required groups
  for (const group of linkedGroups) {
    if (group.required) {
      if (group.type === 'single' && !modalSelectedOptions[group.id]) {
        showToast(`กรุณาเลือก "${group.name}"`, 'warning');
        return;
      }
      if (group.type === 'multiple' && (!modalSelectedOptions[group.id] || modalSelectedOptions[group.id].length === 0)) {
        showToast(`กรุณาเลือก "${group.name}" อย่างน้อย 1 รายการ`, 'warning');
        return;
      }
    }
  }

  const pricePerItem = calculateModalItemPrice();
  const selectedOptionsList = [];

  linkedGroups.forEach(group => {
    if (group.type === 'single') {
      const optId = modalSelectedOptions[group.id];
      if (optId) {
        const opt = group.options.find(o => o.id === optId);
        if (opt) {
          selectedOptionsList.push({
            groupId: group.id,
            groupName: group.name,
            optId: opt.id,
            optName: opt.name,
            price: opt.price || 0
          });
        }
      }
    } else {
      const optIds = modalSelectedOptions[group.id] || [];
      optIds.forEach(optId => {
        const opt = group.options.find(o => o.id === optId);
        if (opt) {
          selectedOptionsList.push({
            groupId: group.id,
            groupName: group.name,
            optId: opt.id,
            optName: opt.name,
            price: opt.price || 0
          });
        }
      });
    }
  });

  // Backward compatibility fields
  let tempLabel = null;
  let sweetLabel = null;
  const extrasList = [];

  selectedOptionsList.forEach(so => {
    if (so.groupId === 'optgrp-temp') tempLabel = so.optName;
    else if (so.groupId === 'optgrp-sweet') sweetLabel = so.optName;
    else if (so.groupId === 'optgrp-toppings') extrasList.push({ name: so.optName, price: so.price });
  });

  const isCustomPrice = (modalCustomPrice !== null);
  const newCartItem = {
    id: currentCustomizingProduct.id,
    name: currentCustomizingProduct.name,
    category: currentCustomizingProduct.category,
    basePrice: currentCustomizingProduct.basePrice,
    pricePerItem: pricePerItem,
    isCustomPrice: isCustomPrice,
    customPriceNote: isCustomPrice ? modalCustomPriceNote : '',
    selectedOptions: selectedOptionsList,
    selectedTemp: tempLabel,
    selectedSweetness: sweetLabel,
    selectedExtras: extrasList,
    qty: modalQty,
    itemTotal: pricePerItem * modalQty
  };

  // Check if item with exact same options already exists in cart (skip merge if custom price)
  const existingItemIndex = isCustomPrice ? -1 : cart.findIndex(item => {
    if (item.isCustomPrice || item.id !== newCartItem.id) return false;
    const itemOpts = item.selectedOptions || [];
    const newOpts = newCartItem.selectedOptions || [];
    if (itemOpts.length !== newOpts.length) return false;
    return itemOpts.every(io => newOpts.some(no => no.optId === io.optId));
  });

  if (existingItemIndex > -1) {
    cart[existingItemIndex].qty += newCartItem.qty;
    cart[existingItemIndex].itemTotal = cart[existingItemIndex].qty * cart[existingItemIndex].pricePerItem;
  } else {
    cart.push(newCartItem);
  }

  showToast(`เพิ่ม ${newCartItem.name} ในตะกร้าแล้ว`);
  renderCart();
  if (typeof broadcastCustomerCustomization === 'function') {
    broadcastCustomerCustomization('END');
  }
  closeCustomizationModal(true);
}

// --------------------------------------------------------------------------
// MODAL 16: CUSTOM / OPEN ITEM MODAL (เพิ่มเมนูพิเศษ / คีย์ราคาเอง)
// --------------------------------------------------------------------------
function openCustomItemModal() {
  const modal = document.getElementById('customItemModal');
  if (!modal) return;

  // Reset inputs
  document.getElementById('customItemName').value = '';
  document.getElementById('customItemPrice').value = '';
  document.getElementById('customItemNotes').value = '';
  customItemQty = 1;
  const qtyDisplay = document.getElementById('customItemQtyDisplay');
  if (qtyDisplay) qtyDisplay.innerText = '1';

  // Populate categories
  const catSelect = document.getElementById('customItemCategory');
  if (catSelect) {
    const existingCats = categories && categories.length > 0 ? [...categories] : [...DEFAULT_CATEGORIES];
    if (!existingCats.includes('รายการอื่นๆ')) {
      existingCats.push('รายการอื่นๆ');
    }
    if (!existingCats.includes('เมนูพิเศษ')) {
      existingCats.push('เมนูพิเศษ');
    }
    let opts = existingCats.map(c => `<option value="${c}">${c}</option>`).join('');
    catSelect.innerHTML = opts;
  }

  modal.classList.remove('hidden');
  const inner = modal.querySelector('.animate-scale-up') || modal.children[0];
  if (inner) {
    inner.classList.remove('scale-95');
    inner.classList.add('scale-100');
  }

  setTimeout(() => {
    const nameInp = document.getElementById('customItemName');
    if (nameInp) nameInp.focus();
  }, 150);
}

function closeCustomItemModal() {
  const modal = document.getElementById('customItemModal');
  if (!modal) return;
  modal.classList.add('hidden');
}

function setCustomItemPreset(name, category = 'รายการอื่นๆ', defaultPrice = 0) {
  const nameInp = document.getElementById('customItemName');
  if (nameInp) {
    nameInp.value = name;
  }

  if (category) {
    const catSelect = document.getElementById('customItemCategory');
    if (catSelect) {
      let hasOpt = Array.from(catSelect.options).some(o => o.value === category);
      if (!hasOpt) {
        const newOpt = document.createElement('option');
        newOpt.value = category;
        newOpt.innerText = category;
        catSelect.appendChild(newOpt);
      }
      catSelect.value = category;
    }
  }

  if (defaultPrice !== null && defaultPrice !== undefined) {
    const priceInp = document.getElementById('customItemPrice');
    if (priceInp) {
      priceInp.value = defaultPrice;
    }
  } else {
    const priceInp = document.getElementById('customItemPrice');
    if (priceInp && priceInp.value === '') {
      priceInp.focus();
    }
  }
}

function setCustomItemNamePreset(name, category = null, defaultPrice = null) {
  setCustomItemPreset(name, category, defaultPrice);
}

function setCustomItemPricePreset(price) {
  const priceInp = document.getElementById('customItemPrice');
  if (priceInp) {
    priceInp.value = price;
  }
}

function adjustCustomItemQty(delta) {
  customItemQty = Math.max(1, (customItemQty || 1) + delta);
  const qtyDisplay = document.getElementById('customItemQtyDisplay');
  if (qtyDisplay) qtyDisplay.innerText = customItemQty;
}

function addCustomItemToCart() {
  const nameInp = document.getElementById('customItemName');
  const priceInp = document.getElementById('customItemPrice');
  const catSelect = document.getElementById('customItemCategory');
  const notesInp = document.getElementById('customItemNotes');

  const name = (nameInp ? nameInp.value : '').trim();
  if (!name) {
    showToast('กรุณากรอกชื่อเมนูหรือรายการสินค้า', 'warning');
    if (nameInp) nameInp.focus();
    return;
  }

  const priceValStr = priceInp ? priceInp.value.trim() : '';
  if (priceValStr === '' || isNaN(parseFloat(priceValStr))) {
    showToast('กรุณาระบุราคาต่อหน่วย (สามารถใส่ ฿0 ได้)', 'warning');
    if (priceInp) priceInp.focus();
    return;
  }

  const price = Math.max(0, parseFloat(priceValStr));
  const category = catSelect ? catSelect.value : 'เมนูพิเศษ';
  const notes = notesInp ? notesInp.value.trim() : '';
  const qty = customItemQty || 1;

  const customItem = {
    id: 'custom-' + Date.now().toString().slice(-6),
    name: name,
    category: category,
    basePrice: price,
    pricePerItem: price,
    isCustomItem: true,
    isCustomPrice: true,
    customPriceNote: notes,
    customNotes: notes,
    selectedOptions: notes ? [{ optName: notes, price: 0 }] : [],
    qty: qty,
    itemTotal: price * qty
  };

  cart.push(customItem);
  showToast(`เพิ่ม ${name} ในตะกร้าเรียบร้อย`);
  renderCart();
  closeCustomItemModal();
}

// --------------------------------------------------------------------------
// MODAL 17: EDIT CART ITEM MODAL (แก้ไขราคา & หมายเหตุในตะกร้า)
// --------------------------------------------------------------------------
function openEditCartItemModal(index) {
  if (index < 0 || index >= cart.length) return;
  editingCartItemIndex = index;
  const item = cart[index];

  const modal = document.getElementById('editCartItemModal');
  if (!modal) return;

  document.getElementById('editCartItemSubtitle').innerText = `ปรับราคาหรือระบุแลกแต้ม`;
  document.getElementById('editCartItemName').innerText = `${item.name} (${item.qty} ชิ้น)`;

  let mods = [];
  if (item.selectedOptions && item.selectedOptions.length > 0) {
    mods = item.selectedOptions.map(o => o.optName + (o.price > 0 ? ` (+฿${o.price})` : ''));
  } else {
    if (item.selectedTemp) mods.push(item.selectedTemp);
    if (item.selectedSweetness) mods.push(`หวาน ${item.selectedSweetness}`);
    (item.selectedExtras || []).forEach(e => mods.push(`+ ${e.name}`));
  }
  document.getElementById('editCartItemModifiers').innerText = mods.length > 0 ? mods.join(', ') : (item.customNotes || 'ไม่มีตัวเลือกเสริม');

  document.getElementById('editCartItemPriceInput').value = item.pricePerItem;
  document.getElementById('editCartItemNoteInput').value = item.customPriceNote || item.customNotes || '';
  document.getElementById('editCartItemQtyDisplay').innerText = item.qty;

  modal.classList.remove('hidden');
  const inner = modal.querySelector('.animate-scale-up') || modal.children[0];
  if (inner) {
    inner.classList.remove('scale-95');
    inner.classList.add('scale-100');
  }

  setTimeout(() => {
    document.getElementById('editCartItemPriceInput').focus();
  }, 150);
}

function closeEditCartItemModal() {
  const modal = document.getElementById('editCartItemModal');
  if (!modal) return;
  modal.classList.add('hidden');
  editingCartItemIndex = null;
}

function setEditCartItemPrice(price, note = '') {
  document.getElementById('editCartItemPriceInput').value = price;
  if (note) {
    document.getElementById('editCartItemNoteInput').value = note;
  }
}

function resetEditCartItemPrice() {
  if (editingCartItemIndex === null || !cart[editingCartItemIndex]) return;
  const item = cart[editingCartItemIndex];
  
  const prod = products.find(p => p.id === item.id);
  if (prod) {
    let origPrice = prod.basePrice;
    (item.selectedOptions || []).forEach(opt => {
      origPrice += (opt.price || 0);
    });
    document.getElementById('editCartItemPriceInput').value = origPrice;
  } else {
    document.getElementById('editCartItemPriceInput').value = item.basePrice || 0;
  }
  document.getElementById('editCartItemNoteInput').value = '';
}

function adjustEditCartItemQty(delta) {
  const qtyEl = document.getElementById('editCartItemQtyDisplay');
  let currentQty = parseInt(qtyEl.innerText, 10) || 1;
  currentQty = Math.max(1, currentQty + delta);
  qtyEl.innerText = currentQty;
}

function saveEditCartItem() {
  if (editingCartItemIndex === null || !cart[editingCartItemIndex]) return;
  const item = cart[editingCartItemIndex];

  const priceValStr = document.getElementById('editCartItemPriceInput').value;
  if (priceValStr === '' || isNaN(parseFloat(priceValStr))) {
    showToast('กรุณาระบุราคาต่อชิ้น (ใส่ ฿0 ได้)', 'warning');
    return;
  }

  const newPrice = Math.max(0, parseFloat(priceValStr));
  const newNote = (document.getElementById('editCartItemNoteInput').value || '').trim();
  const newQty = parseInt(document.getElementById('editCartItemQtyDisplay').innerText, 10) || 1;

  item.pricePerItem = newPrice;
  item.qty = Math.max(1, newQty);
  item.itemTotal = item.pricePerItem * item.qty;
  item.isCustomPrice = true;
  item.customPriceNote = newNote;
  if (newNote) {
    item.customNotes = newNote;
  }

  renderCart();
  closeEditCartItemModal();
  showToast(`อัปเดต ${item.name} ในตะกร้าแล้ว`);
}

// --------------------------------------------------------------------------
// CART SIDE-PANEL LOGIC
// --------------------------------------------------------------------------
function renderCart() {
  const listContainer = document.getElementById('cartItemsList');
  listContainer.innerHTML = '';

  const badgeCount = document.getElementById('cartBadgeCount');
  const totalItemsCount = cart.reduce((total, item) => total + item.qty, 0);
  
  if (badgeCount) {
    badgeCount.innerText = totalItemsCount;
    if (totalItemsCount > 0) {
      badgeCount.classList.remove('hidden');
    } else {
      badgeCount.classList.add('hidden');
    }
  }

  if (cart.length === 0) {
    listContainer.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 py-12">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
        <span class="text-sm font-medium">ไม่มีสินค้าในตะกร้า</span>
      </div>
    `;
    updateCartSummary();
    return;
  }

  cart.forEach((item, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'pt-3 first:pt-0 pb-3 flex flex-col space-y-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0 animate-slide-in';
    
    // Compile modifiers list
    let modifiersText = [];
    if (item.selectedOptions && item.selectedOptions.length > 0) {
      modifiersText = item.selectedOptions.map(o => {
        return o.optName.split(' ')[0] + (o.price > 0 ? ` (+฿${o.price})` : '');
      });
    } else {
      if (item.selectedTemp) modifiersText.push(item.selectedTemp);
      if (item.selectedSweetness) modifiersText.push(`หวาน ${item.selectedSweetness}`);
      (item.selectedExtras || []).forEach(e => modifiersText.push(`+ ${e.name.split(' ')[0]}`));
    }
    
    const modsHtml = modifiersText.length > 0
      ? `<span class="text-xs text-slate-400 dark:text-slate-500 font-medium leading-tight block">${modifiersText.join(', ')}</span>`
      : '';

    const zeroBahtBadge = (item.pricePerItem === 0)
      ? `<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-black bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 ml-1">🎁 แลกแต้ม/ฟรี</span>`
      : '';

    const customNoteHtml = (item.customPriceNote || item.customNotes)
      ? `<span class="text-[11px] text-amber-700 dark:text-amber-400 font-medium italic block">📝 ${item.customPriceNote || item.customNotes}</span>`
      : '';

    itemEl.innerHTML = `
      <div class="flex justify-between items-start">
        <div class="space-y-0.5 max-w-[70%]">
          <div class="flex items-center flex-wrap gap-1">
            <h5 class="font-bold text-slate-900 dark:text-slate-100 text-sm leading-tight">${item.name}</h5>
            ${zeroBahtBadge}
          </div>
          ${modsHtml}
          ${customNoteHtml}
        </div>
        <div class="text-right">
          <span class="font-bold ${item.pricePerItem === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-coffee-700 dark:text-amber-400'} text-sm">฿${item.itemTotal.toFixed(2)}</span>
          ${item.qty > 1 ? `<div class="text-[10px] text-slate-400 dark:text-slate-500">@฿${item.pricePerItem.toFixed(2)}</div>` : ''}
        </div>
      </div>
      <div class="flex justify-between items-center pt-0.5">
        <!-- Item action buttons: Edit & Delete -->
        <div class="flex items-center space-x-1">
          <button type="button" onclick="openEditCartItemModal(${index})" title="แก้ไขราคา / หมายเหตุ / แลกแต้ม" class="text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 p-1 rounded hover:bg-amber-50 dark:hover:bg-amber-950/40 transition">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onclick="removeCartItem(${index})" title="ลบออกจากตะกร้า" class="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        <!-- Qty Incrementers -->
        <div class="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
          <button onclick="adjustCartQty(${index}, -1)" class="w-6 h-6 flex items-center justify-center font-bold text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-md transition">-</button>
          <span class="font-bold text-xs text-slate-900 dark:text-slate-100 w-5 text-center">${item.qty}</span>
          <button onclick="adjustCartQty(${index}, 1)" class="w-6 h-6 flex items-center justify-center font-bold text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-md transition">+</button>
        </div>
      </div>
    `;
    listContainer.appendChild(itemEl);
  });

  updateCartSummary();
}

function adjustCartQty(index, delta) {
  if (index < 0 || index >= cart.length) return;
  cart[index].qty = Math.max(1, cart[index].qty + delta);
  cart[index].itemTotal = cart[index].qty * cart[index].pricePerItem;
  renderCart();
}

function removeCartItem(index) {
  if (index < 0 || index >= cart.length) return;
  const name = cart[index].name;
  cart.splice(index, 1);
  renderCart();
  showToast(`ลบ ${name} ออกจากตะกร้าเรียบร้อย`);
}

function clearCart() {
  cart = [];
  cartDiscountDetail = { type: 'none', value: 0, name: '', amount: 0 };
  renderCart();
  showToast('ล้างรายการตะกร้าสินค้าทั้งหมดแล้ว');
}

function getCartCalculation() {
  const subtotal = cart.reduce((sum, item) => sum + item.itemTotal, 0);
  let discount = 0;

  if (cartDiscountDetail.type === 'percent' && cartDiscountDetail.value > 0) {
    discount = Math.round((subtotal * (cartDiscountDetail.value / 100)) * 100) / 100;
  } else if (cartDiscountDetail.type === 'fixed' && cartDiscountDetail.value > 0) {
    discount = Math.min(subtotal, cartDiscountDetail.value);
  }

  discount = Math.min(subtotal, Math.max(0, discount));
  cartDiscountDetail.amount = discount;
  const total = Math.max(0, subtotal - discount);

  return { subtotal, discount, total };
}

function updateCartSummary() {
  const { subtotal, discount, total } = getCartCalculation();
  document.getElementById('cartSubtotal').innerText = `฿${subtotal.toFixed(2)}`;
  document.getElementById('cartTotal').innerText = `฿${total.toFixed(2)}`;

  const discountAmountEl = document.getElementById('cartDiscountAmountDisplay');
  if (discountAmountEl) {
    discountAmountEl.innerText = discount > 0 ? `-฿${discount.toFixed(2)}` : '฿0.00';
  }

  const discountTag = document.getElementById('cartDiscountTag');
  if (discountTag) {
    if (discount > 0 && cartDiscountDetail.type !== 'none') {
      discountTag.classList.remove('hidden');
      if (cartDiscountDetail.type === 'percent') {
        discountTag.innerText = `${cartDiscountDetail.value}%`;
      } else {
        discountTag.innerText = `-${cartDiscountDetail.value}฿`;
      }
      if (cartDiscountDetail.name) {
        discountTag.title = cartDiscountDetail.name;
      }
    } else {
      discountTag.classList.add('hidden');
    }
  }

  // Update button states
  const btnHoldBill = document.getElementById('btnHoldBill');
  const btnCheckout = document.getElementById('btnCheckout');
  if (btnHoldBill) btnHoldBill.disabled = (cart.length === 0);
  if (btnCheckout) btnCheckout.disabled = (cart.length === 0);

  // Synchronize cart with customer-facing display in real-time
  if (typeof syncCustomerDisplay === 'function') {
    syncCustomerDisplay('CART_UPDATE');
  }
}

// --------------------------------------------------------------------------
// QUICK DISCOUNT MODAL LOGIC (CASHIER CART)
// --------------------------------------------------------------------------
function openQuickDiscountModal() {
  if (cart.length === 0) {
    showToast('ไม่มีสินค้าในตะกร้าสำหรับคำนวณส่วนลด', 'warning');
    return;
  }

  // Pre-fill with active discount if set
  if (cartDiscountDetail.type === 'percent' || cartDiscountDetail.type === 'fixed') {
    quickDiscountCurrentMode = cartDiscountDetail.type;
    document.getElementById('quickDiscountValueInput').value = cartDiscountDetail.value;
  } else {
    quickDiscountCurrentMode = 'percent';
    document.getElementById('quickDiscountValueInput').value = 0;
  }

  setQuickDiscountMode(quickDiscountCurrentMode, false);
  renderQuickDiscountPresets();
  previewQuickDiscount();

  const modal = document.getElementById('quickDiscountModal');
  modal.classList.remove('hidden');
  modal.querySelector('.transform').classList.remove('scale-95');
  modal.querySelector('.transform').classList.add('scale-100');
  
  setTimeout(() => {
    document.getElementById('quickDiscountValueInput').select();
  }, 100);
}

function closeQuickDiscountModal() {
  const modal = document.getElementById('quickDiscountModal');
  modal.querySelector('.transform').classList.remove('scale-100');
  modal.querySelector('.transform').classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 100);
}

function setQuickDiscountMode(mode, resetValue = false) {
  quickDiscountCurrentMode = mode;
  const btnPercent = document.getElementById('btn-quick-disc-percent');
  const btnFixed = document.getElementById('btn-quick-disc-fixed');
  const label = document.getElementById('quickDiscountInputLabel');
  const unitTag = document.getElementById('quickDiscountUnitTag');
  const valInput = document.getElementById('quickDiscountValueInput');

  if (mode === 'percent') {
    btnPercent.className = 'py-2 text-xs font-bold rounded-lg transition bg-white dark:bg-slate-800 text-coffee-700 dark:text-amber-400 shadow-sm';
    btnFixed.className = 'py-2 text-xs font-bold rounded-lg transition text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white';
    label.innerText = 'ระบุเปอร์เซ็นต์ส่วนลด (%)';
    unitTag.innerText = '%';
    valInput.max = 100;
  } else {
    btnPercent.className = 'py-2 text-xs font-bold rounded-lg transition text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white';
    btnFixed.className = 'py-2 text-xs font-bold rounded-lg transition bg-white dark:bg-slate-800 text-coffee-700 dark:text-amber-400 shadow-sm';
    label.innerText = 'ระบุจำนวนเงินส่วนลด (บาท)';
    unitTag.innerText = '฿';
    valInput.removeAttribute('max');
  }

  if (resetValue) {
    valInput.value = '';
  }

  previewQuickDiscount();
}

function previewQuickDiscount() {
  const subtotal = cart.reduce((sum, item) => sum + item.itemTotal, 0);
  const inputVal = parseFloat(document.getElementById('quickDiscountValueInput').value) || 0;
  let previewAmount = 0;

  if (quickDiscountCurrentMode === 'percent') {
    previewAmount = Math.round((subtotal * (Math.min(100, Math.max(0, inputVal)) / 100)) * 100) / 100;
  } else {
    previewAmount = Math.min(subtotal, Math.max(0, inputVal));
  }

  const previewText = document.getElementById('quickDiscountPreviewText');
  if (previewText) {
    previewText.innerText = `คำนวณส่วนลด: -฿${previewAmount.toFixed(2)} (ยอดรวมหลังลด ฿${Math.max(0, subtotal - previewAmount).toFixed(2)})`;
  }
}

function renderQuickDiscountPresets() {
  const container = document.getElementById('quickDiscountPresetsContainer');
  container.innerHTML = '';

  if (promotions.length === 0) {
    container.innerHTML = `<span class="col-span-2 text-center text-xs text-slate-400 dark:text-slate-500 py-3">ยังไม่มีโปรโมชั่นที่บันทึกไว้ในแท็บ "โปรโมชั่น"</span>`;
    return;
  }

  promotions.forEach(promo => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isPercent = promo.type === 'percent';
    const valTag = isPercent ? `${promo.value}%` : `฿${promo.value}`;
    const badgeColor = isPercent ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200' : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200';

    btn.className = 'p-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 hover:border-amber-400 rounded-xl text-left transition flex items-center justify-between group';
    btn.onclick = () => applyPresetDiscount(promo.id);

    btn.innerHTML = `
      <div class="truncate max-w-[140px]">
        <div class="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">${promo.name}</div>
        <div class="text-[10px] text-slate-400 dark:text-slate-500 font-medium">${isPercent ? 'ส่วนลด %' : 'ส่วนลดบิล'}</div>
      </div>
      <span class="text-xs font-black px-2 py-0.5 rounded-lg ${badgeColor}">${valTag}</span>
    `;
    container.appendChild(btn);
  });
}

function applyPresetDiscount(promoId) {
  const promo = promotions.find(p => p.id === promoId);
  if (!promo) return;

  setQuickDiscountMode(promo.type);
  document.getElementById('quickDiscountValueInput').value = promo.value;

  const subtotal = cart.reduce((sum, item) => sum + item.itemTotal, 0);
  let discount = 0;
  if (promo.type === 'percent') {
    discount = Math.round((subtotal * (promo.value / 100)) * 100) / 100;
  } else {
    discount = Math.min(subtotal, promo.value);
  }

  cartDiscountDetail = {
    type: promo.type,
    value: promo.value,
    name: promo.name,
    amount: discount
  };

  updateCartSummary();
  closeQuickDiscountModal();
  showToast(`ใช้โปรโมชั่น "${promo.name}" แล้ว`);
}

function applyQuickDiscountFromModal() {
  const val = parseFloat(document.getElementById('quickDiscountValueInput').value) || 0;
  if (val <= 0) {
    clearCartDiscount();
    return;
  }

  const subtotal = cart.reduce((sum, item) => sum + item.itemTotal, 0);
  let discount = 0;
  let labelName = '';

  if (quickDiscountCurrentMode === 'percent') {
    const pct = Math.min(100, Math.max(0, val));
    discount = Math.round((subtotal * (pct / 100)) * 100) / 100;
    labelName = `ส่วนลด ${pct}%`;
  } else {
    discount = Math.min(subtotal, Math.max(0, val));
    labelName = `ส่วนลด ${val} บาท`;
  }

  cartDiscountDetail = {
    type: quickDiscountCurrentMode,
    value: val,
    name: labelName,
    amount: discount
  };

  updateCartSummary();
  closeQuickDiscountModal();
  showToast(`บันทึกส่วนลด -฿${discount.toFixed(2)} แล้ว`);
}

function clearCartDiscount() {
  cartDiscountDetail = { type: 'none', value: 0, name: '', amount: 0 };
  updateCartSummary();
  closeQuickDiscountModal();
  showToast('ล้างส่วนลดเรียบร้อยแล้ว');
}

// --------------------------------------------------------------------------
// HELD BILLS (พักบิล / OPEN TABS) LOGIC
// --------------------------------------------------------------------------

function updateHeldBillsBadge() {
  const badge = document.getElementById('heldBillsBadge');
  const modalBadge = document.getElementById('heldBillsModalCountBadge');
  const clearAllBtn = document.getElementById('btnClearAllHeldBills');
  const count = heldBills.length;

  if (badge) {
    badge.innerText = count;
    if (count > 0) {
      badge.classList.remove('hidden');
      badge.classList.add('inline-flex');
    } else {
      badge.classList.add('hidden');
      badge.classList.remove('inline-flex');
    }
  }

  if (modalBadge) {
    modalBadge.innerText = `${count} บิล`;
  }

  if (clearAllBtn) {
    if (count > 1) {
      clearAllBtn.classList.remove('hidden');
    } else {
      clearAllBtn.classList.add('hidden');
    }
  }
}

function initHoldBillEvents() {
  const noteInput = document.getElementById('holdBillNoteInput');
  if (noteInput) {
    noteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmHoldBill();
      }
    });
  }
}

function openHoldBillPromptModal() {
  if (cart.length === 0) {
    showToast('ไม่มีสินค้าในตะกร้าสำหรับพักบิล', 'warning');
    return;
  }

  const { total } = getCartCalculation();
  const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);

  const itemsCountEl = document.getElementById('holdBillItemsCount');
  const totalEl = document.getElementById('holdBillTotalAmount');
  const noteInput = document.getElementById('holdBillNoteInput');

  if (itemsCountEl) itemsCountEl.innerText = `${totalQty} รายการ (${cart.length} เมนู)`;
  if (totalEl) totalEl.innerText = `฿${total.toFixed(2)}`;
  if (noteInput) noteInput.value = '';

  const modal = document.getElementById('holdBillModal');
  if (modal) {
    modal.classList.remove('hidden');
    setTimeout(() => {
      if (noteInput) noteInput.focus();
    }, 100);
  }
}

function closeHoldBillModal() {
  const modal = document.getElementById('holdBillModal');
  if (modal) modal.classList.add('hidden');
}

function setHoldBillPresetTag(tag) {
  const noteInput = document.getElementById('holdBillNoteInput');
  if (noteInput) {
    noteInput.value = tag;
    noteInput.focus();
  }
}

function confirmHoldBill() {
  if (cart.length === 0) {
    showToast('ไม่มีสินค้าในตะกร้าสำหรับพักบิล', 'warning');
    closeHoldBillModal();
    return;
  }

  const noteInput = document.getElementById('holdBillNoteInput');
  const rawNote = noteInput ? noteInput.value.trim() : '';
  const now = new Date();
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const count = heldBills.length;
  const note = rawNote || `บิลพัก #${count + 1} (${timeStr})`;
  const calc = getCartCalculation();

  const newHeldBill = {
    id: 'HOLD-' + Date.now().toString().slice(-6),
    note: note,
    rawNote: rawNote,
    createdAt: Date.now(),
    formattedTime: timeStr,
    cart: JSON.parse(JSON.stringify(cart)),
    cartDiscountDetail: JSON.parse(JSON.stringify(cartDiscountDetail)),
    subtotal: calc.subtotal,
    discount: calc.discount,
    total: calc.total,
    itemCount: cart.reduce((sum, item) => sum + item.qty, 0)
  };

  heldBills.unshift(newHeldBill);
  saveToStorage('coffeeshop_held_bills', heldBills);

  // Clear current cart so cashier can immediately serve next customer
  cart = [];
  cartDiscountDetail = { type: 'none', value: 0, name: '', amount: 0 };
  renderCart();

  if (typeof syncCustomerDisplay === 'function') {
    syncCustomerDisplay('CLEAR_CART');
  }

  updateHeldBillsBadge();
  closeHoldBillModal();
  showToast(`⏸️ พักบิล "${note}" เรียบร้อยแล้ว (สามารถรับลูกค้าท่านอื่นต่อได้ทันที)`, 'success');
}

function openHeldBillsModal() {
  const modal = document.getElementById('heldBillsModal');
  if (modal) modal.classList.remove('hidden');
  const searchInput = document.getElementById('heldBillsSearchInput');
  if (searchInput) searchInput.value = '';
  renderHeldBillsList();
}

function closeHeldBillsModal() {
  const modal = document.getElementById('heldBillsModal');
  if (modal) modal.classList.add('hidden');
}

function filterHeldBillsList() {
  renderHeldBillsList();
}

function getTimeAgo(timestamp) {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'เมื่อสักครู่';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} ชม. ที่แล้ว`;
  return `${Math.floor(diffHour / 24)} วันที่แล้ว`;
}

function renderHeldBillsList() {
  const container = document.getElementById('heldBillsListContainer');
  if (!container) return;

  const searchInput = document.getElementById('heldBillsSearchInput');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  let filtered = heldBills;
  if (query) {
    filtered = heldBills.filter(bill => {
      const matchNote = bill.note && bill.note.toLowerCase().includes(query);
      const matchId = bill.id && bill.id.toLowerCase().includes(query);
      const matchItems = bill.cart && bill.cart.some(item => item.name.toLowerCase().includes(query));
      return matchNote || matchId || matchItems;
    });
  }

  updateHeldBillsBadge();

  if (heldBills.length === 0) {
    container.innerHTML = `
      <div class="py-12 flex flex-col items-center justify-center text-center space-y-3">
        <div class="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 flex items-center justify-center text-2xl text-amber-600 dark:text-amber-400 shadow-sm">
          ⏸️
        </div>
        <div class="space-y-1 max-w-xs">
          <h4 class="font-bold text-slate-800 dark:text-slate-200 text-sm">ไม่มีบิลที่พักไว้ในขณะนี้</h4>
          <p class="text-xs text-slate-400 dark:text-slate-500">หากลูกค้าท่านใดกำลังเลือกเมนูหรือรอเพื่อน สามารถกดปุ่ม "พักบิล" ในแถบสั่งซื้อ เพื่อเปิดทางให้ลูกค้าคนถัดไปได้ทันที</p>
        </div>
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="py-10 text-center text-slate-400 dark:text-slate-500 text-xs">
        🔍 ไม่พบรายการบิลพักที่ตรงกับ "${query}"
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  filtered.forEach((bill) => {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:border-amber-400/50 dark:hover:border-amber-500/50 transition flex flex-col space-y-3';

    // Item preview lines (up to 3 items)
    const itemsPreview = (bill.cart || []).slice(0, 3).map(item => {
      let mods = '';
      if (item.selectedOptions && item.selectedOptions.length > 0) {
        mods = ` (${item.selectedOptions.map(o => o.optName.split(' ')[0]).join(', ')})`;
      }
      return `<li class="text-xs text-slate-600 dark:text-slate-300 truncate">• <span class="font-medium">${item.name}</span>${mods} <span class="font-bold text-slate-900 dark:text-white">x${item.qty}</span></li>`;
    }).join('');

    const moreItemsCount = (bill.cart || []).length - 3;
    const moreText = moreItemsCount > 0
      ? `<li class="text-[11px] text-slate-400 italic">+ และอีก ${moreItemsCount} รายการ</li>`
      : '';

    const timeAgo = getTimeAgo(bill.createdAt);

    card.innerHTML = `
      <div class="flex justify-between items-start gap-2">
        <div class="space-y-0.5 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h4 class="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-snug break-words">${bill.note}</h4>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">${bill.id}</span>
          </div>
          <p class="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <span>🕒 ${bill.formattedTime || ''} (${timeAgo})</span>
            <span>•</span>
            <span>${bill.itemCount || (bill.cart ? bill.cart.reduce((s, i) => s + i.qty, 0) : 0)} แก้ว/ชิ้น</span>
          </p>
        </div>
        <div class="text-right flex-shrink-0">
          <span class="text-base sm:text-lg font-black text-coffee-700 dark:text-amber-400">฿${(bill.total || 0).toFixed(2)}</span>
          ${bill.discount > 0 ? `<span class="block text-[10px] text-red-500 font-semibold">ลด ฿${bill.discount.toFixed(2)}</span>` : ''}
        </div>
      </div>

      <!-- Items List -->
      <div class="bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/70">
        <ul class="space-y-1">
          ${itemsPreview}
          ${moreText}
        </ul>
      </div>

      <!-- Action Buttons -->
      <div class="flex justify-between items-center pt-1">
        <button type="button" onclick="deleteHeldBill('${bill.id}')" class="text-xs text-red-500 hover:text-red-600 dark:hover:text-red-400 font-semibold flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition">
          <span>🗑️</span>
          <span>ลบบิลนี้</span>
        </button>

        <button type="button" onclick="restoreHeldBill('${bill.id}')" class="px-4 py-2 text-xs font-bold text-white bg-coffee-600 hover:bg-coffee-700 dark:bg-amber-600 dark:hover:bg-amber-700 rounded-xl shadow transition flex items-center space-x-1.5">
          <span>▶️</span>
          <span>ดึงบิลมาขายต่อ</span>
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

function restoreHeldBill(billId) {
  const index = heldBills.findIndex(b => b.id === billId);
  if (index === -1) {
    showToast('ไม่พบบิลพักนี้ในระบบ', 'warning');
    return;
  }

  const targetBill = heldBills[index];

  // Check if current cart has items
  if (cart.length > 0) {
    pendingRestoreBillId = billId;
    const countEl = document.getElementById('conflictCurrentCartCount');
    const noteEl = document.getElementById('conflictTargetBillNote');
    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);

    if (countEl) countEl.innerText = `${totalQty} ชิ้น (${cart.length} เมนู)`;
    if (noteEl) noteEl.innerText = targetBill.note;

    const conflictModal = document.getElementById('restoreConflictModal');
    if (conflictModal) conflictModal.classList.remove('hidden');
    return;
  }

  doRestoreHeldBill(billId);
}

function closeRestoreConflictModal() {
  const conflictModal = document.getElementById('restoreConflictModal');
  if (conflictModal) conflictModal.classList.add('hidden');
  pendingRestoreBillId = null;
}

function confirmConflictAction(action) {
  if (!pendingRestoreBillId) {
    closeRestoreConflictModal();
    return;
  }

  const targetId = pendingRestoreBillId;

  if (action === 'park_current') {
    // Auto-park the current cart
    const now = new Date();
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const calc = getCartCalculation();
    const autoNote = `บิลพัก #${heldBills.length + 1} (${timeStr})`;

    const currentHeldBill = {
      id: 'HOLD-' + Date.now().toString().slice(-6),
      note: autoNote,
      rawNote: '',
      createdAt: Date.now(),
      formattedTime: timeStr,
      cart: JSON.parse(JSON.stringify(cart)),
      cartDiscountDetail: JSON.parse(JSON.stringify(cartDiscountDetail)),
      subtotal: calc.subtotal,
      discount: calc.discount,
      total: calc.total,
      itemCount: cart.reduce((sum, item) => sum + item.qty, 0)
    };

    heldBills.unshift(currentHeldBill);
    saveToStorage('coffeeshop_held_bills', heldBills);
    showToast(`⏸️ พักบิลปัจจุบันไว้แล้ว: "${autoNote}"`, 'info');
  }

  closeRestoreConflictModal();
  doRestoreHeldBill(targetId);
}

function doRestoreHeldBill(billId) {
  const index = heldBills.findIndex(b => b.id === billId);
  if (index === -1) return;

  const billToRestore = heldBills[index];
  const restoredNote = billToRestore.note;

  // Restore cart and discount
  cart = JSON.parse(JSON.stringify(billToRestore.cart || []));
  cartDiscountDetail = JSON.parse(JSON.stringify(billToRestore.cartDiscountDetail || { type: 'none', value: 0, name: '', amount: 0 }));

  // Remove from held bills list
  heldBills.splice(index, 1);
  saveToStorage('coffeeshop_held_bills', heldBills);

  updateHeldBillsBadge();
  renderCart();

  if (typeof syncCustomerDisplay === 'function') {
    syncCustomerDisplay('CART_UPDATE');
  }

  closeHeldBillsModal();
  showToast(`▶️ ดึงบิล "${restoredNote}" กลับมาขายต่อแล้ว`, 'success');
}

function deleteHeldBill(billId) {
  const bill = heldBills.find(b => b.id === billId);
  const note = bill ? bill.note : 'รายการนี้';
  if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบบิลพัก "${note}"?`)) {
    return;
  }

  heldBills = heldBills.filter(b => b.id !== billId);
  saveToStorage('coffeeshop_held_bills', heldBills);
  updateHeldBillsBadge();
  renderHeldBillsList();
  showToast(`ลบบิลพัก "${note}" เรียบร้อยแล้ว`);
}

function clearAllHeldBills() {
  if (heldBills.length === 0) return;
  if (!confirm(`คุณต้องการล้างบิลที่พักไว้ทั้งหมด (${heldBills.length} บิล) ใช่หรือไม่?`)) {
    return;
  }

  heldBills = [];
  saveToStorage('coffeeshop_held_bills', heldBills);
  updateHeldBillsBadge();
  renderHeldBillsList();
  showToast('ล้างบิลที่พักไว้ทั้งหมดเรียบร้อยแล้ว');
}

// --------------------------------------------------------------------------
// CHECKOUT & PAYMENT DIALOG LOGIC
// --------------------------------------------------------------------------
function openCheckoutModal() {
  if (cart.length === 0) {
    showToast('ไม่มีสินค้าในตะกร้าสำหรับคิดเงิน', 'warning');
    return;
  }

  const { total } = getCartCalculation();
  document.getElementById('checkoutTotalAmount').innerText = `฿${total.toFixed(2)}`;
  document.getElementById('promptPayScanAmount').innerText = `฿${total.toFixed(2)}`;
  
  // Zero Baht notice & UI adjustments
  const zeroNotice = document.getElementById('zeroBahtCheckoutNotice');
  if (zeroNotice) {
    if (total === 0) {
      zeroNotice.classList.remove('hidden');
    } else {
      zeroNotice.classList.add('hidden');
    }
  }

  // Set default view (Cash)
  setCheckoutMethod('cash');

  // Trigger quick cash buttons calculations
  renderQuickCashButtons(total);

  // Render QR Code (Bank Account / PromptPay / QR Image)
  renderCheckoutQr(total);

  // Display modal
  const modal = document.getElementById('checkoutModal');
  modal.classList.remove('hidden');
  modal.querySelector('.transform').classList.remove('scale-95');
  modal.querySelector('.transform').classList.add('scale-100');
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkoutModal');
  modal.querySelector('.transform').classList.remove('scale-100');
  modal.querySelector('.transform').classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 100);

  if (typeof syncCustomerDisplay === 'function') {
    syncCustomerDisplay('HIDE_QR');
  }
}

function setCheckoutMethod(method) {
  checkoutMethod = method;
  
  // Update Buttons UI
  const cashBtn = document.getElementById('btn-method-cash');
  const ppBtn = document.getElementById('btn-method-promptpay');
  
  if (method === 'cash') {
    cashBtn.className = 'flex flex-col items-center justify-center p-4 border-2 border-coffee-600 dark:border-amber-500 bg-coffee-50/50 dark:bg-amber-950/40 text-coffee-700 dark:text-amber-200 rounded-xl font-bold transition';
    ppBtn.className = 'flex flex-col items-center justify-center p-4 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold transition';
    
    document.getElementById('checkoutView-cash').classList.remove('hidden');
    document.getElementById('checkoutView-promptpay').classList.add('hidden');
    
    // Auto-focus cash input
    setTimeout(() => {
      document.getElementById('cashReceivedInput').focus();
    }, 150);

    if (typeof syncCustomerDisplay === 'function') {
      syncCustomerDisplay('HIDE_QR');
    }
  } else {
    cashBtn.className = 'flex flex-col items-center justify-center p-4 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold transition';
    ppBtn.className = 'flex flex-col items-center justify-center p-4 border-2 border-coffee-600 dark:border-amber-500 bg-coffee-50/50 dark:bg-amber-950/40 text-coffee-700 dark:text-amber-200 rounded-xl font-bold transition';
    
    document.getElementById('checkoutView-cash').classList.add('hidden');
    document.getElementById('checkoutView-promptpay').classList.remove('hidden');

    if (typeof broadcastCustomerQr === 'function') {
      broadcastCustomerQr();
    }
  }
}

function renderQuickCashButtons(orderTotal) {
  const container = document.getElementById('quickCashButtons');
  container.innerHTML = '';
  
  // If order total is 0 (Points redemption / 100% discount / free promo)
  if (orderTotal === 0) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow transition active:scale-95 flex items-center justify-center gap-1.5';
    btn.innerHTML = `<span>🎁 ฟรี / แลกแต้ม (฿0.00)</span>`;
    btn.onclick = () => {
      document.getElementById('cashReceivedInput').value = '0';
      calculateCashChange();
    };
    container.appendChild(btn);

    document.getElementById('cashReceivedInput').value = '0';
    checkoutCashReceived = 0;
    calculateCashChange();
    return;
  }
  
  // Quick cash options calculations
  const total = Math.ceil(orderTotal);
  let options = [total]; // Exact Change option

  // Presets like rounding to next 20, 50, 100, 500, 1000 bills
  const billPresets = [20, 50, 100, 500, 1000];
  billPresets.forEach(bill => {
    if (bill > total) {
      options.push(bill);
    }
  });

  // Unique sorted values
  const uniqueOptions = [...new Set(options)].sort((a, b) => a - b).slice(0, 8); // maximum 8 choices

  uniqueOptions.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 rounded-lg text-slate-800 dark:text-slate-200 text-sm font-bold shadow-sm transition active:scale-95';
    btn.innerText = opt === total ? 'พอดี' : `฿${opt}`;
    btn.onclick = () => {
      document.getElementById('cashReceivedInput').value = opt;
      calculateCashChange();
      // Add visual click animation
      const containerInp = document.getElementById('cashReceivedInput').parentElement;
      containerInp.classList.add('animate-pulse-once');
      setTimeout(() => containerInp.classList.remove('animate-pulse-once'), 300);
    };
    container.appendChild(btn);
  });

  // Clear inputs
  document.getElementById('cashReceivedInput').value = '';
  document.getElementById('cashChangeDisplay').innerText = '฿0.00';
}

function calculateCashChange() {
  const { total } = getCartCalculation();
  const received = parseFloat(document.getElementById('cashReceivedInput').value) || 0;
  checkoutCashReceived = received;

  const change = Math.max(0, received - total);
  
  if (received >= total) {
    document.getElementById('cashChangeDisplay').innerText = `฿${change.toFixed(2)}`;
    document.getElementById('cashChangeDisplay').parentElement.className = 'bg-emerald-100 dark:bg-emerald-950/60 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/80 text-center mt-4';
    document.getElementById('cashChangeDisplay').className = 'text-3xl font-black text-emerald-900 dark:text-emerald-200 mt-1 block';
  } else {
    document.getElementById('cashChangeDisplay').innerText = `เหลืออีก ฿${(total - received).toFixed(2)}`;
    document.getElementById('cashChangeDisplay').parentElement.className = 'bg-amber-100 dark:bg-amber-950/60 p-4 rounded-xl border border-amber-200 dark:border-amber-800/80 text-center mt-4';
    document.getElementById('cashChangeDisplay').className = 'text-xl font-bold text-amber-900 dark:text-amber-200 mt-1 block';
  }
}

// --------------------------------------------------------------------------
// THAI QR & BANK ACCOUNT EMVCO QR GENERATION
// --------------------------------------------------------------------------
function renderCheckoutQr(amount) {
  const canvas = document.getElementById('promptPayQrCanvas');
  const staticImg = document.getElementById('promptPayStaticImg');
  const badgeTag = document.getElementById('qrHeaderBadge');
  const badgeText = document.getElementById('qrHeaderBadgeText');
  const bankNameText = document.getElementById('qrBankNameText');
  const accNoText = document.getElementById('qrAccountNoText');
  const accNameText = document.getElementById('qrAccountNameText');
  const accNoRow = document.getElementById('qrAccountNoRow');
  const accNameRow = document.getElementById('qrAccountNameRow');
  const bankInfoText = document.getElementById('promptPayInfoText');

  document.getElementById('promptPayScanAmount').innerText = `฿${amount.toFixed(2)}`;

  // Mode 1: Uploaded QR Image from bank
  if (settings.promptPayType === 'image' && settings.bankQrImage) {
    canvas.classList.add('hidden');
    staticImg.classList.remove('hidden');
    staticImg.src = settings.bankQrImage;

    badgeTag.style.backgroundColor = '#4b5563';
    badgeText.innerText = 'สแกน QR ธนาคาร';
    
    bankInfoText.classList.remove('hidden');
    bankNameText.innerText = 'รูปภาพ QR ธนาคาร';
    accNoRow.classList.add('hidden');
    accNameRow.classList.add('hidden');
    
    currentActiveQrPayload = '';
    if (checkoutMethod === 'promptpay' && typeof broadcastCustomerQr === 'function') {
      broadcastCustomerQr();
    }
    return;
  }

  // Dynamic QR Code Modes (Bank Account or PromptPay)
  staticImg.classList.add('hidden');
  canvas.classList.remove('hidden');

  let rawPayload = '';

  if (settings.promptPayType === 'bank') {
    // Mode 2: Bank Account Transfer (Sub-tag 04)
    const selectedBank = THAI_BANKS.find(b => b.code === settings.bankCode) || THAI_BANKS[0];
    badgeTag.style.backgroundColor = selectedBank.color || '#138f2d';
    badgeText.innerText = `โอนเข้าบัญชี ${selectedBank.short}`;
    
    bankInfoText.classList.remove('hidden');
    bankNameText.innerText = selectedBank.name;
    
    accNoRow.classList.remove('hidden');
    accNoText.innerText = settings.bankAccountNo || '-';
    
    accNameRow.classList.remove('hidden');
    accNameText.innerText = settings.bankAccountName || '-';

    if (!settings.bankAccountNo) {
      drawQrPlaceholder(canvas, 'กรุณาตั้งค่าเลขบัญชีก่อนใช้งาน');
      return;
    }

    rawPayload = generateThaiQrPayload('bank', settings.bankAccountNo, settings.bankCode, amount);
  } else {
    // Mode 3: PromptPay Mobile or National ID (Sub-tag 01 or 02)
    badgeTag.style.backgroundColor = '#0369a1';
    badgeText.innerText = settings.promptPayType === 'mobile' ? 'พร้อมเพย์ (เบอร์โทร)' : 'พร้อมเพย์ (เลขบัตร/ภาษี)';
    
    bankInfoText.classList.remove('hidden');
    bankNameText.innerText = 'PromptPay';
    
    accNoRow.classList.remove('hidden');
    accNoText.innerText = settings.promptPayNo || '-';
    
    accNameRow.classList.add('hidden');

    if (!settings.promptPayNo) {
      drawQrPlaceholder(canvas, 'กรุณาตั้งค่าเลขพร้อมเพย์ก่อนใช้งาน');
      return;
    }

    rawPayload = generateThaiQrPayload(settings.promptPayType, settings.promptPayNo, null, amount);
  }

  // Draw QR on canvas using QRious
  new QRious({
    element: canvas,
    value: rawPayload,
    size: 200,
    level: 'M'
  });

  currentActiveQrPayload = rawPayload;
  if (checkoutMethod === 'promptpay' && typeof broadcastCustomerQr === 'function') {
    broadcastCustomerQr();
  }
}

function drawQrPlaceholder(canvas, msg) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px Prompt, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
}

function generateThaiQrPayload(type, identifier, bankCode, amount) {
  const aid = 'A000000677010111';
  const sub00 = '00' + String(aid.length).padStart(2, '0') + aid;
  let sub01 = '';

  if (type === 'bank') {
    // EMVCo Sub-tag 04: 3-digit Bank Code + Account Number (digits only)
    const cleanAcc = (identifier || '').replace(/[^0-9]/g, '');
    const cleanBank = (bankCode || '004').padStart(3, '0');
    const bankVal = cleanBank + cleanAcc;
    sub01 = '04' + String(bankVal.length).padStart(2, '0') + bankVal;
  } else if (type === 'mobile') {
    let cleanMobile = (identifier || '').replace(/[^0-9]/g, '');
    if (cleanMobile.length === 10 && cleanMobile.startsWith('0')) {
      cleanMobile = '0066' + cleanMobile.substring(1);
    }
    sub01 = '01' + String(cleanMobile.length).padStart(2, '0') + cleanMobile;
  } else if (type === 'natid') {
    const cleanNatId = (identifier || '').replace(/[^0-9]/g, '');
    sub01 = '02' + String(cleanNatId.length).padStart(2, '0') + cleanNatId;
  }

  const tag29Val = sub00 + sub01;
  const tag29 = '29' + String(tag29Val.length).padStart(2, '0') + tag29Val;

  const tag00 = '000201'; // Payload Format Indicator
  const tag01 = '010212'; // Point of Initiation: 12 (Dynamic QR, specifies amount)
  const tag53 = '5303764'; // Transaction Currency: 764 (THB)

  const amountStr = parseFloat(amount).toFixed(2);
  const tag54 = '54' + String(amountStr.length).padStart(2, '0') + amountStr;

  const tag58 = '5802TH'; // Country code TH
  
  const basePayload = tag00 + tag01 + tag29 + tag53 + tag54 + tag58 + '6304';
  
  // Calculate checksum
  const crc = crc16CCITT(basePayload);
  return basePayload + crc.toUpperCase();
}

function crc16CCITT(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    let x = ((crc >> 8) ^ str.charCodeAt(i)) & 0xFF;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF;
  }
  return crc.toString(16).padStart(4, '0');
}

// --------------------------------------------------------------------------
// FINISH ORDER & SAVE TO HISTORY
// --------------------------------------------------------------------------
function completeOrder(shouldPrint) {
  const { subtotal, discount, total } = getCartCalculation();

  if (total > 0 && checkoutMethod === 'cash' && checkoutCashReceived < total) {
    showToast('กรุณากรอกยอดเงินสดที่ได้รับให้ครบถ้วนก่อนบันทึก', 'warning');
    return;
  }

  // Create Order Object
  const orderId = 'ORD-' + Date.now().toString().slice(-6);
  const orderDate = new Date();
  
  // Determine payment method label & bank info
  let payMethodText = 'เงินสด';
  let bankDetails = null;

  if (total === 0) {
    payMethodText = 'แลกแต้ม / ฟรี';
  } else if (checkoutMethod !== 'cash') {
    if (settings.promptPayType === 'bank') {
      const bObj = THAI_BANKS.find(b => b.code === settings.bankCode) || THAI_BANKS[0];
      payMethodText = 'โอนบัญชีธนาคาร';
      bankDetails = {
        bankName: bObj.name,
        shortName: bObj.short,
        accountNo: settings.bankAccountNo,
        accountName: settings.bankAccountName
      };
    } else if (settings.promptPayType === 'image') {
      payMethodText = 'โอนเงิน/QR';
    } else {
      payMethodText = 'พร้อมเพย์';
    }
  }

  const newOrderObj = {
    id: orderId,
    timestamp: orderDate.getTime(),
    items: [...cart],
    subtotal: subtotal,
    discount: discount,
    discountDetail: { ...cartDiscountDetail },
    total: total,
    paymentMethod: payMethodText,
    bankInfo: bankDetails,
    cashReceived: total === 0 ? 0 : (checkoutMethod === 'cash' ? checkoutCashReceived : total),
    cashChange: total === 0 ? 0 : (checkoutMethod === 'cash' ? Math.max(0, checkoutCashReceived - total) : 0),
    cashierName: (currentUser && currentUser.name) ? currentUser.name : 'เจ้าของร้าน',
    cashierId: (currentUser && currentUser.id) ? currentUser.id : 'user-owner',
    cashierRole: (currentUser && currentUser.role) ? currentUser.role : 'owner',
    status: 'completed' // completed, voided
  };

  // Save to database array
  orders.push(newOrderObj);
  saveToStorage('coffeeshop_orders', orders);

  // Sync to Supabase Cloud
  if (typeof syncOrderToCloud === 'function') {
    syncOrderToCloud(newOrderObj);
  }

  // Clear modal and cart
  closeCheckoutModal();
  cart = [];
  cartDiscountDetail = { type: 'none', value: 0, name: '', amount: 0 };
  renderCart();

  if (typeof syncCustomerDisplay === 'function') {
    syncCustomerDisplay('PAYMENT_SUCCESS', { amount: total });
  }

  // Play cashier chime & polite Thai voice notification (Zero fee, offline)
  if (typeof playPaymentAudioAlert === 'function') {
    playPaymentAudioAlert(total);
  }

  showToast(`บันทึกออเดอร์ ${orderId} สำเร็จ!`);

  // Fire print logic
  if (shouldPrint) {
    printReceipt(newOrderObj);
  }
}

// --------------------------------------------------------------------------
// PRINT RECEIPT & TEMPLATING
// --------------------------------------------------------------------------
function printReceipt(order) {
  // 1. Populate details in printable HTML section
  document.getElementById('print-shop-name').innerText = settings.shopName;
  document.getElementById('print-shop-address').innerText = settings.shopAddress;
  document.getElementById('print-shop-phone').innerText = `โทร: ${settings.shopPhone}`;
  document.getElementById('print-order-id').innerText = `#${order.id}`;
  
  // Format Thai locale datetime
  const formattedDate = new Date(order.timestamp).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  document.getElementById('print-order-date').innerText = formattedDate;

  const cashierEl = document.getElementById('print-cashier-name');
  if (cashierEl) {
    cashierEl.innerText = order.cashierName || (currentUser ? currentUser.name : 'เจ้าของร้าน');
  }

  // Build items rows
  const itemsContainer = document.getElementById('print-receipt-items');
  itemsContainer.innerHTML = '';

  order.items.forEach(item => {
    const tr = document.createElement('tr');
    
    // Modifiers info string
    let modifiers = [];
    if (item.selectedOptions && item.selectedOptions.length > 0) {
      modifiers = item.selectedOptions.map(o => o.optName + (o.price > 0 ? ` (+฿${o.price})` : ''));
    } else {
      if (item.selectedTemp) modifiers.push(item.selectedTemp);
      if (item.selectedSweetness) modifiers.push(`หวาน ${item.selectedSweetness}`);
      (item.selectedExtras || []).forEach(e => modifiers.push(`+ ${e.name}`));
    }
    if (item.customPriceNote) {
      modifiers.push(`(${item.customPriceNote})`);
    } else if (item.customNotes) {
      modifiers.push(`(${item.customNotes})`);
    } else if (item.pricePerItem === 0) {
      modifiers.push('(แลกแต้ม/ฟรี)');
    }

    const modsHtml = modifiers.length > 0 
      ? `<div class="receipt-item-details">${modifiers.join(', ')}</div>` 
      : '';

    tr.innerHTML = `
      <td style="padding: 3px 0;">
        <div style="font-weight: bold;">${item.name}</div>
        ${modsHtml}
      </td>
      <td style="text-align: center; padding: 3px 0;">x${item.qty}</td>
      <td style="text-align: right; padding: 3px 0;">฿${item.itemTotal.toFixed(2)}</td>
    `;
    itemsContainer.appendChild(tr);
  });

  // Populate totals
  document.getElementById('print-subtotal').innerText = `฿${order.subtotal.toFixed(2)}`;
  
  const discountRow = document.getElementById('print-discount-row');
  if (order.discount > 0) {
    discountRow.classList.remove('hidden');
    const discLabel = (order.discountDetail && order.discountDetail.name)
      ? `ส่วนลด (${order.discountDetail.name}):`
      : 'ส่วนลด:';
    const labelSpan = discountRow.querySelector('span:first-child');
    if (labelSpan) labelSpan.innerText = discLabel;
    document.getElementById('print-discount').innerText = `-฿${order.discount.toFixed(2)}`;
  } else {
    discountRow.classList.add('hidden');
  }

  document.getElementById('print-total').innerText = `฿${order.total.toFixed(2)}`;
  document.getElementById('print-payment-method').innerText = order.paymentMethod;

  // Handle Shop Logo display mode
  const printLogo = document.getElementById('print-receipt-logo');
  if (printLogo) {
    if (settings.printLogoMode === 'hide') {
      printLogo.style.display = 'none';
    } else {
      printLogo.style.display = 'block';
      if (settings.printLogoMode === 'compact') {
        printLogo.style.maxWidth = '28mm';
        printLogo.style.margin = '0 auto 2px auto';
      } else {
        printLogo.style.maxWidth = '38mm';
        printLogo.style.margin = '0 auto 4px auto';
      }
    }
  }

  const cashRecRow = document.getElementById('print-cash-received-row');
  const cashChgRow = document.getElementById('print-cash-change-row');
  const bankInfoRow = document.getElementById('print-bank-info-row');
  const qrContainer = document.getElementById('print-promptpay-qr-container');
  const printQrCanvas = document.getElementById('printReceiptQrCanvas');
  const printQrImg = document.getElementById('printReceiptQrImg');
  const printQrLabel = document.getElementById('print-qr-code-label');
  const qrDivider = document.getElementById('print-qr-divider');
  
  if (order.paymentMethod === 'แลกแต้ม / ฟรี' || order.total === 0) {
    cashRecRow.classList.add('hidden');
    cashChgRow.classList.add('hidden');
    bankInfoRow.classList.add('hidden');
    qrContainer.classList.add('hidden');
    if (qrDivider) qrDivider.classList.add('hidden');
  } else if (order.paymentMethod === 'เงินสด') {
    cashRecRow.classList.remove('hidden');
    cashChgRow.classList.remove('hidden');
    bankInfoRow.classList.add('hidden');
    document.getElementById('print-cash-received').innerText = `฿${order.cashReceived.toFixed(2)}`;
    document.getElementById('print-cash-change').innerText = `฿${order.cashChange.toFixed(2)}`;
  } else {
    cashRecRow.classList.add('hidden');
    cashChgRow.classList.add('hidden');

    if (order.bankInfo && order.bankInfo.accountNo) {
      bankInfoRow.classList.remove('hidden');
      document.getElementById('print-bank-info').innerText = `${order.bankInfo.shortName} ${order.bankInfo.accountNo}`;
      document.getElementById('print-bank-acc-name').innerText = order.bankInfo.accountName || '-';
    } else {
      bankInfoRow.classList.add('hidden');
    }
  }

  // Handle QR Code on receipt
  let shouldShowQr = false;
  if (order.paymentMethod === 'แลกแต้ม / ฟรี' || order.total === 0) {
    shouldShowQr = false;
  } else if (settings.printQrMode === 'always') {
    shouldShowQr = true;
  } else if (settings.printQrMode === 'never') {
    shouldShowQr = false;
  } else { // 'auto': only for non-cash orders
    shouldShowQr = (order.paymentMethod !== 'เงินสด');
  }

  if (shouldShowQr) {
    qrContainer.classList.remove('hidden');
    if (qrDivider) qrDivider.classList.remove('hidden');
    printQrLabel.innerText = order.paymentMethod === 'โอนบัญชีธนาคาร' ? 'สแกนชำระเงิน (บัญชีธนาคาร)' : 'สแกนชำระเงิน (QR/พร้อมเพย์)';

    if (settings.promptPayType === 'image' && settings.bankQrImage) {
      printQrCanvas.style.display = 'none';
      printQrImg.style.display = 'block';
      printQrImg.src = settings.bankQrImage;
    } else {
      printQrImg.style.display = 'none';
      printQrCanvas.style.display = 'block';
      
      let payload = '';
      if (settings.promptPayType === 'bank' && settings.bankAccountNo) {
        payload = generateThaiQrPayload('bank', settings.bankAccountNo, settings.bankCode, order.total);
      } else if (settings.promptPayNo) {
        payload = generateThaiQrPayload(settings.promptPayType, settings.promptPayNo, null, order.total);
      }

      if (payload) {
        new QRious({
          element: printQrCanvas,
          value: payload,
          size: 85,
          level: 'M'
        });
      }
    }
  } else {
    qrContainer.classList.add('hidden');
    if (qrDivider) qrDivider.classList.add('hidden');
  }

  document.getElementById('print-receipt-footer-msg').innerText = settings.receiptFooter;

  // Manage dynamic printer width class (80mm vs 58mm)
  const printArea = document.getElementById('receipt-print-area');
  const printContainer = printArea.querySelector('.receipt-container');
  const is58mm = (settings.paperSize === '58mm');
  if (is58mm) {
    printContainer.classList.add('receipt-58mm-mode');
  } else {
    printContainer.classList.remove('receipt-58mm-mode');
  }

  // Inject or update dynamic @page size rule based on selected paper size
  let dynamicPrintStyle = document.getElementById('dynamic-thermal-print-style');
  if (!dynamicPrintStyle) {
    dynamicPrintStyle = document.createElement('style');
    dynamicPrintStyle.id = 'dynamic-thermal-print-style';
    document.head.appendChild(dynamicPrintStyle);
  }
  const paperWidth = is58mm ? '52mm' : '72mm';
  const pageDefWidth = is58mm ? '58mm' : '80mm';
  dynamicPrintStyle.textContent = `
    @media print {
      @page {
        size: ${pageDefWidth} auto !important;
        margin: 0mm !important;
      }
      html, body, #receipt-print-area, .receipt-container {
        width: ${paperWidth} !important;
        max-width: ${paperWidth} !important;
        height: auto !important;
        min-height: auto !important;
        max-height: fit-content !important;
        margin: 0 !important;
        padding-top: 1mm !important;
        padding-bottom: 1mm !important;
      }
    }
  `;

  // Trigger browser printer window dialog
  window.print();
}

function testThermalPrint() {
  const testOrder = {
    id: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
    timestamp: Date.now(),
    items: [
      {
        id: 'test-item-1',
        name: 'ทดสอบเครื่องพิมพ์ Vozy U9',
        qty: 1,
        itemTotal: 50,
        selectedOptions: []
      }
    ],
    subtotal: 50,
    discount: 0,
    total: 50,
    paymentMethod: 'เงินสด',
    cashReceived: 50,
    cashChange: 0,
    isDraft: false
  };
  triggerPrintReceipt(testOrder);
}

// --------------------------------------------------------------------------
// THERMAL RECEIPT PREVIEW MODAL LOGIC
// --------------------------------------------------------------------------
function openReceiptPreviewModal(existingOrder = null) {
  const checkoutActions = document.getElementById('previewCheckoutActions');
  const pastActions = document.getElementById('previewPastOrderActions');

  if (existingOrder) {
    currentPreviewOrder = existingOrder;
    if (checkoutActions) checkoutActions.classList.add('hidden');
    if (pastActions) pastActions.classList.remove('hidden');
  } else {
    if (cart.length === 0) {
      showToast('ไม่มีสินค้าในตะกร้าสำหรับดูตัวอย่างใบเสร็จ', 'warning');
      return;
    }

    const { subtotal, discount, total } = getCartCalculation();
    let payMethodText = 'เงินสด';
    let bankDetails = null;

    if (total === 0) {
      payMethodText = 'แลกแต้ม / ฟรี';
    } else if (checkoutMethod !== 'cash') {
      if (settings.promptPayType === 'bank') {
        const bObj = THAI_BANKS.find(b => b.code === settings.bankCode) || THAI_BANKS[0];
        payMethodText = 'โอนบัญชีธนาคาร';
        bankDetails = {
          bankName: bObj.name,
          shortName: bObj.short,
          accountNo: settings.bankAccountNo,
          accountName: settings.bankAccountName
        };
      } else if (settings.promptPayType === 'image') {
        payMethodText = 'โอนเงิน/QR';
      } else {
        payMethodText = 'พร้อมเพย์';
      }
    }

    let rec = checkoutCashReceived;
    if (total === 0) {
      rec = 0;
    } else if (checkoutMethod === 'cash' && rec <= 0) {
      rec = total; // Default to exact amount for preview if not yet typed
    }

    currentPreviewOrder = {
      id: 'ORD-DRAFT (ตัวอย่าง)',
      timestamp: Date.now(),
      items: JSON.parse(JSON.stringify(cart)),
      subtotal: subtotal,
      discount: discount,
      discountDetail: { ...cartDiscountDetail },
      total: total,
      paymentMethod: payMethodText,
      bankInfo: bankDetails,
      cashReceived: total === 0 ? 0 : (checkoutMethod === 'cash' ? rec : total),
      cashChange: total === 0 ? 0 : (checkoutMethod === 'cash' ? Math.max(0, rec - total) : 0),
      isDraft: true
    };

    if (checkoutActions) checkoutActions.classList.remove('hidden');
    if (pastActions) pastActions.classList.add('hidden');
  }

  setReceiptPreviewSize(receiptPreviewSize || settings.paperSize || '80mm');
  renderReceiptPreviewContent(currentPreviewOrder);

  const modal = document.getElementById('receiptPreviewModal');
  modal.classList.remove('hidden');
  modal.querySelector('.transform').classList.remove('scale-95');
  modal.querySelector('.transform').classList.add('scale-100');
}

function closeReceiptPreviewModal() {
  const modal = document.getElementById('receiptPreviewModal');
  if (!modal) return;
  modal.querySelector('.transform').classList.remove('scale-100');
  modal.querySelector('.transform').classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 100);
}

function setReceiptPreviewSize(size) {
  receiptPreviewSize = size;
  const btn80 = document.getElementById('btn-preview-size-80');
  const btn58 = document.getElementById('btn-preview-size-58');
  const paper = document.getElementById('previewReceiptPaper');

  if (size === '58mm') {
    if (btn58) btn58.className = 'px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 text-coffee-800 dark:text-amber-400 shadow-sm transition';
    if (btn80) btn80.className = 'px-2.5 py-1 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition';
    if (paper) {
      paper.classList.add('preview-58mm');
      paper.classList.add('receipt-58mm-mode');
    }
  } else {
    if (btn80) btn80.className = 'px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 text-coffee-800 dark:text-amber-400 shadow-sm transition';
    if (btn58) btn58.className = 'px-2.5 py-1 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition';
    if (paper) {
      paper.classList.remove('preview-58mm');
      paper.classList.remove('receipt-58mm-mode');
    }
  }
}

function renderReceiptPreviewContent(order) {
  // Store info
  document.getElementById('preview-shop-name').innerText = settings.shopName || 'ร้านทานตะวัน';
  document.getElementById('preview-shop-address').innerText = settings.shopAddress || '';
  document.getElementById('preview-shop-phone').innerText = settings.shopPhone ? `โทร: ${settings.shopPhone}` : '';
  
  // Order ID & Date
  const orderIdDisplay = order.id.startsWith('#') ? order.id : `#${order.id}`;
  document.getElementById('preview-order-id').innerText = orderIdDisplay;

  const formattedDate = new Date(order.timestamp).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  document.getElementById('preview-order-date').innerText = formattedDate;

  const cashierEl = document.getElementById('preview-cashier-name');
  if (cashierEl) {
    cashierEl.innerText = order.cashierName || (currentUser ? currentUser.name : 'เจ้าของร้าน');
  }

  // Build items rows
  const itemsContainer = document.getElementById('preview-receipt-items');
  itemsContainer.innerHTML = '';

  order.items.forEach(item => {
    const tr = document.createElement('tr');
    
    // Modifiers info string
    let modifiers = [];
    if (item.selectedOptions && item.selectedOptions.length > 0) {
      modifiers = item.selectedOptions.map(o => o.optName + (o.price > 0 ? ` (+฿${o.price})` : ''));
    } else {
      if (item.selectedTemp) modifiers.push(item.selectedTemp);
      if (item.selectedSweetness) modifiers.push(`หวาน ${item.selectedSweetness}`);
      (item.selectedExtras || []).forEach(e => modifiers.push(`+ ${e.name}`));
    }
    if (item.customPriceNote) {
      modifiers.push(`(${item.customPriceNote})`);
    } else if (item.customNotes) {
      modifiers.push(`(${item.customNotes})`);
    } else if (item.pricePerItem === 0) {
      modifiers.push('(แลกแต้ม/ฟรี)');
    }

    const modsHtml = modifiers.length > 0 
      ? `<div class="receipt-item-details">${modifiers.join(', ')}</div>` 
      : '';

    tr.innerHTML = `
      <td style="padding: 3px 0;">
        <div style="font-weight: bold;">${item.name}</div>
        ${modsHtml}
      </td>
      <td style="text-align: center; padding: 3px 0;">x${item.qty}</td>
      <td style="text-align: right; padding: 3px 0;">฿${item.itemTotal.toFixed(2)}</td>
    `;
    itemsContainer.appendChild(tr);
  });

  // Summary Totals
  document.getElementById('preview-subtotal').innerText = `฿${order.subtotal.toFixed(2)}`;
  
  const discountRow = document.getElementById('preview-discount-row');
  if (order.discount > 0) {
    discountRow.classList.remove('hidden');
    const discLabel = (order.discountDetail && order.discountDetail.name)
      ? `ส่วนลด (${order.discountDetail.name}):`
      : 'ส่วนลด:';
    document.getElementById('preview-discount-label').innerText = discLabel;
    document.getElementById('preview-discount').innerText = `-฿${order.discount.toFixed(2)}`;
  } else {
    discountRow.classList.add('hidden');
  }

  document.getElementById('preview-total').innerText = `฿${order.total.toFixed(2)}`;
  document.getElementById('preview-payment-method').innerText = order.paymentMethod;

  // Payment Breakdown & QR
  const cashRecRow = document.getElementById('preview-cash-received-row');
  const cashChgRow = document.getElementById('preview-cash-change-row');
  const bankInfoRow = document.getElementById('preview-bank-info-row');
  const qrContainer = document.getElementById('preview-promptpay-qr-container');
  const qrDivider = document.getElementById('preview-qr-divider');
  const printQrCanvas = document.getElementById('previewReceiptQrCanvas');
  const printQrImg = document.getElementById('previewReceiptQrImg');
  const printQrLabel = document.getElementById('preview-qr-code-label');

  if (order.paymentMethod === 'แลกแต้ม / ฟรี' || order.total === 0) {
    cashRecRow.classList.add('hidden');
    cashChgRow.classList.add('hidden');
    bankInfoRow.classList.add('hidden');
    qrContainer.classList.add('hidden');
    if (qrDivider) qrDivider.classList.add('hidden');
  } else if (order.paymentMethod === 'เงินสด') {
    cashRecRow.classList.remove('hidden');
    cashChgRow.classList.remove('hidden');
    bankInfoRow.classList.add('hidden');
    qrContainer.classList.add('hidden');
    if (qrDivider) qrDivider.classList.add('hidden');
    document.getElementById('preview-cash-received').innerText = `฿${order.cashReceived.toFixed(2)}`;
    document.getElementById('preview-cash-change').innerText = `฿${order.cashChange.toFixed(2)}`;
  } else {
    cashRecRow.classList.add('hidden');
    cashChgRow.classList.add('hidden');
    if (qrDivider) qrDivider.classList.remove('hidden');

    if (order.bankInfo && order.bankInfo.accountNo) {
      bankInfoRow.classList.remove('hidden');
      document.getElementById('preview-bank-info').innerText = `${order.bankInfo.shortName} ${order.bankInfo.accountNo}`;
      document.getElementById('preview-bank-acc-name').innerText = order.bankInfo.accountName || '-';
    } else {
      bankInfoRow.classList.add('hidden');
    }

    qrContainer.classList.remove('hidden');
    printQrLabel.innerText = order.paymentMethod === 'โอนบัญชีธนาคาร' ? 'สแกนชำระเงิน (บัญชีธนาคาร)' : 'สแกนชำระเงิน (QR/พร้อมเพย์)';

    if (settings.promptPayType === 'image' && settings.bankQrImage) {
      printQrCanvas.style.display = 'none';
      printQrImg.style.display = 'block';
      printQrImg.src = settings.bankQrImage;
    } else {
      printQrImg.style.display = 'none';
      printQrCanvas.style.display = 'block';

      let payload = '';
      if (settings.promptPayType === 'bank' && settings.bankAccountNo) {
        payload = generateThaiQrPayload('bank', settings.bankAccountNo, settings.bankCode, order.total);
      } else if (settings.promptPayNo) {
        payload = generateThaiQrPayload(settings.promptPayType, settings.promptPayNo, null, order.total);
      }

      if (payload) {
        new QRious({
          element: printQrCanvas,
          value: payload,
          size: 100,
          level: 'M'
        });
      }
    }
  }

  // Footer message
  document.getElementById('preview-receipt-footer-msg').innerText = settings.receiptFooter || 'ขอบคุณที่ใช้บริการ / Thank you';
}

function confirmOrderFromPreview(shouldPrint) {
  if (!currentPreviewOrder || !currentPreviewOrder.isDraft) {
    closeReceiptPreviewModal();
    return;
  }

  const { total } = getCartCalculation();
  if (checkoutMethod === 'cash' && checkoutCashReceived < total) {
    showToast('กรุณากรอกยอดเงินสดที่ได้รับให้ครบถ้วนก่อนบันทึก', 'warning');
    closeReceiptPreviewModal();
    return;
  }

  closeReceiptPreviewModal();
  completeOrder(shouldPrint);
}

function previewPastOrder(orderId) {
  const o = orders.find(ord => ord.id === orderId);
  if (!o) return;
  openReceiptPreviewModal(o);
}

function printPastOrderFromPreview() {
  if (currentPreviewOrder) {
    printReceipt(currentPreviewOrder);
  }
}


// --------------------------------------------------------------------------
// REPORTS & ACCOUNTING DASHBOARD
// --------------------------------------------------------------------------
function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function setDateRange(range) {
  if (currentUser && currentUser.role !== 'owner' && range !== 'today') {
    showToast('⚠️ สิทธิ์พนักงาน: ดูรายงานสรุปยอดขายได้เฉพาะ "วันนี้" เท่านั้น', 'warning');
    range = 'today';
  }
  selectedDateRange = range;

  // Toggle button styling classes for all preset buttons
  ['today', 'yesterday', 'thisWeek', 'week', 'month', 'lastMonth'].forEach(r => {
    const btn = document.getElementById(`btn-date-${r}`);
    if (btn) {
      const isHistorical = (r !== 'today');
      const baseClass = isHistorical ? 'historical-date-ctrl ' : '';
      if (r === range) {
        btn.className = baseClass + 'px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-coffee-600 text-white shadow-sm transition';
      } else {
        btn.className = baseClass + 'px-2.5 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition';
      }
    }
  });

  const startInput = document.getElementById('reportStartDate');
  const endInput = document.getElementById('reportEndDate');
  
  const today = new Date();
  
  if (range === 'today') {
    startInput.value = formatLocalDate(today);
    endInput.value = formatLocalDate(today);
  } else if (range === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    startInput.value = formatLocalDate(yesterday);
    endInput.value = formatLocalDate(yesterday);
  } else if (range === 'thisWeek') {
    // Current week from Monday to Today
    const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday...
    const distToMon = (dayOfWeek + 6) % 7;
    const monDate = new Date(today);
    monDate.setDate(today.getDate() - distToMon);
    startInput.value = formatLocalDate(monDate);
    endInput.value = formatLocalDate(today);
  } else if (range === 'week') {
    // Past 7 days
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 6);
    startInput.value = formatLocalDate(weekAgo);
    endInput.value = formatLocalDate(today);
  } else if (range === 'month') {
    // Current month from 1st to Today
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    startInput.value = formatLocalDate(firstDay);
    endInput.value = formatLocalDate(today);
  } else if (range === 'lastMonth') {
    // Previous month from 1st to Last day
    const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    startInput.value = formatLocalDate(firstDayLastMonth);
    endInput.value = formatLocalDate(lastDayLastMonth);
  }

  calculateReportStats();
}

function customDateChanged() {
  if (currentUser && currentUser.role !== 'owner') {
    showToast('⚠️ สิทธิ์พนักงาน: ดูรายงานสรุปยอดขายได้เฉพาะ "วันนี้" เท่านั้น', 'warning');
    setDateRange('today');
    return;
  }
  selectedDateRange = 'custom';
  ['today', 'yesterday', 'thisWeek', 'week', 'month', 'lastMonth'].forEach(r => {
    const btn = document.getElementById(`btn-date-${r}`);
    if (btn) btn.className = 'px-2.5 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition';
  });
  calculateReportStats();
}

function getFilteredOrders() {
  const startStr = document.getElementById('reportStartDate').value;
  const endStr = document.getElementById('reportEndDate').value;

  if (!startStr || !endStr) return [];

  // Parse time stamps bounds (startOfDay -> endOfDay)
  const startTS = new Date(startStr + 'T00:00:00').getTime();
  const endTS = new Date(endStr + 'T23:59:59').getTime();

  return orders.filter(o => o.timestamp >= startTS && o.timestamp <= endTS);
}

function setPaymentLedgerFilter(filterType) {
  selectedPaymentFilter = filterType;
  updatePaymentFilterUI();
  const filtered = getFilteredOrders();
  renderLedgerTable(filtered);
}

function updatePaymentFilterUI() {
  const cardAll = document.getElementById('card-filter-all');
  const cardCash = document.getElementById('card-filter-cash');
  const cardTransfer = document.getElementById('card-filter-transfer');

  const tabAll = document.getElementById('tab-filter-pay-all');
  const tabCash = document.getElementById('tab-filter-pay-cash');
  const tabTransfer = document.getElementById('tab-filter-pay-transfer');

  const exportBtnText = document.getElementById('exportCsvBtnText');

  // Reset & apply card active states
  if (cardAll) {
    cardAll.className = 'cursor-pointer bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border-2 transition-all group relative ' +
      (selectedPaymentFilter === 'all' 
        ? 'border-amber-600 dark:border-amber-500 ring-4 ring-amber-100 dark:ring-amber-950/60 shadow-md' 
        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700');
  }

  if (cardCash) {
    cardCash.className = 'cursor-pointer p-5 rounded-2xl shadow-sm border-2 transition-all group relative overflow-hidden ' +
      (selectedPaymentFilter === 'cash' 
        ? 'bg-amber-100/70 dark:bg-amber-950/60 border-amber-500 dark:border-amber-500 ring-4 ring-amber-200/90 dark:ring-amber-900/50 shadow-md' 
        : 'bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30 border-amber-200 dark:border-amber-900/40 hover:border-amber-400 dark:hover:border-amber-700');
  }

  if (cardTransfer) {
    cardTransfer.className = 'cursor-pointer p-5 rounded-2xl shadow-sm border-2 transition-all group relative overflow-hidden ' +
      (selectedPaymentFilter === 'transfer' 
        ? 'bg-emerald-100/70 dark:bg-emerald-950/60 border-emerald-600 dark:border-emerald-500 ring-4 ring-emerald-200/90 dark:ring-emerald-900/50 shadow-md' 
        : 'bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40 hover:border-emerald-400 dark:hover:border-emerald-700');
  }

  // Update tabs active states
  if (tabAll) {
    tabAll.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition ' +
      (selectedPaymentFilter === 'all' 
        ? 'bg-amber-600 text-white shadow-sm' 
        : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-transparent');
  }

  if (tabCash) {
    tabCash.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1 ' +
      (selectedPaymentFilter === 'cash' 
        ? 'bg-amber-500 text-white shadow-sm' 
        : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-transparent');
  }

  if (tabTransfer) {
    tabTransfer.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1 ' +
      (selectedPaymentFilter === 'transfer' 
        ? 'bg-emerald-600 text-white shadow-sm' 
        : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-transparent');
  }

  if (exportBtnText) {
    if (selectedPaymentFilter === 'cash') {
      exportBtnText.innerText = 'ส่งออก CSV (เงินสด)';
    } else if (selectedPaymentFilter === 'transfer') {
      exportBtnText.innerText = 'ส่งออก CSV (โอน/QR)';
    } else {
      exportBtnText.innerText = 'ส่งออก Excel/CSV';
    }
  }
}

function calculateReportStats() {
  const filtered = getFilteredOrders();
  
  let totalSales = 0;
  let normalOrdersCount = 0;
  let voidedOrdersCount = 0;
  let promptPayTotal = 0;
  let promptPayOrdersCount = 0;
  let cashTotal = 0;
  let cashOrdersCount = 0;
  
  const productQuantities = {};
  latestProductSalesStats = {};

  filtered.forEach(o => {
    if (o.status === 'voided') {
      voidedOrdersCount++;
    } else {
      totalSales += o.total;
      normalOrdersCount++;
      
      const isCash = (o.paymentMethod === 'เงินสด');
      const isRedemption = (o.paymentMethod === 'แลกแต้ม / ฟรี' || o.total === 0);
      if (isCash) {
        cashTotal += o.total;
        cashOrdersCount++;
      } else if (!isRedemption) {
        promptPayTotal += o.total;
        promptPayOrdersCount++;
      }

      // Count quantities of products and collect category sales stats
      o.items.forEach(item => {
        productQuantities[item.name] = (productQuantities[item.name] || 0) + item.qty;

        const prod = products.find(p => p.id === item.id || p.name === item.name);
        const category = prod ? prod.category : (item.category || 'เมนูพิเศษ');
        const image = prod ? prod.image : null;

        if (!latestProductSalesStats[item.name]) {
          latestProductSalesStats[item.name] = {
            id: item.id,
            name: item.name,
            category: category,
            image: image,
            qty: 0,
            revenue: 0
          };
        }
        latestProductSalesStats[item.name].qty += item.qty;
        latestProductSalesStats[item.name].revenue += (item.itemTotal || (item.pricePerItem * item.qty) || 0);
      });
    }
  });

  // Calculate Average ticket
  const avgTicket = normalOrdersCount > 0 ? (totalSales / normalOrdersCount) : 0;
  
  // Percentages calculation
  const cashPct = totalSales > 0 ? ((cashTotal / totalSales) * 100).toFixed(1) : '0.0';
  const transferPct = totalSales > 0 ? ((promptPayTotal / totalSales) * 100).toFixed(1) : '0.0';

  // Render Stats Card Values
  document.getElementById('metricTotalSales').innerText = `฿${totalSales.toFixed(2)}`;
  document.getElementById('metricTotalSalesCount').innerText = `${normalOrdersCount} รายการสำเร็จ (ยกเลิก ${voidedOrdersCount})`;
  const badgeAll = document.getElementById('badgeTotalAllOrders');
  if (badgeAll) badgeAll.innerText = `${filtered.length} ออเดอร์`;
  document.getElementById('metricAvgTicket').innerText = `เฉลี่ย ฿${avgTicket.toFixed(2)}/บิล`;
  
  // Cash stats card
  document.getElementById('metricCashSales').innerText = `฿${cashTotal.toFixed(2)}`;
  document.getElementById('metricCashOrdersCount').innerText = `${cashOrdersCount} บิลเงินสด`;
  document.getElementById('badgeCashShare').innerText = `${cashPct}% ของยอดขาย`;

  // Bank Transfer / QR stats card
  document.getElementById('metricPromptPaySales').innerText = `฿${promptPayTotal.toFixed(2)}`;
  document.getElementById('metricTransferOrdersCount').innerText = `${promptPayOrdersCount} บิลโอนเงิน/QR`;
  document.getElementById('badgeTransferShare').innerText = `${transferPct}% ของยอดขาย`;

  // Visual Split Ratio Bar
  const ratioCashAmount = document.getElementById('ratioCashAmount');
  const ratioCashPct = document.getElementById('ratioCashPct');
  const ratioTransferAmount = document.getElementById('ratioTransferAmount');
  const ratioTransferPct = document.getElementById('ratioTransferPct');

  if (ratioCashAmount) ratioCashAmount.innerText = `฿${cashTotal.toFixed(2)}`;
  if (ratioCashPct) ratioCashPct.innerText = `${cashPct}%`;
  if (ratioTransferAmount) ratioTransferAmount.innerText = `฿${promptPayTotal.toFixed(2)}`;
  if (ratioTransferPct) ratioTransferPct.innerText = `${transferPct}%`;

  const barCash = document.getElementById('ratioBarCash');
  const barTransfer = document.getElementById('ratioBarTransfer');
  if (barCash && barTransfer) {
    if (totalSales > 0) {
      barCash.style.width = `${cashPct}%`;
      barTransfer.style.width = `${transferPct}%`;
    } else {
      barCash.style.width = '50%';
      barTransfer.style.width = '50%';
    }
  }

  // Update counters in ledger filter tabs
  const countAll = document.getElementById('countDisplayAll');
  const countCash = document.getElementById('countDisplayCash');
  const countTransfer = document.getElementById('countDisplayTransfer');
  if (countAll) countAll.innerText = `${filtered.length}`;
  if (countCash) countCash.innerText = `${cashOrdersCount}`;
  if (countTransfer) countTransfer.innerText = `${promptPayOrdersCount}`;

  // Period label for chart
  const startStr = document.getElementById('reportStartDate').value;
  const endStr = document.getElementById('reportEndDate').value;
  const chartLabel = document.getElementById('chartPeriodLabel');
  if (chartLabel && startStr && endStr) {
    chartLabel.innerText = startStr === endStr ? `วันที่ ${startStr}` : `ช่วง ${startStr} ถึง ${endStr}`;
  }

  // Update payment filter UI highlights
  updatePaymentFilterUI();

  // Period label for Cashier section
  const cashierPeriodBadge = document.getElementById('cashierPeriodBadge');
  if (cashierPeriodBadge && startStr && endStr) {
    cashierPeriodBadge.innerText = startStr === endStr ? `วันที่ ${startStr}` : `ช่วง ${startStr} ถึง ${endStr}`;
  }

  // Render cashier performance breakdown and update filter dropdown
  renderCashierPerformance(filtered);

  // Render category filter tabs and list of top items
  renderBestSellerCategoryTabs();
  renderTopItemsList(latestProductSalesStats);

  // Render transaction history ledger
  renderLedgerTable(filtered);

  // Render SVG Chart graph
  renderSVGChart(filtered);
}

// --------------------------------------------------------------------------
// CASHIER PERFORMANCE & SALES ATTRIBUTION BREAKDOWN
// --------------------------------------------------------------------------
function renderCashierPerformance(filteredOrders) {
  const container = document.getElementById('cashierCardsGrid');
  if (!container) return;
  container.innerHTML = '';

  const activeOrders = filteredOrders.filter(o => o.status !== 'voided');
  const totalShopSales = activeOrders.reduce((sum, o) => sum + o.total, 0);

  // Build cashier stats map
  const cashierStats = {};

  // 1. Initialize with all registered active users from users array
  users.forEach(u => {
    if (u.active !== false) {
      cashierStats[u.id] = {
        id: u.id,
        name: u.name,
        role: u.role,
        totalSales: 0,
        billsCount: 0,
        voidedCount: 0,
        itemsCount: 0
      };
    }
  });

  // 2. Accumulate stats from filteredOrders
  filteredOrders.forEach(o => {
    const cId = o.cashierId || 'user-owner';
    if (!cashierStats[cId]) {
      cashierStats[cId] = {
        id: cId,
        name: o.cashierName || 'พนักงาน',
        role: o.cashierRole || 'staff',
        totalSales: 0,
        billsCount: 0,
        voidedCount: 0,
        itemsCount: 0
      };
    }

    if (o.status === 'voided') {
      cashierStats[cId].voidedCount++;
    } else {
      cashierStats[cId].totalSales += o.total;
      cashierStats[cId].billsCount++;
      cashierStats[cId].itemsCount += (o.items || []).reduce((sum, i) => sum + (i.qty || 1), 0);
    }
  });

  const statsList = Object.values(cashierStats);
  
  // Sort descending by totalSales, then by billsCount
  statsList.sort((a, b) => b.totalSales - a.totalSales || b.billsCount - a.billsCount);

  // Update Cashier Filter Dropdown
  updateLedgerCashierFilterDropdown(statsList);

  if (statsList.length === 0) {
    container.innerHTML = `<span class="col-span-full text-center py-6 text-xs text-slate-400 dark:text-slate-500">ไม่มีข้อมูลพนักงานสำหรับช่วงเวลานี้</span>`;
    return;
  }

  // Render cards
  statsList.forEach((stat, index) => {
    const rank = index + 1;
    const isFiltered = (selectedCashierFilter === stat.id);
    const sharePct = totalShopSales > 0 ? ((stat.totalSales / totalShopSales) * 100).toFixed(1) : '0.0';
    const avgTicket = stat.billsCount > 0 ? (stat.totalSales / stat.billsCount) : 0;
    const isOwner = (stat.role === 'owner');

    let rankBadge = '';
    if (stat.totalSales > 0) {
      if (rank === 1) rankBadge = '<span class="text-base" title="อันดับ 1">🥇</span>';
      else if (rank === 2) rankBadge = '<span class="text-base" title="อันดับ 2">🥈</span>';
      else if (rank === 3) rankBadge = '<span class="text-base" title="อันดับ 3">🥉</span>';
      else rankBadge = `<span class="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-bold flex items-center justify-center border border-slate-200 dark:border-slate-700">#${rank}</span>`;
    }

    const card = document.createElement('div');
    card.className = `p-4 rounded-2xl border-2 transition-all cursor-pointer relative group flex flex-col justify-between ${
      isFiltered
        ? 'border-amber-600 dark:border-amber-500 bg-amber-50/50 dark:bg-amber-950/40 ring-4 ring-amber-200/80 dark:ring-amber-900/50 shadow-md'
        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm'
    }`;
    card.onclick = () => toggleCashierFilter(stat.id);

    card.innerHTML = `
      <div>
        <div class="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-200/80 dark:border-slate-800/80">
          <div class="flex items-center space-x-2.5 min-w-0">
            <div class="w-9 h-9 rounded-xl ${isOwner ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30' : 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30'} flex items-center justify-center font-bold text-base flex-shrink-0">
              ${isOwner ? '👑' : '👤'}
            </div>
            <div class="min-w-0">
              <div class="font-bold text-xs text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                <span class="truncate" title="${stat.name}">${stat.name}</span>
              </div>
              <div class="flex items-center gap-1 mt-0.5">
                <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold ${isOwner ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300' : 'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300'}">
                  ${isOwner ? 'เจ้าของร้าน' : 'พนักงาน'}
                </span>
                ${isFiltered ? '<span class="text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-900/60 px-1 rounded">กำลังกรอง</span>' : ''}
              </div>
            </div>
          </div>
          <div class="flex items-center space-x-1 flex-shrink-0">
            ${rankBadge}
          </div>
        </div>

        <div class="mt-3 space-y-2">
          <div class="flex items-baseline justify-between">
            <span class="text-[11px] text-slate-500 dark:text-slate-400 font-medium">ยอดขายรวม</span>
            <span class="text-base font-black text-slate-900 dark:text-white">฿${stat.totalSales.toFixed(2)}</span>
          </div>
          <div class="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span class="flex items-center gap-1">
              <span>🧾 ปิดบิล:</span>
              <span class="font-bold text-slate-900 dark:text-white">${stat.billsCount} บิล</span>
              ${stat.voidedCount > 0 ? `<span class="text-[10px] text-red-500">(ยกเลิก ${stat.voidedCount})</span>` : ''}
            </span>
            <span class="text-[11px] text-coffee-700 dark:text-amber-400 font-bold">
              เฉลี่ย ฿${avgTicket.toFixed(2)}/บิล
            </span>
          </div>

          <!-- Share percentage bar -->
          <div class="space-y-1 pt-1">
            <div class="flex justify-between text-[10px] font-medium text-slate-400">
              <span>สัดส่วนผลงาน</span>
              <span class="font-bold text-slate-700 dark:text-slate-300">${sharePct}%</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div class="${isOwner ? 'bg-amber-500' : 'bg-sky-500'} h-full rounded-full transition-all duration-500" style="width: ${sharePct}%"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
        <span>${isFiltered ? 'กดเพื่อยกเลิกตัวกรอง' : 'กดเพื่อดูเฉพาะบิลคนนี้'}</span>
        <span class="font-bold group-hover:translate-x-0.5 transition-transform text-amber-600 dark:text-amber-400">${isFiltered ? '✕ รีเซ็ต' : 'ดูบิล →'}</span>
      </div>
    `;

    container.appendChild(card);
  });
}

function updateLedgerCashierFilterDropdown(statsList) {
  const select = document.getElementById('selectLedgerCashierFilter');
  if (!select) return;

  const currentVal = selectedCashierFilter;
  select.innerHTML = '<option value="all">พนักงานทุกคน (All)</option>';

  statsList.forEach(stat => {
    const opt = document.createElement('option');
    opt.value = stat.id;
    const roleLabel = stat.role === 'owner' ? 'Owner' : 'Staff';
    opt.innerText = `${stat.name} (${roleLabel} - ${stat.billsCount} บิล)`;
    select.appendChild(opt);
  });

  select.value = currentVal;
}

function setCashierLedgerFilter(cashierId) {
  selectedCashierFilter = cashierId;
  const select = document.getElementById('selectLedgerCashierFilter');
  if (select) select.value = cashierId;

  const filtered = getFilteredOrders();
  renderCashierPerformance(filtered);
  renderLedgerTable(filtered);
}

function toggleCashierFilter(cashierId) {
  if (selectedCashierFilter === cashierId) {
    selectedCashierFilter = 'all';
  } else {
    selectedCashierFilter = cashierId;
  }
  setCashierLedgerFilter(selectedCashierFilter);
}

// --------------------------------------------------------------------------
// BEST SELLERS RANKING & CATEGORY FILTERING LOGIC
// --------------------------------------------------------------------------
function renderBestSellerCategoryTabs() {
  const container = document.getElementById('bestSellerCategoryTabs');
  if (!container) return;
  container.innerHTML = '';

  // Tab "ทั้งหมด" (All)
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = `px-3 py-1 text-xs font-bold rounded-lg transition ${reportBestSellerCategory === 'all' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`;
  allBtn.innerText = 'ทั้งหมด';
  allBtn.onclick = () => setBestSellerCategory('all');
  container.appendChild(allBtn);

  // Dynamic category pills from categories array
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `px-3 py-1 text-xs font-bold rounded-lg transition whitespace-nowrap ${reportBestSellerCategory === cat ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`;
    btn.innerText = cat;
    btn.onclick = () => setBestSellerCategory(cat);
    container.appendChild(btn);
  });

  const badge = document.getElementById('bestSellerCategoryBadge');
  if (badge) {
    badge.innerText = reportBestSellerCategory === 'all' ? 'ทั้งหมด' : reportBestSellerCategory;
  }
}

function setBestSellerCategory(cat) {
  reportBestSellerCategory = cat;
  renderBestSellerCategoryTabs();
  renderTopItemsList(latestProductSalesStats);
}

function renderTopItemsList(salesStats = latestProductSalesStats) {
  const container = document.getElementById('topSellingList');
  if (!container) return;
  container.innerHTML = '';

  let items = Object.values(salesStats);
  if (reportBestSellerCategory !== 'all') {
    items = items.filter(i => i.category === reportBestSellerCategory);
  }

  // Sort descending by qty sold, then by total revenue
  items.sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);

  if (items.length === 0) {
    const catLabel = reportBestSellerCategory === 'all' ? 'ทุกหมวดหมู่' : `หมวด "${reportBestSellerCategory}"`;
    container.innerHTML = `<span class="text-xs text-slate-400 dark:text-slate-500 block text-center py-6">ไม่มีข้อมูลออเดอร์ใน${catLabel} สำหรับช่วงเวลานี้</span>`;
    return;
  }

  const maxQty = items[0].qty;

  items.forEach((item, index) => {
    const pct = maxQty > 0 ? (item.qty / maxQty) * 100 : 0;
    const rank = index + 1;

    // Rank Medal & Styling
    let rankBadge = '';
    let barColor = 'bg-coffee-600';

    if (rank === 1) {
      rankBadge = `<span class="w-6 h-6 rounded-full bg-amber-400 text-amber-950 font-black text-xs flex items-center justify-center shadow-sm flex-shrink-0" title="อันดับ 1">🥇</span>`;
      barColor = 'bg-amber-500';
    } else if (rank === 2) {
      rankBadge = `<span class="w-6 h-6 rounded-full bg-slate-300 text-slate-800 font-black text-xs flex items-center justify-center shadow-sm flex-shrink-0" title="อันดับ 2">🥈</span>`;
      barColor = 'bg-slate-400';
    } else if (rank === 3) {
      rankBadge = `<span class="w-6 h-6 rounded-full bg-amber-700 text-amber-100 font-black text-xs flex items-center justify-center shadow-sm flex-shrink-0" title="อันดับ 3">🥉</span>`;
      barColor = 'bg-amber-700';
    } else {
      rankBadge = `<span class="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs flex items-center justify-center border border-slate-200 dark:border-slate-700 flex-shrink-0">${rank}</span>`;
      barColor = 'bg-amber-600';
    }

    const thumbHtml = item.image 
      ? `<img src="${item.image}" alt="${item.name}" class="w-7 h-7 rounded-lg object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0">` 
      : '';

    const row = document.createElement('div');
    row.className = 'space-y-1.5 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition border border-transparent hover:border-slate-200/80 dark:hover:border-slate-700/80 animate-slide-in';
    row.innerHTML = `
      <div class="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
        <div class="flex items-center space-x-2 truncate max-w-[65%]">
          ${rankBadge}
          ${thumbHtml}
          <div class="truncate">
            <span class="font-bold text-slate-900 dark:text-slate-100 block truncate">${item.name}</span>
            <span class="text-[10px] text-slate-400 dark:text-slate-500 font-medium">${item.category}</span>
          </div>
        </div>
        <div class="text-right flex-shrink-0">
          <span class="font-extrabold text-slate-900 dark:text-slate-100 block text-xs">${item.qty} แก้ว/ชิ้น</span>
          <span class="text-[10px] text-coffee-700 dark:text-amber-400 font-bold">฿${item.revenue.toFixed(2)}</span>
        </div>
      </div>
      <div class="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
        <div class="${barColor} h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

function renderLedgerTable(filteredOrders) {
  const body = document.getElementById('ledgerTableBody');
  if (!body) return;
  body.innerHTML = '';

  // Filter orders by payment method
  let displayedOrders = filteredOrders;
  if (selectedPaymentFilter === 'cash') {
    displayedOrders = filteredOrders.filter(o => o.paymentMethod === 'เงินสด');
  } else if (selectedPaymentFilter === 'transfer') {
    displayedOrders = filteredOrders.filter(o => o.paymentMethod !== 'เงินสด' && o.paymentMethod !== 'แลกแต้ม / ฟรี' && o.total > 0);
  }

  // Filter orders by cashier
  if (selectedCashierFilter !== 'all') {
    displayedOrders = displayedOrders.filter(o => (o.cashierId || 'user-owner') === selectedCashierFilter);
  }

  // Calculate sum of active displayed orders
  let displayedSum = 0;
  displayedOrders.forEach(o => {
    if (o.status !== 'voided') displayedSum += o.total;
  });

  const countDisplay = document.getElementById('ledgerCountDisplay');
  if (countDisplay) {
    const matchedCashier = users.find(u => u.id === selectedCashierFilter);
    const cashierLabel = matchedCashier ? ` (${matchedCashier.name})` : '';
    
    if (selectedPaymentFilter === 'cash') {
      countDisplay.innerText = `แสดงเงินสด${cashierLabel} ${displayedOrders.length} บิล (ยอด ฿${displayedSum.toFixed(2)})`;
    } else if (selectedPaymentFilter === 'transfer') {
      countDisplay.innerText = `แสดงโอน/QR${cashierLabel} ${displayedOrders.length} บิล (ยอด ฿${displayedSum.toFixed(2)})`;
    } else {
      countDisplay.innerText = `แสดง${cashierLabel} ${displayedOrders.length} บิล (ยอด ฿${displayedSum.toFixed(2)})`;
    }
  }

  if (displayedOrders.length === 0) {
    let emptyMsg = 'ไม่มีบันทึกบัญชีของช่วงเวลาที่เลือก';
    if (selectedPaymentFilter === 'cash') emptyMsg = 'ไม่มีรายการชำระด้วยเงินสดในช่วงเวลาที่เลือก';
    if (selectedPaymentFilter === 'transfer') emptyMsg = 'ไม่มีรายการชำระด้วยการโอนเงินหรือ QR Code ในช่วงเวลาที่เลือก';
    if (selectedCashierFilter !== 'all') emptyMsg += ' สำหรับพนักงานท่านนี้';

    body.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-8 text-slate-400 dark:text-slate-500 text-sm">${emptyMsg}</td>
      </tr>
    `;
    return;
  }

  // Sort orders descending by timestamp
  const sorted = [...displayedOrders].sort((a, b) => b.timestamp - a.timestamp);
  const isOwnerLoggedIn = (currentUser && currentUser.role === 'owner');

  sorted.forEach(o => {
    const tr = document.createElement('tr');
    tr.className = `hover:bg-slate-50/50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 ${o.status === 'voided' ? 'opacity-50 line-through bg-red-50/20 dark:bg-red-950/20' : ''}`;
    
    const dateStr = new Date(o.timestamp).toLocaleString('th-TH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Compile items name strings
    const itemsSummary = o.items.map(i => {
      let customLabel = '';
      if (i.selectedTemp) customLabel += ` (${i.selectedTemp})`;
      if (i.customPriceNote) customLabel += ` [${i.customPriceNote}]`;
      else if (i.customNotes) customLabel += ` [${i.customNotes}]`;
      else if (i.pricePerItem === 0) customLabel += ` [ฟรี]`;
      return `${i.name}${customLabel} x${i.qty}`;
    }).join(', ');

    // Cashier column display
    const cName = o.cashierName || 'เจ้าของร้าน';
    const cRole = o.cashierRole || 'owner';
    const isCashierOwner = (cRole === 'owner');
    
    const cashierRoleBadge = isCashierOwner
      ? `<span class="bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-[10px] font-bold px-1.5 py-0.2 rounded border border-amber-300 dark:border-amber-800">Owner</span>`
      : `<span class="bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 text-[10px] font-bold px-1.5 py-0.2 rounded border border-sky-300 dark:border-sky-800">Staff</span>`;

    const reassignedBadge = o.reassignedAt 
      ? `<span class="text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-1 py-0.2 rounded border border-amber-200 dark:border-amber-800" title="บิลนี้ได้รับการโอนยอดขาย">โอนยอดแล้ว</span>` 
      : '';

    // Reassign button: strictly rendered ONLY if currentUser.role === 'owner' and order is not voided
    const reassignButtonHtml = (isOwnerLoggedIn && o.status !== 'voided')
      ? `<button onclick="openReassignCashierModal('${o.id}')" title="โอนยอดบิลนี้ให้พนักงานคนอื่น" class="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-800 px-2 py-0.5 rounded-lg transition shadow-xs">
          <span>⇄</span>
          <span>โอนยอด</span>
         </button>`
      : '';

    // Badges UI
    let payBadge = '';
    if (o.paymentMethod === 'แลกแต้ม / ฟรี' || o.total === 0) {
      payBadge = `<span class="bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/70 px-2 py-0.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1"><span>🎁</span><span>แลกแต้ม/ฟรี</span></span>`;
    } else if (o.paymentMethod === 'โอนบัญชีธนาคาร') {
      payBadge = `<span class="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/70 px-2 py-0.5 rounded-full text-xs font-semibold">โอนธนาคาร</span>`;
    } else if (o.paymentMethod === 'พร้อมเพย์' || o.paymentMethod === 'โอนเงิน/QR') {
      payBadge = `<span class="bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800/70 px-2 py-0.5 rounded-full text-xs font-semibold">QR / พร้อมเพย์</span>`;
    } else {
      payBadge = `<span class="bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70 px-2 py-0.5 rounded-full text-xs font-semibold">เงินสด</span>`;
    }

    const statusBadge = o.status === 'completed'
      ? `<span class="text-emerald-700 dark:text-emerald-400 font-semibold text-xs flex items-center justify-center space-x-1">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1"></span>สำเร็จ
         </span>`
      : `<span class="text-red-600 dark:text-red-400 font-semibold text-xs flex items-center justify-center space-x-1">
          <span class="w-1.5 h-1.5 rounded-full bg-red-500 mr-1"></span>ยกเลิก
         </span>`;

    const isVoided = o.status === 'voided';
    
    tr.innerHTML = `
      <td class="px-5 py-3.5 text-xs whitespace-nowrap">${dateStr}</td>
      <td class="px-4 py-3.5 font-bold text-slate-900 dark:text-slate-100 text-xs">
        ${o.id}
      </td>
      <td class="px-4 py-3.5 text-xs whitespace-nowrap">
        <div class="flex flex-col items-start gap-1">
          <div class="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
            <span>👤</span>
            <span class="truncate max-w-[120px]" title="${cName}">${cName}</span>
            ${cashierRoleBadge}
          </div>
          <div class="flex items-center gap-1.5">
            ${reassignedBadge}
            ${reassignButtonHtml}
          </div>
        </div>
      </td>
      <td class="px-5 py-3.5 text-xs max-w-[220px] truncate" title="${itemsSummary}">${itemsSummary}</td>
      <td class="px-4 py-3.5 text-right font-medium text-red-500 dark:text-red-400 text-xs">฿${o.discount.toFixed(2)}</td>
      <td class="px-4 py-3.5 text-right font-extrabold text-slate-900 dark:text-slate-100 text-xs">฿${o.total.toFixed(2)}</td>
      <td class="px-4 py-3.5 text-center">${payBadge}</td>
      <td class="px-4 py-3.5 text-center">${statusBadge}</td>
      <td class="px-4 py-3.5 text-center">
        <div class="flex items-center justify-center space-x-1.5">
          <button onclick="previewPastOrder('${o.id}')" title="ดูตัวอย่างใบเสร็จ" class="text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
          <button onclick="reprintPastOrder('${o.id}')" title="พิมพ์ใบเสร็จซ้ำ" class="text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </button>
          
          <button onclick="toggleVoidOrder('${o.id}')" title="${isVoided ? 'กู้คืนออเดอร์' : 'ยกเลิกออเดอร์ (Void)'}" class="${isVoided ? 'text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300' : 'text-red-400 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300'} p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="${isVoided ? 'M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2' : 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636'}" />
            </svg>
          </button>
        </div>
      </td>
    `;
    body.appendChild(tr);
  });
}

function toggleVoidOrder(orderId) {
  const o = orders.find(ord => ord.id === orderId);
  if (!o) return;
  
  if (currentUser && currentUser.role !== 'owner') {
    promptOwnerPinOverride(() => {
      executeToggleVoid(orderId);
    }, 'การยกเลิก/กู้คืนออเดอร์ต้องได้รับการอนุมัติด้วยรหัส PIN เจ้าของร้าน (Owner)');
    return;
  }
  executeToggleVoid(orderId);
}

function executeToggleVoid(orderId) {
  const o = orders.find(ord => ord.id === orderId);
  if (!o) return;

  const textConfirm = o.status === 'completed'
    ? 'คุณต้องการยกเลิกออเดอร์นี้และหักยอดขายออกหรือไม่?'
    : 'คุณต้องการกู้คืนออเดอร์นี้กลับมาเป็นยอดขายปกติหรือไม่?';
    
  if (confirm(textConfirm)) {
    o.status = o.status === 'completed' ? 'voided' : 'completed';
    saveToStorage('coffeeshop_orders', orders);
    if (typeof syncOrderToCloud === 'function') {
      syncOrderToCloud(o);
    }
    calculateReportStats();
    showToast(`อัปเดตสถานะออเดอร์ ${orderId} เรียบร้อยแล้ว`);
  }
}

function reprintPastOrder(orderId) {
  const o = orders.find(ord => ord.id === orderId);
  if (!o) return;
  printReceipt(o);
}

// --------------------------------------------------------------------------
// REASSIGN CASHIER (โอนย้ายยอดขายบิล - สิทธิ์เฉพาะ Owner)
// --------------------------------------------------------------------------
function openReassignCashierModal(orderId) {
  const o = orders.find(ord => ord.id === orderId);
  if (!o) {
    showToast('ไม่พบออเดอร์ดังกล่าวในระบบ', 'error');
    return;
  }

  // Strictly enforce Owner permission
  if (currentUser && currentUser.role !== 'owner') {
    promptOwnerPinOverride(() => {
      openReassignCashierModal(orderId);
    }, 'สิทธิ์เฉพาะเจ้าของร้าน (Owner) ในการโอนย้ายยอดขายบิล');
    return;
  }

  reassignTargetOrderId = orderId;
  reassignSelectedCashierId = o.cashierId || 'user-owner';

  const modal = document.getElementById('reassignCashierModal');
  const modalOrderId = document.getElementById('reassignModalOrderId');
  const modalTotal = document.getElementById('reassignModalTotal');
  const modalTime = document.getElementById('reassignModalTime');
  const modalCurrentCashier = document.getElementById('reassignModalCurrentCashier');

  if (modalOrderId) modalOrderId.innerText = o.id;
  if (modalTotal) modalTotal.innerText = `฿${o.total.toFixed(2)}`;
  if (modalTime) {
    const d = new Date(o.timestamp);
    modalTime.innerText = `เวลา: ${d.toLocaleDateString('th-TH')} ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (modalCurrentCashier) {
    const roleLabel = o.cashierRole === 'owner' ? 'Owner' : 'Staff';
    modalCurrentCashier.innerText = `ผู้ขายปัจจุบัน: ${o.cashierName || 'เจ้าของร้าน'} (${roleLabel})`;
  }

  renderReassignCashierOptions();
  if (modal) modal.classList.remove('hidden');
}

function renderReassignCashierOptions() {
  const container = document.getElementById('reassignCashierOptionsContainer');
  if (!container) return;
  container.innerHTML = '';

  const activeUsers = users.filter(u => u.active !== false);

  activeUsers.forEach(u => {
    const isSelected = (u.id === reassignSelectedCashierId);
    const roleBadge = u.role === 'owner' 
      ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">เจ้าของร้าน (Owner)</span>'
      : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-300 dark:border-sky-800">พนักงาน (Staff)</span>';

    const card = document.createElement('div');
    card.className = `p-3 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${
      isSelected 
        ? 'border-amber-600 dark:border-amber-500 bg-amber-50/70 dark:bg-amber-950/50 ring-2 ring-amber-200 dark:ring-amber-900/50 shadow-sm' 
        : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
    }`;
    card.onclick = () => selectReassignCashier(u.id);

    card.innerHTML = `
      <div class="flex items-center space-x-3">
        <div class="w-9 h-9 rounded-xl ${u.role === 'owner' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-sky-500/20 text-sky-700 dark:text-sky-300'} flex items-center justify-center font-bold text-sm">
          ${u.role === 'owner' ? '👑' : '👤'}
        </div>
        <div>
          <div class="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
            <span>${u.name}</span>
            ${roleBadge}
          </div>
          <div class="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            ${u.id === (currentUser ? currentUser.id : '') ? '(บัญชีที่คุณล็อกอินอยู่)' : ''}
          </div>
        </div>
      </div>
      <div class="flex items-center">
        <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          isSelected 
            ? 'border-amber-600 dark:border-amber-500 bg-amber-600 dark:bg-amber-500 text-white' 
            : 'border-slate-300 dark:border-slate-600'
        }">
          ${isSelected ? '<svg class="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/></svg>' : ''}
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

function selectReassignCashier(cashierId) {
  reassignSelectedCashierId = cashierId;
  renderReassignCashierOptions();
}

function closeReassignCashierModal() {
  const modal = document.getElementById('reassignCashierModal');
  if (modal) modal.classList.add('hidden');
  reassignTargetOrderId = null;
  reassignSelectedCashierId = null;
}

function confirmReassignCashier() {
  if (!reassignTargetOrderId) {
    closeReassignCashierModal();
    return;
  }

  // Re-verify Owner role
  if (currentUser && currentUser.role !== 'owner') {
    showToast('⚠️ สิทธิ์เฉพาะเจ้าของร้าน (Owner) ในการโอนย้ายยอดขาย', 'warning');
    closeReassignCashierModal();
    return;
  }

  const o = orders.find(ord => ord.id === reassignTargetOrderId);
  if (!o) {
    showToast('ไม่พบออเดอร์ดังกล่าวในระบบ', 'error');
    closeReassignCashierModal();
    return;
  }

  const targetUser = users.find(u => u.id === reassignSelectedCashierId);
  if (!targetUser) {
    showToast('กรุณาเลือกพนักงานที่ต้องการโอนยอดให้', 'warning');
    return;
  }

  if (o.cashierId === targetUser.id) {
    showToast(`บิล ${o.id} มี "${targetUser.name}" เป็นผู้ขายอยู่แล้ว`, 'info');
    closeReassignCashierModal();
    return;
  }

  const prevName = o.cashierName || 'เจ้าของร้าน';
  o.cashierId = targetUser.id;
  o.cashierName = targetUser.name;
  o.cashierRole = targetUser.role;
  o.reassignedAt = Date.now();
  o.reassignedBy = currentUser ? currentUser.id : 'user-owner';

  saveToStorage('coffeeshop_orders', orders);
  if (typeof syncOrderToCloud === 'function') {
    syncOrderToCloud(o);
  }
  closeReassignCashierModal();

  showToast(`โอนยอดบิล ${o.id} จาก "${prevName}" ให้ "${targetUser.name}" สำเร็จ!`, 'success');
  calculateReportStats();
}

// --------------------------------------------------------------------------
// EXPORT TRANSACTIONS TO EXCEL / CSV FILE
// --------------------------------------------------------------------------
function exportToCSV() {
  if (currentUser && currentUser.role !== 'owner') {
    showToast('⚠️ สิทธิ์ไม่เพียงพอ: ส่งออกข้อมูลยอดขายได้เฉพาะเจ้าของร้าน (Owner) เท่านั้น', 'warning');
    return;
  }

  const filtered = getFilteredOrders();
  let ordersToExport = filtered;

  if (selectedPaymentFilter === 'cash') {
    ordersToExport = filtered.filter(o => o.paymentMethod === 'เงินสด');
  } else if (selectedPaymentFilter === 'transfer') {
    ordersToExport = filtered.filter(o => o.paymentMethod !== 'เงินสด');
  }

  if (selectedCashierFilter !== 'all') {
    ordersToExport = ordersToExport.filter(o => (o.cashierId || 'user-owner') === selectedCashierFilter);
  }

  if (ordersToExport.length === 0) {
    showToast('ไม่มีข้อมูลยอดขายสำหรับส่งออกในช่วงเวลานี้', 'warning');
    return;
  }

  // BOM header to support Excel Thai characters rendering encoding correctly
  let csvContent = '\uFEFF';
  csvContent += 'รหัสออเดอร์,วัน-เวลา,ผู้ขาย/แคชเชียร์,ตำแหน่ง,รายการสินค้า,ราคารวมสินค้า,ส่วนลด,ยอดสุทธิ,ช่องทางชำระเงิน,สถานะ\r\n';

  ordersToExport.forEach(o => {
    const dateStr = new Date(o.timestamp).toLocaleString('th-TH');
    
    // Compile items text list
    const itemsSummary = o.items.map(i => {
      let customLabel = '';
      if (i.selectedTemp) customLabel += `-${i.selectedTemp}`;
      return `${i.name}${customLabel} (x${i.qty})`;
    }).join('; ');

    const roleName = (o.cashierRole === 'owner') ? 'เจ้าของร้าน (Owner)' : 'พนักงาน (Staff)';

    const row = [
      o.id,
      dateStr,
      `"${o.cashierName || 'เจ้าของร้าน'}"`,
      `"${roleName}"`,
      `"${itemsSummary}"`,
      o.subtotal.toFixed(2),
      o.discount.toFixed(2),
      o.total.toFixed(2),
      o.paymentMethod,
      o.status === 'completed' ? 'สำเร็จ' : 'ยกเลิก'
    ];
    
    csvContent += row.join(',') + '\r\n';
  });

  // Create temporary link element to trigger downloads
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  const startStr = document.getElementById('reportStartDate').value;
  const endStr = document.getElementById('reportEndDate').value;
  let filterTag = selectedPaymentFilter === 'cash' ? 'เฉพาะเงินสด' : selectedPaymentFilter === 'transfer' ? 'เฉพาะโอนเงิน-QR' : 'รวมทั้งหมด';
  if (selectedCashierFilter !== 'all') {
    const matched = users.find(u => u.id === selectedCashierFilter);
    if (matched) filterTag += `-พนักงาน-${matched.name}`;
  }
  
  link.setAttribute('href', url);
  link.setAttribute('download', `ร้านทานตะวัน-ยอดขาย-${filterTag}-${startStr}-ถึง-${endStr}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast(`ดาวน์โหลดไฟล์ CSV (${filterTag}) เรียบร้อยแล้ว`);
}

// --------------------------------------------------------------------------
// FULL POS BACKUP & RESTORE / CLOUD MIGRATION
// --------------------------------------------------------------------------
function exportFullPOSBackup() {
  try {
    const backup = {
      products: JSON.parse(localStorage.getItem('coffeeshop_products') || '[]'),
      categories: JSON.parse(localStorage.getItem('coffeeshop_categories') || '[]'),
      optionGroups: JSON.parse(localStorage.getItem('coffeeshop_option_groups') || '[]'),
      promotions: JSON.parse(localStorage.getItem('coffeeshop_promotions') || '[]'),
      settings: JSON.parse(localStorage.getItem('coffeeshop_settings') || '{}'),
      users: JSON.parse(localStorage.getItem('coffeeshop_users') || '[]'),
      orders: JSON.parse(localStorage.getItem('coffeeshop_orders') || '[]'),
      timestamp: Date.now()
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tantawan_pos_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('💾 ส่งออกไฟล์สำรองข้อมูลสำเร็จเรียบร้อย!', 'success');
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการส่งออกข้อมูล: ' + err.message, 'error');
  }
}

function importFullPOSBackup(fileInput) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      let count = 0;
      if (data.products && Array.isArray(data.products)) {
        localStorage.setItem('coffeeshop_products', JSON.stringify(data.products));
        products = data.products;
        window.products = products;
        count = products.length;
      }
      if (data.categories && Array.isArray(data.categories)) {
        localStorage.setItem('coffeeshop_categories', JSON.stringify(data.categories));
        categories = data.categories;
        window.categories = categories;
      }
      if (data.optionGroups && Array.isArray(data.optionGroups)) {
        localStorage.setItem('coffeeshop_option_groups', JSON.stringify(data.optionGroups));
        optionGroups = data.optionGroups;
      }
      if (data.promotions && Array.isArray(data.promotions)) {
        localStorage.setItem('coffeeshop_promotions', JSON.stringify(data.promotions));
        promotions = data.promotions;
      }
      if (data.settings && typeof data.settings === 'object') {
        localStorage.setItem('coffeeshop_settings', JSON.stringify(data.settings));
        settings = data.settings;
      }
      if (data.orders && Array.isArray(data.orders)) {
        localStorage.setItem('coffeeshop_orders', JSON.stringify(data.orders));
        orders = data.orders;
        window.orders = orders;
      }

      // Sync directly to Supabase cloud
      if (typeof syncProductsToCloud === 'function') {
        syncProductsToCloud(products);
      }
      if (typeof syncSettingsToCloud === 'function') {
        syncSettingsToCloud(settings);
      }

      showToast(`🎉 กู้คืนข้อมูลสำเร็จ! โหลดเมนูเข้ามา ${count} รายการ`, 'success');
      setTimeout(() => location.reload(), 1000);
    } catch (err) {
      alert('ไฟล์สำรองไม่ถูกต้อง: ' + err.message);
    }
  };
  reader.readAsText(file);
}
// LIGHTWEIGHT SVG LINE CHART RENDERING (Works Offline)
// --------------------------------------------------------------------------
function renderSVGChart(filteredOrders) {
  const container = document.getElementById('chartContainer');
  container.innerHTML = '';

  const activeOrders = filteredOrders.filter(o => o.status === 'completed');

  if (activeOrders.length === 0) {
    container.innerHTML = `<span class="text-xs text-slate-400 dark:text-slate-500">ไม่มีข้อมูลยอดขายสำหรับวาดกราฟแนวโน้ม</span>`;
    return;
  }

  const isDark = document.documentElement.classList.contains('dark');
  const gridStroke = isDark ? '#334155' : '#e2e8f0';
  const axisFill = isDark ? '#94a3b8' : '#64748b';
  const lineStroke = isDark ? '#f59e0b' : '#d97706';
  const areaFill = isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(217, 119, 6, 0.10)';
  const dotFill = isDark ? '#0f172a' : '#ffffff';
  const valFill = isDark ? '#fbbf24' : '#b45309';
  const baseStroke = isDark ? '#475569' : '#cbd5e1';

  const startStr = document.getElementById('reportStartDate').value;
  const endStr = document.getElementById('reportEndDate').value;
  const isSingleDay = (startStr === endStr);

  let dataPoints = [];

  if (isSingleDay) {
    // Hourly trend for single day (e.g. 09:00, 10:00, 11:00...)
    const salesByHour = {};
    activeOrders.forEach(o => {
      const d = new Date(o.timestamp);
      const hr = String(d.getHours()).padStart(2, '0') + ':00';
      salesByHour[hr] = (salesByHour[hr] || 0) + o.total;
    });

    const sortedHours = Object.keys(salesByHour).sort();
    dataPoints = sortedHours.map(hr => ({
      label: hr,
      val: salesByHour[hr]
    }));

    if (dataPoints.length === 1) {
      dataPoints.unshift({ label: 'เปิดร้าน', val: 0 });
    }
  } else {
    // Daily trend for multi-day date ranges (DD/MM)
    const salesByDate = {};
    activeOrders.forEach(o => {
      const dStr = formatLocalDate(new Date(o.timestamp));
      salesByDate[dStr] = (salesByDate[dStr] || 0) + o.total;
    });

    const sortedDates = Object.keys(salesByDate).sort();
    dataPoints = sortedDates.map(date => ({
      label: date.split('-').slice(1).reverse().join('/'),
      val: salesByDate[date]
    }));

    if (dataPoints.length === 1) {
      dataPoints.unshift({ label: 'เริ่มต้น', val: 0 });
    }
  }

  const chartWidth = 500;
  const chartHeight = 220;
  const padding = 35;

  const maxVal = Math.max(...dataPoints.map(p => p.val), 100);
  const minVal = 0;

  // Calculate coordinates mapping helper
  const getX = (index) => padding + (index * (chartWidth - (padding * 2)) / (dataPoints.length - 1));
  const getY = (value) => chartHeight - padding - ((value - minVal) * (chartHeight - (padding * 2)) / (maxVal - minVal));

  // Build SVG tags
  let svg = `<svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="w-full h-full text-slate-400 font-semibold" style="font-size: 8px;">`;

  // Draw Grid Lines & Y-axis labels
  const gridTicks = 4;
  for (let i = 0; i <= gridTicks; i++) {
    const val = minVal + (i * (maxVal - minVal) / gridTicks);
    const y = getY(val);
    svg += `<line x1="${padding}" y1="${y}" x2="${chartWidth - padding}" y2="${y}" stroke="${gridStroke}" stroke-width="1" stroke-dasharray="3,3" />`;
    svg += `<text x="${padding - 5}" y="${y + 3}" text-anchor="end" fill="${axisFill}">฿${Math.round(val)}</text>`;
  }

  // Build points path line string
  let pathStr = `M ${getX(0)} ${getY(dataPoints[0].val)}`;
  let areaStr = `M ${getX(0)} ${getY(0)} L ${getX(0)} ${getY(dataPoints[0].val)}`;

  for (let i = 1; i < dataPoints.length; i++) {
    const x = getX(i);
    const y = getY(dataPoints[i].val);
    pathStr += ` L ${x} ${y}`;
    areaStr += ` L ${x} ${y}`;
  }

  areaStr += ` L ${getX(dataPoints.length - 1)} ${getY(0)} Z`;

  // Fill gradient area below the line chart
  svg += `<path d="${areaStr}" fill="${areaFill}" />`;
  // Draw primary trend line
  svg += `<path d="${pathStr}" fill="none" stroke="${lineStroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;

  // Draw coordinate circles & X labels
  dataPoints.forEach((pt, i) => {
    const x = getX(i);
    const y = getY(pt.val);
    
    // Draw dots
    svg += `<circle cx="${x}" cy="${y}" r="4" fill="${dotFill}" stroke="${lineStroke}" stroke-width="2" />`;
    
    // Display value tag above hover coordinates dot
    if (pt.val > 0) {
      svg += `<text x="${x}" y="${y - 8}" text-anchor="middle" font-weight="bold" fill="${valFill}">฿${Math.round(pt.val)}</text>`;
    }
    
    // Date tag label on X-axis line bounds
    svg += `<text x="${x}" y="${chartHeight - 12}" text-anchor="middle" fill="${axisFill}">${pt.label}</text>`;
  });

  // Base X axis baseline
  svg += `<line x1="${padding}" y1="${chartHeight - padding}" x2="${chartWidth - padding}" y2="${chartHeight - padding}" stroke="${baseStroke}" stroke-width="1.5" />`;

  svg += '</svg>';
  container.innerHTML = svg;
}

// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// PRODUCT REORDERING, DRAG & DROP AND AUTO-SORT LOGIC
// --------------------------------------------------------------------------
// PRODUCT REORDERING, CATEGORIZED MENU VIEW & DRAG/DROP
// --------------------------------------------------------------------------
let draggedProductId = null;
let menuConfigSelectedCategory = 'all';

function getCategoryIcon(cat) {
  const c = (cat || '').toLowerCase();
  if (c.includes('กาแฟ') || c.includes('coffee') || c.includes('espresso')) return '☕';
  if (c.includes('ชา') || c.includes('tea') || c.includes('มัทฉะ') || c.includes('matcha')) return '🍵';
  if (c.includes('เบเกอรี่') || c.includes('bakery') || c.includes('เค้ก') || c.includes('ขนม') || c.includes('cake') || c.includes('ครัวซอง')) return '🥐';
  if (c.includes('โซดา') || c.includes('soda') || c.includes('สมูทตี้') || c.includes('smoothie') || c.includes('ปั่น') || c.includes('น้ำ')) return '🥤';
  if (c.includes('นม') || c.includes('milk') || c.includes('โกโก้') || c.includes('cocoa') || c.includes('ช็อกโกแลต')) return '🍫';
  if (c.includes('อาหาร') || c.includes('food') || c.includes('ข้าว') || c.includes('จานเดียว')) return '🍽️';
  return '🏷️';
}

function setMenuConfigCategoryFilter(cat) {
  menuConfigSelectedCategory = cat;
  renderMenuConfigTable();
}

function moveProduct(productId, direction) {
  const currentProd = products.find(p => p.id === productId);
  if (!currentProd) return;

  const category = currentProd.category;
  // Get all products in the same category
  const catProducts = products.filter(p => p.category === category);
  const catIndex = catProducts.findIndex(p => p.id === productId);
  if (catIndex === -1) return;

  const globalIndex = products.findIndex(p => p.id === productId);

  if (direction === 'top') {
    if (catIndex === 0) return;
    const targetProd = catProducts[0];
    const targetGlobalIdx = products.findIndex(p => p.id === targetProd.id);
    const [item] = products.splice(globalIndex, 1);
    products.splice(targetGlobalIdx, 0, item);
    showToast(`ย้ายเมนู "${item.name}" ไปอยู่อันดับ 1 ของหมวด "${category}"`);
  } else if (direction === 'bottom') {
    if (catIndex === catProducts.length - 1) return;
    const targetProd = catProducts[catProducts.length - 1];
    const targetGlobalIdx = products.findIndex(p => p.id === targetProd.id);
    const [item] = products.splice(globalIndex, 1);
    products.splice(targetGlobalIdx, 0, item);
    showToast(`ย้ายเมนู "${item.name}" ไปอยู่อันดับสุดท้ายของหมวด "${category}"`);
  } else if (direction === 'up') {
    if (catIndex === 0) return;
    const targetProd = catProducts[catIndex - 1];
    const targetGlobalIdx = products.findIndex(p => p.id === targetProd.id);
    const [item] = products.splice(globalIndex, 1);
    products.splice(targetGlobalIdx, 0, item);
    showToast(`เลื่อนเมนู "${item.name}" ขึ้น`);
  } else if (direction === 'down') {
    if (catIndex === catProducts.length - 1) return;
    const targetProd = catProducts[catIndex + 1];
    const targetGlobalIdx = products.findIndex(p => p.id === targetProd.id);
    const [item] = products.splice(globalIndex, 1);
    products.splice(targetGlobalIdx, 0, item);
    showToast(`เลื่อนเมนู "${item.name}" ลง`);
  }

  saveToStorage('coffeeshop_products', products);
  if (typeof syncProductsToCloud === 'function') syncProductsToCloud(products);
  renderMenuConfigTable();
  renderProductsGrid();
}

function autoSortProducts(sortType) {
  if (sortType === 'best-seller') {
    const salesMap = getProductSalesMap();
    products.sort((a, b) => {
      const soldA = salesMap[a.id] || 0;
      const soldB = salesMap[b.id] || 0;
      if (soldB !== soldA) return soldB - soldA;
      return a.name.localeCompare(b.name, 'th');
    });
    showToast('จัดเรียงเมนูขายดีที่สุดขึ้นก่อนเรียบร้อยแล้ว');
  } else if (sortType === 'name-asc') {
    products.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    showToast('จัดเรียงเมนูตามชื่อ ก-ฮ เรียบร้อยแล้ว');
  } else if (sortType === 'category') {
    products.sort((a, b) => {
      const catAIdx = categories.indexOf(a.category);
      const catBIdx = categories.indexOf(b.category);
      const orderA = catAIdx === -1 ? 999 : catAIdx;
      const orderB = catBIdx === -1 ? 999 : catBIdx;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name, 'th');
    });
    showToast('จัดกลุ่มเมนูตามหมวดหมู่เรียบร้อยแล้ว');
  } else if (sortType === 'price-desc') {
    products.sort((a, b) => b.basePrice - a.basePrice);
    showToast('จัดเรียงตามราคาสูงไปต่ำเรียบร้อยแล้ว');
  } else if (sortType === 'price-asc') {
    products.sort((a, b) => a.basePrice - b.basePrice);
    showToast('จัดเรียงตามราคาต่ำไปสูงเรียบร้อยแล้ว');
  }

  saveToStorage('coffeeshop_products', products);
  if (typeof syncProductsToCloud === 'function') syncProductsToCloud(products);
  renderMenuConfigTable();
  renderProductsGrid();
}

function onProductRowDragStart(e, productId) {
  draggedProductId = productId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', productId);
  const row = e.target.closest('tr');
  if (row) {
    row.classList.add('opacity-40', 'bg-amber-50', 'dark:bg-amber-950/40');
  }
}

function onProductRowDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const row = e.target.closest('tr');
  if (row) {
    row.classList.add('border-t-2', 'border-amber-500');
  }
}

function onProductRowDragLeave(e) {
  const row = e.target.closest('tr');
  if (row) {
    row.classList.remove('border-t-2', 'border-amber-500');
  }
}

function onProductRowDrop(e, targetProductId) {
  e.preventDefault();
  document.querySelectorAll('.menu-config-row').forEach(r => {
    r.classList.remove('border-t-2', 'border-amber-500', 'opacity-40', 'bg-amber-50', 'dark:bg-amber-950/40');
  });

  if (!draggedProductId || draggedProductId === targetProductId) return;

  const fromIdx = products.findIndex(p => p.id === draggedProductId);
  const toIdx = products.findIndex(p => p.id === targetProductId);

  if (fromIdx > -1 && toIdx > -1) {
    const draggedItem = products[fromIdx];
    const targetItem = products[toIdx];

    if (draggedItem.category !== targetItem.category) {
      draggedItem.category = targetItem.category;
      showToast(`ย้าย "${draggedItem.name}" เข้าหมวด "${targetItem.category}" เรียบร้อยแล้ว`, 'success');
    }

    const [moved] = products.splice(fromIdx, 1);
    products.splice(toIdx, 0, moved);

    saveToStorage('coffeeshop_products', products);
    if (typeof syncProductsToCloud === 'function') syncProductsToCloud(products);
    renderMenuConfigTable();
    renderProductsGrid();
  }
  draggedProductId = null;
}

function onProductRowDragEnd(e) {
  draggedProductId = null;
  document.querySelectorAll('.menu-config-row').forEach(r => {
    r.classList.remove('border-t-2', 'border-amber-500', 'opacity-40', 'bg-amber-50', 'dark:bg-amber-950/40');
  });
}

// --------------------------------------------------------------------------
// MENU LIST CONFIGURATION LAYOUT (SEPARATED BY CATEGORY CARDS)
// --------------------------------------------------------------------------
function renderMenuConfigTable() {
  const container = document.getElementById('menuConfigCategoriesContainer');
  const tabsContainer = document.getElementById('menuConfigCategoryTabs');
  if (!container) return;
  container.innerHTML = '';

  const searchInput = document.getElementById('menuConfigSearchInput');
  const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';

  // 1. Gather all categories that exist in system + any used by products
  const allCats = [...categories];
  products.forEach(p => {
    const c = p.category || 'อื่นๆ';
    if (!allCats.includes(c)) allCats.push(c);
  });

  // 2. Render Category Filter Tabs Bar
  if (tabsContainer) {
    tabsContainer.innerHTML = '';

    // "ทุกหมวดหมู่" (All) tab
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = `px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 flex-shrink-0 ${
      menuConfigSelectedCategory === 'all'
        ? 'bg-amber-600 text-white shadow-sm'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
    }`;
    allBtn.innerHTML = `<span>🏷️ ทุกหมวดหมู่</span><span class="text-[10.5px] px-1.5 py-0.2 rounded-full ${menuConfigSelectedCategory === 'all' ? 'bg-amber-700 text-amber-100' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'} font-semibold">${products.length}</span>`;
    allBtn.onclick = () => setMenuConfigCategoryFilter('all');
    tabsContainer.appendChild(allBtn);

    // Individual category tabs
    allCats.forEach(cat => {
      const catCount = products.filter(p => p.category === cat).length;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 flex-shrink-0 ${
        menuConfigSelectedCategory === cat
          ? 'bg-amber-600 text-white shadow-sm'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
      }`;
      btn.innerHTML = `<span>${getCategoryIcon(cat)} ${cat}</span><span class="text-[10.5px] px-1.5 py-0.2 rounded-full ${menuConfigSelectedCategory === cat ? 'bg-amber-700 text-amber-100' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'} font-semibold">${catCount}</span>`;
      btn.onclick = () => setMenuConfigCategoryFilter(cat);
      tabsContainer.appendChild(btn);
    });
  }

  // 3. Filter products by search query
  const filteredProducts = products.filter(p => {
    if (!searchVal) return true;
    return (
      (p.name && p.name.toLowerCase().includes(searchVal)) ||
      (p.category && p.category.toLowerCase().includes(searchVal)) ||
      (p.basePrice && String(p.basePrice).includes(searchVal))
    );
  });

  // Determine which categories to display
  const categoriesToRender = (menuConfigSelectedCategory === 'all')
    ? allCats
    : [menuConfigSelectedCategory];

  let renderedCategoriesCount = 0;

  categoriesToRender.forEach(cat => {
    const catProducts = filteredProducts.filter(p => p.category === cat);

    // If search is active and category has no matching products, skip this card
    if (searchVal && catProducts.length === 0) {
      return;
    }

    renderedCategoriesCount++;

    // Create Category Section Card
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden';

    // Card Header
    const cardHeader = document.createElement('div');
    cardHeader.className = 'px-5 py-3.5 bg-slate-50/80 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex flex-wrap justify-between items-center gap-3';
    cardHeader.innerHTML = `
      <div class="flex items-center space-x-2.5">
        <span class="w-8 h-8 rounded-lg bg-amber-500/10 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 flex items-center justify-center font-bold text-base border border-amber-500/20">
          ${getCategoryIcon(cat)}
        </span>
        <div class="flex items-center gap-2">
          <h3 class="text-base font-bold text-slate-900 dark:text-white">${cat}</h3>
          <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            ${catProducts.length} รายการ
          </span>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <button type="button" onclick="openProductModal(null, '${cat}')" class="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-xs font-bold rounded-lg transition flex items-center gap-1 shadow-xs active:scale-95">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span>เพิ่มเมนูในหมวดนี้</span>
        </button>
      </div>
    `;
    card.appendChild(cardHeader);

    // Card Table
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'overflow-x-auto';

    const table = document.createElement('table');
    table.className = 'w-full text-left text-sm border-collapse';
    table.innerHTML = `
      <thead>
        <tr class="bg-slate-50/50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 text-[11px] uppercase font-bold tracking-wider">
          <th class="px-4 py-3 text-center w-28">ลำดับในหมวด</th>
          <th class="px-6 py-3">ชื่อเมนู</th>
          <th class="px-6 py-3 text-right w-28">ราคาหลัก</th>
          <th class="px-6 py-3">กลุ่มตัวเลือกที่ผูก</th>
          <th class="px-6 py-3 text-center w-24">จัดการ</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 dark:divide-slate-800"></tbody>
    `;

    const tbody = table.querySelector('tbody');

    // Allow dropping products into this category
    tbody.ondragover = (e) => e.preventDefault();
    tbody.ondrop = (e) => {
      if (!draggedProductId) return;
      const p = products.find(prod => prod.id === draggedProductId);
      if (p && p.category !== cat) {
        p.category = cat;
        saveToStorage('coffeeshop_products', products);
        renderMenuConfigTable();
        renderProductsGrid();
        showToast(`ย้าย "${p.name}" เข้าหมวด "${cat}" เรียบร้อยแล้ว`, 'success');
      }
    };

    if (catProducts.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="5" class="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
          ยังไม่มีเมนูในหมวด "${cat}" 
          <button type="button" onclick="openProductModal(null, '${cat}')" class="text-amber-600 dark:text-amber-400 underline font-semibold ml-1.5 hover:text-amber-700">
            + คลิกเพื่อเพิ่มเมนูแรกในหมวดนี้
          </button>
        </td>
      `;
      tbody.appendChild(emptyRow);
    } else {
      catProducts.forEach((p, catIndex) => {
        const tr = document.createElement('tr');
        tr.className = 'menu-config-row hover:bg-slate-50 dark:hover:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-colors select-none';
        tr.draggable = true;
        tr.ondragstart = (e) => onProductRowDragStart(e, p.id);
        tr.ondragover = (e) => onProductRowDragOver(e);
        tr.ondragleave = (e) => onProductRowDragLeave(e);
        tr.ondrop = (e) => onProductRowDrop(e, p.id);
        tr.ondragend = (e) => onProductRowDragEnd(e);

        // Format options description column text
        const linkedGroupNames = (p.optionGroupIds || [])
          .map(gid => {
            const g = (optionGroups || []).find(og => og.id === gid);
            return g ? g.name : null;
          })
          .filter(Boolean);

        const optionsSummary = linkedGroupNames.length > 0 
          ? linkedGroupNames.map(gn => `<span class="inline-block bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800/70 px-2 py-0.5 rounded-md text-[11px] font-semibold mr-1 mb-1">${gn}</span>`).join('')
          : '<span class="text-slate-400 dark:text-slate-500 text-xs italic">ไม่มีการปรับแต่ง</span>';

        const thumbHtml = p.image
          ? `<img src="${p.image}" alt="${p.name}" class="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0 shadow-xs">`
          : `<div class="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-500 text-xs font-bold flex-shrink-0">${getCategoryIcon(cat)}</div>`;

        const isFirstInCat = catIndex === 0;
        const isLastInCat = catIndex === catProducts.length - 1;

        tr.innerHTML = `
          <td class="px-3 py-3 text-center">
            <div class="flex items-center justify-center space-x-1.5">
              <span class="cursor-grab active:cursor-grabbing text-slate-400 dark:text-slate-500 hover:text-amber-500 font-black px-1 select-none text-base" title="ลากเพื่อสลับลำดับ">⠿</span>
              <span class="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-black flex items-center justify-center border border-slate-200 dark:border-slate-700">#${catIndex + 1}</span>
              <div class="flex items-center space-x-0.5">
                <button type="button" onclick="moveProduct('${p.id}', 'top')" class="p-1 rounded text-xs hover:bg-amber-100 dark:hover:bg-slate-800 hover:scale-110 transition ${isFirstInCat ? 'opacity-25 cursor-not-allowed' : 'text-slate-500 dark:text-slate-400 hover:text-amber-600'}" title="ย้ายไปอันดับ 1 ของหมวด" ${isFirstInCat ? 'disabled' : ''}>🔝</button>
                <button type="button" onclick="moveProduct('${p.id}', 'up')" class="p-1 rounded text-xs hover:bg-slate-100 dark:hover:bg-slate-800 hover:scale-110 transition ${isFirstInCat ? 'opacity-25 cursor-not-allowed' : 'text-slate-500 dark:text-slate-400 hover:text-amber-600'}" title="เลื่อนขึ้นในหมวด" ${isFirstInCat ? 'disabled' : ''}>🔼</button>
                <button type="button" onclick="moveProduct('${p.id}', 'down')" class="p-1 rounded text-xs hover:bg-slate-100 dark:hover:bg-slate-800 hover:scale-110 transition ${isLastInCat ? 'opacity-25 cursor-not-allowed' : 'text-slate-500 dark:text-slate-400 hover:text-amber-600'}" title="เลื่อนลงในหมวด" ${isLastInCat ? 'disabled' : ''}>🔽</button>
                <button type="button" onclick="moveProduct('${p.id}', 'bottom')" class="p-1 rounded text-xs hover:bg-slate-100 dark:hover:bg-slate-800 hover:scale-110 transition ${isLastInCat ? 'opacity-25 cursor-not-allowed' : 'text-slate-500 dark:text-slate-400 hover:text-amber-600'}" title="ย้ายไปล่างสุดของหมวด" ${isLastInCat ? 'disabled' : ''}>🔚</button>
              </div>
            </div>
          </td>
          <td class="px-6 py-3.5 font-bold text-slate-900 dark:text-slate-100 text-sm">
            <div class="flex items-center space-x-3">
              ${thumbHtml}
              <span>${p.name}</span>
            </div>
          </td>
          <td class="px-6 py-3.5 text-right font-extrabold text-slate-950 dark:text-slate-100 text-sm">฿${p.basePrice.toFixed(2)}</td>
          <td class="px-6 py-3.5 text-xs font-medium text-slate-500 dark:text-slate-400">${optionsSummary}</td>
          <td class="px-6 py-4 text-center">
            <div class="flex justify-center items-center space-x-1">
              <button onclick="openProductModal('${p.id}')" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 p-1.5 rounded-lg transition" title="แก้ไขสินค้า">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button onclick="deleteProduct('${p.id}')" class="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 p-1.5 rounded-lg transition" title="ลบสินค้า">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    tableWrapper.appendChild(table);
    card.appendChild(tableWrapper);
    container.appendChild(card);
  });

  // If search yielded 0 categories
  if (renderedCategoriesCount === 0) {
    container.innerHTML = `
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <span class="text-4xl block">🔍</span>
        <h4 class="text-base font-bold text-slate-800 dark:text-slate-200">ไม่พบเมนูที่ตรงกับคำค้นหา "${searchVal}"</h4>
        <p class="text-xs text-slate-400 dark:text-slate-500">ลองค้นหาด้วยชื่ออื่น หรือกดปุ่มล้างคำค้นหาด้านล่าง</p>
        <button type="button" onclick="document.getElementById('menuConfigSearchInput').value=''; renderMenuConfigTable();" class="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition">
          ล้างคำค้นหา
        </button>
      </div>
    `;
  }
}

// --------------------------------------------------------------------------
// PRODUCT IMAGE UPLOAD & CANVAS RESIZING
// --------------------------------------------------------------------------
function handleProductImageFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('กรุณาเลือกไฟล์รูปภาพเท่านั้น (.jpg, .png, .webp)', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Resize to maximum 400x400 px to conserve localStorage space
      const maxDim = 400;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Compress to JPEG 85%
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      currentProductEditingImage = compressedDataUrl;
      updateProductImagePreviewUI(compressedDataUrl, file.name);
      showToast('โหลดและย่อรูปภาพสำเร็จ');
    };
    img.onerror = () => {
      showToast('ไม่สามารถเปิดไฟล์รูปภาพนี้ได้', 'error');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function updateProductImagePreviewUI(dataUrl, fileName = '') {
  const previewImg = document.getElementById('configProdImagePreview');
  const placeholder = document.getElementById('configProdImagePlaceholder');
  const btnRemove = document.getElementById('btnRemoveProdImage');
  const info = document.getElementById('configProdImageInfo');

  if (dataUrl) {
    if (previewImg) {
      previewImg.src = dataUrl;
      previewImg.classList.remove('hidden');
    }
    if (placeholder) placeholder.classList.add('hidden');
    if (btnRemove) btnRemove.classList.remove('hidden');
    if (info) info.innerText = fileName ? `รูปภาพ: ${fileName}` : 'มีรูปภาพสินค้าแล้ว';
  } else {
    if (previewImg) {
      previewImg.src = '';
      previewImg.classList.add('hidden');
    }
    if (placeholder) placeholder.classList.remove('hidden');
    if (btnRemove) btnRemove.classList.add('hidden');
    if (info) info.innerText = 'ยังไม่ได้เลือกรูปภาพ (สามารถใส่ภายหลังได้)';
  }
}

function removeProductImage() {
  currentProductEditingImage = null;
  const fileInput = document.getElementById('configProdImageFileInput');
  if (fileInput) fileInput.value = '';
  updateProductImagePreviewUI(null);
  showToast('ลบรูปภาพเรียบร้อยแล้ว');
}

function openProductModal(productId = null, defaultCategory = null) {
  const categorySelect = document.getElementById('configProdCategory');
  categorySelect.innerHTML = '';
  
  // Populate category dropdown
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.innerText = cat;
    categorySelect.appendChild(opt);
  });

  const modal = document.getElementById('productConfigModal');
  const title = document.getElementById('productConfigModalTitle');
  const container = document.getElementById('productOptionGroupsCheckboxContainer');
  container.innerHTML = '';
  
  let currentGroupIds = [];

  const posWrapper = document.getElementById('configProdPositionWrapper');
  if (productId) {
    // EDIT PRODUCT MODE
    const p = products.find(prod => prod.id === productId);
    if (!p) return;

    if (posWrapper) posWrapper.classList.add('hidden');
    title.innerText = 'แก้ไขราคาและสินค้า';
    document.getElementById('editProductId').value = p.id;
    document.getElementById('configProdName').value = p.name;
    document.getElementById('configProdCategory').value = p.category;
    document.getElementById('configProdPrice').value = p.basePrice;
    currentGroupIds = p.optionGroupIds || [];
    currentProductEditingImage = p.image || null;
    updateProductImagePreviewUI(currentProductEditingImage);
  } else {
    // NEW ADD PRODUCT MODE
    if (posWrapper) posWrapper.classList.remove('hidden');
    const posTop = document.getElementById('posTop');
    if (posTop) posTop.checked = true;
    title.innerText = defaultCategory ? `เพิ่มสินค้าใหม่ (หมวด ${defaultCategory})` : 'เพิ่มสินค้าใหม่';
    document.getElementById('editProductId').value = '';
    document.getElementById('configProdName').value = '';
    document.getElementById('configProdPrice').value = 0;
    if (defaultCategory && categories.includes(defaultCategory)) {
      document.getElementById('configProdCategory').value = defaultCategory;
    }
    currentGroupIds = [];
    currentProductEditingImage = null;
    updateProductImagePreviewUI(null);
  }

  const fileInput = document.getElementById('configProdImageFileInput');
  if (fileInput) fileInput.value = '';

  // Populate dynamic option groups checkboxes
  if (optionGroups.length === 0) {
    container.innerHTML = `<span class="text-xs text-slate-400 dark:text-slate-500 block text-center py-3">ยังไม่มีกลุ่มตัวเลือกในระบบ (กดปุ่ม "จัดการกลุ่มตัวเลือก" ด้านบนเพื่อสร้าง)</span>`;
  } else {
    optionGroups.forEach(group => {
      const isChecked = currentGroupIds.includes(group.id);
      const div = document.createElement('div');
      div.className = 'flex items-center justify-between p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition cursor-pointer select-none';
      
      div.onclick = (e) => {
        if (e.target.tagName !== 'INPUT') {
          const chk = div.querySelector('input');
          chk.checked = !chk.checked;
        }
      };

      const typeLabel = group.type === 'single' ? 'เลือก 1 อย่าง' : 'เลือกได้หลายอย่าง';
      const count = group.options ? group.options.length : 0;

      div.innerHTML = `
        <div class="flex items-center space-x-2.5">
          <input type="checkbox" value="${group.id}" class="prod-opt-group-chk rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer" ${isChecked ? 'checked' : ''}>
          <span class="text-xs font-bold text-slate-800 dark:text-slate-200">${group.name}</span>
        </div>
        <span class="text-[11px] text-slate-400 dark:text-slate-500">${typeLabel} (${count} ตัวเลือก)</span>
      `;
      container.appendChild(div);
    });
  }

  modal.classList.remove('hidden');
  modal.querySelector('.transform').classList.remove('scale-95');
  modal.querySelector('.transform').classList.add('scale-100');
}

function closeProductModal() {
  const modal = document.getElementById('productConfigModal');
  modal.querySelector('.transform').classList.remove('scale-100');
  modal.querySelector('.transform').classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 100);
}

function saveProductConfig() {
  const id = document.getElementById('editProductId').value;
  const name = document.getElementById('configProdName').value.trim();
  const category = document.getElementById('configProdCategory').value;
  const price = parseFloat(document.getElementById('configProdPrice').value) || 0;

  if (!name) {
    showToast('กรุณากรอกชื่อสินค้า', 'warning');
    return;
  }

  // Collect checked option group IDs
  const chkElements = document.querySelectorAll('.prod-opt-group-chk');
  const selectedGroupIds = [];
  chkElements.forEach(chk => {
    if (chk.checked) selectedGroupIds.push(chk.value);
  });

  const productData = {
    id: id || 'prod-' + Date.now(),
    name,
    category,
    basePrice: price,
    image: currentProductEditingImage || null,
    optionGroupIds: selectedGroupIds,
    // backward compat flags
    hasTemp: selectedGroupIds.includes('optgrp-temp'),
    hasSweetness: selectedGroupIds.includes('optgrp-sweet'),
    hasExtras: selectedGroupIds.includes('optgrp-toppings')
  };

  if (id) {
    const idx = products.findIndex(p => p.id === id);
    if (idx > -1) products[idx] = productData;
    showToast(`อัปเดตเมนู ${name} เรียบร้อยแล้ว`);
  } else {
    const pos = document.querySelector('input[name="configProdPosition"]:checked')?.value || 'top';
    if (pos === 'top') {
      products.unshift(productData);
      showToast(`เพิ่มเมนู ${name} ไว้บนสุด (อันดับ 1) เรียบร้อยแล้ว`);
    } else {
      products.push(productData);
      showToast(`เพิ่มเมนู ${name} เรียบร้อยแล้ว`);
    }
  }

  saveToStorage('coffeeshop_products', products);
  if (typeof syncProductsToCloud === 'function') {
    syncProductsToCloud(products);
  }
  renderMenuConfigTable();
  renderProductsGrid();
  closeProductModal();
}

function manualSyncMenuToCloud() {
  if (typeof syncProductsToCloud === 'function') {
    syncProductsToCloud(products);
  }
  if (typeof syncCategoriesToCloud === 'function') {
    syncCategoriesToCloud(categories);
  }
  showToast(`☁️ บันทึกเมนูทั้งหมด ${products.length} รายการ และหมวดหมู่ขึ้น Supabase Cloud สำเร็จ!`, 'success');
}

function deleteProduct(productId) {
  const p = products.find(prod => prod.id === productId);
  if (!p) return;

  if (confirm(`คุณยืนยันต้องการลบสินค้า "${p.name}" ออกจาก POS หรือไม่?`)) {
    products = products.filter(prod => prod.id !== productId);
    saveToStorage('coffeeshop_products', products);
    if (typeof deleteProductFromCloud === 'function') {
      deleteProductFromCloud(productId);
    }
    if (typeof syncProductsToCloud === 'function') {
      syncProductsToCloud(products);
    }
    renderMenuConfigTable();
    showToast('ลบสินค้าสำเร็จ');
  }
}

// --------------------------------------------------------------------------
// OPTION GROUPS MANAGER LOGIC
// --------------------------------------------------------------------------
function openOptionGroupsModal() {
  const modal = document.getElementById('optionGroupsManagerModal');
  renderOptionGroupsManagerList();

  modal.classList.remove('hidden');
  modal.querySelector('.transform').classList.remove('scale-95');
  modal.querySelector('.transform').classList.add('scale-100');
}

function closeOptionGroupsModal() {
  const modal = document.getElementById('optionGroupsManagerModal');
  modal.querySelector('.transform').classList.remove('scale-100');
  modal.querySelector('.transform').classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 100);
}

function renderOptionGroupsManagerList() {
  const container = document.getElementById('optionGroupsManagerList');
  container.innerHTML = '';

  if (optionGroups.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-400 dark:text-slate-500 py-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">ยังไม่มีกลุ่มตัวเลือก กดปุ่ม "+ สร้างกลุ่มตัวเลือกใหม่" ด้านบนเพื่อเริ่มสร้าง</div>`;
    return;
  }

  optionGroups.forEach((group, index) => {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-2.5 hover:border-slate-300 dark:hover:border-slate-600 transition';

    const typeBadge = group.type === 'single'
      ? `<span class="text-[11px] bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800/70 px-2 py-0.5 rounded-full font-bold">เลือก 1 อย่าง</span>`
      : `<span class="text-[11px] bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800/70 px-2 py-0.5 rounded-full font-bold">เลือกหลายอย่าง</span>`;
    
    const reqBadge = group.required
      ? `<span class="text-[11px] bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/70 px-2 py-0.5 rounded-full font-bold">บังคับเลือก</span>`
      : `<span class="text-[11px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">ไม่บังคับ</span>`;

    // Options pill list preview
    const optionsHtml = (group.options || []).map((opt, oIdx) => {
      const priceText = opt.price > 0 ? ` (+฿${opt.price})` : '';
      const optIcon = getOptionItemIcon(opt.name, group.name);
      return `<span class="text-[11px] bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md font-medium"><span class="text-slate-400 mr-0.5">${oIdx + 1}.</span>${optIcon}${opt.name}${priceText}</span>`;
    }).join(' ');

    const isFirstGroup = index === 0;
    const isLastGroup = index === optionGroups.length - 1;

    const grpIcon = getOptionGroupIcon(group.name);

    card.innerHTML = `
      <div class="flex justify-between items-start gap-2">
        <div class="space-y-1">
          <div class="flex items-center space-x-2 flex-wrap gap-y-1">
            <span class="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center justify-center">${index + 1}</span>
            <span class="text-base">${grpIcon}</span>
            <h4 class="font-bold text-sm text-slate-900 dark:text-slate-100">${group.name}</h4>
            ${typeBadge}
            ${reqBadge}
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400 font-medium">มี ${group.options ? group.options.length : 0} ตัวเลือก (สลับลำดับตัวเลือกได้ในปุ่มแก้ไข)</div>
        </div>
        <div class="flex items-center space-x-1 flex-shrink-0">
          <button onclick="moveOptionGroupUp('${group.id}')" class="text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 p-1.5 rounded-lg transition ${isFirstGroup ? 'opacity-25 cursor-not-allowed' : ''}" title="เลื่อนกลุ่มขึ้น" ${isFirstGroup ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd" />
            </svg>
          </button>
          <button onclick="moveOptionGroupDown('${group.id}')" class="text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 p-1.5 rounded-lg transition ${isLastGroup ? 'opacity-25 cursor-not-allowed' : ''}" title="เลื่อนกลุ่มลง" ${isLastGroup ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
          <button onclick="openEditOptionGroupModal('${group.id}')" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 p-1.5 rounded-lg transition" title="แก้ไขกลุ่ม & สลับลำดับตัวเลือก">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button onclick="deleteOptionGroup('${group.id}')" class="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 p-1.5 rounded-lg transition" title="ลบกลุ่ม">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      <div class="flex flex-wrap gap-1.5 pt-1">
        ${optionsHtml || '<span class="text-xs text-slate-400 dark:text-slate-500 italic">ไม่มีตัวเลือกย่อย</span>'}
      </div>
    `;
    container.appendChild(card);
  });
}

function moveOptionGroupUp(groupId) {
  const idx = optionGroups.findIndex(g => g.id === groupId);
  if (idx > 0) {
    const temp = optionGroups[idx];
    optionGroups[idx] = optionGroups[idx - 1];
    optionGroups[idx - 1] = temp;
    saveToStorage('coffeeshop_option_groups', optionGroups);
    renderOptionGroupsManagerList();
    if (currentActiveTab === 'menu') {
      renderMenuConfigTable();
    }
    showToast(`เลื่อนกลุ่ม "${temp.name}" ขึ้นแล้ว`, 'info');
  }
}

function moveOptionGroupDown(groupId) {
  const idx = optionGroups.findIndex(g => g.id === groupId);
  if (idx > -1 && idx < optionGroups.length - 1) {
    const temp = optionGroups[idx];
    optionGroups[idx] = optionGroups[idx + 1];
    optionGroups[idx + 1] = temp;
    saveToStorage('coffeeshop_option_groups', optionGroups);
    renderOptionGroupsManagerList();
    if (currentActiveTab === 'menu') {
      renderMenuConfigTable();
    }
    showToast(`เลื่อนกลุ่ม "${temp.name}" ลงแล้ว`, 'info');
  }
}

function openEditOptionGroupModal(groupId = null) {
  const modal = document.getElementById('optionGroupEditModal');
  const title = document.getElementById('optionGroupEditModalTitle');
  const idInput = document.getElementById('editOptionGroupId');
  const nameInput = document.getElementById('editOptionGroupName');
  const typeSelect = document.getElementById('editOptionGroupType');
  const reqCheck = document.getElementById('editOptionGroupRequired');
  const optionsContainer = document.getElementById('optionItemsListContainer');

  optionsContainer.innerHTML = '';

  if (groupId) {
    const group = optionGroups.find(g => g.id === groupId);
    if (!group) return;
    title.innerText = 'แก้ไขกลุ่มตัวเลือก';
    idInput.value = group.id;
    nameInput.value = group.name;
    typeSelect.value = group.type || 'single';
    reqCheck.checked = !!group.required;

    (group.options || []).forEach(opt => {
      addOptionRow(opt.name, opt.price || 0, opt.id);
    });
  } else {
    title.innerText = 'เพิ่มกลุ่มตัวเลือกใหม่';
    idInput.value = '';
    nameInput.value = '';
    typeSelect.value = 'single';
    reqCheck.checked = false;

    // Add 2 default empty rows for convenience
    addOptionRow('', 0);
    addOptionRow('', 0);
  }

  updateOptionRowsOrderButtons();

  modal.classList.remove('hidden');
  modal.querySelector('.transform').classList.remove('scale-95');
  modal.querySelector('.transform').classList.add('scale-100');

  setTimeout(() => nameInput.focus(), 100);
}

function closeEditOptionGroupModal() {
  const modal = document.getElementById('optionGroupEditModal');
  modal.querySelector('.transform').classList.remove('scale-100');
  modal.querySelector('.transform').classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 100);
}

function addOptionRow(name = '', price = 0, optId = null) {
  const container = document.getElementById('optionItemsListContainer');
  const rowId = 'opt-row-' + Math.random().toString(36).substr(2, 9);
  const row = document.createElement('div');
  row.id = rowId;
  row.className = 'opt-item-row flex items-center gap-1.5 sm:gap-2 bg-slate-50 dark:bg-slate-800/90 p-2 rounded-xl border border-slate-200 dark:border-slate-700 transition-all hover:border-amber-500/50 shadow-sm';

  row.innerHTML = `
    <input type="hidden" class="opt-row-id" value="${optId || ('opt-' + Date.now() + '-' + Math.floor(Math.random() * 1000))}">

    <!-- Reorder buttons & Index badge -->
    <div class="flex items-center gap-1 flex-shrink-0">
      <span class="opt-row-index w-5 h-5 rounded-md bg-slate-200/80 dark:bg-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center select-none shadow-xs">
        1
      </span>
      <div class="flex flex-col gap-0.5">
        <button type="button" onclick="moveOptionRowUp('${rowId}')" class="btn-move-up p-0.5 text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded transition" title="เลื่อนขึ้น">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd" />
          </svg>
        </button>
        <button type="button" onclick="moveOptionRowDown('${rowId}')" class="btn-move-down p-0.5 text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 rounded transition" title="เลื่อนลง">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Drag Handle -->
    <div class="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-amber-500 hidden sm:block flex-shrink-0" title="ลากเพื่อสลับตำแหน่ง">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 8h16M4 16h16" />
      </svg>
    </div>

    <!-- Option Name Input -->
    <input type="text" class="opt-row-name flex-1 min-w-0 px-3 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-amber-500 focus:outline-none placeholder-slate-400" placeholder="ชื่อตัวเลือก เช่น คั่วเข้ม, คั่วกลาง" value="${name}">

    <!-- Price Input -->
    <div class="flex items-center w-24 sm:w-28 relative flex-shrink-0">
      <span class="absolute left-2.5 text-xs text-slate-400 dark:text-slate-500 font-bold">+฿</span>
      <input type="number" class="opt-row-price w-full pl-8 pr-2 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-amber-500 focus:outline-none" placeholder="0" min="0" step="any" value="${price}">
    </div>

    <!-- Delete Button -->
    <button type="button" onclick="removeOptionRow('${rowId}')" class="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 p-1.5 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-lg transition flex-shrink-0" title="ลบตัวเลือกนี้">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  `;

  // HTML5 Drag & Drop Support
  row.setAttribute('draggable', 'true');
  row.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', rowId);
    row.classList.add('opacity-40', 'border-dashed', 'border-amber-400');
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('opacity-40', 'border-dashed', 'border-amber-400');
    updateOptionRowsOrderButtons();
  });
  row.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    const draggedRow = document.getElementById(draggedId);
    if (draggedRow && draggedRow !== row) {
      const rect = row.getBoundingClientRect();
      const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
      row.parentNode.insertBefore(draggedRow, next ? row.nextSibling : row);
      updateOptionRowsOrderButtons();
    }
  });

  container.appendChild(row);
  updateOptionRowsOrderButtons();
}

function moveOptionRowUp(rowId) {
  const row = document.getElementById(rowId);
  if (row && row.previousElementSibling) {
    row.parentNode.insertBefore(row, row.previousElementSibling);
    updateOptionRowsOrderButtons();
    row.classList.add('ring-2', 'ring-amber-400/80');
    setTimeout(() => row.classList.remove('ring-2', 'ring-amber-400/80'), 250);
  }
}

function moveOptionRowDown(rowId) {
  const row = document.getElementById(rowId);
  if (row && row.nextElementSibling) {
    row.parentNode.insertBefore(row.nextElementSibling, row);
    updateOptionRowsOrderButtons();
    row.classList.add('ring-2', 'ring-amber-400/80');
    setTimeout(() => row.classList.remove('ring-2', 'ring-amber-400/80'), 250);
  }
}

function updateOptionRowsOrderButtons() {
  const container = document.getElementById('optionItemsListContainer');
  if (!container) return;
  const rows = container.querySelectorAll('.opt-item-row');
  rows.forEach((r, idx) => {
    const badge = r.querySelector('.opt-row-index');
    if (badge) badge.textContent = (idx + 1);

    const btnUp = r.querySelector('.btn-move-up');
    const btnDown = r.querySelector('.btn-move-down');
    if (btnUp) {
      const isFirst = (idx === 0);
      btnUp.disabled = isFirst;
      btnUp.classList.toggle('opacity-25', isFirst);
      btnUp.classList.toggle('cursor-not-allowed', isFirst);
      btnUp.classList.toggle('hover:text-amber-600', !isFirst);
    }
    if (btnDown) {
      const isLast = (idx === rows.length - 1);
      btnDown.disabled = isLast;
      btnDown.classList.toggle('opacity-25', isLast);
      btnDown.classList.toggle('cursor-not-allowed', isLast);
      btnDown.classList.toggle('hover:text-amber-600', !isLast);
    }
  });
}

function removeOptionRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) {
    row.parentElement.removeChild(row);
    updateOptionRowsOrderButtons();
  }
}

function saveOptionGroup() {
  const id = document.getElementById('editOptionGroupId').value;
  const name = document.getElementById('editOptionGroupName').value.trim();
  const type = document.getElementById('editOptionGroupType').value;
  const required = document.getElementById('editOptionGroupRequired').checked;

  if (!name) {
    showToast('กรุณากรอกชื่อกลุ่มตัวเลือก', 'warning');
    return;
  }

  const container = document.getElementById('optionItemsListContainer');
  const rows = container.querySelectorAll('.opt-item-row');
  const options = [];

  rows.forEach(r => {
    const optId = r.querySelector('.opt-row-id').value;
    const optName = r.querySelector('.opt-row-name').value.trim();
    const optPrice = parseFloat(r.querySelector('.opt-row-price').value) || 0;

    if (optName) {
      options.push({
        id: optId,
        name: optName,
        price: Math.max(0, optPrice)
      });
    }
  });

  if (options.length === 0) {
    showToast('กรุณาระบุตัวเลือกย่อยอย่างน้อย 1 รายการ', 'warning');
    return;
  }

  const groupData = {
    id: id || 'optgrp-' + Date.now(),
    name,
    type,
    required,
    options
  };

  if (id) {
    const idx = optionGroups.findIndex(g => g.id === id);
    if (idx > -1) optionGroups[idx] = groupData;
    showToast(`อัปเดตกลุ่มตัวเลือก "${name}" แล้ว`);
  } else {
    optionGroups.push(groupData);
    showToast(`เพิ่มกลุ่มตัวเลือก "${name}" สำเร็จ`);
  }

  saveToStorage('coffeeshop_option_groups', optionGroups);
  renderOptionGroupsManagerList();
  closeEditOptionGroupModal();

  // If menu config table or product modal is currently active, refresh them
  if (currentActiveTab === 'menu') {
    renderMenuConfigTable();
  }
}

function deleteOptionGroup(groupId) {
  const group = optionGroups.find(g => g.id === groupId);
  if (!group) return;

  if (confirm(`คุณต้องการลบกลุ่มตัวเลือก "${group.name}" หรือไม่? ตัวเลือกนี้จะถูกปลดออกจากสินค้าที่เคยผูกไว้ทั้งหมด`)) {
    optionGroups = optionGroups.filter(g => g.id !== groupId);
    
    // Unlink from all products
    products.forEach(p => {
      if (p.optionGroupIds) {
        p.optionGroupIds = p.optionGroupIds.filter(gid => gid !== groupId);
      }
    });

    saveToStorage('coffeeshop_option_groups', optionGroups);
    saveToStorage('coffeeshop_products', products);

    renderOptionGroupsManagerList();
    if (currentActiveTab === 'menu') {
      renderMenuConfigTable();
    }
    showToast('ลบกลุ่มตัวเลือกสำเร็จ');
  }
}

// --------------------------------------------------------------------------
// PROMOTIONS TAB & MANAGEMENT LOGIC
// --------------------------------------------------------------------------
function renderPromotionsTab() {
  const percentList = document.getElementById('promoListPercent');
  const fixedList = document.getElementById('promoListFixed');
  const badgePercent = document.getElementById('badgePercentCount');
  const badgeFixed = document.getElementById('badgeFixedCount');

  if (!percentList || !fixedList) return;

  percentList.innerHTML = '';
  fixedList.innerHTML = '';

  const percentPromos = promotions.filter(p => p.type === 'percent');
  const fixedPromos = promotions.filter(p => p.type === 'fixed');

  if (badgePercent) badgePercent.innerText = `${percentPromos.length} รายการ`;
  if (badgeFixed) badgeFixed.innerText = `${fixedPromos.length} รายการ`;

  if (percentPromos.length === 0) {
    percentList.innerHTML = `<div class="text-xs text-slate-400 dark:text-slate-500 py-6 text-center">ยังไม่มีโปรโมชั่นเปอร์เซ็นต์</div>`;
  } else {
    percentPromos.forEach(p => {
      const card = document.createElement('div');
      card.className = 'p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center hover:border-slate-300 dark:hover:border-slate-600 transition';
      card.innerHTML = `
        <div class="space-y-0.5">
          <div class="font-bold text-sm text-slate-900 dark:text-slate-100">${p.name}</div>
          <div class="text-xs text-amber-700 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md inline-block">ลด ${p.value}%</div>
        </div>
        <div class="flex items-center space-x-1">
          <button onclick="openPromotionModal('${p.id}')" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 p-1.5 rounded-lg transition" title="แก้ไข">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button onclick="deletePromotion('${p.id}')" class="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 p-1.5 rounded-lg transition" title="ลบ">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      `;
      percentList.appendChild(card);
    });
  }

  if (fixedPromos.length === 0) {
    fixedList.innerHTML = `<div class="text-xs text-slate-400 dark:text-slate-500 py-6 text-center">ยังไม่มีโปรโมชั่นส่วนลดบาท</div>`;
  } else {
    fixedPromos.forEach(p => {
      const card = document.createElement('div');
      card.className = 'p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center hover:border-slate-300 dark:hover:border-slate-600 transition';
      card.innerHTML = `
        <div class="space-y-0.5">
          <div class="font-bold text-sm text-slate-900 dark:text-slate-100">${p.name}</div>
          <div class="text-xs text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md inline-block">ลด ฿${p.value}</div>
        </div>
        <div class="flex items-center space-x-1">
          <button onclick="openPromotionModal('${p.id}')" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 p-1.5 rounded-lg transition" title="แก้ไข">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button onclick="deletePromotion('${p.id}')" class="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 p-1.5 rounded-lg transition" title="ลบ">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      `;
      fixedList.appendChild(card);
    });
  }
}

function openPromotionModal(promoId = null) {
  const modal = document.getElementById('promotionConfigModal');
  const title = document.getElementById('promotionConfigModalTitle');
  const idInput = document.getElementById('editPromotionId');
  const nameInput = document.getElementById('editPromoName');
  const typeSelect = document.getElementById('editPromoType');
  const valInput = document.getElementById('editPromoValue');

  if (promoId) {
    const promo = promotions.find(p => p.id === promoId);
    if (!promo) return;
    title.innerText = 'แก้ไขโปรโมชั่นส่วนลด';
    idInput.value = promo.id;
    nameInput.value = promo.name;
    typeSelect.value = promo.type;
    valInput.value = promo.value;
  } else {
    title.innerText = 'เพิ่มโปรโมชั่นส่วนลด';
    idInput.value = '';
    nameInput.value = '';
    typeSelect.value = 'percent';
    valInput.value = '';
  }

  togglePromoTypeInputs();

  modal.classList.remove('hidden');
  modal.querySelector('.transform').classList.remove('scale-95');
  modal.querySelector('.transform').classList.add('scale-100');

  setTimeout(() => nameInput.focus(), 100);
}

function closePromotionModal() {
  const modal = document.getElementById('promotionConfigModal');
  modal.querySelector('.transform').classList.remove('scale-100');
  modal.querySelector('.transform').classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 100);
}

function togglePromoTypeInputs() {
  const type = document.getElementById('editPromoType').value;
  const label = document.getElementById('editPromoValueLabel');
  const tag = document.getElementById('editPromoUnitTag');

  if (type === 'percent') {
    label.innerText = 'มูลค่าส่วนลด (%)';
    tag.innerText = '%';
  } else {
    label.innerText = 'มูลค่าส่วนลด (บาท)';
    tag.innerText = '฿';
  }
}

function savePromotion() {
  const id = document.getElementById('editPromotionId').value;
  const name = document.getElementById('editPromoName').value.trim();
  const type = document.getElementById('editPromoType').value;
  const val = parseFloat(document.getElementById('editPromoValue').value) || 0;

  if (!name) {
    showToast('กรุณากรอกชื่อโปรโมชั่น', 'warning');
    return;
  }

  if (val <= 0) {
    showToast('มูลค่าส่วนลดต้องมากกว่า 0', 'warning');
    return;
  }

  if (type === 'percent' && val > 100) {
    showToast('ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100%', 'warning');
    return;
  }

  if (id) {
    const idx = promotions.findIndex(p => p.id === id);
    if (idx > -1) {
      promotions[idx] = { id, name, type, value: val };
    }
    showToast(`อัปเดตโปรโมชั่น "${name}" เรียบร้อยแล้ว`);
  } else {
    const newPromo = {
      id: 'promo-' + Date.now(),
      name,
      type,
      value: val
    };
    promotions.push(newPromo);
    showToast(`เพิ่มโปรโมชั่น "${name}" เรียบร้อยแล้ว`);
  }

  saveToStorage('coffeeshop_promotions', promotions);
  renderPromotionsTab();
  closePromotionModal();
}

function deletePromotion(promoId) {
  const promo = promotions.find(p => p.id === promoId);
  if (!promo) return;

  if (confirm(`คุณต้องการลบโปรโมชั่น "${promo.name}" หรือไม่?`)) {
    promotions = promotions.filter(p => p.id !== promoId);
    saveToStorage('coffeeshop_promotions', promotions);
    renderPromotionsTab();
    showToast('ลบโปรโมชั่นเรียบร้อยแล้ว');
  }
}

// --------------------------------------------------------------------------
// CATEGORY MODAL BUILDER
// --------------------------------------------------------------------------
function openCategoryModal() {
  const modal = document.getElementById('categoriesManagerModal');
  renderCategoriesList();
  
  modal.classList.remove('hidden');
  modal.querySelector('.transform').classList.remove('scale-95');
  modal.querySelector('.transform').classList.add('scale-100');
}

function closeCategoryModal() {
  const modal = document.getElementById('categoriesManagerModal');
  modal.querySelector('.transform').classList.remove('scale-100');
  modal.querySelector('.transform').classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 100);
}

// --------------------------------------------------------------------------
// CATEGORY MODAL BUILDER & REORDERING ENGINE
// --------------------------------------------------------------------------
let draggedCategoryName = null;

function renderCategoriesList() {
  const container = document.getElementById('categoriesListContainer');
  if (!container) return;
  container.innerHTML = '';

  if (categories.length === 0) {
    container.innerHTML = `<li class="p-6 text-center text-xs text-slate-400">ยังไม่มีหมวดหมู่สินค้า กดเพิ่มได้จากช่องด้านบน</li>`;
    return;
  }

  categories.forEach((cat, index) => {
    const prodCount = (products || []).filter(p => p.category === cat).length;
    const isFirst = index === 0;
    const isLast = index === categories.length - 1;

    const li = document.createElement('li');
    li.className = 'px-3.5 py-2.5 flex items-center justify-between text-sm font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 transition group select-none';
    li.draggable = true;
    li.ondragstart = (e) => onCategoryDragStart(e, cat);
    li.ondragover = (e) => onCategoryDragOver(e);
    li.ondragleave = (e) => onCategoryDragLeave(e);
    li.ondrop = (e) => onCategoryDrop(e, cat);
    li.ondragend = (e) => onCategoryDragEnd(e);

    li.innerHTML = `
      <div class="flex items-center space-x-2.5 min-w-0 flex-1">
        <span class="cursor-grab active:cursor-grabbing text-slate-400 dark:text-slate-500 hover:text-amber-600 font-black select-none text-base px-1" title="ลากเพื่อสลับลำดับ">⠿</span>
        <span class="w-6 h-6 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-850 dark:text-amber-300 text-xs font-black flex items-center justify-center flex-shrink-0 border border-amber-200 dark:border-amber-800/50">#${index + 1}</span>
        <span class="font-bold text-slate-900 dark:text-white truncate">${cat}</span>
        <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 flex-shrink-0 font-medium">${prodCount} เมนู</span>
      </div>

      <div class="flex items-center space-x-1.5 flex-shrink-0 ml-2">
        <!-- Reorder buttons: Top, Up, Down, Bottom -->
        <div class="flex items-center bg-slate-100 dark:bg-slate-700/60 rounded-lg p-0.5 space-x-0.5 border border-slate-200 dark:border-slate-700">
          <button type="button" onclick="moveCategory('${cat}', 'top')" class="p-1 rounded text-xs hover:bg-white dark:hover:bg-slate-800 hover:scale-110 transition ${isFirst ? 'opacity-25 cursor-not-allowed' : 'text-slate-600 dark:text-slate-300 hover:text-amber-600'}" title="ย้ายไปอันดับ 1 (บนสุด)" ${isFirst ? 'disabled' : ''}>🔝</button>
          <button type="button" onclick="moveCategory('${cat}', 'up')" class="p-1 rounded text-xs hover:bg-white dark:hover:bg-slate-800 hover:scale-110 transition ${isFirst ? 'opacity-25 cursor-not-allowed' : 'text-slate-600 dark:text-slate-300 hover:text-amber-600'}" title="เลื่อนขึ้น" ${isFirst ? 'disabled' : ''}>🔼</button>
          <button type="button" onclick="moveCategory('${cat}', 'down')" class="p-1 rounded text-xs hover:bg-white dark:hover:bg-slate-800 hover:scale-110 transition ${isLast ? 'opacity-25 cursor-not-allowed' : 'text-slate-600 dark:text-slate-300 hover:text-amber-600'}" title="เลื่อนลง" ${isLast ? 'disabled' : ''}>🔽</button>
          <button type="button" onclick="moveCategory('${cat}', 'bottom')" class="p-1 rounded text-xs hover:bg-white dark:hover:bg-slate-800 hover:scale-110 transition ${isLast ? 'opacity-25 cursor-not-allowed' : 'text-slate-600 dark:text-slate-300 hover:text-amber-600'}" title="ย้ายไปล่างสุด" ${isLast ? 'disabled' : ''}>🔚</button>
        </div>

        <!-- Edit name button -->
        <button type="button" onclick="editCategoryName('${cat}')" class="text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 p-1.5 rounded-lg transition" title="แก้ไขชื่อหมวดหมู่">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>

        <!-- Delete button -->
        <button type="button" onclick="deleteCategory('${cat}')" class="text-red-500 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 p-1.5 rounded-lg transition" title="ลบหมวดหมู่">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    `;
    container.appendChild(li);
  });
}

function moveCategory(catName, direction) {
  const index = categories.indexOf(catName);
  if (index === -1) return;

  if (direction === 'top') {
    if (index === 0) return;
    const [item] = categories.splice(index, 1);
    categories.unshift(item);
    showToast(`ย้ายหมวดหมู่ "${item}" ไปไว้ลำดับแรก (#1)`);
  } else if (direction === 'bottom') {
    if (index === categories.length - 1) return;
    const [item] = categories.splice(index, 1);
    categories.push(item);
    showToast(`ย้ายหมวดหมู่ "${item}" ไปไว้ลำดับสุดท้าย`);
  } else if (direction === 'up') {
    if (index === 0) return;
    const temp = categories[index];
    categories[index] = categories[index - 1];
    categories[index - 1] = temp;
    showToast(`เลื่อนหมวดหมู่ "${temp}" ขึ้น`);
  } else if (direction === 'down') {
    if (index === categories.length - 1) return;
    const temp = categories[index];
    categories[index] = categories[index + 1];
    categories[index + 1] = temp;
    showToast(`เลื่อนหมวดหมู่ "${temp}" ลง`);
  }

  saveToStorage('coffeeshop_categories', categories);
  renderCategoriesList();
  renderCategoryFilters();
  if (typeof renderBestSellerCategoryTabs === 'function') {
    renderBestSellerCategoryTabs();
  }
}

function onCategoryDragStart(e, catName) {
  draggedCategoryName = catName;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', catName);
  e.currentTarget.classList.add('opacity-40', 'bg-amber-50', 'dark:bg-amber-950/40');
}

function onCategoryDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('border-t-2', 'border-amber-500');
}

function onCategoryDragLeave(e) {
  e.currentTarget.classList.remove('border-t-2', 'border-amber-500');
}

function onCategoryDrop(e, targetCatName) {
  e.preventDefault();
  e.currentTarget.classList.remove('border-t-2', 'border-amber-500');

  if (!draggedCategoryName || draggedCategoryName === targetCatName) return;

  const fromIdx = categories.indexOf(draggedCategoryName);
  const toIdx = categories.indexOf(targetCatName);

  if (fromIdx === -1 || toIdx === -1) return;

  const [moved] = categories.splice(fromIdx, 1);
  categories.splice(toIdx, 0, moved);

  saveToStorage('coffeeshop_categories', categories);
  renderCategoriesList();
  renderCategoryFilters();
  if (typeof renderBestSellerCategoryTabs === 'function') {
    renderBestSellerCategoryTabs();
  }
  showToast(`ย้ายหมวดหมู่ "${moved}" ไปลำดับที่ #${toIdx + 1} เรียบร้อยแล้ว`);
}

function onCategoryDragEnd(e) {
  draggedCategoryName = null;
  e.currentTarget.classList.remove('opacity-40', 'bg-amber-50', 'dark:bg-amber-950/40');
  document.querySelectorAll('#categoriesListContainer li').forEach(li => {
    li.classList.remove('border-t-2', 'border-amber-500');
  });
}

function editCategoryName(oldName) {
  const newName = prompt(`แก้ไขชื่อหมวดหมู่ "${oldName}":`, oldName);
  if (!newName) return;
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) return;

  if (categories.includes(trimmed)) {
    showToast(`มีหมวดหมู่ "${trimmed}" อยู่แล้วในระบบ`, 'warning');
    return;
  }

  const idx = categories.indexOf(oldName);
  if (idx === -1) return;

  categories[idx] = trimmed;

  // Update products in this category
  let updatedCount = 0;
  (products || []).forEach(p => {
    if (p.category === oldName) {
      p.category = trimmed;
      updatedCount++;
    }
  });

  if (selectedCategory === oldName) {
    selectedCategory = trimmed;
  }

  saveToStorage('coffeeshop_categories', categories);
  saveToStorage('coffeeshop_products', products);
  if (typeof syncCategoriesToCloud === 'function') syncCategoriesToCloud(categories);
  if (typeof syncProductsToCloud === 'function') syncProductsToCloud(products);
  renderCategoriesList();
  renderCategoryFilters();
  renderProductsGrid();
  renderMenuConfigTable();
  if (typeof renderBestSellerCategoryTabs === 'function') {
    renderBestSellerCategoryTabs();
  }

  showToast(`เปลี่ยนชื่อหมวดหมู่เป็น "${trimmed}" สำเร็จ (ปรับปรุง ${updatedCount} เมนู)`, 'success');
}

function sortCategoriesAlphabetical() {
  categories.sort((a, b) => a.localeCompare(b, 'th'));
  saveToStorage('coffeeshop_categories', categories);
  if (typeof syncCategoriesToCloud === 'function') syncCategoriesToCloud(categories);
  renderCategoriesList();
  renderCategoryFilters();
  if (typeof renderBestSellerCategoryTabs === 'function') {
    renderBestSellerCategoryTabs();
  }
  showToast('จัดเรียงหมวดหมู่ตาม ก-ฮ เรียบร้อยแล้ว');
}

function addNewCategory() {
  const input = document.getElementById('newCategoryInput');
  const name = input.value.trim();

  if (!name) {
    showToast('กรุณากรอกชื่อหมวดหมู่', 'warning');
    return;
  }

  if (categories.includes(name)) {
    showToast('มีหมวดหมู่นี้อยู่แล้วในระบบ', 'warning');
    return;
  }

  categories.push(name);
  saveToStorage('coffeeshop_categories', categories);
  if (typeof syncCategoriesToCloud === 'function') syncCategoriesToCloud(categories);
  renderCategoriesList();
  renderCategoryFilters();
  if (typeof renderBestSellerCategoryTabs === 'function') {
    renderBestSellerCategoryTabs();
  }
  input.value = '';
  showToast(`เพิ่มหมวดหมู่ ${name} สำเร็จ`);
}

function deleteCategory(catName) {
  if (confirm(`คุณต้องการลบหมวดหมู่ "${catName}" หรือไม่? สินค้าที่อยู่ในหมวดหมู่นี้จะไม่ถูกลบ แต่จะถูกย้ายเป็นไม่มีหมวดหมู่`)) {
    categories = categories.filter(c => c !== catName);
    
    // Update products belonging to this category to empty category
    products.forEach(p => {
      if (p.category === catName) p.category = 'อื่นๆ';
    });

    // Ensure 'อื่นๆ' is in category lists if it became a fallback
    if (products.some(p => p.category === 'อื่นๆ') && !categories.includes('อื่นๆ')) {
      categories.push('อื่นๆ');
    }

    if (selectedCategory === catName) {
      selectedCategory = 'all';
    }

    saveToStorage('coffeeshop_categories', categories);
    saveToStorage('coffeeshop_products', products);
    if (typeof syncCategoriesToCloud === 'function') syncCategoriesToCloud(categories);
    if (typeof syncProductsToCloud === 'function') syncProductsToCloud(products);

    renderCategoriesList();
    renderCategoryFilters();
    renderProductsGrid();
    renderMenuConfigTable();
    if (typeof renderBestSellerCategoryTabs === 'function') {
      renderBestSellerCategoryTabs();
    }
    showToast('ลบหมวดหมู่สำเร็จ');
  }
}

// --------------------------------------------------------------------------
// SETTINGS PAGE FORM MANAGEMENT
// --------------------------------------------------------------------------
function togglePaymentSettingsFields() {
  const type = document.getElementById('settingsPromptPayType').value;
  const bankFields = document.getElementById('settingsBankFields');
  const ppFields = document.getElementById('settingsPromptPayFields');
  const qrImgFields = document.getElementById('settingsQrImageFields');
  const ppLabel = document.getElementById('settingsPromptPayLabel');

  bankFields.classList.add('hidden');
  ppFields.classList.add('hidden');
  qrImgFields.classList.add('hidden');

  if (type === 'bank') {
    bankFields.classList.remove('hidden');
  } else if (type === 'mobile') {
    ppFields.classList.remove('hidden');
    ppLabel.innerText = 'เบอร์โทรศัพท์มือถือพร้อมเพย์ (10 หลัก)';
    document.getElementById('settingsPromptPayNo').placeholder = 'เช่น 0812345678';
  } else if (type === 'natid') {
    ppFields.classList.remove('hidden');
    ppLabel.innerText = 'เลขประจำตัวผู้เสียภาษี / เลขบัตรประชาชน (13 หลัก)';
    document.getElementById('settingsPromptPayNo').placeholder = 'เช่น 1100999888777';
  } else if (type === 'image') {
    qrImgFields.classList.remove('hidden');
  }
}

function handleQrImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // Resize to max 400x400 to conserve localStorage space
      const maxDim = 400;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      settings.bankQrImage = compressedDataUrl;

      // Update UI preview
      document.getElementById('settingsQrImagePreview').src = compressedDataUrl;
      const previewContainer = document.getElementById('settingsQrImagePreviewContainer');
      previewContainer.classList.remove('hidden');
      previewContainer.classList.add('flex');
      showToast('อัปโหลดรูปภาพ QR Code สำเร็จแล้ว อย่าลืมกดบันทึกการตั้งค่า');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeQrImage() {
  settings.bankQrImage = '';
  document.getElementById('settingsQrImageInput').value = '';
  document.getElementById('settingsQrImagePreview').src = '';
  const previewContainer = document.getElementById('settingsQrImagePreviewContainer');
  previewContainer.classList.add('hidden');
  previewContainer.classList.remove('flex');
  showToast('ลบรูปภาพ QR Code แล้ว');
}

function updateHeaderShopBranding(fullShopName) {
  const nameEl = document.getElementById('headerShopName');
  const subEl = document.getElementById('headerShopSubtitle');
  if (!nameEl) return;

  const raw = (fullShopName || '').trim() || 'ร้านทานตะวัน';
  const match = raw.match(/^(.*?)\s*\((.*?)\)$/);
  if (match) {
    nameEl.innerText = match[1].trim();
    if (subEl) {
      subEl.innerText = match[2].trim();
      subEl.style.display = '';
    }
  } else {
    nameEl.innerText = raw;
    if (subEl) {
      subEl.innerText = settings.shopSubtitle || 'TANTAWAN COFFEE & CAFÉ';
      subEl.style.display = '';
    }
  }
}

function loadSettingsInputs() {
  updateHeaderShopBranding(settings.shopName);
  document.getElementById('settingsShopName').value = settings.shopName || '';
  document.getElementById('settingsShopPhone').value = settings.shopPhone || '';
  document.getElementById('settingsShopAddress').value = settings.shopAddress || '';
  document.getElementById('settingsReceiptFooter').value = settings.receiptFooter || '';
  document.getElementById('settingsPaperSize').value = settings.paperSize || '80mm';
  if (document.getElementById('settingsPrintQrMode')) {
    document.getElementById('settingsPrintQrMode').value = settings.printQrMode || 'auto';
  }
  if (document.getElementById('settingsPrintLogoMode')) {
    document.getElementById('settingsPrintLogoMode').value = settings.printLogoMode || 'compact';
  }
  if (document.getElementById('settingsAutoCutFix')) {
    document.getElementById('settingsAutoCutFix').checked = settings.autoCutFix !== false;
  }

  // Audio Alerts Settings
  if (document.getElementById('settingsSoundEnabled')) {
    document.getElementById('settingsSoundEnabled').checked = settings.soundEnabled !== false;
  }
  if (document.getElementById('settingsVoiceEnabled')) {
    document.getElementById('settingsVoiceEnabled').checked = settings.voiceEnabled !== false;
  }
  if (document.getElementById('settingsVoiceGender')) {
    document.getElementById('settingsVoiceGender').value = settings.voiceGender || 'female';
  }

  // Theme Mode Select sync
  const themeSelect = document.getElementById('settingsThemeMode');
  if (themeSelect) {
    themeSelect.value = currentTheme;
  }

  // Payment Type
  const pType = settings.promptPayType || 'bank';
  document.getElementById('settingsPromptPayType').value = pType;
  document.getElementById('settingsBankCode').value = settings.bankCode || '004';
  document.getElementById('settingsBankAccountNo').value = settings.bankAccountNo || '';
  document.getElementById('settingsBankAccountName').value = settings.bankAccountName || '';
  document.getElementById('settingsPromptPayNo').value = settings.promptPayNo || '';

  // Show/Hide fields based on type
  togglePaymentSettingsFields();

  // QR Image preview
  const previewContainer = document.getElementById('settingsQrImagePreviewContainer');
  if (settings.bankQrImage) {
    document.getElementById('settingsQrImagePreview').src = settings.bankQrImage;
    previewContainer.classList.remove('hidden');
    previewContainer.classList.add('flex');
  } else {
    previewContainer.classList.add('hidden');
    previewContainer.classList.remove('flex');
  }
}

function saveSystemSettings() {
  const shopName = document.getElementById('settingsShopName').value.trim();
  const shopPhone = document.getElementById('settingsShopPhone').value.trim();
  const shopAddress = document.getElementById('settingsShopAddress').value.trim();
  const receiptFooter = document.getElementById('settingsReceiptFooter').value.trim();
  const promptPayType = document.getElementById('settingsPromptPayType').value;
  const bankCode = document.getElementById('settingsBankCode').value;
  const bankAccountNo = document.getElementById('settingsBankAccountNo').value.trim();
  const bankAccountName = document.getElementById('settingsBankAccountName').value.trim();
  const promptPayNo = document.getElementById('settingsPromptPayNo').value.trim();
  const paperSize = document.getElementById('settingsPaperSize').value;
  const printQrMode = document.getElementById('settingsPrintQrMode')?.value || 'auto';
  const printLogoMode = document.getElementById('settingsPrintLogoMode')?.value || 'compact';
  const autoCutFix = document.getElementById('settingsAutoCutFix')?.checked !== false;
  const soundEnabled = document.getElementById('settingsSoundEnabled')?.checked !== false;
  const voiceEnabled = document.getElementById('settingsVoiceEnabled')?.checked !== false;
  const voiceGender = document.getElementById('settingsVoiceGender')?.value || 'female';

  if (!shopName) {
    showToast('กรุณากรอกชื่อร้านค้า', 'warning');
    return;
  }

  // Validation based on type
  if (promptPayType === 'bank') {
    if (!bankAccountNo) {
      showToast('กรุณากรอกเลขที่บัญชีธนาคาร', 'warning');
      return;
    }
  } else if (promptPayType === 'mobile') {
    const cleanNo = promptPayNo.replace(/[^0-9]/g, '');
    if (cleanNo.length !== 10) {
      showToast('เบอร์โทรศัพท์มือถือพร้อมเพย์ต้องมี 10 หลัก', 'warning');
      return;
    }
  } else if (promptPayType === 'natid') {
    const cleanNo = promptPayNo.replace(/[^0-9]/g, '');
    if (cleanNo.length !== 13) {
      showToast('เลขบัตรประชาชน/เลขผู้เสียภาษีต้องมี 13 หลัก', 'warning');
      return;
    }
  } else if (promptPayType === 'image') {
    if (!settings.bankQrImage) {
      showToast('กรุณาเลือกไฟล์รูปภาพ QR Code ของคุณก่อนบันทึก', 'warning');
      return;
    }
  }

  const themeMode = document.getElementById('settingsThemeMode') ? document.getElementById('settingsThemeMode').value : currentTheme;
  applyTheme(themeMode);

  settings = {
    ...settings,
    shopName,
    shopPhone,
    shopAddress,
    receiptFooter,
    promptPayType,
    bankCode,
    bankAccountNo,
    bankAccountName,
    promptPayNo,
    paperSize,
    printQrMode,
    printLogoMode,
    autoCutFix,
    soundEnabled,
    voiceEnabled,
    voiceGender,
    theme: themeMode
  };

  saveToStorage('coffeeshop_settings', settings);
  updateHeaderShopBranding(shopName);
  showToast('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว', 'success');
}

function resetToSampleData() {
  if (confirm('คุณแน่ใจว่าต้องการล้างประวัติการขายและโครงสร้างสินค้าทั้งหมดเพื่อโหลดข้อมูลทดลองใช่หรือไม่? ยอดขายเก่าจะหายทั้งหมด!')) {
    localStorage.clear();
    
    // Build Sample Orders from today & yesterday to populate statistics nicely
    const todayTS = new Date().getTime();
    const yesterdayTS = todayTS - (24 * 60 * 60 * 1000);
    
    const sampleOrders = [
      {
        id: 'ORD-89493',
        timestamp: todayTS - (5 * 24 * 60 * 60 * 1000), // 5 days ago
        items: [
          { id: 'prod-9', name: 'โกโก้เข้มข้น (Cocoa)', basePrice: 50, pricePerItem: 55, selectedTemp: 'เย็น', selectedSweetness: '100%', selectedExtras: [], qty: 1, itemTotal: 55 },
          { id: 'prod-8', name: 'ครัวซองต์เนยสด (Butter Croissant)', basePrice: 65, pricePerItem: 65, selectedTemp: null, selectedSweetness: null, selectedExtras: [], qty: 1, itemTotal: 65 }
        ],
        subtotal: 120,
        discount: 0,
        total: 120,
        paymentMethod: 'เงินสด',
        cashReceived: 120,
        cashChange: 0,
        status: 'completed'
      },
      {
        id: 'ORD-89494',
        timestamp: todayTS - (3 * 24 * 60 * 60 * 1000), // 3 days ago
        items: [
          { id: 'prod-5', name: 'ชาเขียวมัทฉะ (Matcha Latte)', basePrice: 60, pricePerItem: 65, selectedTemp: 'เย็น', selectedSweetness: '50%', selectedExtras: [{ name: 'บุกน้ำผึ้ง (Honey Jelly)', price: 15 }], qty: 2, itemTotal: 160 }
        ],
        subtotal: 160,
        discount: 0,
        total: 160,
        paymentMethod: 'โอนบัญชีธนาคาร',
        cashReceived: 160,
        cashChange: 0,
        status: 'completed'
      },
      {
        id: 'ORD-89495',
        timestamp: yesterdayTS - (4 * 60 * 60 * 1000), // yesterday afternoon
        items: [
          { id: 'prod-2', name: 'อเมริกาโน่ (Americano)', basePrice: 50, pricePerItem: 55, selectedTemp: 'เย็น', selectedSweetness: '50%', selectedExtras: [], qty: 1, itemTotal: 55 },
          { id: 'prod-7', name: 'บลูเบอร์รี่ชีสพาย (Blueberry Cheesepie)', basePrice: 85, pricePerItem: 85, selectedTemp: null, selectedSweetness: null, selectedExtras: [], qty: 1, itemTotal: 85 }
        ],
        subtotal: 140,
        discount: 0,
        total: 140,
        paymentMethod: 'เงินสด',
        cashReceived: 500,
        cashChange: 360,
        status: 'completed'
      },
      {
        id: 'ORD-89496',
        timestamp: yesterdayTS - (1 * 60 * 60 * 1000), // yesterday evening
        items: [
          { id: 'prod-4', name: 'ลาเต้ (Latte)', basePrice: 55, pricePerItem: 60, selectedTemp: 'เย็น', selectedSweetness: '100%', selectedExtras: [], qty: 2, itemTotal: 120 }
        ],
        subtotal: 120,
        discount: 10,
        total: 110,
        paymentMethod: 'พร้อมเพย์',
        cashReceived: 110,
        cashChange: 0,
        status: 'completed'
      },
      {
        id: 'ORD-89497',
        timestamp: todayTS - (4 * 60 * 60 * 1000), // today morning
        items: [
          { id: 'prod-1', name: 'เอสเพรสโซ่ (Espresso)', basePrice: 50, pricePerItem: 55, selectedTemp: 'เย็น', selectedSweetness: '50%', selectedExtras: [{ name: 'เพิ่มช็อตกาแฟ (Extra Shot)', price: 15 }], qty: 1, itemTotal: 70 },
          { id: 'prod-8', name: 'ครัวซองต์เนยสด (Butter Croissant)', basePrice: 65, pricePerItem: 65, selectedTemp: null, selectedSweetness: null, selectedExtras: [], qty: 1, itemTotal: 65 }
        ],
        subtotal: 135,
        discount: 0,
        total: 135,
        paymentMethod: 'พร้อมเพย์',
        cashReceived: 135,
        cashChange: 0,
        status: 'completed'
      },
      {
        id: 'ORD-89498',
        timestamp: todayTS - (2 * 60 * 60 * 1000), // today noon
        items: [
          { id: 'prod-6', name: 'ชาไทยพรีเมียม (Thai Tea)', basePrice: 50, pricePerItem: 60, selectedTemp: 'ปั่น', selectedSweetness: '100%', selectedExtras: [{ name: 'วิปครีม (Whipped Cream)', price: 15 }], qty: 1, itemTotal: 75 }
        ],
        subtotal: 75,
        discount: 5,
        total: 70,
        paymentMethod: 'เงินสด',
        cashReceived: 100,
        cashChange: 30,
        status: 'completed'
      },
      {
        id: 'ORD-89499',
        timestamp: todayTS - (30 * 60 * 1000), // today 30 mins ago
        items: [
          { id: 'prod-3', name: 'คาปูชิโน่ (Cappuccino)', basePrice: 55, pricePerItem: 55, selectedTemp: 'ร้อน', selectedSweetness: '0%', selectedExtras: [], qty: 1, itemTotal: 55 }
        ],
        subtotal: 55,
        discount: 0,
        total: 55,
        paymentMethod: 'เงินสด',
        cashReceived: 55,
        cashChange: 0,
        status: 'voided' // voided order sample
      }
    ];

    localStorage.setItem('coffeeshop_categories', JSON.stringify(DEFAULT_CATEGORIES));
    localStorage.setItem('coffeeshop_option_groups', JSON.stringify(DEFAULT_OPTION_GROUPS));
    localStorage.setItem('coffeeshop_promotions', JSON.stringify(DEFAULT_PROMOTIONS));
    localStorage.setItem('coffeeshop_products', JSON.stringify(DEFAULT_PRODUCTS));
    localStorage.setItem('coffeeshop_settings', JSON.stringify(DEFAULT_SETTINGS));
    localStorage.setItem('coffeeshop_orders', JSON.stringify(sampleOrders));
    localStorage.setItem('coffeeshop_theme', 'dark');
    localStorage.setItem('coffeeshop_users', JSON.stringify(DEFAULT_USERS));
    localStorage.setItem('coffeeshop_current_user_id', 'user-owner');

    // Reload browser to load clean presets
    window.location.reload();
  }
}

// --------------------------------------------------------------------------
// FLOATING TOAST ALERTS DIALOGS
// --------------------------------------------------------------------------
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'px-4 py-2.5 rounded-xl text-white text-xs font-semibold shadow-lg transition-all duration-300 transform translate-y-2 opacity-0 flex items-center space-x-2 pointer-events-auto select-none';
  
  // Theme coloring
  if (type === 'success') {
    toast.classList.add('bg-coffee-700', 'border', 'border-coffee-500');
    toast.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>${message}</span>
    `;
  } else if (type === 'warning') {
    toast.classList.add('bg-amber-600', 'border', 'border-amber-400');
    toast.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span>${message}</span>
    `;
  } else {
    toast.classList.add('bg-red-600', 'border', 'border-red-400');
    toast.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>${message}</span>
    `;
  }

  container.appendChild(toast);

  // Trigger entering animations (Force browser layout reflow)
  toast.offsetHeight;
  toast.classList.remove('translate-y-2', 'opacity-0');

  // Dismiss timers
  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => {
      container.removeChild(toast);
    }, 300);
  }, 2500);
}

// ==========================================================================
// CUSTOMER-FACING DISPLAY (CFD / DUAL SCREEN) MODULE
// BroadcastChannel & LocalStorage synchronization for customer screen
// ==========================================================================
const customerDisplayChannel = new BroadcastChannel('tantawan-pos-customer-display');
let currentActiveQrPayload = '';

function openCustomerDisplayWindow() {
  const width = 1180;
  const height = 760;
  const left = Math.max(0, (window.screen.availWidth - width) / 2);
  const top = Math.max(0, (window.screen.availHeight - height) / 2);
  
  const win = window.open(
    'customer.html',
    'TantawanCustomerDisplay',
    `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
  );
  
  if (win) {
    win.focus();
    setTimeout(() => {
      syncCustomerDisplay('CART_UPDATE');
    }, 400);
    showToast('🖥️ เปิดหน้าจอฝั่งลูกค้าแล้ว (ลากไปจอที่ 2 แล้วกด F11 ได้เลย)', 'success');
  } else {
    showToast('กรุณาอนุญาตป๊อปอัป (Pop-up) ของเบราว์เซอร์เพื่อเปิดจอลูกค้า', 'warning');
  }
}

function syncCustomerDisplay(type, payload = null) {
  try {
    let eventData = { type: type };
    if (type === 'CART_UPDATE') {
      const calc = getCartCalculation();
      eventData = {
        type: 'CART_UPDATE',
        cart: cart.map(item => ({
          name: item.name,
          qty: item.qty,
          pricePerItem: item.pricePerItem,
          itemTotal: item.itemTotal,
          selectedOptions: item.selectedOptions || [],
          isCustomPrice: item.isCustomPrice || false,
          customPriceNote: item.customPriceNote || item.customNotes || ''
        })),
        subtotal: calc.subtotal,
        discount: calc.discount,
        total: calc.total,
        discountDetail: cartDiscountDetail
      };
    } else if (type === 'SHOW_QR') {
      eventData = {
        type: 'SHOW_QR',
        qrData: payload
      };
    } else if (type === 'HIDE_QR') {
      eventData = { type: 'HIDE_QR' };
    } else if (type === 'PAYMENT_SUCCESS') {
      eventData = { 
        type: 'PAYMENT_SUCCESS',
        total: payload && payload.amount ? payload.amount : 0,
        voiceGender: settings.voiceGender || 'female'
      };
    } else if (type === 'CLEAR_CART') {
      eventData = { type: 'CLEAR_CART' };
    } else if (type.startsWith('CUSTOMIZE_')) {
      eventData = {
        type: type,
        payload: payload
      };
    }

    customerDisplayChannel.postMessage(eventData);

    // Broadcast across devices over the cloud via Supabase Realtime
    if (typeof broadcastToCustomerScreen === 'function') {
      broadcastToCustomerScreen(eventData);
    }

    localStorage.setItem('tantawan_customer_display_event', JSON.stringify({
      ...eventData,
      _t: Date.now()
    }));
  } catch (err) {
    console.warn('Customer display sync error:', err);
  }
}

customerDisplayChannel.onmessage = (e) => {
  if (e.data && e.data.type === 'REQUEST_INITIAL_STATE') {
    syncCustomerDisplay('CART_UPDATE');
    if (typeof currentCustomizingProduct !== 'undefined' && currentCustomizingProduct) {
      if (typeof broadcastCustomerCustomization === 'function') {
        broadcastCustomerCustomization('START');
      }
    }
    if (checkoutMethod === 'promptpay' && !document.getElementById('checkoutModal').classList.contains('hidden')) {
      broadcastCustomerQr();
    }
  }
};

function broadcastCustomerQr() {
  const { total } = getCartCalculation();
  const selectedBank = (typeof THAI_BANKS !== 'undefined' && Array.isArray(THAI_BANKS))
    ? (THAI_BANKS.find(b => b.code === settings.bankCode) || THAI_BANKS[0])
    : { name: 'ธนาคาร' };

  const qrData = {
    amount: total,
    type: settings.promptPayType,
    imageUrl: settings.bankQrImage,
    qrString: currentActiveQrPayload,
    accountNo: settings.promptPayType === 'bank' ? settings.bankAccountNo : (settings.promptPayNo || '-'),
    accountName: settings.promptPayType === 'bank' ? settings.bankAccountName : (settings.promptPayName || settings.shopName),
    bankName: settings.promptPayType === 'bank' ? selectedBank.name : 'PromptPay พร้อมเพย์'
  };
  syncCustomerDisplay('SHOW_QR', qrData);
}

// ==========================================================================
// PAYMENT AUDIO & VOICE ALERT ENGINE (ZERO FEES / WORKS OFFLINE 100%)
// Web Audio API harmonic chime ("ติ๊ง-ดอง!") + Thai Speech Synthesis
// ==========================================================================
function playChimeSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const t = ctx.currentTime;

    // Tone 1: High crisp bell E6 (1318.5 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1318.5, t);
    gain1.gain.setValueAtTime(0.35, t);
    gain1.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.55);

    // Tone 2: Warm harmonious chime B6 (1975.5 Hz) slightly delayed
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1975.5, t + 0.12);
    gain2.gain.setValueAtTime(0.4, t + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t + 0.12);
    osc2.stop(t + 1.2);
  } catch (err) {
    console.warn('Web Audio chime error:', err);
  }
}

// Pre-initialize SpeechSynthesis voice cache
let cachedSpeechVoices = [];
function updateSpeechVoicesCache() {
  if ('speechSynthesis' in window) {
    cachedSpeechVoices = window.speechSynthesis.getVoices();
  }
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  updateSpeechVoicesCache();
  window.speechSynthesis.onvoiceschanged = updateSpeechVoicesCache;
}

function getThaiVoice(preferredGender = 'female') {
  if (!('speechSynthesis' in window)) return null;
  let voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) {
    voices = cachedSpeechVoices || [];
  }
  if (!voices || voices.length === 0) return null;

  const thaiVoices = voices.filter(v => {
    const l = (v.lang || '').toLowerCase().replace('_', '-');
    return l === 'th-th' || l.startsWith('th');
  });

  if (thaiVoices.length === 0) return null;

  // Female voice keywords (Edge: "premwadee", Chrome: "google ภาษาไทย", Safari/iOS: "kanya", "narisa")
  const femaleKeywords = ['premwadee', 'google', 'kanya', 'narisa', 'achara', 'female', 'woman', 'siri'];
  const maleKeywords = ['pattara', 'niwat', 'male', 'man'];

  if (preferredGender === 'female') {
    // 1. Explicit female voice match
    const femaleVoice = thaiVoices.find(v => {
      const name = (v.name || '').toLowerCase();
      return femaleKeywords.some(k => name.includes(k));
    });
    if (femaleVoice) return femaleVoice;

    // 2. Any Thai voice that is NOT explicitly known as male
    const nonMaleVoice = thaiVoices.find(v => {
      const name = (v.name || '').toLowerCase();
      return !maleKeywords.some(k => name.includes(k));
    });
    if (nonMaleVoice) return nonMaleVoice;

    // 3. Fallback
    return thaiVoices[0];
  } else {
    // Male preferred
    const maleVoice = thaiVoices.find(v => {
      const name = (v.name || '').toLowerCase();
      return maleKeywords.some(k => name.includes(k));
    });
    if (maleVoice) return maleVoice;

    return thaiVoices[0];
  }
}

function speakThaiPaymentNotice(amount) {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();

    // Check if dropdown in settings is currently open/modified
    const genderSelect = document.getElementById('settingsVoiceGender');
    const gender = (genderSelect && genderSelect.value) ? genderSelect.value : (settings.voiceGender || 'female');
    const isFemale = gender === 'female';

    const rounded = Math.round(amount || 0);
    const particle = isFemale ? 'ค่ะ' : 'ครับ';
    const text = rounded > 0 
      ? `ได้รับชำระเงินแล้ว${particle} ${rounded} บาท ขอบคุณ${particle}`
      : `ได้รับชำระเงินเรียบร้อยแล้ว${particle} ขอบคุณ${particle}`;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'th-TH';

    const selectedVoice = getThaiVoice(gender);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    const voiceName = (selectedVoice ? selectedVoice.name : '').toLowerCase();
    const isMaleVoice = voiceName.includes('pattara') || voiceName.includes('niwat') || voiceName.includes('male');

    if (isFemale) {
      // Natural sweet cafe barista tone for female voice
      // If forced to fallback to Pattara offline, shift pitch up higher to sound lighter/feminine
      utterance.pitch = isMaleVoice ? 1.35 : 1.15;
      utterance.rate = 1.02;
    } else {
      utterance.pitch = 0.95;
      utterance.rate = 1.0;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('SpeechSynthesis error:', err);
  }
}

function playPaymentAudioAlert(amount) {
  const soundEnabled = settings.soundEnabled !== false;
  const voiceEnabled = settings.voiceEnabled !== false;

  if (soundEnabled) {
    playChimeSound();
  }

  if (voiceEnabled) {
    setTimeout(() => {
      speakThaiPaymentNotice(amount);
    }, soundEnabled ? 380 : 0);
  }
}

function testPaymentAudioAlert() {
  const genderSelect = document.getElementById('settingsVoiceGender');
  if (genderSelect) {
    settings.voiceGender = genderSelect.value;
  }
  const isFemale = (settings.voiceGender || 'female') !== 'male';
  const particle = isFemale ? 'ค่ะ' : 'ครับ';

  playPaymentAudioAlert(120);
  showToast(`🔊 กำลังทดสอบเสียง: ติ๊ง-ดอง! + "ได้รับชำระเงินแล้ว${particle} 120 บาท ขอบคุณ${particle}"`, 'success');
}

// ==========================================================================
// USER AUTHENTICATION, PIN LOCK SCREEN & ROLE-BASED ACCESS CONTROL (RBAC)
// ==========================================================================

function applyUserRolePermissions() {
  if (!currentUser) return;
  const isOwner = (currentUser.role === 'owner');

  // 1. Update Header User Badge & Dropdown
  const roleIcon = document.getElementById('currentUserRoleIcon');
  const nameDisplay = document.getElementById('currentUserNameDisplay');
  const roleBadge = document.getElementById('currentUserRoleBadge');
  const dropdownName = document.getElementById('dropdownUserName');

  if (roleIcon) roleIcon.innerText = isOwner ? '👑' : '☕';
  if (nameDisplay) nameDisplay.innerText = currentUser.name;
  if (roleBadge) {
    roleBadge.innerText = isOwner ? 'เจ้าของร้าน (Owner)' : 'พนักงานหน้าร้าน (Staff)';
    roleBadge.className = isOwner 
      ? 'text-[10px] text-amber-600 dark:text-amber-400 font-semibold' 
      : 'text-[10px] text-blue-600 dark:text-blue-400 font-semibold';
  }
  if (dropdownName) {
    dropdownName.innerText = `${currentUser.name} (${isOwner ? 'Owner' : 'Staff'})`;
  }

  // 2. Hide / Show Protected Navigation Tabs
  const tabMenu = document.getElementById('tab-menu');
  const tabPromotions = document.getElementById('tab-promotions');
  const tabSettings = document.getElementById('tab-settings');

  if (tabMenu) tabMenu.style.display = isOwner ? '' : 'none';
  if (tabPromotions) tabPromotions.style.display = isOwner ? '' : 'none';
  if (tabSettings) tabSettings.style.display = isOwner ? '' : 'none';

  // If staff is currently on a protected tab, redirect to cashier
  if (!isOwner && ['menu', 'promotions', 'settings'].includes(currentActiveTab)) {
    switchTab('cashier');
  }

  // 3. Reports Tab Restrictions for Staff
  const staffNotice = document.getElementById('staffReportNotice');
  if (staffNotice) {
    staffNotice.classList.toggle('hidden', isOwner);
  }

  document.querySelectorAll('.historical-date-ctrl').forEach(el => {
    el.style.display = isOwner ? '' : 'none';
  });

  const btnYesterday = document.getElementById('btn-date-yesterday');
  if (btnYesterday) {
    btnYesterday.style.display = isOwner ? '' : 'none';
  }

  const customDateWrapper = document.getElementById('reportsCustomDateWrapper');
  if (customDateWrapper) {
    customDateWrapper.style.display = isOwner ? '' : 'none';
  }

  const exportBtn = document.getElementById('btnExportReport');
  if (exportBtn) {
    exportBtn.style.display = isOwner ? '' : 'none';
  }

  // If staff, lock date range strictly to 'today'
  if (!isOwner && selectedDateRange !== 'today') {
    setDateRange('today');
  }

  // Refresh report stats and ledger if reports tab is active
  if (currentActiveTab === 'reports') {
    calculateReportStats();
  }
}

function toggleUserDropdown() {
  const dd = document.getElementById('userQuickDropdown');
  if (!dd) return;
  dd.classList.toggle('hidden');
}

function closeUserDropdown() {
  const dd = document.getElementById('userQuickDropdown');
  if (dd) dd.classList.add('hidden');
}

// Close user quick dropdown when clicking outside
document.addEventListener('click', (e) => {
  const badgeBtn = document.getElementById('currentUserBadgeBtn');
  const dropdown = document.getElementById('userQuickDropdown');
  if (dropdown && !dropdown.classList.contains('hidden')) {
    if (badgeBtn && !badgeBtn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  }
});

function openPinLoginModal(targetUserId = null, isLock = false, onSuccess = null, customSubtitle = null) {
  closeUserDropdown();
  const modal = document.getElementById('pinLoginModal');
  if (!modal) return;

  isScreenLocked = isLock;
  pinOnSuccessCallback = onSuccess;
  pinCurrentInput = '';

  // Set target user if specified
  pinModalTargetUser = targetUserId ? users.find(u => u.id === targetUserId && u.active !== false) : null;
  if (!pinModalTargetUser && currentUser) {
    pinModalTargetUser = currentUser;
  }

  // Update modal titles & controls
  const titleEl = document.getElementById('pinModalTitle');
  const subEl = document.getElementById('pinModalSubtitle');
  const cancelBtn = document.getElementById('btnCancelPinModal');
  const avatarEl = document.getElementById('pinModalAvatar');

  if (isLock) {
    if (titleEl) titleEl.innerText = 'หน้าจอล็อค (POS Locked)';
    if (subEl) subEl.innerText = customSubtitle || 'กรุณาเลือกผู้ใช้งานและป้อนรหัส PIN 4 หลักเพื่อปลดล็อค';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (avatarEl) avatarEl.innerText = '🔒';
  } else {
    if (titleEl) titleEl.innerText = customSubtitle ? 'ยืนยันรหัส PIN' : 'เข้าสู่ระบบ / สลับผู้ใช้งาน';
    if (subEl) subEl.innerText = customSubtitle || 'กรุณาเลือกผู้ใช้งานและป้อนรหัส PIN 4 หลัก';
    if (cancelBtn) cancelBtn.style.display = '';
    if (avatarEl) avatarEl.innerText = '🔐';
  }

  renderPinUserSelectors();
  updatePinDotsUI();
  clearPinError();

  modal.classList.remove('hidden');
}

function closePinLoginModal() {
  if (isScreenLocked) return; // Prevent closing if screen is locked
  const modal = document.getElementById('pinLoginModal');
  if (modal) modal.classList.add('hidden');
  pinCurrentInput = '';
  pinModalTargetUser = null;
  pinOnSuccessCallback = null;
}

function renderPinUserSelectors() {
  const container = document.getElementById('pinUserSelectorContainer');
  if (!container) return;
  container.innerHTML = '';

  const activeUsers = users.filter(u => u.active !== false);
  activeUsers.forEach(u => {
    const isSelected = pinModalTargetUser && pinModalTargetUser.id === u.id;
    const isOwner = (u.role === 'owner');
    
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.onclick = () => selectPinTargetUser(u.id);
    btn.className = `px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border shadow-2xs ${
      isSelected 
        ? (isOwner 
            ? 'bg-amber-500 text-white border-amber-600 ring-2 ring-amber-300 dark:ring-amber-700' 
            : 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-300 dark:ring-blue-700')
        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
    }`;
    btn.innerHTML = `<span>${isOwner ? '👑' : '☕'}</span><span>${u.name}</span>`;
    container.appendChild(btn);
  });
}

function selectPinTargetUser(userId) {
  const u = users.find(usr => usr.id === userId);
  if (u) {
    pinModalTargetUser = u;
    pinCurrentInput = '';
    updatePinDotsUI();
    clearPinError();
    renderPinUserSelectors();
  }
}

function enterPinDigit(digit) {
  if (pinCurrentInput.length >= 4) return;
  pinCurrentInput += digit;
  updatePinDotsUI();
  clearPinError();

  if (pinCurrentInput.length === 4) {
    setTimeout(() => {
      submitPinLogin();
    }, 80);
  }
}

function backspacePinInput() {
  if (pinCurrentInput.length > 0) {
    pinCurrentInput = pinCurrentInput.slice(0, -1);
    updatePinDotsUI();
    clearPinError();
  }
}

function clearPinInput() {
  pinCurrentInput = '';
  updatePinDotsUI();
  clearPinError();
}

function updatePinDotsUI() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((dot, index) => {
    if (index < pinCurrentInput.length) {
      dot.className = 'pin-dot w-4 h-4 rounded-full border-2 border-coffee-600 dark:border-amber-500 bg-coffee-600 dark:bg-amber-500 scale-110 shadow-sm transition-all';
    } else {
      dot.className = 'pin-dot w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 bg-transparent transition-all';
    }
  });
}

function showPinError(msg = 'รหัส PIN ไม่ถูกต้อง') {
  const errEl = document.getElementById('pinErrorMessage');
  const dotsBox = document.getElementById('pinDotsContainer');
  if (errEl) {
    errEl.innerText = msg;
    errEl.classList.remove('opacity-0');
  }
  if (dotsBox) {
    dotsBox.classList.add('animate-shake');
    setTimeout(() => dotsBox.classList.remove('animate-shake'), 400);
  }
}

function clearPinError() {
  const errEl = document.getElementById('pinErrorMessage');
  if (errEl) errEl.classList.add('opacity-0');
}

function submitPinLogin() {
  if (pinCurrentInput.length !== 4) return;

  // Verify PIN
  let authenticatedUser = null;

  // Helper function to check if input matches a user's pin (with dual-compatibility fallback for 1234/9999 and 0000/1111)
  const isPinMatch = (u, input) => {
    if (!u) return false;
    if (u.pin === input) return true;
    if (u.id === 'user-owner' && (input === '1234' || input === '9999')) return true;
    if (u.role === 'owner' && (input === '1234' || input === '9999')) return true;
    if (u.id === 'user-staff1' && (input === '0000' || input === '1111')) return true;
    if (u.role === 'staff' && (input === '0000' || input === '1111')) return true;
    return false;
  };

  // 1. If an action specifically requires Owner override (promptOwnerPinOverride)
  if (pinOnSuccessCallback && pinModalTargetUser && pinModalTargetUser.role === 'owner') {
    if (isPinMatch(pinModalTargetUser, pinCurrentInput)) {
      authenticatedUser = pinModalTargetUser;
    } else {
      authenticatedUser = users.find(u => u.role === 'owner' && u.active !== false && isPinMatch(u, pinCurrentInput));
    }
  } else {
    // 2. Normal login / screen unlock / user switch
    // First, check if input matches the selected target user
    if (pinModalTargetUser && isPinMatch(pinModalTargetUser, pinCurrentInput)) {
      authenticatedUser = pinModalTargetUser;
    }

    // If target didn't match, check ANY active user whose PIN matches!
    // This allows cashiers to simply punch in their PIN without clicking their name first!
    if (!authenticatedUser) {
      authenticatedUser = users.find(u => u.active !== false && isPinMatch(u, pinCurrentInput));
    }
  }

  if (authenticatedUser) {
    // PIN correct!
    currentUser = authenticatedUser;
    localStorage.setItem('coffeeshop_current_user_id', currentUser.id);
    isScreenLocked = false;
    
    const cb = pinOnSuccessCallback;
    pinOnSuccessCallback = null;
    
    closePinLoginModal();
    applyUserRolePermissions();
    
    const roleLabel = currentUser.role === 'owner' ? 'เจ้าของร้าน' : 'พนักงานหน้าร้าน';
    showToast(`ยินดีต้อนรับ ${currentUser.name} (${roleLabel})`, 'success');

    if (typeof cb === 'function') {
      cb();
    }
  } else {
    // PIN incorrect
    showPinError('รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
    setTimeout(() => {
      pinCurrentInput = '';
      updatePinDotsUI();
    }, 450);
  }
}

function lockScreen() {
  closeUserDropdown();
  openPinLoginModal(currentUser ? currentUser.id : null, true);
}

function switchUserPrompt() {
  closeUserDropdown();
  openPinLoginModal(null, false);
}

function promptOwnerPinOverride(callback, reason = 'ต้องใช้รหัส PIN เจ้าของร้าน (Owner) เพื่อดำเนินการ') {
  const owners = users.filter(u => u.role === 'owner' && u.active !== false);
  const targetOwnerId = owners.length > 0 ? owners[0].id : null;
  openPinLoginModal(targetOwnerId, false, () => {
    if (currentUser && currentUser.role === 'owner') {
      callback();
    } else {
      showToast('⚠️ ต้องเข้าสู่ระบบด้วยสิทธิ์เจ้าของร้านเท่านั้น', 'warning');
    }
  }, reason);
}

function initPinModalKeyboardEvents() {
  window.addEventListener('keydown', (e) => {
    const modal = document.getElementById('pinLoginModal');
    if (!modal || modal.classList.contains('hidden')) return;

    // Ignore if typing in an input, textarea, or select element
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    if (e.key >= '0' && e.key <= '9') {
      enterPinDigit(e.key);
      e.preventDefault();
    } else if (e.key === 'Backspace') {
      backspacePinInput();
      e.preventDefault();
    } else if (e.key === 'Escape' && !isScreenLocked) {
      closePinLoginModal();
      e.preventDefault();
    } else if (e.key === 'c' || e.key === 'C') {
      clearPinInput();
      e.preventDefault();
    }
  });
}

// --------------------------------------------------------------------------
// STAFF MANAGEMENT (CRUD IN SETTINGS TAB)
// --------------------------------------------------------------------------

function renderStaffList() {
  const tbody = document.getElementById('staffListTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  users.forEach((user) => {
    const isOwner = (user.role === 'owner');
    const isCurrent = currentUser && (currentUser.id === user.id);
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition';

    // Role badge
    const roleBadgeHtml = isOwner 
      ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
           <span>👑</span><span>เจ้าของร้าน (Owner)</span>
         </span>`
      : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
           <span>☕</span><span>พนักงาน (Staff)</span>
         </span>`;

    // Status badge
    const statusBadgeHtml = (user.active !== false)
      ? `<span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
           <span class="w-2 h-2 rounded-full bg-emerald-500"></span><span>ใช้งานอยู่</span>
         </span>`
      : `<span class="inline-flex items-center gap-1 text-slate-400 font-semibold text-xs">
           <span class="w-2 h-2 rounded-full bg-slate-400"></span><span>ปิดใช้งาน</span>
         </span>`;

    tr.innerHTML = `
      <td class="px-4 py-3">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full ${isOwner ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-blue-500/20 text-blue-600 dark:text-blue-400'} flex items-center justify-center font-bold text-sm">
            ${isOwner ? '👑' : '☕'}
          </div>
          <div>
            <div class="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <span>${user.name}</span>
              ${isCurrent ? '<span class="text-[10px] bg-coffee-100 dark:bg-amber-950/80 text-coffee-800 dark:text-amber-300 px-1.5 py-0.2 rounded font-medium">คุณ</span>' : ''}
            </div>
            <div class="text-[10px] text-slate-400">ID: ${user.id}</div>
          </div>
        </div>
      </td>
      <td class="px-4 py-3">${roleBadgeHtml}</td>
      <td class="px-4 py-3 text-center">
        <span class="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
          <span id="pin-display-${user.id}" class="font-mono tracking-widest text-slate-500 dark:text-slate-400 text-xs">••••</span>
          <button type="button" onclick="toggleShowStaffPin('${user.id}')" title="แสดง/ซ่อนรหัส PIN" class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">👁️</button>
        </span>
      </td>
      <td class="px-4 py-3 text-center">${statusBadgeHtml}</td>
      <td class="px-4 py-3 text-right">
        <div class="flex items-center justify-end gap-1.5">
          <button type="button" onclick="openStaffModal('${user.id}')" title="แก้ไขข้อมูล / เปลี่ยน PIN" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition">
            ✏️ แก้ไข
          </button>
          <button type="button" onclick="deleteStaff('${user.id}')" title="ลบผู้ใช้งาน" class="px-2.5 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 dark:text-red-400 text-xs font-semibold transition">
            🗑️ ลบ
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function toggleShowStaffPin(userId) {
  const el = document.getElementById(`pin-display-${userId}`);
  if (!el) return;
  const user = users.find(u => u.id === userId);
  if (!user) return;
  if (el.innerText === '••••') {
    el.innerText = user.pin;
    el.className = 'font-mono font-bold tracking-widest text-slate-800 dark:text-slate-100 text-xs';
  } else {
    el.innerText = '••••';
    el.className = 'font-mono tracking-widest text-slate-500 dark:text-slate-400 text-xs';
  }
}

function openStaffModal(userId = null) {
  const modal = document.getElementById('staffModal');
  if (!modal) return;

  const idInput = document.getElementById('staffModalUserId');
  const nameInput = document.getElementById('staffModalName');
  const roleSelect = document.getElementById('staffModalRole');
  const pinInput = document.getElementById('staffModalPin');
  const activeCheck = document.getElementById('staffModalActive');
  const titleEl = document.getElementById('staffModalTitle');

  if (userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    if (idInput) idInput.value = user.id;
    if (nameInput) nameInput.value = user.name;
    if (roleSelect) roleSelect.value = user.role;
    if (pinInput) pinInput.value = user.pin;
    if (activeCheck) activeCheck.checked = (user.active !== false);
    if (titleEl) titleEl.innerText = `แก้ไขข้อมูลพนักงาน: ${user.name}`;
  } else {
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (roleSelect) roleSelect.value = 'staff';
    if (pinInput) pinInput.value = '';
    if (activeCheck) activeCheck.checked = true;
    if (titleEl) titleEl.innerText = 'เพิ่มพนักงานใหม่';
  }

  modal.classList.remove('hidden');
}

function closeStaffModal() {
  const modal = document.getElementById('staffModal');
  if (modal) modal.classList.add('hidden');
}

function saveStaffModal() {
  const idInput = document.getElementById('staffModalUserId');
  const nameInput = document.getElementById('staffModalName');
  const roleSelect = document.getElementById('staffModalRole');
  const pinInput = document.getElementById('staffModalPin');
  const activeCheck = document.getElementById('staffModalActive');

  const name = (nameInput.value || '').trim();
  const role = roleSelect.value;
  const pin = (pinInput.value || '').trim();
  const active = activeCheck.checked;
  const userId = idInput.value;

  if (!name) {
    showToast('กรุณากรอกชื่อพนักงาน', 'warning');
    nameInput.focus();
    return;
  }

  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    showToast('กรุณากำหนดรหัส PIN เป็นตัวเลข 4 หลัก', 'warning');
    pinInput.focus();
    return;
  }

  // Check PIN conflict with another active user
  const pinConflict = users.find(u => u.id !== userId && u.pin === pin && u.active !== false);
  if (pinConflict) {
    showToast(`รหัส PIN นี้ตรงกับของ "${pinConflict.name}" กรุณาใช้รหัส PIN อื่น`, 'warning');
    pinInput.focus();
    return;
  }

  if (userId) {
    // Edit existing user
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex >= 0) {
      // Prevent deactivating or demoting the last active owner
      if (users[userIndex].role === 'owner' && (role !== 'owner' || !active)) {
        const otherOwners = users.filter(u => u.id !== userId && u.role === 'owner' && u.active !== false);
        if (otherOwners.length === 0) {
          showToast('ไม่สามารถเปลี่ยนบทบาทหรือปิดใช้งานได้ เนื่องจากต้องมีเจ้าของร้าน (Owner) ที่ใช้งานอยู่อย่างน้อย 1 คน', 'warning');
          return;
        }
      }

      users[userIndex].name = name;
      users[userIndex].role = role;
      users[userIndex].pin = pin;
      users[userIndex].active = active;

      if (currentUser && currentUser.id === userId) {
        currentUser = users[userIndex];
        applyUserRolePermissions();
      }
      showToast(`อัปเดตข้อมูล "${name}" เรียบร้อยแล้ว`, 'success');
    }
  } else {
    // Create new user
    const newId = 'user-' + Date.now().toString().slice(-6);
    const newUser = {
      id: newId,
      name: name,
      role: role,
      pin: pin,
      active: active
    };
    users.push(newUser);
    showToast(`เพิ่มพนักงาน "${name}" เรียบร้อยแล้ว`, 'success');
  }

  saveToStorage('coffeeshop_users', users);
  renderStaffList();
  closeStaffModal();
}

function deleteStaff(userId) {
  const user = users.find(u => u.id === userId);
  if (!user) return;

  if (currentUser && currentUser.id === userId) {
    showToast('ไม่สามารถลบบัญชีผู้ใช้งานที่คุณกำลังเข้าใช้งานอยู่ได้', 'warning');
    return;
  }

  if (user.role === 'owner') {
    const otherOwners = users.filter(u => u.id !== userId && u.role === 'owner' && u.active !== false);
    if (otherOwners.length === 0) {
      showToast('ไม่สามารถลบเจ้าของร้านคนสุดท้ายได้ ระบบต้องมี Owner อย่างน้อย 1 คน', 'warning');
      return;
    }
  }

  if (confirm(`คุณแน่ใจว่าต้องการลบผู้ใช้งาน "${user.name}" (${user.role === 'owner' ? 'เจ้าของร้าน' : 'พนักงาน'}) ออกจากระบบใช่หรือไม่?`)) {
    users = users.filter(u => u.id !== userId);
    saveToStorage('coffeeshop_users', users);
    renderStaffList();
    showToast(`ลบผู้ใช้งาน "${user.name}" เรียบร้อยแล้ว`, 'success');
  }
}

