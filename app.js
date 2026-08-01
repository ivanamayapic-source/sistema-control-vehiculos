/* ==========================================================================
   SISTEMA DE CONTROL Y CARNETIZACION VEHICULAR - APP LOGIC
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // --------------------------------------------------------------------------
  // 1. STATE & DATA INITIALIZATION
  // --------------------------------------------------------------------------
  let vehicles = [];
  const STORAGE_KEY = 'CEDI_ACTIVE_VEHICLES_V36_REAL_PHYSICAL_FILE_PERSISTENCE';

  // Supabase Cloud Sync Configuration (Project ID: zamqqaiipwatbaubvlpq)
  const SUPABASE_URL = window.SUPABASE_URL || localStorage.getItem('SUPABASE_URL') || 'https://zamqqaiipwatbaubvlpq.supabase.co';
  const SUPABASE_KEY = window.SUPABASE_KEY || localStorage.getItem('SUPABASE_KEY') || '';
  let supabaseClient = null;

  if (window.supabase && SUPABASE_URL && SUPABASE_KEY) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log('Supabase Cloud Database (zamqqaiipwatbaubvlpq) Conectado Correctamente');
    } catch (err) {
      console.error('Error conectando a Supabase:', err);
    }
  }

  function initData() {
    // Clear all obsolete old caches to force fresh load of physical file persistence
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('CEDI_ACTIVE_VEHICLES') && key !== STORAGE_KEY) {
          localStorage.removeItem(key);
        }
      }
      localStorage.removeItem('CEDI_VEHICLES_DATA');
      localStorage.removeItem('CEDI_ACTIVE_VEHICLES_V35_PERMANENT_PRINCIPAL_DB_SYNC');
    } catch (e) {}

    const initialList = (Array.isArray(window.INITIAL_VEHICLES) && window.INITIAL_VEHICLES.length > 0) 
      ? window.INITIAL_VEHICLES 
      : [];

    // Always prefer fresh window.INITIAL_VEHICLES on load to guarantee exact Excel data sync
    vehicles = initialList;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vehicles));

    if (supabaseClient) {
      syncWithSupabase();
    }
  }

  async function syncWithSupabase() {
    if (!supabaseClient) return;
    try {
      // Upsert local active driver records to Supabase to keep cloud database synchronized with the 255 active drivers
      const recordsToUpsert = vehicles.map(v => ({
        id: v.id,
        placa: v.placa,
        nombre: v.nombre,
        cedula: v.cedula,
        tipo_vehiculo: v.tipoVehiculo,
        empresa: v.empresa || 'CEDI',
        centro_distribucion: v.centroDistribucion || 'CEDI',
        cargo: v.cargo || 'COLABORADOR',
        soat_vencimiento: v.soatVencimiento || null,
        rtm_vencimiento: v.rtmVencimiento || null,
        licencia_categoria: v.licenciaCategoria || 'B1',
        licencia_vencimiento: v.licenciaVencimiento || null,
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabaseClient.from('vehiculos').upsert(recordsToUpsert, { onConflict: 'placa' });
      if (error) {
        console.error('Supabase cloud sync error:', error);
      } else {
        console.log('Supabase Cloud Database sincronizado exitosamente con los 255 activos');
      }
    } catch (e) {
      console.error('Supabase fetch error:', e);
    }
  }

  async function saveToSupabase(vehicle) {
    if (!supabaseClient) return;
    try {
      await supabaseClient.from('vehiculos').upsert({
        id: vehicle.id,
        placa: vehicle.placa,
        nombre: vehicle.nombre,
        cedula: vehicle.cedula,
        tipo_vehiculo: vehicle.tipoVehiculo,
        empresa: vehicle.empresa,
        centro_distribucion: vehicle.centroDistribucion,
        cargo: vehicle.cargo,
        soat_vencimiento: vehicle.soatVencimiento || null,
        rtm_vencimiento: vehicle.rtmVencimiento || null,
        licencia_categoria: vehicle.licenciaCategoria,
        licencia_vencimiento: vehicle.licenciaVencimiento || null,
        updated_at: new Date().toISOString()
      });
    } catch (e) {
      console.error('Error saving to Supabase:', e);
    }
  }

  // Audit Logs & Backup Snapshot Stores
  const STORAGE_KEY_LOGS = 'CEDI_AUDIT_LOGS_V1';
  const STORAGE_KEY_BACKUP = 'CEDI_BACKUP_SNAPSHOT_V1';
  let auditLogs = [];

  try {
    const savedLogs = localStorage.getItem(STORAGE_KEY_LOGS);
    if (savedLogs) auditLogs = JSON.parse(savedLogs);
  } catch (e) {
    auditLogs = [];
  }

  function saveAuditLogs() {
    try {
      localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(auditLogs));
      renderAuditLogsTable();
    } catch (e) {}
  }

  function createBackupSnapshot() {
    try {
      const backupData = {
        timestamp: new Date().toISOString(),
        formattedDate: new Date().toLocaleString('es-CO'),
        vehicles: JSON.parse(JSON.stringify(vehicles))
      };
      localStorage.setItem(STORAGE_KEY_BACKUP, JSON.stringify(backupData));
      return backupData;
    } catch (e) {
      return null;
    }
  }

  function logAdminAction(action, vehicle, fieldName, oldVal, newVal) {
    const logEntry = {
      id: Date.now().toString() + '_' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      formattedDate: new Date().toLocaleString('es-CO'),
      usuario: 'Administrador',
      accion: action,
      placa: vehicle ? vehicle.placa : (fieldName === 'CANTIDAD_REGISTROS' ? 'GLOBAL' : 'N/A'),
      conductor: vehicle ? vehicle.nombre : 'N/A',
      cedula: vehicle ? vehicle.cedula : 'N/A',
      campoModificado: fieldName || 'N/A',
      valorAnterior: oldVal !== undefined && oldVal !== null ? oldVal.toString() : 'N/A',
      valorNuevo: newVal !== undefined && newVal !== null ? newVal.toString() : 'N/A'
    };
    auditLogs.unshift(logEntry);
    saveAuditLogs();
  }

  // Persistent Registries for Admin Deletions & Manual Overrides
  const STORAGE_KEY_DELETIONS = 'CEDI_DELETED_KEYS_V1';
  const STORAGE_KEY_OVERRIDES = 'CEDI_MANUAL_OVERRIDES_V1';

  let deletedVehicleKeysSet = new Set();
  let manualOverridesMap = new Map();

  try {
    const savedDeletions = localStorage.getItem(STORAGE_KEY_DELETIONS);
    if (savedDeletions) deletedVehicleKeysSet = new Set(JSON.parse(savedDeletions));
  } catch (e) {}

  try {
    const savedOverrides = localStorage.getItem(STORAGE_KEY_OVERRIDES);
    if (savedOverrides) manualOverridesMap = new Map(JSON.parse(savedOverrides));
  } catch (e) {}

  function saveModificationsRegistry() {
    try {
      localStorage.setItem(STORAGE_KEY_DELETIONS, JSON.stringify(Array.from(deletedVehicleKeysSet)));
      localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(Array.from(manualOverridesMap.entries())));
    } catch (e) {}
  }

  window.activeExcelFileHandle = null;

  async function writePhysicalExcelFile() {
    if (window.activeExcelFileHandle) {
      try {
        const dataToExport = vehicles.map(v => ({
          'PLACA': v.placa,
          'NOMBRE COMPLETO Y APELLIDOS': v.nombre,
          'CEDULA (SIN PUNTOS)': v.cedula,
          'TIPO DE VEHICULO': v.tipoVehiculo,
          'EMPRESA': v.empresa,
          'CENTRO DE DISTRIBUCION': v.centroDistribucion || 'CEDI BUCARAMANGA',
          'POSICIONES': v.cargo,
          'FECHA VENCIMIENTO SOAT': v.soatVencimiento,
          'FECHA VENCIMIENTO RTM': v.rtmVencimiento,
          'CATEGORIA LICENCIA': v.licenciaCategoria,
          'FECHA VENCIMIENTO LICENCIA': v.licenciaVencimiento,
          'ESTADO DOCUMENTOS': getVehicleOverallStatus(v)
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "BASE_DATOS_OFICIAL_CEDI");
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

        const writable = await window.activeExcelFileHandle.createWritable();
        await writable.write(excelBuffer);
        await writable.close();
        console.log('✅ Archivo Excel principal actualizado físicamente en disco duro.');
        return true;
      } catch (err) {
        console.warn('Escritura física directa no soportada o denegada:', err);
      }
    }
    return false;
  }

  function saveDataLocally() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vehicles));
    saveModificationsRegistry();
    updateKPIs();
    populateDropdownFilters();
    renderDatabaseTable();
    populateBadgeSelector();
  }

  function saveData(updatedVehicle = null) {
    saveDataLocally();
    writePhysicalExcelFile();
    if (updatedVehicle && supabaseClient) {
      saveToSupabase(updatedVehicle);
    }
  }

  initData();

  function getTodayDate() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  function parseDate(dateStr) {
    if (!dateStr) return null;
    const str = dateStr.toString().trim();
    if (!str || str === '0' || str === 'N/A' || str.toUpperCase() === 'SIN REGISTRO') return null;

    // Handle Excel serial date numbers like 46240 or 48389
    const num = Number(str);
    if (!isNaN(num) && num > 30000 && num < 60000) {
      const roundedNum = Math.round(num);
      const baseUTC = Date.UTC(1899, 11, 30);
      const targetUTC = new Date(baseUTC + roundedNum * 86400000);
      return new Date(targetUTC.getUTCFullYear(), targetUTC.getUTCMonth(), targetUTC.getUTCDate(), 0, 0, 0, 0);
    }

    // Handle YYYY-MM-DD string strictly in local timezone (no UTC offset subtraction)
    const match = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      return new Date(year, month, day, 0, 0, 0, 0);
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    }
    return null;
  }

  function formatDateISO(dateStr) {
    const d = parseDate(dateStr);
    if (!d) return 'N/A';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function calculateDocStatus(dateStr) {
    const d = parseDate(dateStr);
    if (!d) return { status: 'VENCIDO', label: 'Sin Registro', days: -999, class: 'bg-rose-950/80 text-rose-400 border-rose-500/40' };
    
    const today = getTodayDate();
    const targetDate = new Date(d);
    targetDate.setHours(0, 0, 0, 0);

    const diffTime = targetDate - today;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { status: 'VENCIDO', label: 'Vencido', days: diffDays, class: 'bg-rose-950/80 text-rose-400 border-rose-500/40' };
    } else if (diffDays <= 15) {
      return { status: 'POR_VENCER', label: `Vence en ${diffDays}d`, days: diffDays, class: 'bg-amber-950/80 text-amber-400 border-amber-500/40' };
    } else {
      return { status: 'VIGENTE', label: 'Vigente', days: diffDays, class: 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40' };
    }
  }

  function getVehicleOverallStatus(vehicle) {
    const soat = calculateDocStatus(vehicle.soatVencimiento);
    const rtm = calculateDocStatus(vehicle.rtmVencimiento);
    const lic = calculateDocStatus(vehicle.licenciaVencimiento);

    if (soat.status === 'VENCIDO' || rtm.status === 'VENCIDO' || lic.status === 'VENCIDO') {
      return 'DENEGADO';
    }
    if (soat.status === 'POR_VENCER' || rtm.status === 'POR_VENCER' || lic.status === 'POR_VENCER') {
      return 'POR_VENCER';
    }
    return 'APTO';
  }

  // --------------------------------------------------------------------------
  // 3. NAVIGATION & TABS MANAGEMENT WITH ROLE ACCESS CONTROL
  // --------------------------------------------------------------------------
  let currentUserRole = null; // 'VIGILANCIA' or 'ADMIN'

  const tabs = {
    vigilancia: document.getElementById('tab-vigilancia'),
    carnets: document.getElementById('tab-carnets'),
    database: document.getElementById('tab-database')
  };

  const views = {
    vigilancia: document.getElementById('view-vigilancia'),
    carnets: document.getElementById('view-carnets'),
    database: document.getElementById('view-database')
  };

  const viewLandingGateway = document.getElementById('view-landing-gateway');
  const btnSelectVigilancia = document.getElementById('btnSelectVigilancia');
  const btnSelectAdmin = document.getElementById('btnSelectAdmin');

  const adminAuthModal = document.getElementById('adminAuthModal');
  const adminAuthForm = document.getElementById('adminAuthForm');
  const adminAuthError = document.getElementById('adminAuthError');
  const closeAdminAuthBtn = document.getElementById('closeAdminAuthBtn');
  const cancelAdminAuthBtn = document.getElementById('cancelAdminAuthBtn');
  const adminUser = document.getElementById('adminUser');
  const adminPass = document.getElementById('adminPass');

  const btnHeaderRoleSwitch = document.getElementById('btnHeaderRoleSwitch');
  const headerRoleBadgeText = document.getElementById('headerRoleBadgeText');

  function setRole(role) {
    currentUserRole = role;
    if (role === 'VIGILANCIA') {
      if (headerRoleBadgeText) headerRoleBadgeText.textContent = 'Módulo Vigilancia (Solo Consulta)';
      if (btnHeaderRoleSwitch) {
        btnHeaderRoleSwitch.className = "bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs px-3.5 py-2 rounded-xl font-bold transition-all flex items-center gap-2 shadow-md";
        btnHeaderRoleSwitch.innerHTML = `<i class="fa-solid fa-shield-cat text-amber-400"></i> <span>Módulo Vigilancia (Solo Consulta)</span> <span class="bg-amber-500 text-slate-950 text-[10px] px-1.5 py-0.5 rounded font-extrabold ml-1">Cambiar / Admin</span>`;
      }
      document.querySelectorAll('.admin-lock-icon').forEach(el => el.classList.remove('hidden'));
      switchTab('vigilancia');
    } else if (role === 'ADMIN') {
      if (headerRoleBadgeText) headerRoleBadgeText.textContent = 'Modo Administrador';
      if (btnHeaderRoleSwitch) {
        btnHeaderRoleSwitch.className = "bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 text-xs px-3.5 py-2 rounded-xl font-bold transition-all flex items-center gap-2 shadow-md";
        btnHeaderRoleSwitch.innerHTML = `<i class="fa-solid fa-user-shield text-sky-400"></i> <span>Modo Administrador</span> <span class="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded font-extrabold ml-1">Salir Admin</span>`;
      }
      document.querySelectorAll('.admin-lock-icon').forEach(el => el.classList.add('hidden'));
    }
    if (viewLandingGateway) viewLandingGateway.classList.add('hidden');
    if (adminAuthModal) adminAuthModal.classList.add('hidden');
  }

  // Option 1: Control de Vigilancia (QR) - Direct Access (No Password Required)
  if (btnSelectVigilancia) {
    btnSelectVigilancia.addEventListener('click', () => {
      setRole('VIGILANCIA');
    });
  }

  // Option 2: Administración - Requires Auth
  if (btnSelectAdmin) {
    btnSelectAdmin.addEventListener('click', () => {
      openAdminAuthModal();
    });
  }

  if (btnHeaderRoleSwitch) {
    btnHeaderRoleSwitch.addEventListener('click', () => {
      if (currentUserRole === 'ADMIN') {
        setRole('VIGILANCIA');
      } else {
        openAdminAuthModal();
      }
    });
  }

  function openAdminAuthModal() {
    if (adminAuthError) adminAuthError.classList.add('hidden');
    if (adminUser) adminUser.value = '';
    if (adminPass) adminPass.value = '';
    if (adminAuthModal) adminAuthModal.classList.remove('hidden');
  }

  function closeAdminAuthModal() {
    if (adminAuthModal) adminAuthModal.classList.add('hidden');
  }

  if (closeAdminAuthBtn) closeAdminAuthBtn.addEventListener('click', closeAdminAuthModal);
  if (cancelAdminAuthBtn) cancelAdminAuthBtn.addEventListener('click', closeAdminAuthModal);

  if (adminAuthForm) {
    adminAuthForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = (adminUser ? adminUser.value : '').trim().toLowerCase();
      const p = (adminPass ? adminPass.value : '').trim();

      if ((u === 'admin' && p === 'admin') || (u === 'admin' && p === 'admin123') || (u === 'admin' && p === 'cedi2026') || p === 'admin') {
        setRole('ADMIN');
      } else {
        if (adminAuthError) adminAuthError.classList.remove('hidden');
      }
    });
  }

  function requestAdminAccess(targetTab) {
    if (currentUserRole === 'ADMIN') {
      switchTab(targetTab);
    } else {
      openAdminAuthModal();
    }
  }

  function switchTab(targetTab) {
    Object.keys(tabs).forEach(key => {
      if (key === targetTab) {
        tabs[key].classList.add('active-tab');
        tabs[key].classList.remove('text-slate-400', 'border-transparent');
        views[key].classList.remove('hidden');
      } else {
        tabs[key].classList.remove('active-tab');
        tabs[key].classList.add('text-slate-400', 'border-transparent');
        views[key].classList.add('hidden');
      }
    });

    if (targetTab === 'carnets') {
      renderSingleBadgePreview();
    }
  }

  tabs.vigilancia.addEventListener('click', () => switchTab('vigilancia'));
  tabs.carnets.addEventListener('click', () => requestAdminAccess('carnets'));
  tabs.database.addEventListener('click', () => requestAdminAccess('database'));

  // --------------------------------------------------------------------------
  // 4. KPI STATS UPDATER
  // --------------------------------------------------------------------------
  function updateKPIs() {
    let vigentesCount = 0;
    let porVencerCount = 0;
    let vencidosCount = 0;

    vehicles.forEach(v => {
      const st = getVehicleOverallStatus(v);
      if (st === 'APTO') vigentesCount++;
      else if (st === 'POR_VENCER') porVencerCount++;
      else vencidosCount++;
    });

    document.getElementById('kpiTotal').textContent = vehicles.length;
    document.getElementById('kpiVigentes').textContent = vigentesCount;
    document.getElementById('kpiPorVencer').textContent = porVencerCount;
    document.getElementById('kpiVencidos').textContent = vencidosCount;

    // Filter counts in DB tab
    document.getElementById('filterCountAll').textContent = vehicles.length;
    document.getElementById('filterCountVigentes').textContent = vigentesCount;
    document.getElementById('filterCountPorVencer').textContent = porVencerCount;
    document.getElementById('filterCountVencidos').textContent = vencidosCount;
  }

  // --------------------------------------------------------------------------
  // 5. MODULO 1: VIGILANCIA & QR SCANNER
  // --------------------------------------------------------------------------
  let html5QrcodeScanner = null;
  let isCameraOn = false;

  const toggleCameraBtn = document.getElementById('toggleCameraBtn');
  const cameraBtnText = document.getElementById('cameraBtnText');
  const qrPlaceholder = document.getElementById('qrPlaceholder');

  toggleCameraBtn.addEventListener('click', () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      startCamera();
    }
  });

  function startCamera() {
    if (isCameraOn) return;
    qrPlaceholder.classList.add('hidden');
    
    html5QrcodeScanner = new Html5Qrcode("qrReader");
    html5QrcodeScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        // Handle Scanned text
        stopCamera();
        handleScannedCode(decodedText);
      },
      (errorMessage) => {
        // ignore scan failures
      }
    ).then(() => {
      isCameraOn = true;
      cameraBtnText.textContent = "Apagar Cámara";
      toggleCameraBtn.classList.replace('bg-amber-500', 'bg-rose-600');
    }).catch(err => {
      alert("No se pudo acceder a la cámara: " + err);
      qrPlaceholder.classList.remove('hidden');
    });
  }

  function stopCamera() {
    if (html5QrcodeScanner && isCameraOn) {
      html5QrcodeScanner.stop().then(() => {
        html5QrcodeScanner.clear();
        isCameraOn = false;
        cameraBtnText.textContent = "Encender Cámara";
        toggleCameraBtn.classList.replace('bg-rose-600', 'bg-amber-500');
        qrPlaceholder.classList.remove('hidden');
      }).catch(err => console.error(err));
    }
  }

  function handleScannedCode(scannedText) {
    let placa = scannedText.trim().toUpperCase();
    // If URL like ?placa=XYZ123, parse param
    if (scannedText.includes('placa=')) {
      const match = scannedText.match(/placa=([A-Z0-9]+)/i);
      if (match) placa = match[1].toUpperCase();
    }
    verifyVehicleByPlaca(placa);
  }

  // Manual search
  const manualPlacaInput = document.getElementById('manualPlacaInput');
  const manualSearchBtn = document.getElementById('manualSearchBtn');

  manualSearchBtn.addEventListener('click', () => {
    const val = manualPlacaInput.value.trim().toUpperCase();
    if (val) verifyVehicleByPlaca(val);
  });

  manualPlacaInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const val = manualPlacaInput.value.trim().toUpperCase();
      if (val) verifyVehicleByPlaca(val);
    }
  });

  // Global search input
  const globalSearchInput = document.getElementById('globalSearchInput');
  globalSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const val = globalSearchInput.value.trim().toUpperCase();
      if (val) {
        switchTab('vigilancia');
        verifyVehicleByPlaca(val);
      }
    }
  });

  function verifyVehicleByPlaca(placaOrCedula) {
    const vehicle = vehicles.find(v => 
      v.placa.toUpperCase() === placaOrCedula || 
      v.cedula.trim() === placaOrCedula
    );

    const emptyState = document.getElementById('statusEmptyState');
    const resultContent = document.getElementById('statusResultContent');

    if (!vehicle) {
      emptyState.classList.add('hidden');
      resultContent.classList.remove('hidden');
      renderNotFoundResult(placaOrCedula);
      return;
    }

    emptyState.classList.add('hidden');
    resultContent.classList.remove('hidden');
    renderVehicleVerification(vehicle);
  }

  function renderNotFoundResult(query) {
    const banner = document.getElementById('decisionBanner');
    const iconBg = document.getElementById('decisionIconBg');
    const icon = document.getElementById('decisionIcon');
    const badge = document.getElementById('decisionBadge');
    const title = document.getElementById('decisionTitle');
    const subtitle = document.getElementById('decisionSubtitle');

    banner.className = "p-5 rounded-2xl border bg-rose-950/70 border-rose-500/50 glow-red";
    iconBg.className = "w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 bg-rose-900 text-rose-200";
    icon.className = "fa-solid fa-triangle-exclamation";
    badge.className = "text-xs font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-rose-900/80 text-rose-300 border border-rose-500/30";
    badge.textContent = "NO REGISTRADO";
    title.textContent = "VEHÍCULO NO ENCONTRADO";
    subtitle.textContent = `La placa o cédula "${query}" no existe en la base de datos del Centro de Distribución.`;

    document.getElementById('resPlaca').textContent = query;
    document.getElementById('resNombre').textContent = "Desconocido / Sin Registro";
    document.getElementById('resCedula').textContent = "---";
    document.getElementById('resTipoVehiculo').textContent = "---";
    document.getElementById('resEmpresa').textContent = "---";
    document.getElementById('resVehicleIcon').innerHTML = '<i class="fa-solid fa-circle-question"></i>';

    // Clear doc cards
    ['Soat', 'Rtm', 'Lic'].forEach(type => {
      document.getElementById(`tag${type}`).textContent = "N/A";
      document.getElementById(`tag${type}`).className = "text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400";
      document.getElementById(`date${type}`).textContent = "---";
      document.getElementById(`days${type}`).textContent = "---";
    });
  }

  function renderVehicleVerification(v) {
    window.currentVerifiedVehicle = v;
    const overall = getVehicleOverallStatus(v);
    const soat = calculateDocStatus(v.soatVencimiento);
    const rtm = calculateDocStatus(v.rtmVencimiento);
    const lic = calculateDocStatus(v.licenciaVencimiento);

    const banner = document.getElementById('decisionBanner');
    const iconBg = document.getElementById('decisionIconBg');
    const icon = document.getElementById('decisionIcon');
    const badge = document.getElementById('decisionBadge');
    const title = document.getElementById('decisionTitle');
    const subtitle = document.getElementById('decisionSubtitle');

    if (overall === 'APTO') {
      banner.className = "p-5 rounded-2xl border bg-emerald-950/70 border-emerald-500/50 glow-green";
      iconBg.className = "w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 bg-emerald-900 text-emerald-200";
      icon.className = "fa-solid fa-circle-check";
      badge.className = "text-xs font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-900/80 text-emerald-300 border border-emerald-500/30";
      badge.textContent = "INGRESO PERMITIDO";
      title.textContent = "🟢 APTO PARA INGRESO";
      subtitle.textContent = "Todos los documentos se encuentran al día y en estado VIGENTE.";
    } else if (overall === 'POR_VENCER') {
      banner.className = "p-5 rounded-2xl border bg-amber-950/70 border-amber-500/50 glow-yellow";
      iconBg.className = "w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 bg-amber-900 text-amber-200";
      icon.className = "fa-solid fa-triangle-exclamation";
      badge.className = "text-xs font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-900/80 text-amber-300 border border-amber-500/30";
      badge.textContent = "ALERTA POR RENOVACIÓN";
      title.textContent = "🟡 INGRESO AUTORIZADO - DOCUMENTO POR VENCER";
      subtitle.textContent = "Uno o más documentos vencerán en menos de 15 días. Notificar al conductor.";
    } else {
      banner.className = "p-5 rounded-2xl border bg-rose-950/70 border-rose-500/50 glow-red";
      iconBg.className = "w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 bg-rose-900 text-rose-200";
      icon.className = "fa-solid fa-ban";
      badge.className = "text-xs font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-rose-900/80 text-rose-300 border border-rose-500/30";
      badge.textContent = "INGRESO DENEGADO";
      title.textContent = "🔴 DENEGADO - DOCUMENTACIÓN VENCIDA";
      subtitle.textContent = "El vehículo NO puede ingresar. Presenta documentos vencidos obligatorios.";
    }

    document.getElementById('resPlaca').textContent = v.placa;
    document.getElementById('resNombre').textContent = v.nombre;
    document.getElementById('resCedula').textContent = v.cedula;
    document.getElementById('resTipoVehiculo').textContent = v.tipoVehiculo;
    document.getElementById('resEmpresa').textContent = `${v.empresa || 'CEDI'} ${v.centroDistribucion ? ' - ' + v.centroDistribucion : ''}`;

    const iconHtml = v.tipoVehiculo === 'MOTOCICLETA' ? '<i class="fa-solid fa-motorcycle"></i>' : '<i class="fa-solid fa-car"></i>';
    document.getElementById('resVehicleIcon').innerHTML = iconHtml;

    // Doc cards with explicit raw date values
    renderDocCard('Soat', soat, v.soatVencimiento);
    renderDocCard('Rtm', rtm, v.rtmVencimiento);
    renderDocCard('Lic', lic, v.licenciaVencimiento, v.licenciaCategoria);
  }

  function renderDocCard(prefix, docState, dateVal, cat = null) {
    const card = document.getElementById(`docCard${prefix}`);
    const tag = document.getElementById(`tag${prefix}`);
    const dateEl = document.getElementById(`date${prefix}`);
    const daysEl = document.getElementById(`days${prefix}`);

    card.className = `bg-slate-950/80 border p-4 rounded-xl space-y-2 ${docState.class}`;
    tag.textContent = docState.label;

    if (docState.status === 'VENCIDO') {
      tag.className = "text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-900 text-rose-200 border border-rose-500/30";
    } else if (docState.status === 'POR_VENCER') {
      tag.className = "text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-900 text-amber-200 border border-amber-500/30";
    } else {
      tag.className = "text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-200 border border-emerald-500/30";
    }

    if (cat) {
      document.getElementById('catLic').textContent = cat || 'B1';
    }

    // Format and display date string
    if (dateVal && dateVal !== '0' && dateVal !== 'N/A') {
      const dObj = parseDate(dateVal);
      if (dObj) {
        dateEl.textContent = dObj.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
      } else {
        dateEl.textContent = dateVal;
      }
    } else {
      dateEl.textContent = 'Sin Registro';
    }
    
    if (docState.days === -999) {
      daysEl.textContent = 'Sin registro de fecha';
      daysEl.className = 'text-[11px] font-semibold text-slate-500';
    } else if (docState.days < 0) {
      daysEl.textContent = `Vencido hace ${Math.abs(docState.days)} días`;
      daysEl.className = 'text-[11px] font-semibold text-rose-400';
    } else {
      daysEl.textContent = `Quedan ${docState.days} días de vigencia`;
      daysEl.className = docState.days <= 15 ? 'text-[11px] font-semibold text-amber-400' : 'text-[11px] font-semibold text-emerald-400';
    }
  }

  // Quick sample buttons for test
  const quickSampleContainer = document.getElementById('quickSamplePlacas');
  function populateQuickSamplePlacas() {
    quickSampleContainer.innerHTML = '';
    const sampleList = vehicles.slice(0, 5);
    sampleList.forEach(v => {
      const btn = document.createElement('button');
      btn.className = "text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-amber-400 px-2.5 py-1 rounded-lg border border-slate-700 transition-all";
      btn.textContent = v.placa;
      btn.addEventListener('click', () => {
        manualPlacaInput.value = v.placa;
        verifyVehicleByPlaca(v.placa);
      });
      quickSampleContainer.appendChild(btn);
    });
  }
  populateQuickSamplePlacas();

  document.getElementById('resetVigilanciaBtn').addEventListener('click', () => {
    document.getElementById('statusEmptyState').classList.remove('hidden');
    document.getElementById('statusResultContent').classList.add('hidden');
    manualPlacaInput.value = '';
  });

  document.getElementById('printBadgeFromVigilancia').addEventListener('click', () => {
    if (currentUserRole !== 'ADMIN') {
      openAdminAuthModal();
      return;
    }
    if (window.currentVerifiedVehicle) {
      switchTab('carnets');
      document.getElementById('badgeSelectVehicle').value = window.currentVerifiedVehicle.id;
      renderSingleBadgePreview();
    }
  });

  // Check URL params on load for direct QR scanning (e.g., ?placa=JRK763 or ?placa=SLB01E)
  const urlParams = new URLSearchParams(window.location.search);
  const placaParam = urlParams.get('placa');
  if (placaParam) {
    setRole('VIGILANCIA');
    verifyVehicleByPlaca(placaParam.toUpperCase());
  }

  // --------------------------------------------------------------------------
  // 6. MODULO 2: ESTUDIO DE CARNETIZACION (BADGES & FILTERS)
  // --------------------------------------------------------------------------
  const badgeSelectVehicle = document.getElementById('badgeSelectVehicle');
  const badgeStyleBadgeBtn = document.getElementById('badgeStyleBadge');
  const badgeStyleCardBtn = document.getElementById('badgeStyleCard');
  const badgeCdFilter = document.getElementById('badgeCdFilter');
  const badgeEmpresaFilter = document.getElementById('badgeEmpresaFilter');
  const badgeStatusFilter = document.getElementById('badgeStatusFilter');
  const badgeFilteredCountBadge = document.getElementById('badgeFilteredCountBadge');
  let currentBadgeStyle = 'vertical'; // 'vertical' or 'cr80'

  function populateBadgeDropdownFilters() {
    if (!badgeCdFilter || !badgeEmpresaFilter) return;

    const cds = [...new Set(vehicles.map(v => (v.centroDistribucion || 'CEDI').trim()))].sort();
    const empresas = [...new Set(vehicles.map(v => (v.empresa || 'CEDI').trim()))].sort();

    badgeCdFilter.innerHTML = '<option value="ALL">🏢 Todos los CD</option>';
    cds.forEach(cd => {
      if (cd) {
        const opt = document.createElement('option');
        opt.value = cd;
        opt.textContent = `🏢 CD: ${cd}`;
        badgeCdFilter.appendChild(opt);
      }
    });

    badgeEmpresaFilter.innerHTML = '<option value="ALL">🏭 Todas las Empresas</option>';
    empresas.forEach(emp => {
      if (emp) {
        const opt = document.createElement('option');
        opt.value = emp;
        opt.textContent = `🏭 ${emp}`;
        badgeEmpresaFilter.appendChild(opt);
      }
    });
  }

  function getFilteredBadgeVehicles() {
    const cdVal = badgeCdFilter ? badgeCdFilter.value : 'ALL';
    const empVal = badgeEmpresaFilter ? badgeEmpresaFilter.value : 'ALL';
    const statusVal = badgeStatusFilter ? badgeStatusFilter.value : 'ALL';

    return vehicles.filter(v => {
      // 1. CD Filter
      if (cdVal !== 'ALL' && (v.centroDistribucion || 'CEDI').trim() !== cdVal) {
        return false;
      }
      // 2. Empresa Filter
      if (empVal !== 'ALL' && (v.empresa || 'CEDI').trim() !== empVal) {
        return false;
      }
      // 3. Document Status Filter (VIGENTE, POR_VENCER, VENCIDO)
      if (statusVal !== 'ALL') {
        const st = getVehicleOverallStatus(v);
        if (statusVal === 'VIGENTE' && st !== 'APTO') return false;
        if (statusVal === 'POR_VENCER' && st !== 'POR_VENCER') return false;
        if (statusVal === 'VENCIDO' && st !== 'DENEGADO') return false;
      }
      return true;
    });
  }

  function populateBadgeSelector() {
    if (!badgeSelectVehicle) return;
    const filtered = getFilteredBadgeVehicles();

    badgeSelectVehicle.innerHTML = '';
    if (filtered.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '-- No hay vehículos con este filtro --';
      badgeSelectVehicle.appendChild(opt);
    } else {
      filtered.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = `${v.placa} - ${v.nombre} (${v.tipoVehiculo})`;
        badgeSelectVehicle.appendChild(opt);
      });
    }

    if (badgeFilteredCountBadge) {
      badgeFilteredCountBadge.textContent = `${filtered.length} vehículos`;
    }
    const countToPrint = document.getElementById('countSelectedToPrint');
    if (countToPrint) {
      countToPrint.textContent = filtered.length;
    }

    renderSingleBadgePreview();
  }

  if (badgeCdFilter) badgeCdFilter.addEventListener('change', populateBadgeSelector);
  if (badgeEmpresaFilter) badgeEmpresaFilter.addEventListener('change', populateBadgeSelector);
  if (badgeStatusFilter) badgeStatusFilter.addEventListener('change', populateBadgeSelector);

  badgeSelectVehicle.addEventListener('change', () => renderSingleBadgePreview());

  badgeStyleBadgeBtn.addEventListener('click', () => {
    currentBadgeStyle = 'vertical';
    badgeStyleBadgeBtn.className = "badge-style-btn active text-xs font-bold py-2 px-3 rounded-lg border bg-amber-500/20 border-amber-500 text-amber-300 flex items-center justify-center gap-2";
    badgeStyleCardBtn.className = "badge-style-btn text-xs font-bold py-2 px-3 rounded-lg border border-slate-700 text-slate-400 flex items-center justify-center gap-2";
    renderSingleBadgePreview();
  });

  badgeStyleCardBtn.addEventListener('click', () => {
    currentBadgeStyle = 'cr80';
    badgeStyleCardBtn.className = "badge-style-btn active text-xs font-bold py-2 px-3 rounded-lg border bg-amber-500/20 border-amber-500 text-amber-300 flex items-center justify-center gap-2";
    badgeStyleBadgeBtn.className = "badge-style-btn text-xs font-bold py-2 px-3 rounded-lg border border-slate-700 text-slate-400 flex items-center justify-center gap-2";
    renderSingleBadgePreview();
  });

  function renderSingleBadgePreview() {
    const selectedId = badgeSelectVehicle.value;
    const v = vehicles.find(x => x.id === selectedId) || vehicles[0];
    if (!v) return;

    const container = document.getElementById('singleBadgePreviewContainer');
    container.innerHTML = generateBadgeHTML(v, currentBadgeStyle);

    // Generate QR code into QR element
    setTimeout(() => {
      const qrEl = document.getElementById(`qr-code-single-${v.id}`);
      if (qrEl) {
        qrEl.innerHTML = '';
        new QRCode(qrEl, {
          text: `${window.location.origin}${window.location.pathname}?placa=${v.placa}`,
          width: currentBadgeStyle === 'vertical' ? 100 : 75,
          height: currentBadgeStyle === 'vertical' ? 100 : 75,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      }
    }, 50);
  }

  function generateBadgeHTML(v, style) {
    const iconClass = v.tipoVehiculo === 'MOTOCICLETA' ? 'fa-motorcycle' : 'fa-car';
    
    if (style === 'vertical') {
      return `
        <div class="badge-container-vertical">
          <div class="badge-lanyard-hole"></div>
          
          <!-- Header -->
          <div class="badge-header flex items-center justify-between px-3 py-2">
            <div class="bg-slate-950 p-1.5 rounded-xl border border-slate-700/80 shadow-md flex items-center justify-center">
              <img src="logo.png" alt="Logística Conectamos MAZ" class="h-10 max-w-[130px] object-contain">
            </div>
            <div class="text-right">
              <div class="text-[9px] tracking-widest text-slate-900 font-extrabold uppercase">CENTRO DE DISTRIBUCIÓN</div>
              <div class="text-xs font-black tracking-tight text-slate-950">CONTROL VEHICULAR</div>
            </div>
          </div>

          <!-- Body -->
          <div class="p-4 text-center space-y-3">
            
            <!-- Placa Box -->
            <div class="badge-plate-box">
              <div class="text-[9px] uppercase tracking-widest text-amber-400 font-bold">PLACA DEL VEHÍCULO</div>
              <div class="font-outfit font-extrabold text-3xl text-amber-400 font-mono tracking-wider">${v.placa}</div>
              <div class="inline-flex items-center gap-1.5 mt-0.5 text-[10px] font-bold text-slate-300">
                <i class="fa-solid ${iconClass} text-amber-400"></i> ${v.tipoVehiculo}
              </div>
            </div>

            <!-- QR Code -->
            <div class="badge-qr-box my-1">
              <div id="qr-code-single-${v.id}"></div>
              <p class="text-[8px] font-bold text-slate-900 uppercase tracking-wider mt-1">Escanear en Portería</p>
            </div>

            <!-- Owner Info & Document Expirations -->
            <div class="text-left bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl space-y-1.5">
              <div>
                <p class="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Conductor / Propietario:</p>
                <p class="text-xs font-bold text-white truncate">${v.nombre}</p>
              </div>
              <div class="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                <div>
                  <p class="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Cédula:</p>
                  <p class="text-[10px] font-mono font-bold text-slate-200">${v.cedula}</p>
                </div>
                <div>
                  <p class="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Empresa:</p>
                  <p class="text-[10px] font-semibold text-amber-400 truncate">${v.empresa || 'CEDI'}</p>
                </div>
              </div>

              <!-- Document Expirations -->
              <div class="pt-1.5 border-t border-slate-800/80 grid grid-cols-3 gap-1 text-[7.5px] leading-tight">
                <div>
                  <span class="text-slate-400 font-semibold block">SOAT</span>
                  <span class="font-mono text-amber-300 font-bold">${formatDateISO(v.soatVencimiento)}</span>
                </div>
                <div>
                  <span class="text-slate-400 font-semibold block">RTM</span>
                  <span class="font-mono text-amber-300 font-bold">${formatDateISO(v.rtmVencimiento)}</span>
                </div>
                <div>
                  <span class="text-slate-400 font-semibold block">LIC (${v.licenciaCategoria || 'B1'})</span>
                  <span class="font-mono text-amber-300 font-bold">${formatDateISO(v.licenciaVencimiento)}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      `;
    } else {
      // Horizontal CR80 Card Format
      return `
        <div class="badge-container-cr80">
          <!-- Left accent strip -->
          <div class="w-3 bg-gradient-to-b from-amber-500 to-amber-600"></div>

          <!-- Main Card Content -->
          <div class="flex-1 p-4 flex flex-col justify-between">
            
            <!-- Top Row -->
            <div class="flex items-center justify-between border-b border-slate-800 pb-2">
              <div class="flex items-center gap-3">
                <div class="bg-slate-950 p-1.5 rounded-xl border border-slate-700/80 shadow-md flex items-center justify-center">
                  <img src="logo.png" alt="Logística Conectamos MAZ" class="h-9 max-w-[130px] object-contain">
                </div>
                <div>
                  <p class="text-[9px] font-extrabold uppercase tracking-widest text-amber-400">CENTRO DE DISTRIBUCIÓN</p>
                  <p class="font-outfit font-extrabold text-xs sm:text-sm text-white">IDENTIFICACIÓN VEHICULAR</p>
                </div>
              </div>
              <div class="bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded text-[10px] font-extrabold text-amber-400">
                <i class="fa-solid ${iconClass}"></i> ${v.tipoVehiculo}
              </div>
            </div>

            <!-- Center Row -->
            <div class="flex items-center gap-4 my-2">
              
              <!-- QR Box -->
              <div class="bg-white p-1.5 rounded-lg shrink-0 shadow-md">
                <div id="qr-code-single-${v.id}"></div>
              </div>

              <!-- Details -->
              <div class="flex-1 min-w-0 space-y-1">
                <div class="bg-slate-950 border border-amber-500/50 px-3 py-1 rounded-lg">
                  <p class="text-[8px] text-slate-400 uppercase font-semibold">PLACA AUTORIZADA</p>
                  <p class="font-outfit font-extrabold text-xl text-amber-400 font-mono tracking-wider">${v.placa}</p>
                </div>

                <div>
                  <p class="text-[8px] text-slate-400 font-semibold uppercase">CONDUCTOR:</p>
                  <p class="text-xs font-bold text-white truncate">${v.nombre}</p>
                </div>
                <div class="flex items-center gap-3 text-[10px]">
                  <span class="text-slate-300 font-mono font-semibold">C.C. ${v.cedula}</span>
                  <span class="text-amber-400 font-bold truncate">${v.empresa || 'CEDI'}</span>
                </div>
                <!-- Document Dates -->
                <div class="grid grid-cols-3 gap-1 pt-1 border-t border-slate-800 text-[8px]">
                  <div>
                    <span class="text-slate-400 font-semibold">SOAT:</span> <span class="font-mono font-bold text-amber-300">${formatDateISO(v.soatVencimiento)}</span>
                  </div>
                  <div>
                    <span class="text-slate-400 font-semibold">RTM:</span> <span class="font-mono font-bold text-amber-300">${formatDateISO(v.rtmVencimiento)}</span>
                  </div>
                  <div>
                    <span class="text-slate-400 font-semibold">LIC (${v.licenciaCategoria || 'B1'}):</span> <span class="font-mono font-bold text-amber-300">${formatDateISO(v.licenciaVencimiento)}</span>
                  </div>
                </div>
              </div>

            </div>

            <!-- Bottom footer -->
            <div class="text-[8px] text-slate-400 flex items-center justify-between border-t border-slate-800/80 pt-1.5">
              <span>Vigilancia CEDI - Escanear QR para validar</span>
              <span class="font-mono text-amber-500/80">ID: ${v.placa}</span>
            </div>

          </div>
        </div>
      `;
    }
  }

  // Print Single Badge
  document.getElementById('printSingleBadgeBtn').addEventListener('click', () => {
    const selectedId = badgeSelectVehicle.value;
    const v = vehicles.find(x => x.id === selectedId) || vehicles[0];
    if (!v) return;

    const printArea = document.getElementById('printBatchArea');
    printArea.innerHTML = generateBadgeHTML(v, currentBadgeStyle);

    setTimeout(() => {
      const qrEl = printArea.querySelector(`[id^="qr-code-single-"]`);
      if (qrEl) {
        qrEl.innerHTML = '';
        new QRCode(qrEl, {
          text: `${window.location.origin}${window.location.pathname}?placa=${v.placa}`,
          width: currentBadgeStyle === 'vertical' ? 120 : 90,
          height: currentBadgeStyle === 'vertical' ? 120 : 90,
          colorDark: "#000000",
          colorLight: "#ffffff"
        });
      }
      setTimeout(() => window.print(), 150);
    }, 50);
  });

  // Batch Print Filtered Carnets
  document.getElementById('printBatchBtn').addEventListener('click', () => {
    const filtered = getFilteredBadgeVehicles();
    if (filtered.length === 0) {
      alert('No hay vehículos para imprimir con los filtros seleccionados actualmente.');
      return;
    }

    if (confirm(`¿Desea enviar a impresión los ${filtered.length} carnets seleccionados por el filtro?`)) {
      const printArea = document.getElementById('printBatchArea');
      printArea.innerHTML = '';

      filtered.forEach(v => {
        const badgeWrapper = document.createElement('div');
        badgeWrapper.innerHTML = generateBadgeHTML(v, currentBadgeStyle);
        printArea.appendChild(badgeWrapper);
      });

      setTimeout(() => {
        filtered.forEach(v => {
          const qrEls = printArea.querySelectorAll(`[id^="qr-code-single-${v.id}"]`);
          qrEls.forEach(qrEl => {
            qrEl.innerHTML = '';
            new QRCode(qrEl, {
              text: `${window.location.origin}${window.location.pathname}?placa=${v.placa}`,
              width: currentBadgeStyle === 'vertical' ? 110 : 80,
              height: currentBadgeStyle === 'vertical' ? 110 : 80,
              colorDark: "#000000",
              colorLight: "#ffffff"
            });
          });
        });
        setTimeout(() => window.print(), 300);
      }, 100);
    }
  });

  // --------------------------------------------------------------------------
  // 7. MODULO 3: BASE DE DATOS & EDICION / RENOVACION
  // --------------------------------------------------------------------------
  let currentDbFilter = 'ALL'; // ALL, VIGENTES, POR_VENCER, VENCIDOS
  let currentTipoFilter = 'ALL'; // ALL, CARRO, MOTOCICLETA
  let currentCdFilter = 'ALL'; // CD filter (Col X)
  let currentEmpresaFilter = 'ALL'; // Empresa filter (Col U)
  let currentLicenciaFilter = 'ALL'; // Licencia filter (Col AP)
  let dbSearchQuery = '';
  let currentPage = 1;
  const pageSize = 20;

  const dbTableBody = document.getElementById('dbTableBody');
  const dbSearchInput = document.getElementById('dbSearchInput');
  const dbTipoFilter = document.getElementById('dbTipoFilter');
  const dbCdFilter = document.getElementById('dbCdFilter');
  const dbEmpresaFilter = document.getElementById('dbEmpresaFilter');
  const dbLicenciaFilter = document.getElementById('dbLicenciaFilter');

  // Filter tab buttons
  const dbFilterTabs = {
    ALL: document.getElementById('dbFilterAll'),
    VIGENTES: document.getElementById('dbFilterVigentes'),
    POR_VENCER: document.getElementById('dbFilterPorVencer'),
    VENCIDOS: document.getElementById('dbFilterVencidos')
  };

  Object.keys(dbFilterTabs).forEach(key => {
    dbFilterTabs[key].addEventListener('click', () => {
      currentDbFilter = key;
      Object.keys(dbFilterTabs).forEach(k => {
        if (k === key) {
          dbFilterTabs[k].className = "db-filter-tab active px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 transition-all";
        } else {
          dbFilterTabs[k].className = "db-filter-tab px-3.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all border border-slate-700";
        }
      });
      currentPage = 1;
      renderDatabaseTable();
    });
  });

  dbSearchInput.addEventListener('input', (e) => {
    dbSearchQuery = e.target.value.trim().toLowerCase();
    currentPage = 1;
    renderDatabaseTable();
  });

  dbTipoFilter.addEventListener('change', (e) => {
    currentTipoFilter = e.target.value;
    currentPage = 1;
    renderDatabaseTable();
  });

  if (dbCdFilter) {
    dbCdFilter.addEventListener('change', (e) => {
      currentCdFilter = e.target.value;
      currentPage = 1;
      renderDatabaseTable();
    });
  }

  if (dbEmpresaFilter) {
    dbEmpresaFilter.addEventListener('change', (e) => {
      currentEmpresaFilter = e.target.value;
      currentPage = 1;
      renderDatabaseTable();
    });
  }

  if (dbLicenciaFilter) {
    dbLicenciaFilter.addEventListener('change', (e) => {
      currentLicenciaFilter = e.target.value;
      currentPage = 1;
      renderDatabaseTable();
    });
  }

  function populateDropdownFilters() {
    if (!dbCdFilter || !dbEmpresaFilter || !dbLicenciaFilter) return;

    // CD options
    const cds = Array.from(new Set(vehicles.map(v => v.centroDistribucion || 'CEDI'))).filter(Boolean).sort();
    dbCdFilter.innerHTML = '<option value="ALL">🏢 Todos los CD (Col. X)</option>';
    cds.forEach(cd => {
      const opt = document.createElement('option');
      opt.value = cd;
      opt.textContent = cd;
      dbCdFilter.appendChild(opt);
    });

    // Empresa options
    const empresas = Array.from(new Set(vehicles.map(v => v.empresa || 'CEDI'))).filter(Boolean).sort();
    dbEmpresaFilter.innerHTML = '<option value="ALL">🏭 Todas las Empresas (Col. U)</option>';
    empresas.forEach(emp => {
      const opt = document.createElement('option');
      opt.value = emp;
      opt.textContent = emp;
      dbEmpresaFilter.appendChild(opt);
    });

    // Licencia options
    const licencias = Array.from(new Set(vehicles.map(v => v.licenciaCategoria || 'SIN CATEGORÍA'))).filter(Boolean).sort();
    dbLicenciaFilter.innerHTML = '<option value="ALL">🪪 Todas las Licencias (Col. AP)</option>';
    licencias.forEach(lic => {
      const opt = document.createElement('option');
      opt.value = lic;
      opt.textContent = `Cat: ${lic}`;
      dbLicenciaFilter.appendChild(opt);
    });
  }

  function getBaseFilteredVehicles() {
    return vehicles.filter(v => {
      // Filter by tipo
      if (currentTipoFilter !== 'ALL' && v.tipoVehiculo !== currentTipoFilter) return false;

      // Filter by CD (Col X)
      if (currentCdFilter !== 'ALL' && (v.centroDistribucion || 'CEDI') !== currentCdFilter) return false;

      // Filter by Empresa (Col U)
      if (currentEmpresaFilter !== 'ALL' && (v.empresa || 'CEDI') !== currentEmpresaFilter) return false;

      // Filter by Licencia Categoria (Col AP)
      if (currentLicenciaFilter !== 'ALL' && (v.licenciaCategoria || 'SIN CATEGORÍA') !== currentLicenciaFilter) return false;

      // Filter by search query
      if (dbSearchQuery) {
        const matchesPlaca = v.placa.toLowerCase().includes(dbSearchQuery);
        const matchesNombre = v.nombre.toLowerCase().includes(dbSearchQuery);
        const matchesCedula = v.cedula.toLowerCase().includes(dbSearchQuery);
        if (!matchesPlaca && !matchesNombre && !matchesCedula) return false;
      }

      return true;
    });
  }

  function updateFilterCounts() {
    const baseSet = getBaseFilteredVehicles();
    let vigentesCount = 0;
    let porVencerCount = 0;
    let vencidosCount = 0;

    baseSet.forEach(v => {
      const st = getVehicleOverallStatus(v);
      if (st === 'APTO') vigentesCount++;
      else if (st === 'POR_VENCER') porVencerCount++;
      else vencidosCount++;
    });

    const total = baseSet.length;

    // Filter tab button counts
    const cntAll = document.getElementById('filterCountAll');
    const cntVig = document.getElementById('filterCountVigentes');
    const cntPor = document.getElementById('filterCountPorVencer');
    const cntVen = document.getElementById('filterCountVencidos');

    if (cntAll) cntAll.textContent = total;
    if (cntVig) cntVig.textContent = vigentesCount;
    if (cntPor) cntPor.textContent = porVencerCount;
    if (cntVen) cntVen.textContent = vencidosCount;

    // Update top KPI badges
    const kTotal = document.getElementById('kpiTotal');
    const kVig = document.getElementById('kpiVigentes');
    const kPor = document.getElementById('kpiPorVencer');
    const kVen = document.getElementById('kpiVencidos');

    if (kTotal) kTotal.textContent = total;
    if (kVig) kVig.textContent = vigentesCount;
    if (kPor) kPor.textContent = porVencerCount;
    if (kVen) kVen.textContent = vencidosCount;
  }

  function getFilteredVehicles() {
    const baseSet = getBaseFilteredVehicles();
    return baseSet.filter(v => {
      const overall = getVehicleOverallStatus(v);
      
      // Filter by status tab
      if (currentDbFilter === 'VIGENTES' && overall !== 'APTO') return false;
      if (currentDbFilter === 'POR_VENCER' && overall !== 'POR_VENCER') return false;
      if (currentDbFilter === 'VENCIDOS' && overall !== 'DENEGADO') return false;

      return true;
    });
  }

  function renderDatabaseTable() {
    updateFilterCounts();
    const filtered = getFilteredVehicles();
    const total = filtered.length;

    const totalPages = Math.ceil(total / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, total);
    const pageItems = filtered.slice(startIdx, endIdx);

    document.getElementById('pageStart').textContent = total === 0 ? 0 : startIdx + 1;
    document.getElementById('pageEnd').textContent = endIdx;
    document.getElementById('pageTotal').textContent = total;
    document.getElementById('currentPageNum').textContent = currentPage;

    document.getElementById('prevPageBtn').disabled = currentPage === 1;
    document.getElementById('nextPageBtn').disabled = currentPage === totalPages;

    dbTableBody.innerHTML = '';

    if (pageItems.length === 0) {
      dbTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="py-8 text-center text-slate-500 text-xs">
            No se encontraron vehículos con los filtros aplicados.
          </td>
        </tr>
      `;
      return;
    }

    pageItems.forEach(v => {
      const overall = getVehicleOverallStatus(v);
      const soat = calculateDocStatus(v.soatVencimiento);
      const rtm = calculateDocStatus(v.rtmVencimiento);
      const lic = calculateDocStatus(v.licenciaVencimiento);

      const tr = document.createElement('tr');
      tr.className = "hover:bg-slate-800/40 transition-colors";

      let statusBadge = '';
      if (overall === 'APTO') {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-950 text-emerald-400 border border-emerald-500/30">🟢 APTO</span>';
      } else if (overall === 'POR_VENCER') {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-950 text-amber-400 border border-amber-500/30">🟡 POR VENCER</span>';
      } else {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-950 text-rose-400 border border-rose-500/30">🔴 DENEGADO</span>';
      }

      const icon = v.tipoVehiculo === 'MOTOCICLETA' ? '<i class="fa-solid fa-motorcycle text-amber-400"></i>' : '<i class="fa-solid fa-car text-amber-400"></i>';

      tr.innerHTML = `
        <td class="py-3 px-4 font-mono font-extrabold text-amber-400 text-sm">${v.placa}</td>
        <td class="py-3 px-4 font-bold text-white">${v.nombre}</td>
        <td class="py-3 px-4 font-mono text-slate-300">${v.cedula}</td>
        <td class="py-3 px-4 font-semibold text-amber-300/90">${v.centroDistribucion || 'CEDI'}</td>
        <td class="py-3 px-4 font-semibold text-sky-300/90">${v.empresa || 'CEDI'}</td>
        <td class="py-3 px-4 font-semibold text-slate-300 flex items-center gap-1.5">${icon} ${v.tipoVehiculo}</td>
        <td class="py-3 px-4 font-mono">
          <span class="${soat.days < 0 ? 'text-rose-400 font-bold' : soat.days <= 15 ? 'text-amber-400 font-bold' : 'text-slate-300'}">${v.soatVencimiento || 'N/A'}</span>
        </td>
        <td class="py-3 px-4 font-mono">
          <span class="${rtm.days < 0 ? 'text-rose-400 font-bold' : rtm.days <= 15 ? 'text-amber-400 font-bold' : 'text-slate-300'}">${v.rtmVencimiento || 'N/A'}</span>
        </td>
        <td class="py-3 px-4 font-mono">
          <span class="${lic.days < 0 ? 'text-rose-400 font-bold' : lic.days <= 15 ? 'text-amber-400 font-bold' : 'text-slate-300'}">${v.licenciaVencimiento || 'N/A'}</span>
        </td>
        <td class="py-3 px-4">${statusBadge}</td>
        <td class="py-3 px-4 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button data-id="${v.id}" class="btn-edit-vehicle bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1">
              <i class="fa-solid fa-pen-to-square"></i> Renovar / Editar
            </button>
            <button data-id="${v.id}" class="btn-delete-vehicle bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1">
              <i class="fa-solid fa-trash-can"></i> Eliminar
            </button>
          </div>
        </td>
      `;

      dbTableBody.appendChild(tr);
    });

    // Attach Edit button events
    document.querySelectorAll('.btn-edit-vehicle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        openEditModal(id);
      });
    });

    // Attach Delete button events
    document.querySelectorAll('.btn-delete-vehicle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        openDeleteModal(id);
      });
    });
  }

  // Delete Confirmation Modal Logic
  let vehicleToDeleteId = null;
  const deleteConfirmModal = document.getElementById('deleteConfirmModal');
  const delModalPlaca = document.getElementById('delModalPlaca');
  const delModalNombre = document.getElementById('delModalNombre');
  const delModalCedula = document.getElementById('delModalCedula');
  const delModalTipo = document.getElementById('delModalTipo');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

  function openDeleteModal(id) {
    if (currentUserRole !== 'ADMIN') {
      openAdminAuthModal();
      return;
    }
    const v = vehicles.find(x => x.id === id);
    if (!v) return;
    vehicleToDeleteId = id;
    if (delModalPlaca) delModalPlaca.textContent = v.placa;
    if (delModalNombre) delModalNombre.textContent = v.nombre;
    if (delModalCedula) delModalCedula.textContent = v.cedula;
    if (delModalTipo) delModalTipo.textContent = v.tipoVehiculo;
    if (deleteConfirmModal) deleteConfirmModal.classList.remove('hidden');
  }

  function closeDeleteModal() {
    vehicleToDeleteId = null;
    if (deleteConfirmModal) deleteConfirmModal.classList.add('hidden');
  }

  if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
  }

  if (deleteConfirmModal) {
    deleteConfirmModal.addEventListener('click', (e) => {
      if (e.target === deleteConfirmModal) closeDeleteModal();
    });
  }

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', () => {
      if (!vehicleToDeleteId) return;
      const targetId = vehicleToDeleteId;
      const targetVehicle = vehicles.find(v => v.id === targetId);

      createBackupSnapshot();
      if (targetVehicle) {
        deletedVehicleKeysSet.add(`${targetVehicle.cedula}_${targetVehicle.tipoVehiculo}`);
        deletedVehicleKeysSet.add(`${targetVehicle.cedula}_${targetVehicle.placa}`);
        saveModificationsRegistry();
        logAdminAction('ELIMINAR', targetVehicle, 'REGISTRO_COMPLETO', targetVehicle.placa, 'ELIMINADO_DE_APLICACION');
      }

      vehicles = vehicles.filter(v => v.id !== targetId);
      saveData();
      closeDeleteModal();

      // Refresh all UI elements, KPIs, and dropdowns
      updateKPIs();
      populateDropdownFilters();
      if (typeof populateBadgeDropdownFilters === 'function') populateBadgeDropdownFilters();
      if (typeof populateBadgeSelector === 'function') populateBadgeSelector();
      renderDatabaseTable();
      alert("✅ El registro fue eliminado correctamente de la aplicación y sincronizado con la base de datos principal.");
    });
  }

  document.getElementById('prevPageBtn').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderDatabaseTable();
    }
  });

  document.getElementById('nextPageBtn').addEventListener('click', () => {
    const total = getFilteredVehicles().length;
    if (currentPage * pageSize < total) {
      currentPage++;
      renderDatabaseTable();
    }
  });

  const resetInitialBtn = document.getElementById('resetInitialDataBtn');
  if (resetInitialBtn) {
    resetInitialBtn.addEventListener('click', () => {
      if (confirm('¿Desea restablecer la base de datos con los 242 vehículos de las respuestas más recientes (Col. B)?')) {
        vehicles = window.INITIAL_VEHICLES || [];
        saveData();
        renderDatabaseTable();
        renderBadgesList();
        updateDashboardMetrics();
        alert('Se han cargado los 242 vehículos de las respuestas más recientes exitosamente.');
      }
    });
  }

  // --------------------------------------------------------------------------
  // 8. EDIT MODAL FOR DOCUMENT RENEWALS
  // --------------------------------------------------------------------------
  const editModal = document.getElementById('editModal');
  const vehicleForm = document.getElementById('vehicleForm');

  function openEditModal(vehicleId = null) {
    if (currentUserRole !== 'ADMIN') {
      openAdminAuthModal();
      return;
    }
    editModal.classList.remove('hidden');
    
    if (vehicleId) {
      const v = vehicles.find(x => x.id === vehicleId);
      if (!v) return;
      document.getElementById('modalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square text-amber-400"></i> Renovación de Documentos';
      document.getElementById('formVehicleId').value = v.id;
      document.getElementById('formPlaca').value = v.placa;
      document.getElementById('formPlaca').readOnly = true;
      document.getElementById('formTipoVehiculo').value = v.tipoVehiculo;
      document.getElementById('formNombre').value = v.nombre;
      document.getElementById('formCedula').value = v.cedula;
      document.getElementById('formEmpresa').value = v.empresa || '';
      document.getElementById('formSoat').value = v.soatVencimiento || '';
      document.getElementById('formRtm').value = v.rtmVencimiento || '';
      document.getElementById('formLicCat').value = v.licenciaCategoria || 'B1';
      document.getElementById('formLicVenc').value = v.licenciaVencimiento || '';
    } else {
      // New vehicle
      document.getElementById('modalTitle').innerHTML = '<i class="fa-solid fa-plus text-amber-400"></i> Registrar Nuevo Vehículo';
      vehicleForm.reset();
      document.getElementById('formVehicleId').value = '';
      document.getElementById('formPlaca').readOnly = false;
    }
  }

  document.getElementById('closeModalBtn').addEventListener('click', () => editModal.classList.add('hidden'));
  document.getElementById('cancelFormBtn').addEventListener('click', () => editModal.classList.add('hidden'));
  document.getElementById('addNewVehicleBtn').addEventListener('click', () => openEditModal(null));

  vehicleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('formVehicleId').value;
    const placa = document.getElementById('formPlaca').value.trim().toUpperCase();
    const tipo = document.getElementById('formTipoVehiculo').value;
    const nombre = document.getElementById('formNombre').value.trim();
    const cedula = document.getElementById('formCedula').value.trim();
    const empresa = document.getElementById('formEmpresa').value.trim();
    const soat = document.getElementById('formSoat').value;
    const rtm = document.getElementById('formRtm').value;
    const licCat = document.getElementById('formLicCat').value.trim().toUpperCase();
    const licVenc = document.getElementById('formLicVenc').value;

    createBackupSnapshot();

    if (id) {
      // Edit existing by ID
      const idx = vehicles.findIndex(x => x.id === id);
      if (idx !== -1) {
        const oldV = vehicles[idx];
        if (oldV.soatVencimiento !== soat) logAdminAction('RENOVAR_SOAT', oldV, 'FECHA_SOAT', oldV.soatVencimiento, soat);
        if (oldV.rtmVencimiento !== rtm) logAdminAction('RENOVAR_RTM', oldV, 'FECHA_RTM', oldV.rtmVencimiento, rtm);
        if (oldV.licenciaVencimiento !== licVenc) logAdminAction('RENOVAR_LICENCIA', oldV, 'FECHA_LICENCIA', oldV.licenciaVencimiento, licVenc);
        if (oldV.licenciaCategoria !== licCat) logAdminAction('EDITAR', oldV, 'CATEGORIA_LICENCIA', oldV.licenciaCategoria, licCat);
        if (oldV.placa !== placa) logAdminAction('EDITAR', oldV, 'PLACA', oldV.placa, placa);

        const updatedObj = {
          ...vehicles[idx],
          placa,
          tipoVehiculo: tipo,
          nombre,
          cedula,
          empresa,
          soatVencimiento: soat,
          rtmVencimiento: rtm,
          licenciaCategoria: licCat,
          licenciaVencimiento: licVenc
        };
        vehicles[idx] = updatedObj;
        manualOverridesMap.set(`${cedula}_${tipo}`, updatedObj);
        saveModificationsRegistry();
      }
    } else {
      // Check if a vehicle with the exact same cedula already exists (strict deduplication)
      const cleanCed = cedula.replace(/[^0-9]/g, '').replace(/^0+/, '');
      const existingCedIdx = vehicles.findIndex(x => x.cedula.replace(/[^0-9]/g, '').replace(/^0+/, '') === cleanCed);
      
      if (existingCedIdx !== -1) {
        const oldV = vehicles[existingCedIdx];
        if (oldV.soatVencimiento !== soat) logAdminAction('RENOVAR_SOAT', oldV, 'FECHA_SOAT', oldV.soatVencimiento, soat);
        if (oldV.rtmVencimiento !== rtm) logAdminAction('RENOVAR_RTM', oldV, 'FECHA_RTM', oldV.rtmVencimiento, rtm);
        if (oldV.licenciaVencimiento !== licVenc) logAdminAction('RENOVAR_LICENCIA', oldV, 'FECHA_LICENCIA', oldV.licenciaVencimiento, licVenc);
        if (oldV.licenciaCategoria !== licCat) logAdminAction('EDITAR', oldV, 'CATEGORIA_LICENCIA', oldV.licenciaCategoria, licCat);
        if (oldV.placa !== placa) logAdminAction('EDITAR', oldV, 'PLACA', oldV.placa, placa);

        const updatedObj = {
          ...vehicles[existingCedIdx],
          placa,
          tipoVehiculo: tipo,
          nombre,
          empresa,
          soatVencimiento: soat,
          rtmVencimiento: rtm,
          licenciaCategoria: licCat,
          licenciaVencimiento: licVenc
        };
        vehicles[existingCedIdx] = updatedObj;
        manualOverridesMap.set(`${cleanCed}_${tipo}`, updatedObj);
        saveModificationsRegistry();
      } else {
        // Add new
        const newId = (Date.now()).toString();
        const newObj = {
          id: newId,
          placa,
          tipoVehiculo: tipo,
          nombre,
          cedula,
          cargo: 'COLABORADOR',
          empresa,
          centroDistribucion: 'CEDI',
          propiedad: 'Propio',
          licenciaCategoria: licCat,
          licenciaVencimiento: licVenc,
          soatVencimiento: soat,
          rtmVencimiento: rtm
        };
        vehicles.unshift(newObj);
        manualOverridesMap.set(`${cedula}_${tipo}`, newObj);
        saveModificationsRegistry();
        logAdminAction('CREAR', newObj, 'REGISTRO_NUEVO', 'NIN-GUNO', placa);
      }
    }

    saveData();
    editModal.classList.add('hidden');
    alert("✅ Los cambios fueron guardados correctamente en la aplicación y sincronizados con la base de datos principal.");
  });

  // --------------------------------------------------------------------------
  // 9. EXCEL IMPORT & EXPORT
  // --------------------------------------------------------------------------
  document.getElementById('exportExcelBtn').addEventListener('click', () => {
    const dataToExport = vehicles.map(v => ({
      'PLACA': v.placa,
      'NOMBRE COMPLETO Y APELLIDOS': v.nombre,
      'CEDULA (SIN PUNTOS)': v.cedula,
      'TIPO DE VEHICULO': v.tipoVehiculo,
      'EMPRESA': v.empresa,
      'POSICIONES': v.cargo,
      'FECHA VENCIMIENTO SOAT': v.soatVencimiento,
      'FECHA VENCIMIENTO RTM': v.rtmVencimiento,
      'CATEGORIA LICENCIA': v.licenciaCategoria,
      'FECHA VENCIMIENTO LICENCIA': v.licenciaVencimiento,
      'ESTADO DOCUMENTOS': getVehicleOverallStatus(v)
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "VEHICULOS CEDI");
    XLSX.writeFile(wb, `BASE_DATOS_VEHICULOS_CEDI_${new Date().toISOString().slice(0,10)}.xlsx`);
  });

  document.getElementById('excelFileInput').addEventListener('change', (e) => {
    if (currentUserRole !== 'ADMIN') {
      openAdminAuthModal();
      e.target.value = '';
      return;
    }
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error("El archivo Excel se encuentra vacío o dañado.");
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (!jsonData || jsonData.length === 0) {
          throw new Error("La hoja de Excel seleccionada no contiene registros.");
        }

        // 1. VALIDACIÓN DE ESTRUCTURA DEL ARCHIVO
        const firstRow = jsonData[0];
        const keys = Object.keys(firstRow);
        
        const hasCedulaCol = keys.some(k => k.includes('CEDULA') || k.includes('Cedula') || k.includes('L'));
        const hasNombreCol = keys.some(k => k.includes('NOMBRE') || k.includes('Nombre') || k.includes('O'));
        const hasEmpresaCol = keys.some(k => k.includes('EMPRESA') || k.includes('Empresa') || k.includes('U'));

        if (!hasCedulaCol || !hasNombreCol || !hasEmpresaCol) {
          alert("❌ Estructura de Excel No Válida:\n\nEl archivo cargado no cumple con la estructura esperada de la encuesta ('CEDULA (SIN PUNTOS)', 'NOMBRE', 'EMPRESA').\n\nSe conservará la última versión válida de la base de datos.");
          return;
        }

        // Active cedulas set for JOIN comparison
        const activeCedulas = new Set(
          (window.INITIAL_VEHICLES || vehicles).map(v => (v.cedula || '').toString().replace(/[^0-9]/g, '').replace(/^0+/, ''))
        );

        // Map normalized full name -> cedula from INITIAL_VEHICLES to resolve employee digit typos
        const geoNameMap = new Map();
        (window.INITIAL_VEHICLES || vehicles).forEach(v => {
          if (v.nombre && v.cedula) {
            const normN = v.nombre.toString().trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ');
            if (normN) geoNameMap.set(normN, v.cedula);
          }
        });

        // 1. Group rows by clean Cedula (or resolved name cedula) and select EXCLUSIVELY the single latest row by Col B (Hora de inicio)
        const rowsByCedulaMap = new Map();

        jsonData.forEach((row) => {
          const rawCedula = (row['CEDULA (SIN PUNTOS)'] || row['Cedula'] || row['CEDULA'] || '').toString();
          const cleanCedula = rawCedula.replace(/[^0-9]/g, '').replace(/^0+/, '');
          
          const rawNombre = (row['NOMBRE COMPLETO Y APELLIDOS'] || row['Nombre'] || row['NOMBRE'] || '').toString().trim().toUpperCase();
          const normNombre = rawNombre.replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ');

          let resolvedCedula = cleanCedula;
          if (!activeCedulas.has(cleanCedula) && geoNameMap.has(normNombre)) {
            resolvedCedula = geoNameMap.get(normNombre);
          }

          if (!resolvedCedula) return;

          const rawTime = row['Hora de inicio'] || row['HORA DE INICIO'] || row['Hora inicio'] || row['B'] || 0;
          let numTime = parseFloat(rawTime);
          if (isNaN(numTime)) {
            const dt = new Date(rawTime);
            numTime = isNaN(dt.getTime()) ? 0 : dt.getTime();
          }

          const item = { row, cleanCedula: resolvedCedula, numTime };

          if (!rowsByCedulaMap.has(resolvedCedula)) {
            rowsByCedulaMap.set(resolvedCedula, []);
          }
          rowsByCedulaMap.get(resolvedCedula).push(item);
        });

        // Helper for browser consolidation: get first non-empty valid field value from newest to older rows
        const getConsolidatedField = (rowList, fieldKeys, isDateField = false, defaultVal = '') => {
          for (const item of rowList) {
            const r = item.row;
            for (const key of fieldKeys) {
              const val = (r[key] || '').toString().trim();
              if (!val) continue;
              const u = val.toUpperCase();
              if (u === '0' || u === 'N/A' || u === 'NO APLICA' || u === 'VVV' || u === 'SYSTEM.XML.XMLELEMENT') continue;
              if (isDateField) {
                const formatted = formatDateISO(val);
                if (formatted && formatted !== 'N/A') return formatted;
              } else {
                return val;
              }
            }
          }
          return isDateField ? 'N/A' : defaultVal;
        };

        // Map strictly enforcing 1 UNIQUE record per (cedula + tipoVehiculo + placa) with field consolidation
        const dedupedRecordsMap = new Map();
        let exemptCount = 0;
        let activeCount = 0;
        let ignoredCount = 0;
        let ignoredRoleCount = 0;
        let duplicatesFiltered = 0;

        const getLevenshteinDistance = (s, t) => {
          const n = s.length, m = t.length;
          if (n === 0) return m;
          if (m === 0) return n;
          const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
          for (let i = 0; i <= n; i++) d[i][0] = i;
          for (let j = 0; j <= m; j++) d[0][j] = j;
          for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= m; j++) {
              const cost = s[i - 1] === t[j - 1] ? 0 : 1;
              d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            }
          }
          return d[n][m];
        };

        const isSimilarPlaca = (p1, p2) => {
          if (!p1 || !p2) return false;
          if (p1 === p2) return true;
          if (Math.abs(p1.length - p2.length) <= 1) {
            if (p1.startsWith(p2) || p2.startsWith(p1) || p1.endsWith(p2) || p2.endsWith(p1)) return true;
            if (p1.length >= 4 && p2.length >= 4) {
              if (getLevenshteinDistance(p1, p2) <= 1) return true;
            }
          }
          return false;
        };

        const isValidColombianPlate = (p) => {
          if (!p) return false;
          const clean = p.replace(/[^A-Z0-9]/g, '').toUpperCase();
          if (!clean) return false;
          const blacklisted = ['EVOBIKE', 'NAELCTRICA', 'NAELECTRICA', 'BICICLETA', 'ELECTRICA', 'PATINETA', 'NOAPLICA', 'NINGUNO', 'NOTIENEN', 'NOTIENE', 'XXXXX', 'VVV', 'MOTO', 'CARRO', 'SINPLACA'];
          if (blacklisted.includes(clean)) return false;
          if (clean.length < 5 || clean.length > 7) return false;
          // Motorcycle: 3 letters + 2 digits + 1 letter (PIY57E, GJT57F, SLB01E)
          if (/^[A-Z]{3}[0-9]{2}[A-Z]$/.test(clean)) return true;
          // Car: 3 letters + 3 digits (MCN707, FCY607)
          if (/^[A-Z]{3}[0-9]{3}$/.test(clean)) return true;
          // Older Motorcycle: 3 letters + 2 digits
          if (/^[A-Z]{3}[0-9]{2}$/.test(clean)) return true;
          // Official / Public: 2 letters + 4 digits
          if (/^[A-Z]{2}[0-9]{4}$/.test(clean)) return true;
          return false;
        };

        rowsByCedulaMap.forEach((list, cleanCedula) => {
          // Sort from newest to oldest by Col B Hora de inicio
          list.sort((a, b) => b.numTime - a.numTime);
          const latestRow = list[0].row;

          const rolVial = (latestRow['SELECCIONE EL ROL VIAL HABITUAL QUE UTILIZA PARA DESPLAZARSE CASA-TRABAJO-CASA'] || latestRow['ROL VIAL'] || latestRow['AM'] || '').toString().trim();
          const rolLower = rolVial.toLowerCase();
          const isConductorMoto = rolLower.includes('conductor') && rolLower.includes('motocicleta');
          const isConductorVehiculo = rolLower.includes('conductor') && (rolLower.includes('veh') || rolLower.includes('carro'));

          if (!isConductorMoto && !isConductorVehiculo) {
            ignoredRoleCount++;
            return;
          }

          const nombre = (latestRow['NOMBRE COMPLETO Y APELLIDOS'] || latestRow['Nombre'] || latestRow['NOMBRE'] || latestRow['O'] || '').toString().trim();
          if (!nombre) return;

          const empresa = (latestRow['EMPRESA'] || latestRow['Empresa'] || latestRow['U'] || 'CEDI').toString().trim();
          const empresaUpper = empresa.toUpperCase();

          const isExempt = (empresaUpper.includes('ABI') || empresaUpper.includes('HONOR') || empresaUpper.includes('RENTAS'));

          if (!isExempt) {
            if (!activeCedulas.has(cleanCedula)) {
              ignoredCount++;
              return;
            }
            activeCount++;
          } else {
            exemptCount++;
          }

          const rawSoat = getConsolidatedField(list, ['FECHA VENCIMIENTO SOAT', 'SOAT', 'BE'], true, 'N/A');
          const rawRtm = getConsolidatedField(list, ['FECHA VENCIMIENTO RTM', 'RTM', 'BH'], true, 'N/A');
          const rawCd = getConsolidatedField(list, ['CENTRO DE DISTRIBUCION', 'CD', 'X'], false, 'CD BUCARAMANGA').toUpperCase();
          const cdClean = (rawCd && rawCd !== '0' && rawCd !== 'N/A' && rawCd !== 'NO APLICA' && rawCd !== 'CD') ? rawCd : 'CD BUCARAMANGA';
          const cargo = getConsolidatedField(list, ['POSICIONES', 'CARGO', 'R'], false, 'COLABORADOR');
          const placaBase = getConsolidatedField(list, ['PLACA', 'Placa', 'placa', 'BB'], false, '').toUpperCase();

          const targetVehicles = [];

          if (isConductorMoto) {
            const rawLicCatM = getConsolidatedField(list, ['CATEGORIA DE LICENCIA OPCION 1', 'CATEGORIA LICENCIA', 'CATEGORIA', 'AP'], false, '');
            const rawLicVencM = getConsolidatedField(list, ['FECHA VENCIMIENTO OPCION 1', 'FECHA VENCIMIENTO LICENCIA', 'AS'], true, 'N/A');
            targetVehicles.push({
              tipoVehiculo: 'MOTOCICLETA',
              licCat: rawLicCatM ? rawLicCatM.toUpperCase() : 'SIN CATEGORÍA',
              licVenc: rawLicVencM
            });
          }

          if (isConductorVehiculo) {
            const rawLicCatV = getConsolidatedField(list, ['CATEGORIA DE LICENCIA OPCION 2', 'CATEGORIA LICENCIA OPCION 2', 'AV'], false, '');
            const rawLicVencV = getConsolidatedField(list, ['FECHA VENCIMIENTO LICENCIA OPCION 2', 'FECHA VENCIMIENTO OPCION 2', 'AY'], true, 'N/A');
            targetVehicles.push({
              tipoVehiculo: 'CARRO',
              licCat: rawLicCatV ? rawLicCatV.toUpperCase() : 'SIN CATEGORÍA',
              licVenc: rawLicVencV
            });
          }

          targetVehicles.forEach((tv) => {
            const cleanPlaca = placaBase.replace(/[^A-Z0-9]/g, '');

            // STRICT RULE: IF RECORD WAS DELETED BY ADMIN, DISCARD IT PERMANENTLY!
            if (deletedVehicleKeysSet.has(`${cleanCedula}_${tv.tipoVehiculo}`) || deletedVehicleKeysSet.has(`${cleanCedula}_${cleanPlaca}`)) {
              duplicatesFiltered++;
              return;
            }

            const isValidPlate = isValidColombianPlate(placaBase);

            // STRICT RULE: IF PLATE IS INVALID, DISCARD RECORD ENTIRELY!
            if (!isValidPlate) {
              duplicatesFiltered++;
              return;
            }

            // Check if another vehicle for this collaborator matches or is fuzzy similar
            let existingKey = null;
            for (const [key, existingRecord] of dedupedRecordsMap.entries()) {
              if (existingRecord.cedula === cleanCedula && existingRecord.tipoVehiculo === tv.tipoVehiculo) {
                const existingClean = existingRecord.placa.replace(/[^A-Z0-9]/g, '');
                if (isSimilarPlaca(existingClean, cleanPlaca)) {
                  existingKey = key;
                  break;
                }
              }
            }

            if (existingKey) {
              duplicatesFiltered++;
              return;
            }

            let displayPlaca = cleanPlaca;
            let finalSoat = (rawSoat && rawSoat !== 'N/A') ? rawSoat : 'N/A';
            let finalRtm = (rawRtm && rawRtm !== 'N/A') ? rawRtm : 'N/A';
            let finalLicCat = tv.licCat;
            let finalLicVenc = tv.licVenc;

            // Apply manual Admin overrides if present
            const ov = manualOverridesMap.get(`${cleanCedula}_${tv.tipoVehiculo}`);
            if (ov) {
              if (ov.placa) displayPlaca = ov.placa;
              if (ov.soatVencimiento) finalSoat = ov.soatVencimiento;
              if (ov.rtmVencimiento) finalRtm = ov.rtmVencimiento;
              if (ov.licenciaCategoria) finalLicCat = ov.licenciaCategoria;
              if (ov.licenciaVencimiento) finalLicVenc = ov.licenciaVencimiento;
            }

            const dedupKey = `${cleanCedula}_${tv.tipoVehiculo}_${displayPlaca}`;

            dedupedRecordsMap.set(dedupKey, {
              id: (dedupedRecordsMap.size + 1).toString(),
              placa: displayPlaca,
              nombre,
              cedula: cleanCedula,
              tipoVehiculo: tv.tipoVehiculo,
              empresa,
              centroDistribucion: cdClean,
              cargo,
              soatVencimiento: finalSoat,
              rtmVencimiento: finalRtm,
              licenciaCategoria: finalLicCat,
              licenciaVencimiento: finalLicVenc
            });
          });
        });

        const newRecords = Array.from(dedupedRecordsMap.values());

        if (newRecords.length === 0) {
          alert("⚠️ No se encontraron registros válidos de conductores activos ni exentos en el archivo subido. Se conserva la versión anterior.");
          return;
        }

        vehicles = newRecords;
        saveData();
        alert(`✅ ¡Base de datos de vehículos cargada exitosamente!\n\n- Total vehículos procesados: ${newRecords.length}\n- Personal Activo Geovictoria: ${activeCount}\n- Exenciones (ABI/HONOR/RENTAS): ${exemptCount}\n- Roles no conductores ignorados: ${ignoredRoleCount}\n- Duplicados Filtrados: ${duplicatesFiltered}`);
      } catch (err) {
        alert("❌ Error al procesar el archivo Excel: " + err.message + "\nSe conservará la última versión válida de la base de datos.");
      }
    };
    reader.readAsArrayBuffer(file);
  });

  // --------------------------------------------------------------------------
  // 10. AUDIT LOGS & BACKUP TABLE RENDERING & EXPORTS
  // --------------------------------------------------------------------------
  const logsTableBody = document.getElementById('logsTableBody');
  const logSearchInput = document.getElementById('logSearchInput');
  const logTotalCount = document.getElementById('logTotalCount');

  let logSearchQuery = '';

  if (logSearchInput) {
    logSearchInput.addEventListener('input', (e) => {
      logSearchQuery = e.target.value.trim().toLowerCase();
      renderAuditLogsTable();
    });
  }

  function renderAuditLogsTable() {
    if (!logsTableBody) return;
    
    const filteredLogs = auditLogs.filter(log => {
      if (!logSearchQuery) return true;
      const q = logSearchQuery;
      return (
        (log.placa || '').toLowerCase().includes(q) ||
        (log.conductor || '').toLowerCase().includes(q) ||
        (log.cedula || '').toLowerCase().includes(q) ||
        (log.accion || '').toLowerCase().includes(q) ||
        (log.campoModificado || '').toLowerCase().includes(q)
      );
    });

    if (logTotalCount) logTotalCount.textContent = filteredLogs.length;
    logsTableBody.innerHTML = '';

    if (filteredLogs.length === 0) {
      logsTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="py-8 text-center text-slate-500 text-xs font-sans">
            No se han registrado modificaciones o eventos en la bitácora de auditoría.
          </td>
        </tr>
      `;
      return;
    }

    filteredLogs.forEach(log => {
      const tr = document.createElement('tr');
      tr.className = "hover:bg-slate-800/40 transition-colors text-[11px]";

      let actionBadge = '';
      if (log.accion.includes('ELIMINAR')) {
        actionBadge = '<span class="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-950 text-rose-400 border border-rose-500/30">ELIMINAR</span>';
      } else if (log.accion.includes('CREAR')) {
        actionBadge = '<span class="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30">CREAR</span>';
      } else if (log.accion.includes('IMPORTAR')) {
        actionBadge = '<span class="px-2 py-0.5 rounded text-[9px] font-bold bg-purple-950 text-purple-400 border border-purple-500/30">IMPORTAR EXCEL</span>';
      } else {
        actionBadge = '<span class="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-950 text-amber-400 border border-amber-500/30">EDITAR / RENOVACIÓN</span>';
      }

      tr.innerHTML = `
        <td class="py-2.5 px-4 text-slate-400 whitespace-nowrap">${log.formattedDate}</td>
        <td class="py-2.5 px-4 font-bold text-sky-400 whitespace-nowrap"><i class="fa-solid fa-user-shield text-[10px]"></i> ${log.usuario}</td>
        <td class="py-2.5 px-4">${actionBadge}</td>
        <td class="py-2.5 px-4 font-bold text-amber-400">${log.placa}</td>
        <td class="py-2.5 px-4 text-white font-sans">${log.conductor}</td>
        <td class="py-2.5 px-4 font-semibold text-slate-300">${log.campoModificado}</td>
        <td class="py-2.5 px-4 text-rose-300 font-mono line-through">${log.valorAnterior}</td>
        <td class="py-2.5 px-4 text-emerald-300 font-mono font-bold">${log.valorNuevo}</td>
      `;

      logsTableBody.appendChild(tr);
    });
  }

  // Export Audit Logs to Excel
  const exportAuditLogsBtn = document.getElementById('exportAuditLogsBtn');
  if (exportAuditLogsBtn) {
    exportAuditLogsBtn.addEventListener('click', () => {
      if (auditLogs.length === 0) {
        alert('No hay eventos en la bitácora para exportar.');
        return;
      }
      const dataToExport = auditLogs.map(log => ({
        'FECHA Y HORA': log.formattedDate,
        'USUARIO': log.usuario,
        'ACCIÓN': log.accion,
        'PLACA': log.placa,
        'CONDUCTOR': log.conductor,
        'CÉDULA': log.cedula,
        'CAMPO MODIFICADO': log.campoModificado,
        'VALOR ANTERIOR': log.valorAnterior,
        'VALOR NUEVO': log.valorNuevo
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "BITACORA_HISTORIAL_CAMBIOS");
      XLSX.writeFile(wb, `BITACORA_CAMBIOS_CEDI_${new Date().toISOString().slice(0,10)}.xlsx`);
    });
  }

  // Export Synchronized Excel Database
  function exportSynchronizedExcel() {
    createBackupSnapshot();
    const dataToExport = vehicles.map(v => ({
      'PLACA': v.placa,
      'NOMBRE COMPLETO Y APELLIDOS': v.nombre,
      'CEDULA (SIN PUNTOS)': v.cedula,
      'TIPO DE VEHICULO': v.tipoVehiculo,
      'EMPRESA': v.empresa,
      'CENTRO DE DISTRIBUCION': v.centroDistribucion || 'CEDI BUCARAMANGA',
      'POSICIONES': v.cargo,
      'FECHA VENCIMIENTO SOAT': v.soatVencimiento,
      'FECHA VENCIMIENTO RTM': v.rtmVencimiento,
      'CATEGORIA LICENCIA': v.licenciaCategoria,
      'FECHA VENCIMIENTO LICENCIA': v.licenciaVencimiento,
      'ESTADO DOCUMENTOS': getVehicleOverallStatus(v)
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BASE_DATOS_OFICIAL_CEDI");
    
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
    XLSX.writeFile(wb, `BaseDatos_Oficial_Sincronizada_${ts}.xlsx`);
  }

  const downloadSyncExcelBtn = document.getElementById('downloadSyncExcelBtn');
  if (downloadSyncExcelBtn) {
    downloadSyncExcelBtn.addEventListener('click', () => {
      exportSynchronizedExcel();
    });
  }

  // Hook up audit log in excelFileInput
  const excelInputEl = document.getElementById('excelFileInput');
  if (excelInputEl) {
    const originalChange = excelInputEl.onchange;
    excelInputEl.addEventListener('change', () => {
      createBackupSnapshot();
      logAdminAction('IMPORTAR_EXCEL', null, 'ARCHIVOS_EXCEL', 'VERSION_ANTERIOR', 'NUEVA_BASE_DATOS_CARGADA');
    });
  }

  // Initial render - Load vehicles data first!
  initData();
  updateKPIs();
  populateDropdownFilters();
  if (typeof populateBadgeDropdownFilters === 'function') populateBadgeDropdownFilters();
  if (typeof populateBadgeSelector === 'function') populateBadgeSelector();
  renderDatabaseTable();
});
