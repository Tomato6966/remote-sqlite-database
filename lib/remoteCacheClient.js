
const { Client } = require("net-ipc");
const { EventEmitter } = require('events')

class RemoteCacheClient extends EventEmitter {
    /**
     * 
     * @param {object} options Example Object:
     * {
     *  host: "string",
     *  port: number,
     *  username: "string",
     *  password: "string",
     *  tls: boolean,
     *  keyPathing: boolean, //enables if the key contains a "." that it's splitted to a path, e.g.: "hello.world.hi" --> key = "hello", path = "world.hi", db.get("hello") --> {world: {hi: "value"}}
     * } 
     * @returns DatabaseClient
     */
    constructor(options = {}) {
        super();

        if(!options.host || typeof options.host != "string") throw new SyntaxError("Missing the Option host");
        if(!options.port || typeof options.port != "number") throw new SyntaxError("Missing the Option port");
        if(!options.username || typeof options.username != "string") throw new SyntaxError("Missing the Option username");
        if(!options.password || typeof options.password != "string") throw new SyntaxError("Missing the Option password");
        if(options.tls && typeof options.tls != "boolean") throw new SyntaxError("Provided option tls is not a Boolean");
        if(options.keyPathing && typeof options.keyPathing != "boolean") throw new SyntaxError("Provided option keyPathing is not a Boolean");

        this.host = options.host || "localhost";
        this.port = options.port || 5000;
        this.tls = options.tls !== undefined && typeof options.tls == "boolean" ? options.tls : true; 
        this.username = options.username || "database_cache";
        this.password = Buffer.from(options.password) || Buffer.from("database_password");
        this.keyPathing = options.keyPathing !== undefined && typeof options.keyPathing == "boolean" ? options.keyPathing : false; 

        this.client = new Client({
            host: this.host,
            port: this.port,
            tls: this.tls,
            options: {
                pskCallback: () => {
                    // return the user and the key for verification
                    return {
                        identity: this.username,
                        psk: Buffer.from(this.password)
                    }
                },
                ciphers: "PSK", // enable PSK ciphers, they are disabled by default
                checkServerIdentity: () => void 0, // bypass SSL certificate verification since we are not using certificates
            }
        });

        this.cache = new Map();
        this.sync = new Map();
        return this.init(), this;
    }

    /**
     * Generates the correct key with keypathing
     * @param {string} key 
     * @returns {object} containing the main and keyPath, if options.keyPathing == true && key.includes(".")
     */
    getKeyPath(key) {
        if(!this.keyPathing || !key.includes(".")) {
            return {
                main: key,
                keyPath: null
            }
        }
        return {
            main: key.split(".").shift(),
            keyPath: key.split(".").slice(1)?.join(".") || null,
        }
    }
    
    /** 
     * Just connect to the server, when the class is initialized
     * @private
     */
    init() {
        this.client.connect().catch(console.error);
        this.client
            .on("ready", async () => {
                const entries = await this.handleRequest("startSync")
                this.cache = new Map(entries);
                this.emit('cacheReady', null);
            })
            .on("error", (error) => {
                this.emit('cacheError', error);
            })
            .on("close", (reason) => {
                this.emit('cacheClose', reason);
            })
            .on("message", (message) => {
                this.emit('cacheMessage', message);
            })
            .on("request", async (request, response, client) => {
                if(request.requestSync) {
                    if(request.requestSyncData === undefined) {
                        this.cache.delete(request.requestSync)
                    } else if(request.requestSyncClear) {
                        this.cache.clear();
                    } else {
                        this.cache.set(request.requestSync, request.requestSyncData);
                    }
                    await response({syncUpdate: "true"}).catch(e => console.error(e, `RESPONSE - CLIENT`))
                } else this.emit('cacheRequest', request, response, client);
            });
    }
    
    /**
     * Handles the pathing for get operations
     * @param {string} key | Key/KeyPath for the data
     * @param {string|null} path Optional: lodash-path 
     * @returns Correct Object-lodash Data, if there is a path
     */
    async handlePath(key, path = null) {
        // Transform the key
        const { main, keyPath } = this.getKeyPath(key)
        if(!path && keyPath) path = keyPath, key = main;
        else if(path && keyPath) path = `${keyPath}.${path}`, key = main;
        
        if(!path) return this.cache.get(key);
        const data = this.cache.get(key);
        if(!data) return data;
        return lodash.get(data, path);
    }
    
    /**
     * Compares two objects
     * @param {object} data | already existing Data, make sure it exists
     * @param {object} toCompare | new data making sure that it's an object 
     * @returns {boolean} if something changed or not
     */
    compare(data, toCompare) {
        const keys1 = Object.keys(data);
        const keys2 = Object.keys(toCompare);
        if (keys1.length !== keys2.length) {
            return false;
        }
        for (const key of keys1) {
            const val1 = data[key];
            const val2 = toCompare[key];
            const areObjects = lodash.isObject(val1) && lodash.isObject(val2);
            if (areObjects && !this.compare(val1, val2) || !areObjects && val1 !== val2) {
                return false;
            }
        }
        return true;
    }

    /**
     * Make sure that data exists in the key
     * @param {string} key | Key/KeyPath for the data
     * @param {any} data | Data to set, can be anything, preferable an object 
     * @param {string|null} path Optional: lodash-path 
     * @returns {string} of validation
     */
    async ensure(key, data, path = null) {
        if(!key) throw "missing a key to ensure";
        if(data === undefined) throw "missing data to ensure";

        // Transform the key
        const { main, keyPath } = this.getKeyPath(key)
        if(!path && keyPath) path = keyPath, key = main;
        else if(path && keyPath) path = `${keyPath}.${path}`, key = main;

        if(this.cache.has(key) && this.cache.has(key, path)) {
            if(!this.compare(this.cache.get(key, path), data)) {
                return this.handleRequest("ensure", key, data, path);
            }
            return "no_ensure_needed"
        } else {
            return this.handleRequest("ensure", key, data, path);
        }
    }

    /**
     * Apply a mathematical operation to a key/path
     * @param {string} key | Key/KeyPath for the data
     * @param {*} operator Mathematical Operator like "+", "-", "*", "/"
     * @param {number} value number to use
     * @param {string|null} path Optional: lodash-path 
     * @returns {number} new value
     */
    async math(key, operator, value, path = null) {
        if(!key) throw "missing a key to math";
        if(!operator) throw "missing the operator to math";
        if(value === undefined || typeof value !== "number") throw "missing value to math";
        
        // Transform the key
        const { main, keyPath } = this.getKeyPath(key)
        if(!path && keyPath) path = keyPath, key = main;
        else if(path && keyPath) path = `${keyPath}.${path}`, key = main;

        return this.handleRequest("math", key, data, path, operator);
    }

    /**
     * Get all Keys from the cache | identical to Map.keys()
     * @returns {array} of all keys
     */
    async keyArray() {
        return [...this.cache.keys()]
    }

    /**
     * Get Data from the DB (Client-Cache)
     * @param {string} key | Key/KeyPath for the data
     * @param {string|null} path Optional: lodash-path 
     * @returns {any} the value of whateve is in that key/path
     */
    async get(key, path = null) {
        if(!key) throw "Missing a key to get"
        
        // Transform the key
        const { main, keyPath } = this.getKeyPath(key)
        if(!path && keyPath) path = keyPath, key = main;
        else if(path && keyPath) path = `${keyPath}.${path}`, key = main;

        return this.handlePath(key, path);
    }

    /**
     * Add a Number onto a Key/path
     * @param {string} key | Key/KeyPath for the data
     * @param {number} amount number to use
     * @param {string|null} path Optional: lodash-path 
     * @returns {number} new value
     */
    async add(key, amount, path = null) {
        if(!key) throw "Missing a key to add"
        if(!amount || typeof amount != "number") throw "Missing the Amount (Number) to add to the Cache"

        // Transform the key
        const { main, keyPath } = this.getKeyPath(key)
        if(!path && keyPath) path = keyPath, key = main;
        else if(path && keyPath) path = `${keyPath}.${path}`, key = main;

        return this.handleRequest("math", key, amount, path, "+");
    }

    /**
     * Remove a Number from a Key/Path
     * @param {string} key | Key/KeyPath for the data
     * @param {number} amount number to use
     * @param {string|null} path Optional: lodash-path 
     * @returns {number} new value
     */
    async substract(key, amount, path = null) {
        if(!key) throw "Missing a key to substract"
        if(!amount || typeof amount != "number") throw "Missing the Amount (Number) to substract to the Cache"

        // Transform the key
        const { main, keyPath } = this.getKeyPath(key)
        if(!path && keyPath) path = keyPath, key = main;
        else if(path && keyPath) path = `${keyPath}.${path}`, key = main;

        return this.handleRequest("math", key, amount, path, "-");
    }

    /**
     * Pushes an element into an array
     * @param {string} key | Key/KeyPath for the data
     * @param {any} element Element to add to the db
     * @param {string|null} path Optional: lodash-path 
     * @returns {string} of validation
     */
    async push(key, element, path = null) {
        if(!key) throw "Missing a key to push"
        if(!element) throw "Missing the Element to push to the Cache"

        // Transform the key
        const { main, keyPath } = this.getKeyPath(key)
        if(!path && keyPath) path = keyPath, key = main;
        else if(path && keyPath) path = `${keyPath}.${path}`, key = main;

        return this.handleRequest("push", key, element, path);
    }
    
    /**
     * Remove an element from an array
     * @param {string} key | Key/KeyPath for the data
     * @param {any} element Element to remove from the db
     * @param {string|null} path Optional: lodash-path 
     * @returns {string} of validation
     */
    async remove(key, element, path = null) {
        if(!key) throw "Missing a key to remove"
        if(!element) throw "Missing the Element to remove from the Cache"

        // Transform the key
        const { main, keyPath } = this.getKeyPath(key)
        if(!path && keyPath) path = keyPath, key = main;
        else if(path && keyPath) path = `${keyPath}.${path}`, key = main;

        return this.handleRequest("remove", key, element, path);
    }

    /**
     * 
     * @param {string} key | Key/KeyPath for the data
     * @param {string|null} path Optional: lodash-path 
     * @returns {boolean} if it exists or not
     */
    async has(key, path = null) {
        if(!key) throw "Missing a key to check for"
        
        // Transform the key
        const { main, keyPath } = this.getKeyPath(key)
        if(!path && keyPath) path = keyPath, key = main;
        else if(path && keyPath) path = `${keyPath}.${path}`, key = main;

        return this.handlePath(key, path);
    }

    /**
     * delets the data from the key/path
     * @param {string} key | Key/KeyPath for the data
     * @param {string|null} path Optional: lodash-path 
     * @returns {string} of validation
     */
    async delete(key, path = null) {
        if(!key) throw "Missing a key to delete"

        // Transform the key
        const { main, keyPath } = this.getKeyPath(key)
        if(!path && keyPath) path = keyPath, key = main;
        else if(path && keyPath) path = `${keyPath}.${path}`, key = main;

        return this.handleRequest("delete", key, path);
    }

    /**
     * Sets value in the database and updates the caches automatically
     * @param {string} key | Key/KeyPath for the data
     * @param {any} data | Data to set, can be anything, preferable an object 
     * @param {string|null} path Optional: lodash-path 
     * @returns {string} of validation
     */
    async set(key, data, path = null) {
        if(!key) throw "Missing a key to set"
        if(data === undefined) throw "Missing a data to set"
        
        // Transform the key
        const { main, keyPath } = this.getKeyPath(key)
        if(!path && keyPath) path = keyPath, key = main;
        else if(path && keyPath) path = `${keyPath}.${path}`, key = main;

        return this.handleRequest("set", key, data, path);
    }

    /**
     * Get the Size of the Cache-Db (== to the DB)
     * @returns {number} Amount of entries | identical to new Map().size
     */
    async size() {
        return this.cache.size;
    }

    /**
     * Pings the IPC Server
     * @returns {number} WS-Ping to the Database Server in ms
     */
    async ping() {
        return await this.client.ping();
    }

    /**
     * Get all values
     * @returns {array} of all valuesdb | identical to new Map().values()
     */
    async values() {
        return [...this.cache.values()];
    }

    /**
     * Get all Values
     * @returns {array} of all values | identical to new Map().values()
     */
    async all() {
        return [...this.cache.values()];
    }
    
    /**
     * Get all keys
     * @returns {array} of all keys in the db | identical to new Map().keys()
     */
    async keys() {
        return [...this.cache.keys()];
    }

    /**
     * Get all keys and values
     * @returns {array} of arrays containing the [0]key and [1]value | identical to new Map().entries()
     */
    async entries() {
        return [...this.cache.entries()];
    }

    /**
     * 
     * @param {*} type 
     * @param {string} key | Key/KeyPath for the data
     * @param {any} data | Data to set, can be anything, preferable an object 
     * @param {string|null} path Optional: lodash-path 
     * @param {*} operator Mathematical Operator like "+", "-", "*", "/"
     * @returns {Promise<*>} Result of the request, usually a string / value data of the db
     */
    async handleRequest(type, key, data, path, operator) {
        const response = await this.client.request({ 
            dbAction: type, 
            key, 
            data, 
            operator,
            path
        }).catch(err => { 
            console.table({ dbAction: type,  key,  data: typeof data, operator, path });
            console.error(err, `handleRequest - CLIENT | ${type} [${key}]`); 
            return { error: err }
        });

        if(response?.error) {
            throw response.error
        }
        return response.data;
    }
}  
module.exports = RemoteCacheClient;
