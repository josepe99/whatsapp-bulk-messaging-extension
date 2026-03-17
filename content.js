// content.js - WhatsApp Bulk Message Sender (sidebar panel)

let allRows = [];
let isRunning = false;
let selectedImageFile = null;
let pendingBackgroundState = null;
let previewNextContact = null;
let countdownTimerId = null;
const SUPPORTED_CONTACT_FILE_EXTENSIONS = [".xls", ".xlsx", ".csv"];
const DEFAULT_MIN_MINUTES = 1;
const DEFAULT_MAX_MINUTES = 2;

function getFileExtension(fileName) {
  const normalizedName = String(fileName || "").trim().toLowerCase();
  const dotIndex = normalizedName.lastIndexOf(".");
  return dotIndex >= 0 ? normalizedName.slice(dotIndex) : "";
}

function isSupportedContactFile(fileName) {
  return SUPPORTED_CONTACT_FILE_EXTENSIONS.includes(getFileExtension(fileName));
}

function normalizeColumnName(columnName) {
  return String(columnName || "")
    .trim()
    .toLowerCase();
}

function normalizeImportedRow(row) {
  return Object.entries(row || {}).reduce((normalizedRow, [key, value]) => {
    const normalizedKey = normalizeColumnName(key);
    if (!normalizedKey) return normalizedRow;
    normalizedRow[normalizedKey] = value;
    return normalizedRow;
  }, {});
}

function getRowValue(row, possibleKeys) {
  for (const key of possibleKeys) {
    const value = row[normalizeColumnName(key)];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return "";
}

function getRowPhoneValue(row) {
  return getRowValue(row, ["numara", "number", "phone"]);
}

function isTagColumnKey(key) {
  const keyLower = normalizeColumnName(key);
  return keyLower.startsWith("etiket") || keyLower.startsWith("tag");
}

/* ==== Settings (selector) ==== */

const DEFAULT_SETTINGS = {
  sendButtonSelector: 'span[data-icon="wds-ic-send-filled"]',
  // Master privacy mode
  blurChat: false,
  // What to blur when privacy mode is ON
  blurChatList: true,
  blurChatContent: false,
  onlyNewContacts: false
};

let userSettings = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;

function loadSettings() {
  if (settingsLoaded) return;
  try {
    const raw = localStorage.getItem("wpSenderSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        userSettings = { ...DEFAULT_SETTINGS, ...parsed };
      }
    }
  } catch (e) {
    console.warn("Settings parse error:", e);
  }
  settingsLoaded = true;
}

function saveSettings() {
  try {
    localStorage.setItem("wpSenderSettings", JSON.stringify(userSettings));
  } catch (e) {
    console.warn("Settings save error:", e);
  }
}

/* ==== Helper: Build queue by tag ==== */

function buildQueueForTag(tag) {
  if (!tag) return [];

  return allRows
    .filter((row) => {
      const phoneRaw = getRowPhoneValue(row);
      const rawNum = phoneRaw ? phoneRaw.toString().replace(/\D/g, "") : "";
      if (rawNum.length <= 5) return false; // left the number filter as-is

      // Everyone option: all valid numbers regardless of tag
      if (tag === "__ALL__") {
        return true;
      }

      const hasTag = Object.keys(row).some((key) => {
        return isTagColumnKey(key) && String(row[key]).trim() === String(tag).trim();
      });
      return hasTag;
    })
    .map((row) => {
      const phoneRaw = getRowPhoneValue(row);
      return {
        phone: phoneRaw ? phoneRaw.toString().replace(/\D/g, "") : "",
        ad: getRowValue(row, ["ad", "firstname"]),
        soyad: getRowValue(row, ["soyad", "lastname"]),
        hitap: getRowValue(row, ["hitap", "salutation"])
      };
    });
}

function createPreviewContact(person) {
  if (!person) return null;

  const digits = String(person.phone || "").replace(/\D/g, "");
  return {
    name: person.ad || "Sin nombre",
    phoneTail: digits ? `***${digits.slice(-3)}` : "***"
  };
}

function getDefaultPreviewQueue() {
  return buildQueueForTag("__ALL__");
}

/* ==== Panel Injection ==== */

function injectPanel() {
  const sidebar = document.getElementById("side");
  if (!sidebar) {
    setTimeout(injectPanel, 1000);
    return;
  }

  if (document.getElementById("wp-custom-panel")) return;

  loadSettings();

  const logoUrl = chrome.runtime.getURL('icon.png');

  const panel = document.createElement("div");
  panel.id = "wp-custom-panel";
  panel.className = "minimized";

  panel.innerHTML = `
    <div class="wp-shell">
      <div class="wp-header" id="wp-header-trigger">
        <div class="wp-header-left">
          <div class="wp-avatar">
             <img src="${logoUrl}" alt="logo">
          </div>
          <div class="wp-header-text">
            <div class="wp-header-title">Envío masivo de WhatsApp</div>
            <div class="wp-header-sub">
              <span class="wp-status-dot" id="wp-dot"></span>
              <span id="wp-status">Listo.</span>
            </div>
            <div class="wp-signature">Desarrollado por DA Studios</div>
          </div>
        </div>
        <button class="wp-header-toggle" type="button">
          <span id="wp-toggle-icon">▼</span>
        </button>
      </div>

      <div class="wp-content-area">
        <!-- Top intro card -->
        <section class="wp-card wp-card-intro">
          <div class="wp-card-intro-main">
            <div class="wp-card-intro-title">Panel de envíos masivos</div>
            <div class="wp-card-intro-sub">Importa contactos desde un archivo XLS, XLSX o CSV, elige una etiqueta, escribe el mensaje y envíalo automáticamente.</div>
          </div>
          <div class="wp-card-intro-pill">v2.0</div>
        </section>

        <!-- Step 1 + Step 2 side by side -->
        <div class="wp-grid-2">
          <!-- Step 1: Contact file -->
          <section class="wp-card">
            <div class="wp-card-head">
              <div class="wp-card-head-left">
                <span class="wp-card-title">Archivo de contactos</span>
                <span class="wp-card-sub">Tu lista de contactos en formato .xls, .xlsx o .csv</span>
              </div>
              <span class="wp-step-pill">1</span>
            </div>

            <div class="wp-file-row">
              <label class="wp-file-btn" style="cursor:pointer;">
                Elegir archivo
                <input type="file" id="wp-file" accept=".xls,.xlsx,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
              </label>
              <button type="button" id="wp-file-reset" class="wp-file-reset-btn">Limpiar</button>
            </div>
            <div class="wp-file-name" id="wp-file-info">Ningún archivo seleccionado.</div>
          </section>

          <!-- Step 2: Tag -->
          <section class="wp-card">
            <div class="wp-card-head">
              <div class="wp-card-head-left">
                <span class="wp-card-title">Público objetivo</span>
                <span class="wp-card-sub">Puedes filtrar por etiqueta</span>
              </div>
              <span class="wp-step-pill">2</span>
            </div>

            <select id="wp-tag-select" class="wp-select" disabled>
              <option value="">Esperando archivo...</option>
            </select>
          </section>
        </div>

        <!-- Step 3: Message -->
        <section class="wp-card">
          <div class="wp-card-head">
            <div class="wp-card-head-left">
              <span class="wp-card-title">Contenido del mensaje</span>
              <span class="wp-card-sub">Personaliza con nombre, apellido y saludo</span>
            </div>
            <span class="wp-step-pill">3</span>
          </div>

          <div class="wp-tag-container">
            <button class="wp-tag-btn" data-ins="{{Salutation}}">Saludo</button>
            <button class="wp-tag-btn" data-ins="{{FirstName}}">Nombre</button>
            <button class="wp-tag-btn" data-ins="{{LastName}}">Apellido</button>
          </div>
          <div id="wp-messages" class="wp-messages">
            <textarea id="wp-msg-1" class="wp-textarea wp-msg-input" placeholder="Escribe el mensaje 1..."></textarea>
          </div>
          <div class="wp-msg-actions">
            <button type="button" id="wp-add-msg" class="wp-settings-btn">Agregar mensaje</button>
            <button type="button" id="wp-remove-msg" class="wp-settings-btn wp-settings-btn-secondary">Eliminar último</button>
            <span class="wp-msg-count" id="wp-msg-count">1 / 10</span>
          </div>

          <div class="wp-media-box">
            <div class="wp-media-head">
              <span class="wp-card-title">Imagen opcional</span>
              <span class="wp-card-sub">Se enviara la misma imagen a todos los contactos</span>
            </div>
            <div class="wp-file-row">
              <label class="wp-file-btn" style="cursor:pointer;">
                Elegir imagen
                <input type="file" id="wp-image-file" accept="image/*" />
              </label>
              <button type="button" id="wp-image-reset" class="wp-file-reset-btn">Limpiar</button>
            </div>
            <div class="wp-file-name" id="wp-image-info">Sin imagen seleccionada.</div>
          </div>
        </section>

        <!-- Step 4: Timing -->
        <section class="wp-card">
          <div class="wp-card-head">
            <div class="wp-card-head-left">
              <span class="wp-card-title">Velocidad de envío</span>
              <span class="wp-card-sub">Retraso aleatorio entre mensajes</span>
            </div>
            <span class="wp-step-pill">4</span>
          </div>

          <div class="wp-time-grid">
            <div class="wp-time-item">
              <label class="wp-label-small">Mínimo (min.)</label>
              <input type="number" id="wp-min" value="${DEFAULT_MIN_MINUTES}" min="0.1" max="120" step="0.1" class="wp-input" />
            </div>
            <div class="wp-time-item">
              <label class="wp-label-small">Máximo (min.)</label>
              <input type="number" id="wp-max" min="0.1" max="120" step="0.1" value="${DEFAULT_MAX_MINUTES}" class="wp-input" />
            </div>
          </div>
        </section>

        <!-- Step 5: Send Mode -->
        <section class="wp-card">
          <div class="wp-card-head">
            <div class="wp-card-head-left">
              <span class="wp-card-title">Modo de envío</span>
              <span class="wp-card-sub">Elige quién recibe los mensajes</span>
            </div>
            <span class="wp-step-pill">5</span>
          </div>

          <div class="wp-radio-group" id="wp-send-mode">
            <label class="wp-radio-option">
              <input type="radio" name="wp-send-mode" value="all" />
              <span>Todos los contactos</span>
            </label>
            <label class="wp-radio-option">
              <input type="radio" name="wp-send-mode" value="new-only" />
              <span>Solo contactos nuevos (omitir chats existentes)</span>
            </label>
          </div>
        </section>

        <!-- Advanced Settings -->
        <section class="wp-card">
          <div class="wp-card-head wp-card-head-settings">
            <div class="wp-card-head-left">
              <span class="wp-card-title">Configuración avanzada</span>
              <span class="wp-card-sub">Si el botón deja de funcionar tras una actualización de WhatsApp</span>
            </div>
            <button type="button" class="wp-settings-toggle" id="wp-settings-toggle">
              Avanzado
              <span class="wp-settings-chevron">▼</span>
            </button>
          </div>
          <div class="wp-settings-body" id="wp-settings-body">
            <div class="wp-settings-grid-single">
              
              <!-- Chat Privacy -->
              <div class="wp-settings-item" style="grid-column: span 2; margin-bottom: 4px;">
                <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--wp-text-main); cursor:pointer;">
                  <input type="checkbox" id="wp-blur-chat" />
                  Modo privacidad (desenfoque)
                </label>
              </div>

              <div class="wp-settings-item">
                <label style="display:flex; align-items:center; gap:6px; font-size:10px; color:var(--wp-text-main); cursor:pointer;">
                  <input type="checkbox" id="wp-blur-chat-list" />
                  Desenfocar lista de chats
                </label>
              </div>

              <div class="wp-settings-item">
                <label style="display:flex; align-items:center; gap:6px; font-size:10px; color:var(--wp-text-main); cursor:pointer;">
                  <input type="checkbox" id="wp-blur-chat-content" />
                  Desenfocar contenido del chat
                </label>
              </div>

              <div class="wp-settings-item">
                <label class="wp-label-small">Selector del botón de envío</label>
                <input type="text" id="wp-send-selector" class="wp-input" />
              </div>
              <div class="wp-settings-actions">
                <button type="button" id="wp-settings-save" class="wp-settings-btn">Guardar</button>
                <button type="button" id="wp-settings-reset" class="wp-settings-btn wp-settings-btn-secondary">Restablecer</button>
              </div>
              <p class="wp-settings-hint">
                Cambia esto solo si es necesario. La configuración predeterminada suele ser suficiente.
              </p>
            </div>
          </div>
        </section>

        <!-- Actions + Status -->
        <div class="wp-actions-group">
          <div class="wp-actions">
            <button id="wp-start" class="wp-btn-main" disabled>INICIAR</button>
            <button id="wp-stop" class="wp-btn-main wp-btn-stop">DETENER</button>
          </div>

          <div class="wp-status-bar">
            <span class="wp-status-dot" id="wp-dot-detail"></span>
            <div class="wp-status-copy">
              <span id="wp-status-detail">Listo.</span>
              <span id="wp-next-contact" class="wp-next-contact">Siguiente: sin cola pendiente.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  sidebar.prepend(panel);
  setupEvents();
  toggleButtons(false);

  // Apply privacy filters
  applyPrivacyFilters();

  // Try to add the header button
  injectHeaderButton();

  if (pendingBackgroundState) {
    applyBackgroundState(pendingBackgroundState);
  } else {
    syncBackgroundState();
  }
}

/* ==== Header Button (Quick Toggle) ==== */

function injectHeaderButton() {
  if (document.getElementById("wp-header-toggle-btn")) return;

  // Strategy: find the "New Chat" icon, then go to its button and container.
  // data-icon="new-chat-outline" or "chat" (older versions)
  const newChatIcon = document.querySelector('span[data-icon="new-chat-outline"]');

  if (!newChatIcon) return;

  // Icon -> Button -> Wrapper Div -> Main Container
  // HTML structure: Container > Div > Span > Button > Div > ...
  // We need the outermost wrapper that contains the Button.
  // closest('div[role="button"]') or a button tag.

  const newChatBtn = newChatIcon.closest('button') || newChatIcon.closest('[role="button"]');
  if (!newChatBtn) return;

  // Find the div that is the button's parent (the flex item)
  // Typically the div 2-3 levels up is a sibling of the other buttons.
  // HTML: Container > Div > Span > Button.
  // So: Button.parentElement (Span) -> Span.parentElement (Div) -> Div.parentElement (Container)

  // Safe traversal:
  const btnContainer = newChatBtn.parentElement?.parentElement; // Span > Div
  if (!btnContainer) return;

  const mainContainer = btnContainer.parentElement;
  if (!mainContainer) return;

  // Create the button
  const btn = document.createElement("button");
  btn.id = "wp-header-toggle-btn";
  btn.className = "wp-header-btn";
  btn.title = "Modo privacidad (desenfoque)";
  // Margin to match the WA header style
  btn.style.marginRight = "10px";

  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="24" height="24">
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/>
    </svg>
  `;

  btn.onclick = () => {
    userSettings.blurChat = !userSettings.blurChat;
    saveSettings();
    applyPrivacyFilters();

    const cb = document.getElementById("wp-blur-chat");
    if (cb) cb.checked = userSettings.blurChat;
  };

  // Insert into the main container, before the New Chat button container
  mainContainer.insertBefore(btn, btnContainer);

  updateHeaderButtonState();
}

function updateHeaderButtonState() {
  const btn = document.getElementById("wp-header-toggle-btn");
  if (!btn) return;

  // Change color when active
  if (userSettings.blurChat) {
    btn.classList.add("active");
    // We could use a slashed-eye icon, but color change is enough
  } else {
    btn.classList.remove("active");
  }
}

function applyPrivacyFilters() {
  const privacyOn = !!userSettings.blurChat;
  document.body.classList.toggle(
    "wp-blur-chats",
    privacyOn && !!userSettings.blurChatList
  );
  document.body.classList.toggle(
    "wp-blur-chat-content",
    privacyOn && !!userSettings.blurChatContent
  );
  updateHeaderButtonState();
}


/* ==== Events ==== */

function setupEvents() {
  const panel = document.getElementById("wp-custom-panel");
  const headerTrigger = document.getElementById("wp-header-trigger");

  const fileInput = document.getElementById("wp-file");
  const fileResetBtn = document.getElementById("wp-file-reset");
  const imageInput = document.getElementById("wp-image-file");
  const imageResetBtn = document.getElementById("wp-image-reset");
  const imageInfo = document.getElementById("wp-image-info");
  const tagSelect = document.getElementById("wp-tag-select");
  const startBtn = document.getElementById("wp-start");
  const stopBtn = document.getElementById("wp-stop");
  const messagesContainer = document.getElementById("wp-messages");
  const addMsgBtn = document.getElementById("wp-add-msg");
  const removeMsgBtn = document.getElementById("wp-remove-msg");
  const msgCountEl = document.getElementById("wp-msg-count");

  let activeMsgInput = null;
  const MAX_MESSAGES = 10;

  const attachMsgInputEvents = (input) => {
    input.addEventListener("focus", () => {
      activeMsgInput = input;
    });
  };

  const getMsgInputs = () =>
    Array.from(document.querySelectorAll(".wp-msg-input"));

  const updateMsgCount = () => {
    const count = getMsgInputs().length;
    if (msgCountEl) msgCountEl.innerText = `${count} / ${MAX_MESSAGES}`;
    if (addMsgBtn) addMsgBtn.disabled = count >= MAX_MESSAGES;
    if (removeMsgBtn) removeMsgBtn.disabled = count <= 1;
  };

  const createMessageInput = (index) => {
    const textarea = document.createElement("textarea");
    textarea.className = "wp-textarea wp-msg-input";
    textarea.placeholder = `Escribe el mensaje ${index}...`;
    attachMsgInputEvents(textarea);
    return textarea;
  };

  const ensureActiveMsgInput = () => {
    if (activeMsgInput) return activeMsgInput;
    const inputs = getMsgInputs();
    if (inputs.length > 0) {
      activeMsgInput = inputs[0];
    }
    return activeMsgInput;
  };

  const getMessageTemplates = () =>
    getMsgInputs()
      .map((el) => normalizeTemplateText(el.value))
      .filter((val) => val.length > 0)
      .slice(0, MAX_MESSAGES);

  // Settings panel elements
  const settingsToggle = document.getElementById("wp-settings-toggle");
  const settingsBody = document.getElementById("wp-settings-body");
  const sendSelectorInput = document.getElementById("wp-send-selector");
  const settingsSaveBtn = document.getElementById("wp-settings-save");
  const settingsResetBtn = document.getElementById("wp-settings-reset");

  // Privacy checkbox (inside Advanced Settings)
  const blurChatCb = document.getElementById("wp-blur-chat");
  const blurChatListCb = document.getElementById("wp-blur-chat-list");
  const blurChatContentCb = document.getElementById("wp-blur-chat-content");
  const sendModeRadios = document.querySelectorAll('input[name="wp-send-mode"]');

  if (blurChatCb) {
    blurChatCb.checked = userSettings.blurChat || false;
    blurChatCb.onchange = (e) => {
      userSettings.blurChat = e.target.checked;
      saveSettings();
      applyPrivacyFilters();
    };
  }

  if (blurChatListCb) {
    blurChatListCb.checked = userSettings.blurChatList !== false;
    blurChatListCb.onchange = (e) => {
      userSettings.blurChatList = e.target.checked;
      saveSettings();
      applyPrivacyFilters();
    };
  }

  if (blurChatContentCb) {
    blurChatContentCb.checked = userSettings.blurChatContent || false;
    blurChatContentCb.onchange = (e) => {
      userSettings.blurChatContent = e.target.checked;
      saveSettings();
      applyPrivacyFilters();
    };
  }

  if (sendModeRadios && sendModeRadios.length > 0) {
    const currentMode = userSettings.onlyNewContacts ? "new-only" : "all";
    sendModeRadios.forEach((radio) => {
      radio.checked = radio.value === currentMode;
      radio.onchange = (e) => {
        userSettings.onlyNewContacts = e.target.value === "new-only";
        saveSettings();
      };
    });
  }

  // Initialize message inputs
  if (messagesContainer) {
    const initialInput = messagesContainer.querySelector(".wp-msg-input");
    if (initialInput) attachMsgInputEvents(initialInput);
  }

  if (addMsgBtn && messagesContainer) {
    addMsgBtn.onclick = (e) => {
      e.stopPropagation();
      const inputs = getMsgInputs();
      if (inputs.length >= MAX_MESSAGES) return;
      const textarea = createMessageInput(inputs.length + 1);
      messagesContainer.appendChild(textarea);
      updateMsgCount();
      textarea.focus();
    };
  }

  if (removeMsgBtn && messagesContainer) {
    removeMsgBtn.onclick = (e) => {
      e.stopPropagation();
      const inputs = getMsgInputs();
      if (inputs.length <= 1) return;
      const last = inputs[inputs.length - 1];
      if (last) last.remove();
      updateMsgCount();
      const remaining = getMsgInputs();
      activeMsgInput = remaining[remaining.length - 1] || null;
    };
  }

  updateMsgCount();

  // Write the default value into the selector input
  if (sendSelectorInput) {
    sendSelectorInput.value =
      userSettings.sendButtonSelector || DEFAULT_SETTINGS.sendButtonSelector;
  }

  // Accordion toggle
  headerTrigger.onclick = () => {
    panel.classList.toggle("minimized");
  };

  // Open/close Advanced Settings
  if (settingsToggle && settingsBody) {
    settingsToggle.onclick = (e) => {
      e.stopPropagation();
      const isOpen = settingsBody.classList.toggle("open");
      settingsToggle.classList.toggle("open", isOpen);
    };
  }

  // Save settings
  if (settingsSaveBtn) {
    settingsSaveBtn.onclick = (e) => {
      e.stopPropagation();
      userSettings.sendButtonSelector =
        sendSelectorInput.value.trim() || DEFAULT_SETTINGS.sendButtonSelector;
      saveSettings();
      alert("Configuración guardada.");
    };
  }

  // Reset settings
  if (settingsResetBtn) {
    settingsResetBtn.onclick = (e) => {
      e.stopPropagation();
      userSettings = { ...DEFAULT_SETTINGS };
      saveSettings();
      if (sendSelectorInput) {
        sendSelectorInput.value = userSettings.sendButtonSelector;
      }
      if (blurChatCb) blurChatCb.checked = userSettings.blurChat;
      if (blurChatListCb) blurChatListCb.checked = userSettings.blurChatList;
      if (blurChatContentCb) blurChatContentCb.checked = userSettings.blurChatContent;
      applyPrivacyFilters();
      alert("Configuración restablecida a los valores predeterminados.");
    };
  }

  // Read contacts file
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!isSupportedContactFile(file.name)) {
      fileInput.value = "";
      allRows = [];
      tagSelect.innerHTML = '<option value="">Formato no compatible</option>';
      tagSelect.disabled = true;
      document.getElementById("wp-file-info").innerText =
        "❌ Formato no compatible. Usa un archivo .xls, .xlsx o .csv.";
      startBtn.disabled = true;
      startBtn.innerText = "INICIAR";
      previewNextContact = null;
      applyBackgroundState(pendingBackgroundState);
      alert("Formato no compatible. Usa un archivo .xls, .xlsx o .csv.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (elem) => {
      try {
        const data = new Uint8Array(elem.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName || !workbook.Sheets[firstSheetName]) {
          throw new Error("No sheet found in imported file.");
        }

        allRows = XLSX.utils
          .sheet_to_json(workbook.Sheets[firstSheetName])
          .map(normalizeImportedRow);

        const tags = new Set();
        allRows.forEach((row) => {
          Object.keys(row).forEach((key) => {
            if (isTagColumnKey(key) && row[key]) {
              tags.add(String(row[key]).trim());
            }
          });
        });

        // Total numbers
        const totalNumbers = allRows.filter((row) => {
          const phoneRaw = getRowPhoneValue(row);
          const rawNum = phoneRaw ? phoneRaw.toString().replace(/\D/g, "") : "";
          return rawNum.length > 5;
        }).length;

        tagSelect.innerHTML = '<option value="">Selecciona...</option>';

        // Add tags
        tags.forEach((t) => {
          const opt = document.createElement("option");
          opt.value = t;
          opt.textContent = t;
          tagSelect.appendChild(opt);
        });

        // Everyone option
        if (totalNumbers > 0) {
          const optAll = document.createElement("option");
          optAll.value = "__ALL__";
          optAll.textContent = `Todos (${totalNumbers})`;
          tagSelect.appendChild(optAll);
          tagSelect.disabled = false;
          tagSelect.value = "__ALL__";
          startBtn.disabled = false;
          startBtn.innerText = `INICIAR (${totalNumbers})`;
        } else {
          tagSelect.disabled = true;
          startBtn.disabled = true;
          startBtn.innerText = "INICIAR";
        }

        document.getElementById("wp-file-info").innerText =
          totalNumbers > 0
            ? `✅ ${file.name}: ${totalNumbers} números válidos.`
            : "No se encontraron números válidos.";
        previewNextContact = createPreviewContact(getDefaultPreviewQueue()[0] || null);
        applyBackgroundState(pendingBackgroundState);
      } catch (err) {
        console.error(err);
        allRows = [];
        tagSelect.innerHTML = '<option value="">No se pudo leer el archivo</option>';
        tagSelect.disabled = true;
        document.getElementById("wp-file-info").innerText =
          "❌ No se pudo leer el archivo. Verifica que sea .xls, .xlsx o .csv.";
        startBtn.disabled = true;
        startBtn.innerText = "INICIAR";
        previewNextContact = null;
        applyBackgroundState(pendingBackgroundState);
        alert("No se pudo leer el archivo. Verifica que sea .xls, .xlsx o .csv.");
      }
    };
    reader.readAsArrayBuffer(file);
  });

  if (imageInput) {
    imageInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0] || null;
      selectedImageFile = file;
      if (imageInfo) {
        imageInfo.innerText = file
          ? `🖼 ${file.name}`
          : "Sin imagen seleccionada.";
      }
    });
  }

  if (imageResetBtn) {
    imageResetBtn.onclick = (e) => {
      e.stopPropagation();
      selectedImageFile = null;
      if (imageInput) imageInput.value = "";
      if (imageInfo) imageInfo.innerText = "Sin imagen seleccionada.";
    };
  }

  // Clear contacts file
  if (fileResetBtn) {
    fileResetBtn.onclick = (e) => {
      e.stopPropagation();
      fileInput.value = "";
      allRows = [];
      tagSelect.innerHTML = '<option value="">Esperando archivo...</option>';
      tagSelect.disabled = true;
      document.getElementById("wp-file-info").innerText = "Ningún archivo seleccionado.";
      startBtn.disabled = true;
      startBtn.innerText = "INICIAR";
      previewNextContact = null;
      applyBackgroundState(pendingBackgroundState);
    };
  }

  // Tag selection
  tagSelect.addEventListener("change", () => {
    const tag = tagSelect.value;
    const queue = buildQueueForTag(tag);
    const count = queue.length;

    startBtn.disabled = count === 0;
    startBtn.innerText = count > 0 ? `INICIAR (${count})` : "INICIAR";
    previewNextContact = createPreviewContact(queue[0] || getDefaultPreviewQueue()[0] || null);
    applyBackgroundState(pendingBackgroundState);
  });

  // Variable buttons (add one space at the end)
  document.querySelectorAll(".wp-tag-btn").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const ins = btn.getAttribute("data-ins") || "";
      const toInsert = ins + " ";
      const target = ensureActiveMsgInput();
      if (!target) return;
      target.setRangeText(
        toInsert,
        target.selectionStart,
        target.selectionEnd,
        "end"
      );
      target.focus();
    };
  });

  // START
  startBtn.onclick = async (e) => {
    e.stopPropagation();

    if (isRunning) {
      alert("Ya hay un proceso de envío en ejecución.");
      return;
    }

    const tag = tagSelect.value;
    const messages = getMessageTemplates();

    if (!tag || messages.length === 0) {
      alert("Debes seleccionar una etiqueta y escribir al menos un mensaje.");
      return;
    }

    const queue = buildQueueForTag(tag);

    if (queue.length === 0) {
      alert("No se encontraron números para esta etiqueta.");
      return;
    }

    // Minimize the panel as soon as we start
    const p = document.getElementById("wp-custom-panel");
    if (p && !p.classList.contains("minimized")) {
      p.classList.add("minimized");
    }

    try {
      setStatus("Preparando cola...");

      const minMinutes = parseMinutesInput(
        document.getElementById("wp-min")?.value,
        DEFAULT_MIN_MINUTES
      );
      const maxMinutes = Math.max(
        minMinutes,
        parseMinutesInput(document.getElementById("wp-max")?.value, DEFAULT_MAX_MINUTES)
      );

      const minInput = document.getElementById("wp-min");
      const maxInput = document.getElementById("wp-max");
      if (minInput) minInput.value = String(minMinutes);
      if (maxInput) maxInput.value = String(maxMinutes);

      const imagePayload = selectedImageFile
        ? await fileToImagePayload(selectedImageFile)
        : null;

      const response = await sendRuntimeMessage({
        type: "WP_START_SENDING",
        payload: {
          queue,
          msgTemplates: messages,
          imagePayload,
          minTime: minutesToSeconds(minMinutes),
          maxTime: minutesToSeconds(maxMinutes),
          sendButtonSelector:
            userSettings.sendButtonSelector || DEFAULT_SETTINGS.sendButtonSelector,
          onlyNewContacts: !!userSettings.onlyNewContacts
        }
      });

      if (!response?.ok) {
        throw new Error(response?.error || "No se pudo iniciar el proceso.");
      }

      applyBackgroundState(response.state);
    } catch (error) {
      console.error("Could not start sending process:", error);
      setStatus("❌ No se pudo iniciar.");
      toggleButtons(false);
      alert(error.message || "No se pudo iniciar el proceso.");
    }
  };

  // STOP
  stopBtn.onclick = async (e) => {
    e.stopPropagation();

    try {
      const response = await sendRuntimeMessage({ type: "WP_STOP_SENDING" });
      if (response?.state) {
        applyBackgroundState(response.state);
      } else {
        applyBackgroundState({
          isRunning: false,
          status: "⛔ Proceso detenido."
        });
      }
    } catch (error) {
      console.error("Could not stop sending process:", error);
      applyBackgroundState({
        isRunning: false,
        status: "⛔ Proceso detenido."
      });
    }
  };
}

/* ==== Sending Engine ==== */

async function processQueueItem(payload) {
  const {
    person,
    position,
    totalCount,
    selectedTemplate,
    imagePayload,
    sendButtonSelector,
    onlyNewContacts
  } = payload || {};

  if (!person?.phone) {
    return {
      status: "error",
      message: "❌ Contacto inválido."
    };
  }

  const baseUrl = `https://web.whatsapp.com/send?phone=${encodeURIComponent(
    person.phone
  )}`;
  const personLabel = formatPersonLabel(person);

  setStatus(`Preparando (${position}/${totalCount}): ${personLabel}`);

  const link = document.createElement("a");
  link.href = baseUrl;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  const chatReady = await waitForChatReady(12000);
  if (!chatReady) {
    const message = `❌ Chat no disponible: ${personLabel}`;
    setStatus(message);
    return {
      status: "error",
      message
    };
  }

  try {
    let skip = false;

    if (onlyNewContacts) {
      setStatus(`Revisando historial (${position}/${totalCount}): ${personLabel}`);
      const hasHistory = hasExistingMessages();
      if (hasHistory) {
        skip = true;
        const message = `⏭ Omitido (chat existente): ${personLabel}`;
        setStatus(message);
        return {
          status: "skipped",
          message
        };
      }
    }

    if (!skip) {
      const selector = sendButtonSelector || DEFAULT_SETTINGS.sendButtonSelector;
      let text = String(selectedTemplate || "")
        .replace(/{{Ad}}/g, person.ad)
        .replace(/{{Soyad}}/g, person.soyad)
        .replace(/{{Hitap}}/g, person.hitap || "")
        .replace(/{{FirstName}}/g, person.ad)
        .replace(/{{LastName}}/g, person.soyad)
        .replace(/{{Salutation}}/g, person.hitap || "");

      if (imagePayload?.dataUrl) {
        const imageFile = imagePayloadToFile(imagePayload);
        if (imageFile) {
          setStatus(`Adjuntando imagen (${position}/${totalCount}): ${personLabel}`);
          const imageSent = await sendImageAttachment(imageFile, selector);
          if (!imageSent) {
            console.warn("Image could not be sent for:", personLabel);
            setStatus(`⚠️ Imagen no enviada, continuando con texto: ${personLabel}`);
            await sleep(1200);
          }
        }
      }

      let sendBtn = null;
      const msgInput = await waitForMessageInput(10000);

      if (msgInput) {
        setMessageInputText(msgInput, text);
        await sleep(200);
        sendBtn = await waitForVisibleSendButton(selector, 12000, {
          requireFooter: true
        });
      } else {
        const urlWithText = `${baseUrl}&text=${encodeURIComponent(text)}`;
        const fallbackLink = document.createElement("a");
        fallbackLink.href = urlWithText;
        fallbackLink.style.display = "none";
        document.body.appendChild(fallbackLink);
        fallbackLink.click();
        document.body.removeChild(fallbackLink);

        const chatReadyWithText = await waitForChatReady(12000);
        if (!chatReadyWithText) {
          const message = `❌ Chat no disponible: ${personLabel}`;
          setStatus(message);
          return {
            status: "error",
            message
          };
        }

        sendBtn = await waitForVisibleSendButton(selector, 12000, {
          requireFooter: true
        });
      }

      if (sendBtn) {
        sendBtn.click();
        const message = `✅ ${position}/${totalCount} - ${personLabel}`;
        setStatus(message);
        return {
          status: "sent",
          message
        };
      }
    }

    const message = `❌ Botón no encontrado: ${personLabel}`;
    setStatus(message);
    console.warn("Send button not found for:", personLabel);
    return {
      status: "error",
      message
    };
  } catch (e) {
    console.error("Error clicking send button:", e);
    const message = `❌ Error: ${personLabel}`;
    setStatus(message);
    return {
      status: "error",
      message
    };
  }
}

/* ==== Helpers ==== */

function normalizeTemplateText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function parseMinutesInput(value, fallbackMinutes) {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) return fallbackMinutes;
  return Math.min(Math.max(parsed, 0.1), 120);
}

function minutesToSeconds(minutes) {
  return Math.max(1, Math.round(Number(minutes) * 60));
}

function formatNextContact(nextContact) {
  if (!nextContact?.name && !nextContact?.phoneTail) {
    return "Siguiente: sin cola pendiente.";
  }

  const name = nextContact.name || "Sin nombre";
  const phoneTail = nextContact.phoneTail || "***";
  return `Siguiente: ${name} (${phoneTail})`;
}

function formatPersonLabel(person) {
  if (!person) return "Contacto sin datos";

  const displayName = String(person.ad || "").trim();
  if (displayName) return displayName;

  const digits = String(person.phone || "").replace(/\D/g, "");
  if (digits) return `***${digits.slice(-3)}`;

  return "Contacto sin datos";
}

function clearCountdownTimer() {
  if (!countdownTimerId) return;
  window.clearInterval(countdownTimerId);
  countdownTimerId = null;
}

function formatCountdownStatus(baseStatus, nextRunAt) {
  if (!nextRunAt) return baseStatus || "Listo.";

  const secondsLeft = Math.max(0, Math.ceil((nextRunAt - Date.now()) / 1000));

  if (baseStatus.startsWith("⏳ Esperando")) {
    return `⏳ Esperando: ${secondsLeft}s`;
  }

  if (baseStatus.startsWith("⏳ Pausa")) {
    return `⏳ Pausa: ${secondsLeft}s`;
  }

  if (baseStatus.startsWith("⏳ Esperando a que WhatsApp Web esté lista")) {
    return `⏳ Esperando a que WhatsApp Web esté lista... ${secondsLeft}s`;
  }

  return baseStatus || "Listo.";
}

function updateDisplayedStatusFromState(state) {
  if (!state) {
    setStatus("Listo.");
    return;
  }

  setStatus(formatCountdownStatus(state.status || "Listo.", state.nextRunAt));
}

function syncCountdownDisplay(state) {
  clearCountdownTimer();
  updateDisplayedStatusFromState(state);

  if (!state?.isRunning || !state?.nextRunAt) return;

  const shouldCount =
    typeof state.status === "string" &&
    (
      state.status.startsWith("⏳ Esperando") ||
      state.status.startsWith("⏳ Pausa") ||
      state.status.startsWith("⏳ Esperando a que WhatsApp Web esté lista")
    );

  if (!shouldCount) return;

  countdownTimerId = window.setInterval(() => {
    updateDisplayedStatusFromState(pendingBackgroundState);

    if (!pendingBackgroundState?.nextRunAt || Date.now() >= pendingBackgroundState.nextRunAt) {
      clearCountdownTimer();
    }
  }, 1000);
}

function getMessageInput() {
  return (
    document.querySelector('#main footer div[contenteditable="true"]') ||
    document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
    document.querySelector('div[contenteditable="true"][data-tab="6"]') ||
    document.querySelector('div[contenteditable="true"][role="textbox"]')
  );
}

function waitForMessageInput(timeout) {
  return new Promise((resolve) => {
    const elNow = getMessageInput();
    if (elNow) return resolve(elNow);

    const observer = new MutationObserver(() => {
      const el = getMessageInput();
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

function setMessageInputText(input, text) {
  if (!input) return;
  input.focus();
  input.textContent = "";
  let inserted = false;
  if (document.execCommand) {
    inserted = document.execCommand("insertText", false, text);
  }
  if (!inserted) {
    input.textContent = text;
    const evt =
      typeof InputEvent === "function"
        ? new InputEvent("input", { bubbles: true })
        : new Event("input", { bubbles: true });
    input.dispatchEvent(evt);
  }
}

function hasExistingMessages() {
  const main = document.getElementById("main");
  if (!main) return false;
  const selectors = [
    "[data-pre-plain-text]",
    ".message-in",
    ".message-out",
    '[data-testid="msg-container"]'
  ];
  return selectors.some((sel) => main.querySelector(sel));
}

function setStatus(msg) {
  const headerStatus = document.getElementById("wp-status");
  const detailStatus = document.getElementById("wp-status-detail");
  const headerDot = document.getElementById("wp-dot");
  const detailDot = document.getElementById("wp-dot-detail");

  if (headerStatus) headerStatus.innerText = msg;
  if (detailStatus) detailStatus.innerText = msg;

  const isActive =
    msg.includes("Preparando") ||
    msg.includes("Revisando") ||
    msg.includes("Adjuntando") ||
    msg.includes("Enviando") ||
    msg.includes("Esperando") ||
    msg.includes("Pausa");

  if (headerDot) headerDot.classList.toggle("active", isActive);
  if (detailDot) detailDot.classList.toggle("active", isActive);
}

function setNextContactStatus(nextContact) {
  const nextContactEl = document.getElementById("wp-next-contact");
  if (!nextContactEl) return;
  nextContactEl.innerText = formatNextContact(nextContact);
}

function toggleButtons(active) {
  isRunning = active;
  const startBtn = document.getElementById("wp-start");
  const stopBtn = document.getElementById("wp-stop");
  if (!startBtn || !stopBtn) return;

  startBtn.style.display = active ? "none" : "block";
  stopBtn.style.display = active ? "block" : "none";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitForElement(selector, timeout) {
  return new Promise((resolve) => {
    const elNow = document.querySelector(selector);
    if (elNow) return resolve(elNow);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

function isVisibleElement(el) {
  if (!el || !(el instanceof Element)) return false;
  const style = window.getComputedStyle(el);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    el.getClientRects().length > 0
  );
}

function isChatReady() {
  const main = document.getElementById("main");
  if (!main) return false;
  return !!(getMessageInput() || main.querySelector("footer"));
}

function waitForChatReady(timeout = 12000) {
  return new Promise((resolve) => {
    if (isChatReady()) return resolve(true);

    const observer = new MutationObserver(() => {
      if (isChatReady()) {
        observer.disconnect();
        resolve(true);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(isChatReady());
    }, timeout);
  });
}

function findAttachmentButton() {
  const selectors = [
    'button[title="Attach"]',
    'button[title="Adjuntar"]',
    'button[title="Anexar"]',
    'button[aria-label="Attach"]',
    'button[aria-label="Adjuntar"]',
    'button[aria-label="Anexar"]',
    '[data-icon="plus-rounded"]',
    '[data-icon="clip"]'
  ];

  for (const selector of selectors) {
    const candidate =
      document.querySelector(selector)?.closest("button") ||
      document.querySelector(selector);
    if (isVisibleElement(candidate)) {
      return candidate;
    }
  }

  return null;
}

function findMediaFileInput() {
  const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
  return (
    inputs.find((input) => {
      if (input.id === "wp-image-file" || input.closest("#wp-custom-panel")) {
        return false;
      }
      const accept = (input.getAttribute("accept") || "").toLowerCase();
      return accept.includes("image");
    }) || null
  );
}

function setFileInputFile(input, file) {
  if (!input || !file) return false;

  try {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch (e) {
    console.error("Could not set media input file:", e);
    return false;
  }
}

function waitForMediaFileInput(timeout = 8000) {
  return new Promise((resolve) => {
    const currentInput = findMediaFileInput();
    if (currentInput) return resolve(currentInput);

    const observer = new MutationObserver(() => {
      const input = findMediaFileInput();
      if (input) {
        observer.disconnect();
        resolve(input);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

function getAnyVisibleSendButton(selector, options = {}) {
  const { excludeFooter = false, requireFooter = false } = options;
  const buttons = Array.from(document.querySelectorAll(selector));
  return (
    buttons.find((btn) => {
      const clickTarget =
        btn.closest("button") ||
        btn.closest('[role="button"]') ||
        btn;

      if (!isVisibleElement(clickTarget) || clickTarget.closest("#wp-custom-panel")) {
        return false;
      }

      const isFooterButton = !!clickTarget.closest("footer");
      if (excludeFooter && isFooterButton) {
        return false;
      }

      if (requireFooter && !isFooterButton) {
        return false;
      }

      return true;
    }) || null
  );
}

async function waitForVisibleSendButton(selector, timeout = 10000, options = {}) {
  const currentButton = getAnyVisibleSendButton(selector, options);
  if (currentButton) return currentButton;

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const btn = getAnyVisibleSendButton(selector, options);
      if (btn) {
        observer.disconnect();
        resolve(btn);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

async function sendImageAttachment(file, sendButtonSelector) {
  const attachmentButton = findAttachmentButton();
  if (!attachmentButton) return false;

  attachmentButton.click();
  await sleep(250);

  const mediaInput = await waitForMediaFileInput(8000);
  if (!mediaInput) return false;

  const fileAssigned = setFileInputFile(mediaInput, file);
  if (!fileAssigned) return false;

  await sleep(1500);

  const mediaSendBtn = await waitForVisibleSendButton(sendButtonSelector, 10000, {
    excludeFooter: true
  });
  if (!mediaSendBtn) return false;

  mediaSendBtn.click();
  await sleep(2500);
  return true;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      resolve(response);
    });
  });
}

function applyBackgroundState(state) {
  pendingBackgroundState = state || null;
  toggleButtons(!!pendingBackgroundState?.isRunning);
  syncCountdownDisplay(pendingBackgroundState);
  setNextContactStatus(
    pendingBackgroundState?.isRunning
      ? pendingBackgroundState?.nextContact || null
      : previewNextContact
  );
}

async function syncBackgroundState() {
  try {
    const response = await sendRuntimeMessage({ type: "WP_GET_STATE" });
    if (response?.state) {
      applyBackgroundState(response.state);
    }
  } catch (error) {
    console.warn("Could not sync background state:", error);
  }
}

function fileToImagePayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve({
        name: file.name || "image",
        type: file.type || "image/png",
        lastModified: file.lastModified || Date.now(),
        dataUrl: String(reader.result || "")
      });
    };

    reader.onerror = () => {
      reject(new Error("No se pudo leer la imagen seleccionada."));
    };

    reader.readAsDataURL(file);
  });
}

function imagePayloadToFile(imagePayload) {
  try {
    if (!imagePayload?.dataUrl) return null;

    const [header, base64] = String(imagePayload.dataUrl).split(",");
    if (!header || !base64) return null;

    const mimeMatch = header.match(/data:(.*?);base64/);
    const mimeType = imagePayload.type || mimeMatch?.[1] || "image/png";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new File([bytes], imagePayload.name || "image", {
      type: mimeType,
      lastModified: imagePayload.lastModified || Date.now()
    });
  } catch (error) {
    console.error("Could not rebuild image file:", error);
    return null;
  }
}

/* ==== Watcher ==== */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "WP_EXECUTE_SEND") {
    processQueueItem(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error("Queue item execution failed:", error);
        sendResponse({
          ok: true,
          result: {
            status: "error",
            message: "❌ Error ejecutando el envío."
          }
        });
      });
    return true;
  }

  if (message?.type === "WP_UPDATE_STATE") {
    applyBackgroundState(message.payload);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

window.addEventListener("load", injectPanel);

const observer = new MutationObserver(() => {
  if (!document.getElementById("wp-custom-panel") && document.getElementById("side")) {
    injectPanel();
  }
  // Continuously check the header button (it can disappear during WA navigation)
  if (document.getElementById("side") && !document.getElementById("wp-header-toggle-btn")) {
    injectHeaderButton();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
