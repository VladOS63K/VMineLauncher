const { createServer } = require('http');
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const conf = require("./config.js");
const pjson = require('../package.json');

class FakeAuth {
    constructor(port = 8080, playerName = "Player", uuid = "deadbeefdeadbeefdeadbeefdeadbeef") {
        if (typeof port !== 'number' || port <= 0 || port > 65535) {
            throw new Error("Invalid port number. Must be between 1 and 65535.");
        }
        if (playerName && typeof playerName !== 'string') {
            throw new Error("Player name must be a string.");
        }
        if (playerName && (playerName.length > 16 || playerName.length < 3)) {
            throw new Error("Player name must be between 3 and 16 characters long.");
        }
        if (uuid && typeof uuid !== 'string') {
            throw new Error("UUID must be a string.");
        }
        this.port = port;
        this.playerName = playerName;
        this.uuid = uuid;
        this.fakeauthUUID = crypto.randomUUID();
    }

    fakeauthUUID;
    server;

    getUserInfo() {
        const privateKey = fs.readFileSync(path.join(__dirname, 'src/skinsigns/private.pem'), 'utf8').trim();
        const textureData = {
            timestamp: Date.now(),
            profileId: this.uuid,
            profileName: this.playerName,
            textures: {
                SKIN: {
                    url: `http://127.0.0.1:8080/skins/${this.playerName}.png?v=${Date.now()}`
                }
            }
        };

        const base64Textures = Buffer.from(JSON.stringify(textureData)).toString('base64');

        const sign = crypto.createSign('RSA-SHA1');
        sign.update(base64Textures);
        sign.end();
        const signature = sign.sign(privateKey, 'base64');

        return JSON.stringify({
            id: this.uuid,
            name: this.playerName,
            timestamp: Date.now(),
            properties: [
                {
                    name: "textures",
                    value: base64Textures,
                    signature: signature
                }
            ]
        });
    }

    start() {
        if (this.server) {
            throw new Error("Server is already running.");
        }
        this.server = createServer((req, res) => {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });

            req.on('end', () => {
                const url = req.url;
                res.setHeader('Content-Type', 'application/json');
                if (url.includes('/authenticate')) {
                    const data = JSON.parse(body || '{}');
                    const name = data.username || this.playerName;
                    const uuid = this.uuid;

                    console.log(`[FakeAuth ${this.fakeauthUUID}] Allowing ${name}...`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        accessToken: "FakeAuthToken",
                        clientToken: data.clientToken || "client",
                        selectedProfile: { id: uuid, name: name },
                        availableProfiles: [{ id: uuid, name: name }]
                    }));
                }
                else if (url.includes('/session/minecraft/join')) {
                    console.log(`[FakeAuth ${this.fakeauthUUID}] Allowing player to join the server...`);
                    res.writeHead(204);
                    res.end();
                }
                else if (url.startsWith('/skins/')) {
                    const skinName = url.split('/').pop().split('?').shift();
                    const skinPath = path.join(conf.CONFIG_DIR, 'skins', skinName);

                    if (fs.existsSync(skinPath)) {
                        console.log(`[FakeAuth ${this.fakeauthUUID}] Skin requested: ${skinName}`);
                        res.writeHead(200, { 'Content-Type': 'image/png' });
                        res.end(fs.readFileSync(skinPath));
                    } else {
                        console.log(`[FakeAuth ${this.fakeauthUUID}] Skin not found: ${skinName}, serving default skin.`);
                        res.writeHead(200, { 'Content-Type': 'image/png' });
                        res.end(fs.readFileSync(path.join(__dirname, 'steve.png')));
                    }
                }
                else if (url.includes('/api/profiles/minecraft')) {
                    console.log(`[FakeAuth ${this.fakeauthUUID}] UUID Search requested, providing fake profile...`);
                    const name = this.playerName;
                    const uuid = this.uuid;

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify([{ id: uuid, name: name }]));
                }
                else if (url.includes('/sessionserver/session/minecraft/profile/')) {

                    console.log(`[FakeAuth ${this.fakeauthUUID}] Session profile requested for UUID: ${this.uuid}, providing fake profile with skin...`);


                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(this.getUserInfo());
                }
                else if (url.includes('/profile/')) {
                    const uuid = url.split('/').pop().split('?').shift();
                    console.log(`[FakeAuth ${this.fakeauthUUID}] Allowing access to profile for UUID: ${uuid}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(this.getUserInfo());
                }
                else if (url.includes('/session/minecraft/hasJoined')) {
                    console.log(`[FakeAuth ${this.fakeauthUUID}] HasJoined requested, allowing player to join...`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(this.getUserInfo());
                }
                else if (url.includes('/player/attributes') || url.includes('/privileges')) {
                    console.log(`[FakeAuth ${this.fakeauthUUID}] Privileges requested, providing fake privileges...`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        privileges: {
                            onlineChat: { enabled: true },
                            multiplayerServer: { enabled: true },
                            multiplayerRealms: { enabled: false },
                            telemetry: { enabled: false }
                        },
                        profanityFilterPreferences: { profanityFilterEnabled: false }
                    }));
                }
                else if (req.method === 'GET' && (url === '/' || url === '')) {
                    console.log(`[FakeAuth ${this.fakeauthUUID}] Metadata requested, providing FakeAuth server information...`);
                    const sign = fs.readFileSync(path.join(__dirname, 'src/skinsigns/public.pem'), 'utf8').trim();
                    res.writeHead(200, {"Content-Type": "application/json"});
                    res.end(JSON.stringify({
                        meta: {
                            serverName: "VMineLauncher Offline Auth",
                            implementationName: "VMineLauncher",
                            implementationVersion: pjson.version,
                            links: {
                                homepage: "https://vlados63k.xyz",
                                register: "https://vlados63k.xyz",
                            }
                        },
                        skinDomains: ["127.0.0.1"],
                        signaturePublicKeys: [
                            sign
                        ]
                    }));
                }
                else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: "OK", message: "Nothing" }));
                }
            });
        });

        console.log(`[FakeAuth ${this.fakeauthUUID}] Starting FakeAuth server on port ${this.port}...`);
        this.server.listen(this.port, '127.0.0.1');
    }

    stop() {
        if (this.server) {
            console.log(`[FakeAuth ${this.fakeauthUUID}] Stopping FakeAuth server...`);
            this.server.close();
            this.server = null;
        }
        else {
            throw new Error("Server is not running.");
        }
    }
}

module.exports = { FakeAuth };