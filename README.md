<div align="center">
  <p> 
    <a href="https://discord.gg/milrato" title="Join our Discord Server"><img alt="Built with Love" src="https://forthebadge.com/images/badges/built-with-love.svg"></a>
    <a href="https://discord.gg/milrato" title="Join our Discord Server"><img alt="Made with Javascript" src="https://forthebadge.com/images/badges/made-with-javascript.svg"></a>
  </p>
  <p>
    <a href="https://discord.gg/milrato"><img src="https://discord.com/api/guilds/773668217163218944/embed.png" alt="Discord server"/></a>
    <a href="https://www.npmjs.com/package/remote-sqlite-database"><img src="https://img.shields.io/npm/v/remote-sqlite-database.svg?maxAge=3600" alt="NPM version" /></a>
    <a href="https://www.npmjs.com/package/remote-sqlite-database"><img src="https://img.shields.io/npm/dt/remote-sqlite-database.svg?maxAge=3600" alt="NPM downloads" /></a>
    <a href="https://discord.gg/milrato"><img src="https://maintained.cc/SDBagel/Maintained/2?" alt="Get Started Now"></a>
    <a href="https://www.paypal.com/MilratoDevelopment"><img src="https://img.shields.io/badge/donate-patreon-F96854.svg" alt="Patreon" /></a>
  </p>
  <p>
    <a href="https://npmjs.com/package/remote-sqlite-database/"><img src="https://nodei.co/npm/remote-sqlite-database.png?downloads=true&stars=true" alt="npm installnfo" /></a>
  </p>
</div>

# remote-sqlite-database
- A remote nodejs Database using sqlite
- It has auto-restore features
- It is fast
- It uses enmap aka sqlite
- The clients are cached
- Supports **SHARDED** Applications (like Discord Bots, which used enmap before)

# Installation
```
npm install https://github.com/Tomato6966/remote-sqlite-database
npm install remote-sqlite-database
```

# Usage
1. Create the DB  - Create a File-Folder-Project, at your CACHE-SERVER (it's a cache and db at the same time) and put in this Code:

<details>
  <summary>Click to see the Code</summary>

```js
const { remoteCacheServer } = require("remote-sqlite-database");

const Server = new remoteCacheServer({
    username: "TheUserNameForTheCacheServer",
    password: "ThePasswordForTheCacheServer",
    name: "databaseName",
    dataDir: "./path/to/database/",
    port: 4040, // Any port
    tls: true,
    debug: false // if enabled u see all the actions ;)
});
// Following Events are optional
Server
    .on("serverReady", () => {
        console.log("DatabaseCacheServer ready and waiting for connections");
    })
    .on("serverError", (error) => {
        console.error("DatabaseCacheServer error, ERROR:\n", error, "\n---\n");
    })
    .on("serverClose", (reason) => {
        console.log("DatabaseCacheServer closed");
    })
    .on("serverConnect", (connection, payload) => {
        console.log("DatabaseCacheServer a Client Connected");
    })
    .on("serverDisconnect", (connection, reason) => {
        console.log("DatabaseCacheServer a Client Disconnected");
    })
    .on("serverMessage", (message) => {
        // console.log("DatabaseCacheServer, received a Message", message);
    })
    .on("serverRequest", async (request, response, client) => {
        // console.log("DatabaseCacheRequest, received a Request", request);
    });
```
  
</details>

2. To connect the cache do this:

<details>
  <summary>Click to see the Code</summary>

```js
const { remoteCacheClient } = require("remote-sqlite-database");
const client = new remoteCacheClient({
    username: "db_cache",
    password: "db_cache",
    host: "localhost",
    port: 5000,
    tls: true,
    keyPathing: true, // true|false ... enables if the key contains a "." that it's splitted to a path, e.g.: "hello.world.hi" --> key = "hello", path = "world.hi", db.get("hello") --> {world: {hi: "value"}}
}); 
//keyPathing should be set to false, if you want to do "key.hello" as a key

// following events are optional
client
    .on("cacheReady", () => {
        console.log("DATABASECACHECLIENT ready and connected");
    })
    .on("cacheError", (error) => {
        console.error("DATABASECACHECLIENT error, ERROR:\n", error, "\n---\n");
    })
    .on("cacheClose", (reason) => {
        console.log("DATABASECACHECLIENT closed, REASON?:\n", reason, "\n---\n");
    })
    .on("cacheMessage", (message) => {
        console.log("message", message);
    })
    .on("cacheRequest", async (request, response, client) => {
        console.log("REQUEST", request);
    });

// example usage
async function yourProgram(){
    await client.set("hi", "bye").then(console.log).catch(console.error);
    await client.get("hi").then(console.log).catch(console.error);
    await client.set("array", []).then(console.log).catch(console.error);
    await client.push("array", "element").then(console.log).catch(console.error);
    await client.push("array", "element2").then(console.log).catch(console.error);
    await client.size().then(console.log).catch(console.error);
    await client.get("array").then(console.log).catch(console.error);
    await client.all().then(console.log).catch(console.error);
}

yourProgram();
```
</details>

# Methods (Functions) for the CACHE-CLIENT(s)
- *all "path"'s are optional*
- get(key, path) *get any value from a key*
- set(key, path) *set any value in a key*
- add(key, amount, path) *add a number to a key/path*
- substract(key, amount, path) *removes a number from a key/path*
- math(key, operator, amount, path) *make a mathematical operation like adding, substracting multiplying etc.*
- push(key, element, path) *add an element in an array*
- remove(key, element, path) *remove an element out of an array*
- has(key, path) *check if the key / key-path exists*
- delete(key, path) *delete something*
- clear() *clears the whole cache Map*
- all() / values() *array of all values*
- entries() *array of [key, value]*
- keys() *array of all keys*
- ping() *shows the ping*
- size() *shows the cache-map-size*
- ensure(key, data, path) *ensures data in the db*

# Events for the CACHE-SERVER

- serverReady *shows when the server is ready, you don't need to listen to it!*
- serverError *shows when the server errors, you don't need to listen to it!*
- serverClose *shows when the server closes, you don't need to listen to it!*
- serverConnect *shows when a client connects, you don't need to listen to it!*
- serverDisconnect *shows when a client disconnects, you don't need to listen to it!*
- serverMessage *receives messages from a cache-client, you don't need to listen to it!*
- serverRequest *received requets from a cache-client, used for sending the cache datas, you don't need to listen to it!*
- 
# Events for the CACHE-Client(s)

- cacheReady *shows when the server is ready, you don't need to listen to it!*
- cacheError *shows when the server errors, you don't need to listen to it!*
- cacheClose *shows when the server closes, you don't need to listen to it!*
- cacheMessage *receives messages from the cache-server, you don't need to listen to it!*
- cacheRequest *receives requets from the cache-server, you don't need to listen to it!*
