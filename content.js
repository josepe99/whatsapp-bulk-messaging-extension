// content.js - WhatsApp Bulk Message Sender (sidebar panel)

let allRows = [];
let isRunning = false;
let selectedImageFile = null;

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
      const phoneRaw = row.Numara ?? row.Number ?? row.Phone ?? "";
      const rawNum = phoneRaw ? phoneRaw.toString().replace(/\D/g, "") : "";
      if (rawNum.length <= 5) return false; // left the number filter as-is

      // Everyone option: all valid numbers regardless of tag
      if (tag === "__ALL__") {
        return true;
      }

      const hasTag = Object.keys(row).some((key) => {
        const keyLower = key.toLowerCase();
        return (
          (keyLower.startsWith("etiket") || keyLower.startsWith("tag")) &&
          String(row[key]).trim() === String(tag).trim()
        );
      });
      return hasTag;
    })
    .map((row) => {
      const phoneRaw = row.Numara ?? row.Number ?? row.Phone ?? "";
      return {
        phone: phoneRaw ? phoneRaw.toString().replace(/\D/g, "") : "",
        ad: row.Ad || row.FirstName || "",
        soyad: row.Soyad || row.LastName || "",
        hitap: row.Hitap || row.Salutation || ""
      };
    });
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
            <div class="wp-card-intro-sub">Importa contactos desde Excel, elige una etiqueta, escribe el mensaje y envíalo automáticamente.</div>
          </div>
          <div class="wp-card-intro-pill">v1.0</div>
        </section>

        <!-- Step 1 + Step 2 side by side -->
        <div class="wp-grid-2">
          <!-- Step 1: Excel -->
          <section class="wp-card">
            <div class="wp-card-head">
              <div class="wp-card-head-left">
                <span class="wp-card-title">Archivo Excel</span>
                <span class="wp-card-sub">Tu lista de contactos en formato .xlsx</span>
              </div>
              <span class="wp-step-pill">1</span>
            </div>

            <div class="wp-file-row">
              <label class="wp-file-btn" style="cursor:pointer;">
                Elegir archivo
                <input type="file" id="wp-file" accept=".xlsx" />
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
              <label class="wp-label-small">Mínimo (seg.)</label>
              <input type="number" id="wp-min" value="2" min="2" max="6" class="wp-input" />
            </div>
            <div class="wp-time-item">
              <label class="wp-label-small">Máximo (seg.)</label>
              <input type="number" id="wp-max" min="7" max="20" value="7" class="wp-input" />
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
            <span id="wp-status-detail">Listo.</span>
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
      .map((el) => (el.value || "").trim())
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

  // Read Excel
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (elem) => {
      try {
        const data = new Uint8Array(elem.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        allRows = XLSX.utils.sheet_to_json(
          workbook.Sheets[workbook.SheetNames[0]]
        );

        const tags = new Set();
        allRows.forEach((row) => {
          Object.keys(row).forEach((key) => {
            const keyLower = key.toLowerCase();
            if ((keyLower.startsWith("etiket") || keyLower.startsWith("tag")) && row[key]) {
              tags.add(String(row[key]).trim());
            }
          });
        });

        // Total numbers
        const totalNumbers = allRows.filter((row) => {
          const phoneRaw = row.Numara ?? row.Number ?? row.Phone ?? "";
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
        } else {
          tagSelect.disabled = true;
        }

        document.getElementById("wp-file-info").innerText =
          totalNumbers > 0
            ? `✅ ${totalNumbers} números válidos.`
            : "No se encontraron números válidos.";
        startBtn.disabled = true;
        startBtn.innerText = "INICIAR";
      } catch (err) {
        console.error(err);
        allRows = [];
        tagSelect.innerHTML = '<option value="">No se pudo leer el archivo</option>';
        tagSelect.disabled = true;
        document.getElementById("wp-file-info").innerText = "❌ No se pudo leer el archivo.";
        startBtn.disabled = true;
        startBtn.innerText = "INICIAR";
        alert("No se pudo leer el archivo.");
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

  // Clear Excel
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
    };
  }

  // Tag selection
  tagSelect.addEventListener("change", () => {
    const tag = tagSelect.value;
    const queue = buildQueueForTag(tag);
    const count = queue.length;

    startBtn.disabled = count === 0;
    startBtn.innerText = count > 0 ? `INICIAR (${count})` : "INICIAR";
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
  startBtn.onclick = (e) => {
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

    startSendingProcess(queue, messages, selectedImageFile);
  };

  // STOP
  stopBtn.onclick = (e) => {
    e.stopPropagation();
    isRunning = false;
    setStatus("⛔ Proceso detenido.");
    toggleButtons(false);
  };
}

/* ==== Sending Engine ==== */

async function startSendingProcess(queue, msgTemplates, imageFile) {
  isRunning = true;
  toggleButtons(true);

  const minTime = parseInt(document.getElementById("wp-min")?.value) || 5;
  const maxTime = parseInt(document.getElementById("wp-max")?.value) || 10;

  // User can't change this; fixed
  const breakCount = 45;
  const breakSec = 120;

  let sentCount = 0;

  for (let i = 0; i < queue.length; i++) {
    if (!isRunning) break;

    const person = queue[i];
    let skippedCurrentContact = false;
    const baseUrl = `https://web.whatsapp.com/send?phone=${encodeURIComponent(
      person.phone
    )}`;

    setStatus(`Preparando (${i + 1}/${queue.length}): ${person.ad}`);

    // Simulate link click
    const link = document.createElement("a");
    link.href = baseUrl;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Wait for the chat to load
    await sleep(4000);

    try {
      const selector =
        userSettings.sendButtonSelector || DEFAULT_SETTINGS.sendButtonSelector;

      let skip = false;

      if (userSettings.onlyNewContacts) {
        setStatus(`Revisando historial (${i + 1}/${queue.length}): ${person.ad}`);
        const hasHistory = hasExistingMessages();
        if (hasHistory) {
          skip = true;
          skippedCurrentContact = true;
          setStatus(`⏭ Omitido (chat existente): ${person.ad}`);
        }
      }

      if (!skip && isRunning) {
        const chosenTemplate = pickRandomTemplate(msgTemplates);
        let text = chosenTemplate
          // Turkish placeholders (backward compatible)
          .replace(/{{Ad}}/g, person.ad)
          .replace(/{{Soyad}}/g, person.soyad)
          .replace(/{{Hitap}}/g, person.hitap || "")
          // English placeholders
          .replace(/{{FirstName}}/g, person.ad)
          .replace(/{{LastName}}/g, person.soyad)
          .replace(/{{Salutation}}/g, person.hitap || "");

        if (imageFile) {
          setStatus(`Adjuntando imagen (${i + 1}/${queue.length}): ${person.ad}`);
          const imageSent = await sendImageAttachment(imageFile, selector);
          if (!imageSent) {
            console.warn("Image could not be sent for:", person.ad);
            setStatus(`⚠️ Imagen no enviada, continuando con texto: ${person.ad}`);
            await sleep(1200);
          }
        }

        let sendBtn = null;
        const msgInput = await waitForMessageInput(10000);
        if (msgInput) {
          setMessageInputText(msgInput, text);
          await sleep(200);
          sendBtn = await waitForElement(selector, 10000);
        } else {
          // Fallback: prefill via URL if input not found
          const urlWithText = `${baseUrl}&text=${encodeURIComponent(text)}`;
          const fallbackLink = document.createElement("a");
          fallbackLink.href = urlWithText;
          fallbackLink.style.display = "none";
          document.body.appendChild(fallbackLink);
          fallbackLink.click();
          document.body.removeChild(fallbackLink);
          await sleep(4000);
          sendBtn = await waitForElement(selector, 10000);
        }

        if (sendBtn && isRunning) {
          sendBtn.click();
          sentCount++;
          setStatus(`✅ ${i + 1}/${queue.length} - ${person.ad}`);
        } else {
          setStatus(`❌ Botón no encontrado: ${person.ad}`);
          console.warn("Send button not found for:", person.ad);
        }
      }
    } catch (e) {
      console.error("Error clicking send button:", e);
      setStatus(`❌ Error: ${person.ad}`);
    }

    if (!isRunning) break;

    // Do not wait after the last person
    if (i < queue.length - 1) {
      if (skippedCurrentContact) {
        continue;
      }

      if (breakCount > 0 && sentCount > 0 && sentCount % breakCount === 0) {
        await sleepCount(breakSec, "Pausa");
      } else {
        const wait = Math.floor(
          Math.random() * (maxTime - minTime + 1) + minTime
        );
        await sleepCount(wait, "Esperando");
      }
    }
  }

  isRunning = false;
  toggleButtons(false);
  if (sentCount > 0) setStatus("🎉 Proceso finalizado.");
}

/* ==== Helpers ==== */

function pickRandomTemplate(templates) {
  if (!Array.isArray(templates) || templates.length === 0) return "";
  if (templates.length === 1) return templates[0];
  const idx = Math.floor(Math.random() * templates.length);
  return templates[idx];
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

function toggleButtons(active) {
  const startBtn = document.getElementById("wp-start");
  const stopBtn = document.getElementById("wp-stop");
  if (!startBtn || !stopBtn) return;

  startBtn.style.display = active ? "none" : "block";
  stopBtn.style.display = active ? "block" : "none";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sleepCount(sec, label) {
  while (sec > 0 && isRunning) {
    setStatus(`⏳ ${label}: ${sec}`);
    await sleep(1000);
    sec--;
  }
}

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
  const { excludeFooter = false } = options;
  const buttons = Array.from(document.querySelectorAll(selector));
  return (
    buttons.find((btn) => {
      if (!isVisibleElement(btn) || btn.closest("#wp-custom-panel")) {
        return false;
      }
      if (excludeFooter && btn.closest("footer")) {
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

/* ==== Watcher ==== */

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
