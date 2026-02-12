// content.js - WhatsApp Bulk Message Sender (sidebar panel)

let allRows = [];
let isRunning = false;

/* ==== Settings (selector) ==== */

const DEFAULT_SETTINGS = {
  sendButtonSelector: 'span[data-icon="wds-ic-send-filled"]',
  blurChat: false
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
            <div class="wp-header-title">WhatsApp Bulk Message Sender</div>
            <div class="wp-header-sub">
              <span class="wp-status-dot" id="wp-dot"></span>
              <span id="wp-status">Ready.</span>
            </div>
            <div class="wp-signature">Developed by Tuna</div>
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
            <div class="wp-card-intro-title">Bulk sending panel</div>
            <div class="wp-card-intro-sub">Import contacts from Excel, pick a tag, write the message, and send automatically.</div>
          </div>
          <div class="wp-card-intro-pill">v1.0</div>
        </section>

        <!-- Step 1 + Step 2 side by side -->
        <div class="wp-grid-2">
          <!-- Step 1: Excel -->
          <section class="wp-card">
            <div class="wp-card-head">
              <div class="wp-card-head-left">
                <span class="wp-card-title">Excel File</span>
                <span class="wp-card-sub">Your contact list in .xlsx format</span>
              </div>
              <span class="wp-step-pill">1</span>
            </div>

            <div class="wp-file-row">
              <label class="wp-file-btn" style="cursor:pointer;">
                Choose File
                <input type="file" id="wp-file" accept=".xlsx" />
              </label>
              <button type="button" id="wp-file-reset" class="wp-file-reset-btn">Clear</button>
            </div>
            <div class="wp-file-name" id="wp-file-info">No file selected.</div>
          </section>

          <!-- Step 2: Tag -->
          <section class="wp-card">
            <div class="wp-card-head">
              <div class="wp-card-head-left">
                <span class="wp-card-title">Target Audience</span>
                <span class="wp-card-sub">You can filter by tag</span>
              </div>
              <span class="wp-step-pill">2</span>
            </div>

            <select id="wp-tag-select" class="wp-select" disabled>
              <option value="">Waiting for file...</option>
            </select>
          </section>
        </div>

        <!-- Step 3: Message -->
        <section class="wp-card">
          <div class="wp-card-head">
            <div class="wp-card-head-left">
              <span class="wp-card-title">Message Content</span>
              <span class="wp-card-sub">Personalize with first name, last name, and salutation</span>
            </div>
            <span class="wp-step-pill">3</span>
          </div>

          <div class="wp-tag-container">
            <button class="wp-tag-btn" data-ins="{{Salutation}}">Salutation</button>
            <button class="wp-tag-btn" data-ins="{{FirstName}}">First Name</button>
            <button class="wp-tag-btn" data-ins="{{LastName}}">Last Name</button>
          </div>
          <textarea id="wp-msg" class="wp-textarea" placeholder="Write the message to send..."></textarea>
        </section>

        <!-- Step 4: Timing -->
        <section class="wp-card">
          <div class="wp-card-head">
            <div class="wp-card-head-left">
              <span class="wp-card-title">Sending Speed</span>
              <span class="wp-card-sub">Random delay between messages</span>
            </div>
            <span class="wp-step-pill">4</span>
          </div>

          <div class="wp-time-grid">
            <div class="wp-time-item">
              <label class="wp-label-small">Minimum (sec)</label>
              <input type="number" id="wp-min" value="2" min="2" max="6" class="wp-input" />
            </div>
            <div class="wp-time-item">
              <label class="wp-label-small">Maximum (sec)</label>
              <input type="number" id="wp-max" min="7" max="20" value="7" class="wp-input" />
            </div>
          </div>
        </section>

        <!-- Advanced Settings -->
        <section class="wp-card">
          <div class="wp-card-head wp-card-head-settings">
            <div class="wp-card-head-left">
              <span class="wp-card-title">Advanced Settings</span>
              <span class="wp-card-sub">If the button stops working after a WhatsApp update</span>
            </div>
            <button type="button" class="wp-settings-toggle" id="wp-settings-toggle">
              Advanced
              <span class="wp-settings-chevron">▼</span>
            </button>
          </div>
          <div class="wp-settings-body" id="wp-settings-body">
            <div class="wp-settings-grid-single">
              
              <!-- Chat Privacy -->
              <div class="wp-settings-item" style="margin-bottom: 6px;">
                 <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--wp-text-main); cursor:pointer;">
                   <input type="checkbox" id="wp-blur-chat" />
                   Chat Privacy (Blur)
                 </label>
              </div>

              <div class="wp-settings-item">
                <label class="wp-label-small">Send button selector</label>
                <input type="text" id="wp-send-selector" class="wp-input" />
              </div>
              <div class="wp-settings-actions">
                <button type="button" id="wp-settings-save" class="wp-settings-btn">Save</button>
                <button type="button" id="wp-settings-reset" class="wp-settings-btn wp-settings-btn-secondary">Reset</button>
              </div>
              <p class="wp-settings-hint">
                Change this only if you must. The default setting will usually be enough.
              </p>
            </div>
          </div>
        </section>

        <!-- Actions + Status -->
        <div class="wp-actions-group">
          <div class="wp-actions">
            <button id="wp-start" class="wp-btn-main" disabled>START</button>
            <button id="wp-stop" class="wp-btn-main wp-btn-stop">STOP</button>
          </div>

          <div class="wp-status-bar">
            <span class="wp-status-dot" id="wp-dot-detail"></span>
            <span id="wp-status-detail">Ready.</span>
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
  btn.title = "Chat Privacy (Blur)";
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
  if (userSettings.blurChat) {
    document.body.classList.add("wp-blur-chats");
  } else {
    document.body.classList.remove("wp-blur-chats");
  }
  updateHeaderButtonState();
}


/* ==== Events ==== */

function setupEvents() {
  const panel = document.getElementById("wp-custom-panel");
  const headerTrigger = document.getElementById("wp-header-trigger");

  const fileInput = document.getElementById("wp-file");
  const fileResetBtn = document.getElementById("wp-file-reset");
  const tagSelect = document.getElementById("wp-tag-select");
  const startBtn = document.getElementById("wp-start");
  const stopBtn = document.getElementById("wp-stop");
  const msgInput = document.getElementById("wp-msg");

  // Settings panel elements
  const settingsToggle = document.getElementById("wp-settings-toggle");
  const settingsBody = document.getElementById("wp-settings-body");
  const sendSelectorInput = document.getElementById("wp-send-selector");
  const settingsSaveBtn = document.getElementById("wp-settings-save");
  const settingsResetBtn = document.getElementById("wp-settings-reset");

  // Privacy checkbox (inside Advanced Settings)
  const blurChatCb = document.getElementById("wp-blur-chat");

  if (blurChatCb) {
    blurChatCb.checked = userSettings.blurChat || false;
    blurChatCb.onchange = (e) => {
      userSettings.blurChat = e.target.checked;
      saveSettings();
      applyPrivacyFilters();
    };
  }

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
      alert("Settings saved.");
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
      alert("Settings reset to defaults.");
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

        tagSelect.innerHTML = '<option value="">Select...</option>';

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
          optAll.textContent = `Everyone (${totalNumbers})`;
          tagSelect.appendChild(optAll);
          tagSelect.disabled = false;
        } else {
          tagSelect.disabled = true;
        }

        document.getElementById("wp-file-info").innerText =
          totalNumbers > 0
            ? `✅ ${totalNumbers} numbers.`
            : "No valid numbers found.";
        startBtn.disabled = true;
        startBtn.innerText = "START";
      } catch (err) {
        console.error(err);
        allRows = [];
        tagSelect.innerHTML = '<option value="">File could not be read</option>';
        tagSelect.disabled = true;
        document.getElementById("wp-file-info").innerText = "❌ File could not be read.";
        startBtn.disabled = true;
        startBtn.innerText = "START";
        alert("File could not be read!");
      }
    };
    reader.readAsArrayBuffer(file);
  });

  // Clear Excel
  if (fileResetBtn) {
    fileResetBtn.onclick = (e) => {
      e.stopPropagation();
      fileInput.value = "";
      allRows = [];
      tagSelect.innerHTML = '<option value="">Waiting for file...</option>';
      tagSelect.disabled = true;
      document.getElementById("wp-file-info").innerText = "No file selected.";
      startBtn.disabled = true;
      startBtn.innerText = "START";
    };
  }

  // Tag selection
  tagSelect.addEventListener("change", () => {
    const tag = tagSelect.value;
    const queue = buildQueueForTag(tag);
    const count = queue.length;

    startBtn.disabled = count === 0;
    startBtn.innerText = count > 0 ? `START (${count})` : "START";
  });

  // Variable buttons (add one space at the end)
  document.querySelectorAll(".wp-tag-btn").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const ins = btn.getAttribute("data-ins") || "";
      const toInsert = ins + " ";
      msgInput.setRangeText(
        toInsert,
        msgInput.selectionStart,
        msgInput.selectionEnd,
        "end"
      );
      msgInput.focus();
    };
  });

  // START
  startBtn.onclick = (e) => {
    e.stopPropagation();

    if (isRunning) {
      alert("A sending process is already running.");
      return;
    }

    const tag = tagSelect.value;
    const msg = msgInput.value;

    if (!tag || !msg) {
      alert("Tag and message are required!");
      return;
    }

    const queue = buildQueueForTag(tag);

    if (queue.length === 0) {
      alert("No numbers found for this tag.");
      return;
    }

    // Minimize the panel as soon as we start
    const p = document.getElementById("wp-custom-panel");
    if (p && !p.classList.contains("minimized")) {
      p.classList.add("minimized");
    }

    startSendingProcess(queue, msg);
  };

  // STOP
  stopBtn.onclick = (e) => {
    e.stopPropagation();
    isRunning = false;
    setStatus("⛔ Stopped.");
    toggleButtons(false);
  };
}

/* ==== Sending Engine ==== */

async function startSendingProcess(queue, msgTemplate) {
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

    let text = msgTemplate
      // Turkish placeholders (backward compatible)
      .replace(/{{Ad}}/g, person.ad)
      .replace(/{{Soyad}}/g, person.soyad)
      .replace(/{{Hitap}}/g, person.hitap || "")
      // English placeholders
      .replace(/{{FirstName}}/g, person.ad)
      .replace(/{{LastName}}/g, person.soyad)
      .replace(/{{Salutation}}/g, person.hitap || "");

    setStatus(`Sending (${i + 1}/${queue.length}): ${person.ad}`);

    const url = `https://web.whatsapp.com/send?phone=${encodeURIComponent(
      person.phone
    )}&text=${encodeURIComponent(text)}`;

    // Simulate link click
    const link = document.createElement("a");
    link.href = url;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Wait for the chat to load
    await sleep(4000);

    try {
      const selector =
        userSettings.sendButtonSelector || DEFAULT_SETTINGS.sendButtonSelector;
      const sendBtn = await waitForElement(selector, 10000);

      if (sendBtn && isRunning) {
        sendBtn.click();
        sentCount++;
        setStatus(`✅ ${i + 1}/${queue.length} - ${person.ad}`);
      } else {
        setStatus(`❌ Button not found: ${person.ad}`);
        console.warn("Send button not found for:", person.ad);
      }
    } catch (e) {
      console.error("Error clicking send button:", e);
      setStatus(`❌ Error: ${person.ad}`);
    }

    if (!isRunning) break;

    // Do not wait after the last person
    if (i < queue.length - 1) {
      if (breakCount > 0 && sentCount > 0 && sentCount % breakCount === 0) {
        await sleepCount(breakSec, "Break");
      } else {
        const wait = Math.floor(
          Math.random() * (maxTime - minTime + 1) + minTime
        );
        await sleepCount(wait, "Waiting");
      }
    }
  }

  isRunning = false;
  toggleButtons(false);
  if (sentCount > 0) setStatus("🎉 Done!");
}

/* ==== Helpers ==== */

function setStatus(msg) {
  const headerStatus = document.getElementById("wp-status");
  const detailStatus = document.getElementById("wp-status-detail");
  const headerDot = document.getElementById("wp-dot");
  const detailDot = document.getElementById("wp-dot-detail");

  if (headerStatus) headerStatus.innerText = msg;
  if (detailStatus) detailStatus.innerText = msg;

  const isActive =
    msg.includes("Sending") ||
    msg.includes("Waiting") ||
    msg.includes("Break");

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
