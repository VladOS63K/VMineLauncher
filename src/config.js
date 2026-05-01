"use strict";
const path = require("path");
const os = require("os");
const fs = require("fs");
const glob = require("glob");
const { randomUUID } = require("crypto");

// Возможные пути к Java
const POSSIBLE_JAVA_PATHS = {
  linux: [
    "/usr/lib/jvm/*/bin/java",
    "/usr/java/*/bin/java",
    "/opt/jdk/*/bin/java",
    "/opt/java/*/bin/java",
    "/usr/local/java/*/bin/java",
    os.homedir() + "/jdk*/bin/java",
    os.homedir() + "/.sdkman/candidates/java/*/bin/java"
  ],
  // win32: [
  //   "C:\\Program Files\\Java\\jdk*\\bin\\java.exe",
  //   "C:\\Program Files (x86)\\Java\\jdk*\\bin\\java.exe",
  //   os.homedir() + "\\jdk*\\bin\\java.exe"
  // ],
  // darwin: [
  //   "/Library/Java/JavaVirtualMachines/jdk*.jdk/Contents/Home/bin/java",
  //   "/System/Library/Java/JavaVirtualMachines/jdk*.jdk/Contents/Home/bin/java",
  //   os.homedir() + "/jdk*/bin/java"
  // ]
};

const LANGUAGE_ENDPOINTS = [
  { lang: "en", endpoint: "https://localise.biz/api/export/locale/en.json?key=bSbcXshzd91RihGzANxqBZxxLDis62dO" },
  { lang: "ru", endpoint: "https://localise.biz/api/export/locale/ru-RU.json?key=bSbcXshzd91RihGzANxqBZxxLDis62dO" }
];

// Пути конфигурации
const CONFIG_DIR = path.join(os.homedir(), ".vminelauncher");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// Конфигурация по умолчанию
const DEFAULT_CONFIG = {
  firstRun: true,
  lang: "ru",
  clientToken: null, // Требуется для аутентификации в Ely.by
  accounts: [],
  activeAccountIndex: -1,
  accent: "#6a5acd",
  wallpaper: null,
  theme: "dark",
  discordRPC: false,
  minimizeToTrayOnClose: false,
  minimizeToTrayOnGameStart: false,
  systemWindow: false,
  checkUpdates: true,
  javaPath: "",
  allocatedRam: 2,
  instances: [
    // пример: { version: "1.20.1", type: "release", name: "Моя сборка", instanceFolder: path.join(CONFIG_DIR, "instances", "Моя сборка") }
  ],
  selectedVersion: null,
};

// Создание директории конфигурации, если она не существует
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

if (!fs.existsSync(path.join(CONFIG_DIR, "instances"))) {
  fs.mkdirSync(path.join(CONFIG_DIR, "instances"), { recursive: true });
}

if (!fs.existsSync(path.join(CONFIG_DIR, ".cache"))) {
  fs.mkdirSync(path.join(CONFIG_DIR, ".cache"), { recursive: true });
}

if (!fs.existsSync(path.join(CONFIG_DIR, "wallpapers"))) {
  fs.mkdirSync(path.join(CONFIG_DIR, "wallpapers"), { recursive: true });
}

if (!fs.existsSync(path.join(CONFIG_DIR, "skins"))) {
  fs.mkdirSync(path.join(CONFIG_DIR, "skins"), { recursive: true });
}

// Поиск пути к Java
function findJavaPath() {
  const platform = os.platform();
  const possiblePaths = POSSIBLE_JAVA_PATHS[platform] || [];

  for (const pattern of possiblePaths) {
    try {
      const matches = glob.sync(pattern);
      if (matches.length > 0) {
        // Возвращаем первый найденный путь
        return matches[0];
      }
    } catch (error) {
      console.log(`Не удалось проверить путь ${pattern}: `, error.message);
    }
  }

  return null;
}

// Загрузка конфигурации
function loadConfig() {
  let config = { ...DEFAULT_CONFIG };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const configData = fs.readFileSync(CONFIG_FILE, "utf-8");
      config = { ...config, ...JSON.parse(configData) };
    }

    // Миграция со старой системы аккаунтов
    if (config.nickname && (!config.accounts || config.accounts.length === 0)) {
      config.accounts = [{
        name: config.nickname,
        uuid: config.uuid || randomUUID(),
        type: "offline"
      }];
      config.activeAccountIndex = 0;
      delete config.nickname;
      delete config.uuid;
      saveConfig(config);
    }

    // Если путь к Java не установлен, пытаемся найти автоматически
    if (!config.javaPath) {
      const javaPath = findJavaPath();
      if (javaPath) {
        config.javaPath = javaPath;
        saveConfig(config); // Сохраняем найденный путь
      }
    }

    // Если токен лаунчера не был сгенерирован, генерируем его
    if (!config.clientToken || config.clientToken == "00000000-0000-0000-0000-000000000000") {
      config.clientToken = randomUUID();
      saveConfig(config);
    }
  } catch (error) {
    console.error("Ошибка при загрузке конфигурации:", error);
  }
  return config;
}

// Сохранение конфигурации
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
    return true;
  } catch (error) {
    console.error("Ошибка при сохранении конфигурации:", error);
    return false;
  }
}

function getWallpapers() {
  return fs.readdirSync(path.join(CONFIG_DIR, "wallpapers"));
}

module.exports = { CONFIG_DIR, LANGUAGE_ENDPOINTS, loadConfig, saveConfig, getWallpapers };