"use strict";

const { app, BrowserWindow, ipcMain, nativeTheme, Notification, Menu, MenuItem, Tray, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { randomUUID } = require("crypto");
const { openFileManager } = require("open-file-manager");
const dayjs = require("dayjs");
const mclc = require("minecraft-launcher-core");
const { CONFIG_DIR, loadConfig, saveConfig } = require("./src/config.js");
const { loadTranslations, getTranslation } = require("./src/lang.js");
const { FakeAuth } = require("./src/fakeauth.js");

var rpc;
var rpcClient;
var launcher = new mclc.Client();

var fakeAuth;

// Graceful shutdown
process.on('SIGINT', async () => {
  await rpcClient.destroy();
  process.exit(0);
});

if (process.platform !== "linux") {
  console.error("ERROR: Only Linux platform is supported.");
  process.exit(1);
}

let config = loadConfig();
var log = "";
var currentLang = "en";

var discordUser;
var runningInstanceName = "";

function logMsg(msg) {
  var date = dayjs(Date.now());
  var time = `${date.hour()}:${date.minute()}:${date.second()}`;
  log += "[" + time + "] : " + msg + "\n";
}

launcher.on('debug', (e) => {
  logMsg(e);
  console.log(e);
});
launcher.on('data', (e) => {
  logMsg(e);
  console.log(e);
});
launcher.on('progress', (e) => {
  logMsg(`Loading ${e.type} (${e.task} / ${e.total})`);
  mainWindow.webContents.send("loading-progress", e);
});
launcher.on('package-extract', (e) => {
  logMsg("All packages extracted");
  mainWindow.webContents.send("loading-package-extract");
});
launcher.on('arguments', (e) => {
  logMsg("Starting Minecraft");
  setRPC(getTranslation(currentLang, "rpc-active"), runningInstanceName);
  mainWindow.webContents.send("starting-minecraft");
  if (config.minimizeToTrayOnGameStart) mainWindow.hide();
});
launcher.on('close', (e) => {
  if (fakeAuth) {
    fakeAuth.stop();
  }
  runningInstanceName = "";
  logMsg("Minecraft process exited with code " + e + "!");
  setRPC(getTranslation(currentLang, "rpc-unactive"), getTranslation(currentLang, "rpc-unactive"));
  mainWindow.show();
  mainWindow.webContents.send("minecraft-close", { code: e, log: log });
  fs.writeFileSync(path.join(CONFIG_DIR, "latest.log"), log, { encoding: "utf-8" });
  log = "";
});

let mainWindow;
let loadingWindow;

let tray;

var availableVersions = [];

var loadTranslationsAttempts = 0;
var loadVersionsAttempts = 0;

async function retryLoadTranslations() {
  if (loadingWindow) {
    loadingWindow.show();
    loadingWindow.webContents.send("status", `Loading translations${(loadTranslationsAttempts > 0 ? ", attempt " + loadTranslationsAttempts : "")}...`);
  }
  try {
    await loadTranslations();
  }
  catch (e) {
    console.log("Trying to load languages, attempt " + loadTranslationsAttempts);
    loadTranslationsAttempts++;
    if (loadTranslationsAttempts > 5) {
      throw new Error("Languages loading failed");
    }
    await retryLoadTranslations();
  }
}

async function retryLoadVersions() {
  return new Promise(async (resolve, reject) => {
    if (loadingWindow) {
      loadingWindow.show();
      loadingWindow.webContents.send("status", `Loading versions${(loadVersionsAttempts > 0 ? ", attempt " + loadVersionsAttempts : "")}...`);
    }
    try {
      const r = await fetch("https://piston-meta.mojang.com/mc/game/version_manifest.json"); // fetch("https://mc-versions-api.net/api/java?detailed=true&order=desc");
      if (r.ok) {
        r.json().then((j) => {
          availableVersions = j.versions;
          resolve();
        });
      }
      else {
        reject(r.status);
      }
    }
    catch (e) {
      console.log("Trying to load versions, attempt " + loadVersionsAttempts);
      loadVersionsAttempts++;
      if (loadVersionsAttempts > 5) {
        console.error("Can't get all versions list.");
        reject("Can't get all versions list.");
      }
      await retryLoadVersions();
    }
  });
}

async function tryDownloadAuthlibInjector() {
  return new Promise(async (resolve, reject) => {
    try {
      const r = await fetch("https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.7/authlib-injector-1.2.7.jar");
      if (r.ok) {
        r.blob().then(async (blob) => {
          fs.writeFileSync(path.join(CONFIG_DIR, "authlib-injector.jar"), Buffer.from(await blob.arrayBuffer()));
          resolve();
        });
      }
      else {
        reject(r.status);
      }
    }
    catch (e) {
      console.log("Trying to download authlib injector, attempt " + loadVersionsAttempts);
      loadVersionsAttempts++;
      if (loadVersionsAttempts > 5) {
        console.error("Can't download authlib injector.");
        reject("Can't download authlib injector.");
      }
      await tryDownloadAuthlibInjector();
    }
  });
}

async function createWindow() {
  console.log("Creating Electron loading window...");
  // Обработка окна загрузки
  loadingWindow = new BrowserWindow({
    width: 450,
    height: 400,
    frame: false,
    show: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
    modal: true,
    maximizable: false,
    resizable: false
  });

  loadingWindow.loadFile("src/loading.html");

  loadingWindow.webContents.once("dom-ready", () => {
    loadingWindow.show();
    loadingWindow.webContents.send("status", "Loading translations...");
  });

  console.log("Loading translations...");
  try {
    await retryLoadTranslations();
  }
  catch (e) {
    console.error(e);
    process.exit(e);
    return;
  }

  console.log("Loading versions...");
  try {
    await retryLoadVersions();
    loadingWindow.close();
  }
  catch (e) {
    console.log(e);
    process.exit(e);
    return;
  }

  console.log("Creating Electron main window...");
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 650,
    minWidth: 1000,
    minHeight: 650,
    frame: config.systemWindow,
    show: false,
    transparent: !config.systemWindow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
  });

  mainWindow.loadFile("src/index.html");

  // Убираем меню по умолчанию
  mainWindow.setMenu(null);

  // Обработка управления окном
  ipcMain.on("minimize-window", () => {
    mainWindow.minimize();
  });

  ipcMain.on("maximize-window", () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on("close-window", () => {
    if (config.minimizeToTrayOnClose) {
      mainWindow.hide();
      return;
    }
    mainWindow.close();
  });

  ipcMain.on("restart", () => {
    app.relaunch();
    app.exit();
  });

  mainWindow.webContents.once("dom-ready", () => {
    var log = fs.readFileSync(path.join(CONFIG_DIR, "latest.log"), { encoding: "utf-8" });
    mainWindow.webContents.send("log", log);
    const config = loadConfig();
    if (config.discordRPC == true && rpcClient !== null && rpcClient.connectionState === "ready") {
      console.log("[RPC] Sended user info");
      mainWindow.webContents.send("avatar_url", rpcClient.getAvatarUrl(discordUser.id, discordUser.avatar));
      mainWindow.webContents.send("discordUser", discordUser);
    }
    mainWindow.show();
  });

  // Подключение Discord RPC
  currentLang = config.lang;
  if (config.discordRPC == true) {
    rpc = await import("@nich87/discord-rpc");
    rpcClient = new rpc.Client();
    new Promise(async (resolve, reject) => {
      try {
        const { user } = await rpcClient.login({ clientId: '1482780481962512586' });
        discordUser = user;

        console.log(`[RPC] Logged in as ${discordUser.username}`);

        await setRPC(getTranslation(currentLang, "rpc-unactive"), getTranslation(currentLang, "rpc-unactive"));
        resolve();
      }
      catch (e) {
        reject(e);
      }
    }).then(() => {
      console.log("[RPC] Initialization success!");
    }).catch((e) => {
      console.log("[RPC] Init error:", e);
      mainWindow.webContents.send("rpc-error", e);
    });
  }

  if (!fs.existsSync(path.join(CONFIG_DIR, "authlib-injector.jar"))) {
    try {
      await tryDownloadAuthlibInjector();
      console.log("Authlib injector downloaded successfully");
    }
    catch (e) {
      console.error("Failed to download authlib injector:", e);
    }
  }

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'src/icon96.png'))); // Загрузка иконки из файла
  const contextMenu = Menu.buildFromTemplate([
    new MenuItem({ label: "VMineLauncher", type: "normal", enabled: false, icon: nativeImage.createFromPath(path.join(__dirname, 'src/icon96.png')) }),
    new MenuItem({ type: "separator" }),
    new MenuItem({
      label: getTranslation(currentLang, "show-hide"), type: "normal", click: () => {
        if (mainWindow) {
          if (!mainWindow.isVisible()) {
            mainWindow.show();
          } else {
            mainWindow.hide();
          }
        }
      }
    }),
    new MenuItem({ label: getTranslation(currentLang, "exit"), type: "normal", click: () => { app.quit(); } })
  ]);
  tray.setToolTip('VMineLauncher');
  tray.setContextMenu(contextMenu);
}

async function setRPC(details, state) {
  return new Promise(async (resolve, reject) => {
    const config = loadConfig();
    if (config.discordRPC == true) {
      const activity = new rpc.PresenceBuilder()
        .setType(rpc.ActivityType.Playing)
        .setDetails((!app.isPackaged ? "[Debug] " : "") + details)
        .setState(state)
        .setStartTimestamp(Date.now())
        .setLargeImage('game_icon', 'vminelauncher_icon')
        .build();

      await rpcClient.setActivity(activity);
      resolve();
    }
    else {
      reject("Discord RPC is disabled by user");
    }
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Обработка переключения темы
ipcMain.handle("toggle-theme", (event) => {
  const newTheme = nativeTheme.shouldUseDarkColors ? "light" : "dark";
  nativeTheme.themeSource = newTheme;

  // Сохраняем настройку темы в конфигурации
  const config = loadConfig();
  config.theme = newTheme;
  saveConfig(config);

  return nativeTheme.shouldUseDarkColors;
});

// Получение текущей темы
ipcMain.handle("get-theme", () => {
  const config = loadConfig();
  if (config.theme) {
    nativeTheme.themeSource = config.theme;
  }
  return nativeTheme.shouldUseDarkColors;
});

ipcMain.handle("devtools", () => {
  mainWindow.webContents.openDevTools()
});

ipcMain.handle("create_instance_folder", (event, p) => {
  fs.mkdirSync(p);
  fs.mkdirSync(path.join(p, "resourcepacks"));
  fs.mkdirSync(path.join(p, "screenshots"));
});

ipcMain.handle("remove_instance_folder", (event, p) => {
  fs.rmdirSync(p, { recursive: true });
});

ipcMain.on("show_notify", (e, params) => {
  new Notification(params).show();
})

ipcMain.handle("available_versions", (event) => {
  return new Promise(resolve => resolve(availableVersions));
});

ipcMain.on("config-changed", (event) => {
  config = loadConfig();
});

// Авторизация через Ely.by
ipcMain.handle("auth-elyby", async (event, email, password) => {
  try {
    const response = await fetch("https://authserver.ely.by/auth/authenticate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: { name: "Minecraft", version: 1 },
        username: email,
        password: password,
        clientToken: loadConfig().clientToken
      })
    });

    const data = await response.json();

    if (response.ok && data.accessToken) {
      return {
        success: true,
        name: data.selectedProfile.name,
        uuid: data.selectedProfile.id,
        accessToken: data.accessToken
      };
    } else {
      return { success: false, error: data.errorMessage || "Invalid credentials" };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Запуск Minecraft
ipcMain.handle("launch-minecraft", async (event, version, type, instanceName) => {
  runningInstanceName = instanceName;
  const config = loadConfig();

  return new Promise((resolve, reject) => {
    try {
      // Проверка пути к Java
      if (!config.javaPath || !fs.existsSync(config.javaPath)) {
        reject("Java path is invalid");
        return;
      }

      // Проверка пути к Minecraft
      if (!fs.existsSync(path.join(CONFIG_DIR, "instances", instanceName))) {
        reject("Instance path is invalid");
        return;
      }

      if (config.accounts.length < 1 && config.activeAccountIndex < 0) {
        reject("No accounts found");
        return;
      }

      var auth;

      if (config.accounts[config.activeAccountIndex].type == "offline") {
        auth = auth = {
          access_token: "FakeAuthToken",
          client_id: config.clientToken,
          uuid: config.accounts[config.activeAccountIndex].uuid,
          name: config.accounts[config.activeAccountIndex].name,
          user_properties: "{}"
        };
      } else if (config.accounts[config.activeAccountIndex].type == "elyby") {
        auth = {
          access_token: config.accounts[config.activeAccountIndex].accessToken,
          client_id: config.clientToken,
          uuid: config.accounts[config.activeAccountIndex].uuid,
          name: config.accounts[config.activeAccountIndex].name,
          user_properties: "{}"
        };
      }

      // Запуск Minecraft
      console.log(`Starting Minecraft ${version}`);
      setRPC(getTranslation(currentLang, "rpc-starting"), `"${instanceName}"`);
      ipcMain.emit("startingGame");
      let customArgs = [];
      customArgs.push("-Dauthlibwrapper.bootstrap=true");
      if (config.accounts[config.activeAccountIndex].type == "elyby") {
        customArgs.push(`-javaagent:${path.join(CONFIG_DIR, "authlib-injector.jar")}=ely.by`);
      }
      if (config.accounts[config.activeAccountIndex].type == "offline") {
        customArgs.push(`-javaagent:${path.join(CONFIG_DIR, "authlib-injector.jar")}=http://127.0.0.1:8080`);
        customArgs.push("-Dminecraft.api.auth.host=http://127.0.0.1:8080");
        customArgs.push("-Dminecraft.api.services.host=http://127.0.0.1:8080");
        customArgs.push("-Dminecraft.api.session.host=http://127.0.0.1:8080");
        customArgs.push("-Dminecraft.api.account.host=http://127.0.0.1:8080");
        customArgs.push("-Dminecraft.api.profiles.host=http://127.0.0.1:8080");
      }
      let opts = {
        authorization: auth,
        root: path.join(CONFIG_DIR, "instances", instanceName),
        cache: path.join(CONFIG_DIR, ".cache"),
        version: {
          number: version,
          type: type
        },
        memory: {
          max: `${config.allocatedRam}G`,
          min: "512M"
        },
        javaPath: config.javaPath,
        customArgs: customArgs
      }
      fakeAuth = new FakeAuth(8080, config.accounts[config.activeAccountIndex].name, config.accounts[config.activeAccountIndex].uuid);
      fakeAuth.start();
      launcher.launch(opts);
      resolve();
    } catch (error) {
      runningInstanceName = "";
      console.error("Error:", error);
      reject(`Ошибка при запуске Minecraft: ${error.message}`);
    }
  });
});

console.log("[VMineLauncher] Started!");