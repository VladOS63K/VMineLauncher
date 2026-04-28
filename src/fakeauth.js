const { createServer } = require('http');
const { randomUUID } = require("crypto");
const conf = require("./config.js");
const pjson = require('../package.json');

class FakeAuth {
    constructor(port = 8080, playerName = "Player", uuid) {
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
        this.fakeauthUUID = randomUUID();
    }

    fakeauthUUID;
    server;

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
                    const uuid = this.uuid || "deadbeefdeadbeefdeadbeefdeadbeef";

                    console.log(`[FakeAuth ${this.fakeauthUUID}] Allowing ${name}...`);
                    res.end(JSON.stringify({
                        accessToken: "FakeAuthToken",
                        clientToken: data.clientToken || "client",
                        selectedProfile: { id: uuid, name: name },
                        availableProfiles: [{ id: uuid, name: name }]
                    }));
                }
                else if (url.includes('/join')) {
                    console.log(`[FakeAuth ${this.fakeauthUUID}] Allowing player to join the server...`);
                    res.writeHead(204);
                    res.end();
                }
                else if (url.includes('/profile/')) {
                    const uuid = url.split('/').pop();
                    console.log(`[FakeAuth ${this.fakeauthUUID}] Allowing access to profile for UUID: ${uuid}`);
                    res.end(JSON.stringify({
                        id: this.uuid,
                        name: this.playerName,
                        properties: []
                    }));
                }
                else if (url.startsWith('/skins/')) {
                    const skinName = url.split('/').pop();
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
                    return;
                }
                else if (req.method === 'GET' && (url === '/' || url === '')) {
                    console.log(`[FakeAuth ${this.fakeauthUUID}] Metadata requested, providing FakeAuth server information...`);
                    res.writeHead(200);
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
                        skinDomains: []
                    }));
                }
                else {
                    res.writeHead(200);
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