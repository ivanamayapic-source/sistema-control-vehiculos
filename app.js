/* ==========================================================================
   SISTEMA DE CONTROL Y CARNETIZACION VEHICULAR - APP LOGIC
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // --------------------------------------------------------------------------
  // 1. STATE & DATA INITIALIZATION
  // --------------------------------------------------------------------------
  let vehicles = [];
  const STORAGE_KEY = 'CEDI_VEHICLES_DATA';

  // Supabase Cloud Sync Configuration
  const SUPABASE_URL = window.SUPABASE_URL || localStorage.getItem('SUPABASE_URL') || '';
  const SUPABASE_KEY = window.SUPABASE_KEY || localStorage.getItem('SUPABASE_KEY') || '';
  let supabaseClient = null;

  if (window.supabase && SUPABASE_URL && SUPABASE_KEY) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log('Supabase Cloud Database Conectado Correctamente');
    } catch (err) {
      console.error('Error conectando a Supabase:', err);
    }
  }

  function initData() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (window.INITIAL_VEHICLES && window.INITIAL_VEHICLES.length !== parsed.length) {
          vehicles = window.INITIAL_VEHICLES;
          saveData();
        } else {
          vehicles = parsed;
        }
      } catch (e) {
        console.error('Error parsing stored vehicles, falling back to initial data', e);
        vehicles = window.INITIAL_VEHICLES || [];
      }
    } else {
      vehicles = window.INITIAL_VEHICLES || [];
      saveData();
    }

    if (supabaseClient) {
      syncWithSupabase();
    }
  }

  async function syncWithSupabase() {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient.from('vehiculos').select('*');
      if (!error && data && data.length > 0) {
        vehicles = data.map(item => ({
          id: item.id,
          placa: item.placa,
          nombre: item.nombre,
          cedula: item.cedula,
          tipoVehiculo: item.tipo_vehiculo,
          empresa: item.empresa,
          centroDistribucion: item.centro_distribucion,
          cargo: item.cargo,
          soatVencimiento: item.soat_vencimiento,
          rtmVencimiento: item.rtm_vencimiento,
          licenciaCategoria: item.licencia_categoria,
          licenciaVencimiento: item.licencia_vencimiento
        }));
        saveDataLocally();
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

  function saveDataLocally() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vehicles));
    updateKPIs();
    populateDropdownFilters();
    renderDatabaseTable();
    populateBadgeSelector();
  }

  function saveData(updatedVehicle = null) {
    saveDataLocally();
    if (updatedVehicle && supabaseClient) {
      saveToSupabase(updatedVehicle);
    }
  }

  initData();

  // --------------------------------------------------------------------------
  // 2. DOCUMENT STATUS CALCULATOR
  // --------------------------------------------------------------------------
  const TODAY = new Date('2026-07-29'); // Synchronized with system date

  function parseDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  function calculateDocStatus(dateStr) {
    const d = parseDate(dateStr);
    if (!d) return { status: 'VENCIDO', label: 'Sin Registro', days: -999, class: 'bg-rose-950/80 text-rose-400 border-rose-500/40' };
    
    const diffTime = d - TODAY;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

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
  // 3. NAVIGATION & TABS MANAGEMENT
  // --------------------------------------------------------------------------
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
  tabs.carnets.addEventListener('click', () => switchTab('carnets'));
  tabs.database.addEventListener('click', () => switchTab('database'));

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

    // Doc cards
    renderDocCard('Soat', soat);
    renderDocCard('Rtm', rtm);
    renderDocCard('Lic', lic, v.licenciaCategoria);

    // Save current active vehicle for printing
    window.currentVerifiedVehicle = v;
  }

  function renderDocCard(prefix, docState, cat = null) {
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

    dateEl.textContent = docState.days === -999 ? 'No aplica / Sin fecha' : parseDate(docState.days === -999 ? '' : (prefix === 'Soat' ? window.currentVerifiedVehicle?.soatVencimiento : prefix === 'Rtm' ? window.currentVerifiedVehicle?.rtmVencimiento : window.currentVerifiedVehicle?.licenciaVencimiento))?.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }) || 'No registrada';
    
    if (docState.days === -999) {
      daysEl.textContent = 'Sin registro';
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
    if (window.currentVerifiedVehicle) {
      switchTab('carnets');
      document.getElementById('badgeSelectVehicle').value = window.currentVerifiedVehicle.id;
      renderSingleBadgePreview();
    }
  });

  // Check URL params on load for direct scanning (e.g., ?placa=JRK763)
  const urlParams = new URLSearchParams(window.location.search);
  const placaParam = urlParams.get('placa');
  if (placaParam) {
    switchTab('vigilancia');
    verifyVehicleByPlaca(placaParam.toUpperCase());
  }

  // --------------------------------------------------------------------------
  // 6. MODULO 2: ESTUDIO DE CARNETIZACION (BADGES)
  // --------------------------------------------------------------------------
  const badgeSelectVehicle = document.getElementById('badgeSelectVehicle');
  const badgeStyleBadgeBtn = document.getElementById('badgeStyleBadge');
  const badgeStyleCardBtn = document.getElementById('badgeStyleCard');
  let currentBadgeStyle = 'vertical'; // 'vertical' or 'cr80'

  function populateBadgeSelector() {
    badgeSelectVehicle.innerHTML = '';
    vehicles.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = `${v.placa} - ${v.nombre} (${v.tipoVehiculo})`;
      badgeSelectVehicle.appendChild(opt);
    });
    document.getElementById('countSelectedToPrint').textContent = vehicles.length;
  }
  populateBadgeSelector();

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
          <div class="badge-header">
            <div class="text-[10px] tracking-widest text-slate-900 font-bold opacity-80">CENTRO DE DISTRIBUCIÓN</div>
            <div class="text-base font-extrabold tracking-tight">CONTROL VEHICULAR</div>
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

            <!-- Owner Info -->
            <div class="text-left bg-slate-900/90 border border-slate-800 p-3 rounded-xl space-y-1">
              <div>
                <p class="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Conductor / Propietario:</p>
                <p class="text-xs font-bold text-white truncate">${v.nombre}</p>
              </div>
              <div class="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                <div>
                  <p class="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Cédula:</p>
                  <p class="text-xs font-mono font-bold text-slate-200">${v.cedula}</p>
                </div>
                <div>
                  <p class="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Empresa:</p>
                  <p class="text-[10px] font-semibold text-amber-400 truncate">${v.empresa || 'CEDI'}</p>
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
              <div>
                <p class="text-[9px] font-extrabold uppercase tracking-widest text-amber-400">CENTRO DE DISTRIBUCIÓN</p>
                <p class="font-outfit font-extrabold text-sm text-white">IDENTIFICACIÓN VEHICULAR</p>
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

  // Batch Print All Carnets
  document.getElementById('printBatchBtn').addEventListener('click', () => {
    if (confirm(`¿Desea enviar a impresión los ${vehicles.length} carnets de la base de datos?`)) {
      const printArea = document.getElementById('printBatchArea');
      printArea.innerHTML = '';

      vehicles.forEach(v => {
        const badgeWrapper = document.createElement('div');
        badgeWrapper.innerHTML = generateBadgeHTML(v, currentBadgeStyle);
        printArea.appendChild(badgeWrapper);
      });

      setTimeout(() => {
        vehicles.forEach(v => {
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

  function getFilteredVehicles() {
    return vehicles.filter(v => {
      const overall = getVehicleOverallStatus(v);
      
      // Filter by status tab
      if (currentDbFilter === 'VIGENTES' && overall !== 'APTO') return false;
      if (currentDbFilter === 'POR_VENCER' && overall !== 'POR_VENCER') return false;
      if (currentDbFilter === 'VENCIDOS' && overall !== 'DENEGADO') return false;

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

  function renderDatabaseTable() {
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
          <button data-id="${v.id}" class="btn-edit-vehicle bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 mx-auto">
            <i class="fa-solid fa-pen-to-square"></i> Renovar / Editar
          </button>
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

  // --------------------------------------------------------------------------
  // 8. EDIT MODAL FOR DOCUMENT RENEWALS
  // --------------------------------------------------------------------------
  const editModal = document.getElementById('editModal');
  const vehicleForm = document.getElementById('vehicleForm');

  function openEditModal(vehicleId = null) {
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

    if (id) {
      // Edit existing
      const idx = vehicles.findIndex(x => x.id === id);
      if (idx !== -1) {
        vehicles[idx] = {
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
      }
    } else {
      // Add new
      const newId = (Date.now()).toString();
      vehicles.unshift({
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
      });
    }

    saveData();
    editModal.classList.add('hidden');
    alert("¡Información y renovación guardadas exitosamente!");
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
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        let importedCount = 0;
        jsonData.forEach(row => {
          const placa = (row['PLACA'] || row['Placa'] || row['placa'] || '').toString().trim().toUpperCase();
          const nombre = (row['NOMBRE COMPLETO Y APELLIDOS'] || row['Nombre'] || row['NOMBRE'] || '').toString().trim();
          const cedula = (row['CEDULA (SIN PUNTOS)'] || row['Cedula'] || row['CEDULA'] || '').toString().trim();

          if (placa && nombre) {
            const existingIdx = vehicles.findIndex(x => x.placa === placa);
            const vData = {
              id: existingIdx !== -1 ? vehicles[existingIdx].id : Date.now().toString() + Math.random().toString(36).substr(2, 4),
              placa,
              nombre,
              cedula,
              tipoVehiculo: (row['TIPO DE VEHICULO'] || row['Tipo'] || 'MOTOCICLETA').toString().toUpperCase(),
              empresa: row['EMPRESA'] || 'CEDI',
              cargo: row['POSICIONES'] || 'COLABORADOR',
              soatVencimiento: row['FECHA VENCIMIENTO SOAT'] || '',
              rtmVencimiento: row['FECHA VENCIMIENTO RTM'] || '',
              licenciaCategoria: row['CATEGORIA LICENCIA'] || 'B1',
              licenciaVencimiento: row['FECHA VENCIMIENTO LICENCIA'] || ''
            };

            if (existingIdx !== -1) {
              vehicles[existingIdx] = { ...vehicles[existingIdx], ...vData };
            } else {
              vehicles.push(vData);
            }
            importedCount++;
          }
        });

        saveData();
        alert(`¡Importación exitosa! Se procesaron ${importedCount} vehículos.`);
      } catch (err) {
        alert("Error al leer el archivo Excel: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  });

  // Initial render
  updateKPIs();
  populateDropdownFilters();
  renderDatabaseTable();
});
