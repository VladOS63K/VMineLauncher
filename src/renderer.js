"use strict";

const { ipcRenderer } = require("electron");
const path = require("path");
const fs = require("fs");
const { toBlobURL, toDataURI } = require("blob-to-url");
const { freemem, totalmem } = require("os");
const child_process = require("child_process");
const { openFileManager } = require("open-file-manager");
const StreamZip = require('node-stream-zip');

const conf = require("./config.js");
const { loadTranslations, getTranslation } = require("./lang.js");

let currentLang = "en";

let isMinecraftRunning = false;
let runningInstanceName = "";
let selectedResPack = null;

let deletingIndex = -1;
let deletingName = "";

const CHARS = "qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890";

function getRandom(max) {
  return Math.floor(Math.random() * max);
}

function randstring(len) {
  var output = "";
  for (let i = 0; i < len; i++) {
    output += CHARS[getRandom(CHARS.length)];
  }
  return output;
}

document.addEventListener("DOMContentLoaded", async () => {

  const loadingGame = document.querySelector(".loading-game");

  // Система уведомлений
  function showNotification(message, type = "info") {
    const container = document.getElementById("notification-container");
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;

    let icon = "info-circle";
    if (type === "success") icon = "check-circle";
    if (type === "error") icon = "exclamation-circle";

    notification.innerHTML = `
      <i class="fas fa-${icon}"></i>
      <span>${message}</span>
    `;

    container.appendChild(notification);
    container.scrollTo(0, container.scrollHeight);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  document.addEventListener("keydown", (ev) => {
    if (ev.ctrlKey && ev.shiftKey && ev.key == "I") {
      ipcRenderer.invoke("devtools");
    }
  });

  const allElems = document.getElementsByTagName("*");

  var mousePos;
  (function () {
    document.onmousemove = handleMouseMove;

    function handleMouseMove(event) {
      var dot, eventDoc, doc, body, pageX, pageY;

      event = event || window.event;

      if (event.pageX == null && event.clientX != null) {
        eventDoc = (event.target && event.target.ownerDocument) || document;
        doc = eventDoc.documentElement;
        body = eventDoc.body;

        //event.pageX = event.clientX +
        //  (doc && doc.scrollLeft || body && body.scrollLeft || 0) -
        //  (doc && doc.clientLeft || body && body.clientLeft || 0);
        //event.pageY = event.clientY +
        //  (doc && doc.scrollTop || body && body.scrollTop || 0) -
        //  (doc && doc.clientTop || body && body.clientTop || 0);
      }

      mousePos = {
        x: event.pageX,
        y: event.pageY
      };

      document.querySelector(".tooltip").style.left = (mousePos.x + 15) + "px";
      document.querySelector(".tooltip").style.top = (mousePos.y + 15) + "px";
    }
  })();

  // Загрузка конфигурации
  var config;
  let isConfigLoading = false;

  // Функция для отрисовки списка сборок
  async function renderBuildsList() {
    const buildsList = document.getElementById("builds-list");
    const versionSelect = document.getElementById("version-select");

    buildsList.innerHTML = "";
    versionSelect.innerHTML = "";

    const currentConfig = conf.loadConfig();
    const instances = currentConfig.instances || [];

    instances.forEach((instance, index) => {
      // Отрисовка в списке управления
      const buildItem = document.createElement("div");
      buildItem.className = "build-item";
      buildItem.innerHTML = `
        <div class="build-info">
          <div class="build-name">${instance.name}</div>
          <div class="build-version">${instance.version}</div>
        </div>
        <div class="build-actions">
          <button class="delete-btn" data-index="${index}">
            <i class="fas fa-trash"></i> <span data-transid="remove">Удалить</span>
          </button>
        </div>
      `;
      buildsList.appendChild(buildItem);

      // Отрисовка в выборе версии
      const option = document.createElement("option");
      option.value = instance.name;
      option.innerText = instance.name;
      option.dataset.version = instance.version;
      option.dataset.type = instance.type;
      versionSelect.appendChild(option);
    });

    // Обработка удаления
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const index = e.target.closest(".delete-btn").dataset.index;
        deletingIndex = index;
        deletingName = btn.closest(".build-item").querySelector(".build-info .build-name").innerText;
        document.getElementById("del-build-modal").showPopover();
      });
    });

    if (currentConfig.selectedVersion) {
      versionSelect.value = currentConfig.selectedVersion;
    }
  }

  function renderLanguages() {
    const langSelect = document.getElementById("lang-select");

    const languages = Object.values(conf.LANGUAGE_ENDPOINTS);

    languages.forEach((e) => {
      const option = document.createElement("option");
      option.innerText = e.lang;
      option.value = e.lang;

      langSelect.appendChild(option);
    });
  }

  function renderAccentColors() {
    Object.values(document.getElementById("accent-color-selector").children).forEach((e) => {
      e.addEventListener("click", () => {
        Object.values(document.getElementById("accent-color-selector").children).forEach((ee) => {
          if (ee.hasAttribute("selected")) ee.removeAttribute("selected");
        });
        e.setAttribute("selected", null);
        saveConfigSettings();
      });
    });
  }

  function renderWallpapers() {
    // Загрузка списка обоев
    const wallpapers = conf.getWallpapers();

    wallpapers.forEach((e) => {
      const option = document.createElement("option");
      option.value = e;
      option.innerText = (e.length > 30 ? e.substring(0, 30) + "..." : e);
      document.getElementById("wallpaper-select").appendChild(option);
    });
  }

  function reloadLanguage() {
    for (let i = 0; i < allElems.length; i++) {
      const elem = allElems[i];
      if (elem.dataset.tooltip && !elem.dataset.toolid) {
        elem.addEventListener("mouseenter", (e => {
          document.querySelector(".tooltip").innerText = elem.dataset.tooltip;
          document.querySelector(".tooltip").style.display = "block";
        }));
        elem.addEventListener("mouseleave", () => {
          document.querySelector(".tooltip").style = "none";
        });
      }
      else if (elem.dataset.toolid) {
        elem.addEventListener("mouseenter", (e => {
          document.querySelector(".tooltip").innerText = getTranslation(currentLang, elem.dataset.toolid);
          document.querySelector(".tooltip").style.display = "block";
        }));
        elem.addEventListener("mouseleave", () => {
          document.querySelector(".tooltip").style = "none";
        });
      }

      if (elem.dataset.transid) {
        elem.innerText = getTranslation(currentLang, elem.dataset.transid);
      }
    }
  }

  function reloadSettings() {
    isConfigLoading = true;
    config = conf.loadConfig();
    if (config.firstRun) {
      config.firstRun = false;
      conf.saveConfig(config);

      showNotification(getTranslation(currentLang, "welcome-msg"));
    }

    if (config.lang) {
      currentLang = config.lang;
      document.getElementById("lang-select").value = config.lang;
    }

    if (config.accent) {
      Object.values(document.getElementById("accent-color-selector").children).forEach((e) => {
        e.removeAttribute("selected");
        if (e.style.backgroundColor == config.accent) e.setAttribute("selected", null);
      });
      document.body.style.setProperty("--primary-color", config.accent);
    }

    if (config.wallpaper) {
      document.getElementById("wallpaper-select").value = config.wallpaper;
      document.body.style.backgroundImage = `url("file://${path.join(conf.CONFIG_DIR, "wallpapers", config.wallpaper)}")`
    }

    if (config.nickname) {
      document.getElementById("nickname").value = config.nickname;
    }

    document.getElementById("rpc-enabled").checked = config.discordRPC;

    if (config.javaPath) {
      document.getElementById("java-path").value = config.javaPath;
    }

    document.getElementById("ram-alloc").value = config.allocatedRam;

    reloadResourcePacks();
    reloadScreenshots();

    isConfigLoading = false;
  }

  // Обработка Discord RPC
  ipcRenderer.on("avatar_url", (e, msg) => {
    document.querySelector(".user").querySelector("img").src = msg;
  });

  ipcRenderer.on("discordUser", (e, msg) => {
    document.querySelector(".user").querySelector("span").innerText = msg.global_name;
  });

  ipcRenderer.on("rpc-error", (e, msg) => {
    showNotification(getTranslation(currentLang, "error-rpc") + msg, "error");
  });

  ipcRenderer.on("log", (e, msg) => {
    document.getElementById("logs").value = document.getElementById("logs").value + msg;
    document.getElementById("logs").scrollTo(0, document.getElementById("logs").scrollHeight);
  });

  // Установка начальной темы
  const isDark = await ipcRenderer.invoke("get-theme");
  if (isDark) {
    document.body.classList.add("dark-theme");
    document.getElementById("theme-toggle").checked = true;
  }

  await loadTranslations();

  // Изначальная отрисовка
  renderBuildsList();
  renderLanguages();
  renderAccentColors();
  renderWallpapers();
  reloadSettings();
  reloadLanguage();

  setInterval(() => {
    document.getElementById("ram-alloc").closest(".setting-item").dataset.tooltip = `${getTranslation(currentLang, "free-mem-now")} ${Math.floor(freemem() / 1024 / 1024 / 1024)} ${getTranslation(currentLang, "gigabytes")}`;
  }, 1500);

  // Обработка кнопки добавления
  document.getElementById("add-build-btn").addEventListener("click", () => {
    document.getElementById("new-build-name").value = "";
    document.getElementById("new-build-version").value = null;
    document.getElementById("add-build-modal").showPopover();
  });

  // Обработка открытия папки лаунчера
  document.getElementById("open-folder-btn").addEventListener("click", async () => {
    await openFileManager(path.join(conf.CONFIG_DIR, "instances"));
  });

  document.getElementById("modal-add-build-btn").addEventListener("click", () => {
    const currentConfig = conf.loadConfig();
    if (!currentConfig.instances) currentConfig.instances = [];

    const name = document.getElementById("new-build-name").value;
    const version = document.getElementById("new-build-version").value;
    const type = document.getElementById("new-build-version").selectedOptions[0].dataset.type;

    if (!name || !version) return;

    document.getElementById("add-build-modal").hidePopover();

    let found = false;

    currentConfig.instances.forEach((e) => {
      if (name == e.name) {
        found = true;
      }
    });

    if (found) {
      showNotification(getTranslation("instance-exists-msg"), "error");
      return;
    }

    currentConfig.instances.push({
      version: version,
      type: type,
      name: name,
      instanceFolder: path.join(conf.CONFIG_DIR, "instances", name)
    });

    ipcRenderer.invoke("create_instance_folder", path.join(conf.CONFIG_DIR, "instances", name));

    conf.saveConfig(currentConfig);
    renderBuildsList();
    showNotification(getTranslation(currentLang, "instance-added-msg"), "success");
  });

  //Обработка кнопки удаления в модальном окне
  document.getElementById("modal-del-build-btn").addEventListener("click", () => {
    deleteBuild(deletingIndex, deletingName);
    document.getElementById("del-build-modal").hidePopover();
  });

  // Обработка кнопки перезагрузки в модальном окне
  document.getElementById("modal-restart-btn").addEventListener("click", () => {
    document.getElementById("restart-modal").hidePopover();
    ipcRenderer.send("restart");
  });

  // Обработка кнопки удаления ресурс-пака в модальном окне
  document.getElementById("modal-remove-respack-btn").addEventListener("click", () => {
    document.getElementById("respack-info-modal").hidePopover();
    document.getElementById("respack-remove-modal").showPopover();
  });

  document.getElementById("modal-remove-respack-accept-btn").addEventListener("click", () => {
    document.getElementById("respack-remove-modal").hidePopover();
    if (selectedResPack) {
      fs.rmSync(path.join(selectedResPack.path, selectedResPack.name), { recursive: true });
      showNotification(getTranslation(currentLang, "respack-removed-msg"), "success");
      reloadResourcePacks();
    }
    else {
      showNotification(getTranslation(currentLang, "respack-not-found-msg"), "error");
    }
  });

  // Функция удаления сборки
  function deleteBuild(index, name) {
    if (isMinecraftRunning && runningInstanceName == name) {
      showNotification(getTranslation(currentLang, "error-instance-running"), "error");
    }
    else {
      const currentConfig = conf.loadConfig();
      currentConfig.instances.splice(index, 1);
      ipcRenderer.invoke("remove_instance_folder", path.join(conf.CONFIG_DIR, "instances", name));
      conf.saveConfig(currentConfig);
      renderBuildsList();
      showNotification(getTranslation(currentLang, "instance-removed-msg"), "success");
    }
  }

  // Обработка загрузки Minecraft
  ipcRenderer.on("loading-progress", (e, msg) => {
    loadingGame.querySelector("p").innerText = `${getTranslation(currentLang, "loading")} ${msg.type} (${msg.task} / ${msg.total})`;
    if (e.task == 0) {
      loadingGame.querySelector(".progress").querySelector(".progress-inner").style.width = "0%";
    }
    else {
      loadingGame.querySelector(".progress").querySelector(".progress-inner").style.width = `${100 / (msg.total / msg.task)}%`;
    }
  });

  ipcRenderer.on("starting-minecraft", (e) => {
    isMinecraftRunning = true;
    document.getElementById("modal-restart-btn").style.display = "none";
    loadingGame.style.display = "none";
    document.getElementById("launch-btn").disabled = true;
    document.getElementById("launch-btn").innerHTML = `<i class=\"fas fa-check\"></i> ${getTranslation(currentLang, "game-started")}`;
    if (document.hasFocus()) {
      showNotification(getTranslation("game-started-msg"));
    }
    else {
      if (Notification.permission === "granted") {
        var n = new Notification("VMineLauncher", { body: getTranslation(currentLang, "game-started-msg"), badge: "icon96.png" });
        new Audio("game_started.mp3").play();
      }
    }
  });

  ipcRenderer.on("minecraft-close", (e, msg) => {
    isMinecraftRunning = false;
    document.getElementById("modal-restart-btn").style.display = null;
    document.getElementById("logs").value = msg.log;
    document.getElementById("logs").scrollTo(0, document.getElementById("logs").scrollHeight);
    document.querySelector(".play-container .panels").style.display = null;
    document.getElementById("version-select").disabled = false;
    document.getElementById("launch-btn").disabled = false;
    document.getElementById("launch-btn").innerHTML = `<i class=\"fas fa-play\"></i> ${getTranslation(currentLang, "start-game")}`;
    if (msg.code != 0) {
      loadingGame.style.display = "none";
      var modal = document.getElementById("incorrect-exit-modal");
      modal.querySelector(".modal-content").querySelector(".exit-code").innerText = getTranslation(currentLang, "exit-code") + " " + msg.code;
      modal.showPopover();
    }
  });

  // Обработка количества ОЗУ
  document.getElementById("ram-alloc").max = Math.floor(totalmem() / 1024 / 1024 / 1024);

  const availableVersions = await ipcRenderer.invoke("available_versions");
  const versionsSelect = document.getElementById("new-build-version");
  availableVersions.forEach((e) => {
    if (e.type == "release" || e.type == "snapshot") {
      const option = document.createElement("option");
      option.innerText = e.id + " (" + e.type + ")";
      option.value = e.id;
      option.dataset.type = e.type;
      versionsSelect.appendChild(option);
    }
  });

  function reloadResourcePacks() {
    var selectedInstance = document.getElementById("version-select").value;
    var instanceResourcePacks = fs.readdirSync(path.join(conf.CONFIG_DIR, "instances", selectedInstance, "resourcepacks"), { withFileTypes: true, recursive: false });

    if (!fs.existsSync(path.join(conf.CONFIG_DIR, ".cache/respacks_icons"))) {
      fs.mkdirSync(path.join(conf.CONFIG_DIR, ".cache/respacks_icons"));
    }

    document.querySelector(".play-container .resource-packs .content").innerHTML = '';

    instanceResourcePacks.forEach(async (dirent) => {
      try {
        if (dirent.isFile() && dirent.name.endsWith(".zip")) {
          const zip = new StreamZip.async({
            file: path.join(dirent.path, dirent.name),
            storeEntries: true
          });

          var entrs = await zip.entries();

          var packpng = path.join(conf.CONFIG_DIR, ".cache/respacks_icons", dirent.name + ".png");
          var packmcmeta = null;
          if (entrs["pack.mcmeta"]) {
            // Парсинг pack.mcmeta
            packmcmeta = JSON.parse((await zip.entryData(entrs["pack.mcmeta"])).toString("utf-8"));
            console.log("Parsed mcmeta: ", packmcmeta);
          }
          if (entrs["pack.png"] && !fs.existsSync(packpng)) {
            // Распаковка pack.png, если он не найден в кэше
            await zip.extract((await zip.entry("pack.png")), packpng);
          }
          else if (!entrs["pack.png"]) {
            packpng = null;
          }

          var resPackItem = document.createElement("div");
          resPackItem.className = "resource-pack-item";
          resPackItem.innerHTML =
            `
              <div class="pack-icon">
                <img class="secondary" src="${(packpng ? "file://" + packpng : "defaultpack.png")}" alt="Resource pack image">
                <img class="primary" src="${(packpng ? "file://" + packpng : "defaultpack.png")}" alt="Resource pack image">
              </div>
              <div class="resource-pack-name">${(dirent.name.length > 35 ? dirent.name.substring(0, 35) + "..." : dirent.name)}</div>
              `;
          resPackItem.addEventListener("click", () => {
            selectedResPack = dirent;
            document.querySelector("#respack-info-modal #pack-name").innerText = dirent.name + " (" + getTranslation(currentLang, "zip-pack") + ")";
            document.querySelector("#respack-info-modal .respack-info img").src = (packpng ? "file://" + packpng : "defaultpack.png");
            document.querySelector("#respack-info-modal .respack-info .info").innerText = (packmcmeta && packmcmeta.pack.description ? packmcmeta.pack.description : getTranslation(currentLang, "no-description"));
            document.getElementById("respack-info-modal").showPopover();
          });

          document.querySelector(".play-container .resource-packs .content").appendChild(resPackItem);

          zip.close();
        }
        else if (dirent.isDirectory() && fs.existsSync(path.join(dirent.path, dirent.name, "pack.mcmeta"))) {
          var packpng = (fs.existsSync(path.join(dirent.path, dirent.name, "pack.png")) ? path.join(dirent.path, dirent.name, "pack.png") : null);

          // Парсинг pack.mcmeta
          var packmcmeta = JSON.parse(fs.readFileSync(path.join(dirent.path, dirent.name, "pack.mcmeta")).toString("utf-8"));
          console.log("Parsed mcmeta: ", packmcmeta);

          var resPackItem = document.createElement("div");
          resPackItem.className = "resource-pack-item";
          resPackItem.innerHTML =
            `
              <div class="pack-icon">
                <img class="secondary" src="${(packpng ? "file://" + packpng : "defaultpack.png")}" alt="Resource pack image">
                <img class="primary" src="${(packpng ? "file://" + packpng : "defaultpack.png")}" alt="Resource pack image">
              </div>
              <div class="resource-pack-name">${(dirent.name.length > 35 ? dirent.name.substring(0, 35) + "..." : dirent.name)}</div>
              `;

          resPackItem.addEventListener("click", () => {
            selectedResPack = dirent;
            document.querySelector("#respack-info-modal #pack-name").innerText = dirent.name;
            document.querySelector("#respack-info-modal .respack-info img").src = (packpng ? "file://" + packpng : "defaultpack.png");
            document.querySelector("#respack-info-modal .respack-info .info").innerText = (packmcmeta && packmcmeta.pack.description ? packmcmeta.pack.description : getTranslation(currentLang, "no-description"));
            document.getElementById("respack-info-modal").showPopover();
          });

          document.querySelector(".play-container .resource-packs .content").appendChild(resPackItem);
        }
      }
      catch (e) {
        console.warn("Error when parsing resource packs: ", e);
      }
    });

    if (instanceResourcePacks.length == 0) {
      var nothingThere = document.createElement("div");
      nothingThere.className = "nothing-here";
      nothingThere.innerHTML = `<img class="sticker" src="images/pensive.png"><div>${getTranslation(currentLang, "empty-panel")}</div>`;
      document.querySelector(".play-container .resource-packs .content").appendChild(nothingThere);
    }
  }

  function reloadScreenshots() {
    var selectedInstance = document.getElementById("version-select").value;
    var instanceScreenshots = fs.readdirSync(path.join(conf.CONFIG_DIR, "instances", selectedInstance, "screenshots"), { withFileTypes: true, recursive: false });

    document.querySelector(".play-container .screenshots .content").innerHTML = '';

    instanceScreenshots.forEach(async (dirent) => {
      try {
        if (dirent.isFile() && dirent.name.endsWith(".png")) {
          var screenshotItem = document.createElement("div");
          screenshotItem.className = "screenshot-item";
          screenshotItem.innerHTML =
            `
              <img class="secondary" src="file://${path.join(dirent.path, dirent.name)}" alt="Screenshot">
              <img class="primary" src="file://${path.join(dirent.path, dirent.name)}" alt="Screenshot">
            `;

          screenshotItem.addEventListener("click", () => {
            child_process.exec(`xdg-open ${path.join(dirent.path, dirent.name)}`);
          });

          document.querySelector(".play-container .screenshots .content").appendChild(screenshotItem);
        }
      }
      catch (e) {
        console.warn("Error when parsing resource packs: ", e);
      }
    });

    if (instanceScreenshots.length == 0) {
      var nothingThere = document.createElement("div");
      nothingThere.className = "nothing-here";
      nothingThere.innerHTML = `<img class="sticker" src="images/pensive.png"><div>${getTranslation(currentLang, "empty-panel")}</div>`;
      document.querySelector(".play-container .screenshots .content").appendChild(nothingThere);
    }
  }

  // Обработка кнопок управления окном
  document.getElementById("minimize-btn").addEventListener("click", () => {
    ipcRenderer.send("minimize-window");
  });

  document.getElementById("maximize-btn").addEventListener("click", () => {
    ipcRenderer.send("maximize-window");
  });

  document.getElementById("close-btn").addEventListener("click", () => {
    if (isMinecraftRunning) {
      showNotification(getTranslation("minecraft-starting-msg"), "error");
      return;
    }
    ipcRenderer.send("close-window");
  });

  // Кнопки Отмена в диалогах
  const modalCancelButtons = document.querySelectorAll("#modal-cancel-btn");

  modalCancelButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".modal").hidePopover();
    });
  });

  // Навигация по разделам
  const sidebar = document.querySelector(".sidebar");
  const navButtons = document.querySelectorAll(".nav-btn");
  const contentSections = document.querySelectorAll(".content-section");

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      // Удаляем активный класс у всех кнопок и секций
      navButtons.forEach((btn) => btn.classList.remove("active"));
      contentSections.forEach((section) => section.classList.remove("active"));

      // Добавляем активный класс к выбранной кнопке и секции
      button.classList.add("active");
      const sectionId = button.getAttribute("data-section") + "-section";
      document.getElementById(sectionId).classList.add("active");
    });
  });

  sidebar.addEventListener("mouseenter", () => {
    sidebar.className = "sidebar";
  });

  sidebar.addEventListener("mouseleave", () => {
    sidebar.className = "sidebar hidden";
  });

  // Функция для сохранения настроек
  function saveConfigSettings() {
    if (isConfigLoading == true) return;
    const config = conf.loadConfig();
    config.lang = document.getElementById("lang-select").value;
    config.selectedVersion = document.getElementById("version-select").value;
    config.accent = document.querySelector("#accent-color-selector *[selected]").style.backgroundColor;
    config.wallpaper = document.getElementById("wallpaper-select").value;
    config.nickname = document.getElementById("nickname").value;
    config.discordRPC = document.getElementById("rpc-enabled").checked;
    config.javaPath = document.getElementById("java-path").value;
    config.allocatedRam = parseInt(document.getElementById("ram-alloc").value) || 2;
    conf.saveConfig(config);
    reloadSettings();
  }

  // Обработка изменения настроек
  document.getElementById("version-select").addEventListener("change", saveConfigSettings);
  document.getElementById("wallpaper-select").addEventListener("change", saveConfigSettings);
  document.getElementById("nickname").addEventListener("change", saveConfigSettings);
  document.getElementById("java-path").addEventListener("change", saveConfigSettings);
  document.getElementById("ram-alloc").addEventListener("change", saveConfigSettings);

  // Обработка переключения Discord RPC
  document.getElementById("rpc-enabled").addEventListener("change", () => {
    saveConfigSettings();
    document.getElementById("restart-modal").showPopover();
  });

  // Обработка переключения языка
  document.getElementById("lang-select").addEventListener("change", () => {
    saveConfigSettings();
    reloadLanguage();
  });

  // Обработка переключения темы
  document.getElementById("theme-toggle").addEventListener("change", async (e) => {
    const isDark = await ipcRenderer.invoke("toggle-theme");
    document.body.classList.toggle("dark-theme", isDark);

    // Сохраняем настройки
    saveConfigSettings();
  });

  // Обработка запуска Minecraft
  document.getElementById("launch-btn").addEventListener("click", async () => {
    const selectedInstance = document.getElementById("version-select");
    const launchBtn = document.getElementById("launch-btn");
    const originalText = launchBtn.innerHTML;

    if (!selectedInstance.value) {
      showNotification(getTranslation(currentLang, "select-instance-msg"), "error");
      return;
    }

    launchBtn.innerHTML = `<i class='fas fa-spinner fa-spin'></i> ${getTranslation(currentLang, "starting-game")}`;
    launchBtn.disabled = true;
    document.getElementById("modal-restart-btn").style.display = "none";

    // Сохраняем текущие настройки перед запуском
    saveConfigSettings();

    try {
      isMinecraftRunning = true;
      runningInstanceName = selectedInstance.value;
      document.querySelector(".play-container .panels").style.display = "none";
      document.getElementById("version-select").disabled = true;
      loadingGame.querySelector("p").innerText = getTranslation(currentLang, "starting-game");
      loadingGame.querySelector(".progress").querySelector(".progress-inner").style.width = "0%";
      loadingGame.style.display = null;
      const result = await ipcRenderer.invoke("launch-minecraft", selectedInstance.options[selectedInstance.selectedIndex].dataset.version, selectedInstance.options[selectedInstance.selectedIndex].dataset.type, selectedInstance.value);
    } catch (error) {
      isMinecraftRunning = false;
      runningInstanceName = "";
      document.getElementById("modal-restart-btn").style.display = null;
      loadingGame.style.display = "none";
      document.querySelector(".play-container .panels").style.display = null;
      document.getElementById("version-select").disabled = false;
      document.getElementById("launch-btn").disabled = false;
      console.error("Ошибка при запуске Minecraft:", error);
      showNotification(error, "error");
      launchBtn.innerHTML = originalText;
      launchBtn.disabled = false;
    }
  });

  document.querySelector(".loading-container").style.display = "none";
  document.querySelector(".app-container").style.display = null;
});