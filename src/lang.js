const conf = require("./config.js");

const endpoints = conf.LANGUAGE_ENDPOINTS;

var languages = {};

async function loadTranslations() {
    return new Promise(async (resolve, reject) => {
        for (let i = 0; i < endpoints.length; i++) {
            var e = endpoints[i];
            try {
                var r = await fetch(e.endpoint);
                if (r.ok) {
                    var j = await r.json();
                    languages[e.lang] = j;
                }
                else {
                    console.warn("[LANG] Loading failed for ", e.lang, ": ", r.status);
                }
            }
            catch (e) {
                console.warn("[LANG] Loading failed for ", e.lang, ": ", e);
                reject(e);
            }
        };
        resolve();
    });
}

function getTranslation(lang, id) {
    var l = languages[lang];
    if (l) {
        return l[id];
    }
    else return "[Language not supported]";
}

module.exports = { loadTranslations, getTranslation };