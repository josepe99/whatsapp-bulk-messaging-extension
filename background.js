const TASK_STORAGE_KEY = "wpSenderTask";
const TASK_ALARM_NAME = "wpSenderNextStep";
const DEFAULT_BREAK_COUNT = 45;
const DEFAULT_BREAK_SEC = 120;
const DEFAULT_SEND_SELECTOR = 'span[data-icon="wds-ic-send-filled"]';

async function reloadWhatsAppTabs() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });

  await Promise.all(
    tabs.map(async (tab) => {
      if (typeof tab.id !== "number") return;

      try {
        await chrome.tabs.reload(tab.id);
      } catch (error) {
        // Ignore tabs that disappear while reloading.
      }
    })
  );
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getMaskedPhoneTail(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  return `***${digits.slice(-3)}`;
}

function getNextContact(task) {
  if (!task?.active || !Array.isArray(task.queue)) return null;

  const person = task.queue[task.currentIndex];
  if (!person) return null;

  return {
    name: person.ad || "Sin nombre",
    phoneTail: getMaskedPhoneTail(person.phone)
  };
}

function formatNextContactLabel(contact) {
  if (!contact) return "sin cola pendiente";
  return `${contact.name} (${contact.phoneTail})`;
}

function pickRandomTemplate(templates, previousIndex = -1) {
  if (!Array.isArray(templates) || templates.length === 0) {
    return { template: "", templateIndex: -1 };
  }

  if (templates.length === 1) {
    return { template: templates[0], templateIndex: 0 };
  }

  const candidates = templates
    .map((_, index) => index)
    .filter((index) => index !== previousIndex);

  const templateIndex = candidates[randomIntInclusive(0, candidates.length - 1)];

  return {
    template: templates[templateIndex],
    templateIndex
  };
}

async function getTask() {
  const stored = await chrome.storage.local.get(TASK_STORAGE_KEY);
  return stored[TASK_STORAGE_KEY] || null;
}

async function setTask(task) {
  await chrome.storage.local.set({ [TASK_STORAGE_KEY]: task });
}

function buildState(task) {
  const totalCount = Number(task?.totalCount) || 0;

  return {
    isRunning: !!task?.active,
    status: task?.statusMessage || "Listo.",
    currentIndex: Number(task?.currentIndex) || 0,
    totalCount,
    sentCount: Number(task?.sentCount) || 0,
    nextRunAt: Number(task?.nextRunAt) || null,
    nextContact: getNextContact(task)
  };
}

async function notifyTab(tabId, message) {
  if (typeof tabId !== "number") return false;

  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch (error) {
    return false;
  }
}

async function pushState(task) {
  if (!task) return;
  await notifyTab(task.tabId, {
    type: "WP_UPDATE_STATE",
    payload: buildState(task)
  });
}

async function scheduleNextRun(when) {
  await chrome.alarms.clear(TASK_ALARM_NAME);
  await chrome.alarms.create(TASK_ALARM_NAME, { when: Math.max(Date.now() + 50, when) });
}

function finalizeTask(task, statusMessage) {
  return {
    ...task,
    active: false,
    queue: [],
    msgTemplates: [],
    imagePayload: null,
    nextRunAt: null,
    statusMessage
  };
}

async function stopTask(statusMessage) {
  const task = await getTask();
  await chrome.alarms.clear(TASK_ALARM_NAME);

  if (!task) return { ok: true, state: buildState(null) };

  const finalTask = finalizeTask(task, statusMessage || "⛔ Proceso detenido.");
  await setTask(finalTask);
  await pushState(finalTask);

  return { ok: true, state: buildState(finalTask) };
}

async function ensureTaskAlarm() {
  const task = await getTask();
  if (!task?.active || !task.nextRunAt) return;
  await scheduleNextRun(task.nextRunAt);
}

async function handleStartSending(payload, sender) {
  const existingTask = await getTask();
  if (existingTask?.active) {
    return {
      ok: false,
      error: "Ya hay un proceso de envío en ejecución."
    };
  }

  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") {
    return {
      ok: false,
      error: "No se pudo identificar la pestaña de WhatsApp."
    };
  }

  const queue = Array.isArray(payload?.queue) ? payload.queue : [];
  const msgTemplates = Array.isArray(payload?.msgTemplates)
    ? payload.msgTemplates.filter((item) => String(item || "").trim().length > 0)
    : [];

  if (queue.length === 0 || msgTemplates.length === 0) {
    return {
      ok: false,
      error: "La cola de envío está vacía o no hay mensajes válidos."
    };
  }

  const minTime = clampNumber(payload?.minTime, 2, 3600, 2);
  const maxTime = clampNumber(payload?.maxTime, minTime, 3600, Math.max(minTime, 7));

  const task = {
    active: true,
    tabId,
    queue,
    totalCount: queue.length,
    currentIndex: 0,
    sentCount: 0,
    msgTemplates,
    imagePayload: payload?.imagePayload || null,
    minTime,
    maxTime,
    breakCount: DEFAULT_BREAK_COUNT,
    breakSec: DEFAULT_BREAK_SEC,
    sendButtonSelector: payload?.sendButtonSelector || DEFAULT_SEND_SELECTOR,
    onlyNewContacts: !!payload?.onlyNewContacts,
    lastTemplateIndex: -1,
    statusMessage: `Preparando (1/${queue.length})`,
    nextRunAt: Date.now() + 300,
    startedAt: Date.now()
  };

  await setTask(task);
  await scheduleNextRun(task.nextRunAt);
  await pushState(task);

  return { ok: true, state: buildState(task) };
}

async function handleGetState() {
  const task = await getTask();
  return { ok: true, state: buildState(task) };
}

async function executeTaskStep() {
  const task = await getTask();
  if (!task?.active) {
    await chrome.alarms.clear(TASK_ALARM_NAME);
    return;
  }

  if (task.currentIndex >= task.totalCount) {
    const finalTask = finalizeTask(task, "🎉 Proceso finalizado.");
    await setTask(finalTask);
    await pushState(finalTask);
    await chrome.alarms.clear(TASK_ALARM_NAME);
    return;
  }

  let tab;
  try {
    tab = await chrome.tabs.get(task.tabId);
  } catch (error) {
    await stopTask("⛔ La pestaña de WhatsApp ya no está disponible.");
    return;
  }

  if (!tab?.url?.startsWith("https://web.whatsapp.com/")) {
    await stopTask("⛔ La pestaña ya no está en WhatsApp Web.");
    return;
  }

  const person = task.queue[task.currentIndex];
  const selectedTemplate = pickRandomTemplate(task.msgTemplates, task.lastTemplateIndex);
  const processingTask = {
    ...task,
    lastTemplateIndex: selectedTemplate.templateIndex,
    statusMessage: `Preparando (${task.currentIndex + 1}/${task.totalCount}): ${person?.ad || person?.phone || ""}`
  };

  await setTask(processingTask);
  await pushState(processingTask);

  let response;
  try {
    response = await chrome.tabs.sendMessage(task.tabId, {
      type: "WP_EXECUTE_SEND",
      payload: {
        person,
        position: task.currentIndex + 1,
        totalCount: task.totalCount,
        selectedTemplate: selectedTemplate.template,
        imagePayload: task.imagePayload,
        sendButtonSelector: task.sendButtonSelector,
        onlyNewContacts: task.onlyNewContacts
      }
    });
  } catch (error) {
    const retryTask = {
      ...processingTask,
      statusMessage: "⏳ Esperando a que WhatsApp Web esté lista...",
      nextRunAt: Date.now() + 3000
    };
    await setTask(retryTask);
    await scheduleNextRun(retryTask.nextRunAt);
    await pushState(retryTask);
    return;
  }

  const result = response?.result || {
    status: "error",
    message: "❌ No se recibió respuesta desde la pestaña."
  };

  const nextTask = {
    ...processingTask,
    currentIndex: task.currentIndex + 1,
    sentCount: task.sentCount + (result.status === "sent" ? 1 : 0)
  };

  if (nextTask.currentIndex >= nextTask.totalCount) {
    const completedTask = finalizeTask(
      nextTask,
      nextTask.sentCount > 0 ? "🎉 Proceso finalizado." : "Proceso finalizado."
    );
    await setTask(completedTask);
    await pushState(completedTask);
    await chrome.alarms.clear(TASK_ALARM_NAME);
    return;
  }

  let delayMs = 150;
  let statusMessage = result.message || "Esperando siguiente contacto...";
  const upcomingContact = getNextContact(nextTask);

  if (result.status !== "skipped") {
    if (nextTask.breakCount > 0 && nextTask.sentCount > 0 && nextTask.sentCount % nextTask.breakCount === 0) {
      delayMs = nextTask.breakSec * 1000;
      statusMessage = `⏳ Pausa: ${nextTask.breakSec}s · Siguiente: ${formatNextContactLabel(upcomingContact)}`;
    } else {
      const waitSeconds = randomIntInclusive(nextTask.minTime, nextTask.maxTime);
      delayMs = waitSeconds * 1000;
      statusMessage = `⏳ Esperando: ${waitSeconds}s · Siguiente: ${formatNextContactLabel(upcomingContact)}`;
    }
  }

  const scheduledTask = {
    ...nextTask,
    statusMessage,
    nextRunAt: Date.now() + delayMs
  };

  await setTask(scheduledTask);
  await scheduleNextRun(scheduledTask.nextRunAt);
  await pushState(scheduledTask);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "WP_START_SENDING") {
    handleStartSending(message.payload, sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "WP_STOP_SENDING") {
    stopTask("⛔ Proceso detenido.")
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "WP_GET_STATE") {
    handleGetState()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== TASK_ALARM_NAME) return;
  executeTaskStep().catch(async () => {
    await stopTask("❌ El proceso se detuvo por un error inesperado.");
  });
});

chrome.runtime.onStartup.addListener(() => {
  ensureTaskAlarm().catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  stopTask("Listo.")
    .then(() => reloadWhatsAppTabs())
    .catch(() => {});
});

ensureTaskAlarm().catch(() => {});
