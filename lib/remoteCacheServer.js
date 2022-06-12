const Enmap = require("enmap");
const { Server } = require("net-ipc");
const { EventEmitter } = require('events')

class RemoteCacheServer extends EventEmitter {
    /**
     * 
     * @param {object} options Example Object:
     * {
     *  port: number,
     *  username: "string",
     *  password: "string",
     *  tls: boolean,
     *  debug: boolean, //if it should log all the actions
     * }  
     * @returns DatabaseServer
     */
    constructor(options = {}) {
        super();

        if(!options.port || typeof options.port != "number") throw new SyntaxError("Missing the Option port");
        if(!options.username || typeof options.username != "string") throw new SyntaxError("Missing the Option username");
        if(!options.password || typeof options.password != "string") throw new SyntaxError("Missing the Option password");
        if(options.tls && typeof options.tls != "boolean") throw new SyntaxError("Provided option tls is not a Boolean");
        this.debug = options.debug !== undefined && typeof options.debug == "boolean" ? options.debug : false;
        if(this.debug) {
            console.log({
                name: options.name || "database",
                dataDir: options.dataDir
            })
        }
        this.cache = new Enmap({
            name: options.name || "database",
            dataDir: options.dataDir
        });
        this.port = options.port || 5000;
        this.tls = options.tls || true; 
        this.username = options.username || "database_cache";
        this.password = Buffer.from(options.password) || Buffer.from("database_password");

        this.server = new Server({
            port: this.port,
            tls: true,
            options: {
                pskCallback: (socket, identity) => {
                    if(identity === this.username) { // confirm username
                        return this.password; // return password for verification
                    }
                },
                ciphers: "PSK",
            }
        });

        return this.init(), this;
    }
    
    /** 
     * Just starts the server, when the class is initialized
     * @private
     */
    init() {
        // start the server
        this.server.start().catch(console.error);
        this.server
            .on("ready", () => {
                this.emit('serverReady', null);
            })
            .on("close", () => {
                this.emit('serverClosed', null);
            })
            .on("connect", (connection, payload) => {
                this.emit('serverConnect', connection, payload);
            })
            .on("disconnect", (connection, reason) => {
                this.emit('serverDisconnect', connection, reason);
            })
            .on("error", (error) => {
                this.emit('serverError', error);
            })
            .on("message", (message, connection) => {
                this.emit('serverMessage', message, connection);
            })
            .on("request", async (request, response, client) => {
                this.emit('serverRequest', request, response, client);

                /* new Enmap()
                    set(key, value, path)	--> set
                    get(key, path)    	--> get
                    clear()	        --> clear
                    delete(key, path)	    --> delete
                    math(key, operator, value, path)
                    has(key, path)	    --> has		
                    entries()	    --> entries
                    keys()	        --> keys
                    values()	    --> All
                */
                try {
                    if(this.debug) {
                        console.log(`received action: "${request.dbAction}"`);
                    }
                    
                    if(request.dbAction && request.dbAction === "get" && request.key) {
                        const d = this.cache.get(request.key, request.path);
                        if(d === undefined) {
                            return await response({ error: "Key_is_not_in_Cache" }).catch(e => console.error(e, `RESPONSE - SERVER - GET`))
                        }
                        return await response({ data: d });
                    } else if(request.dbAction && request.dbAction === "clear") {
                        this.cache.clear();
                        await this.updateCache(request.key);
                        return await response({ data: "success_cleared_the_cache" }).catch(e => console.error(e, `RESPONSE - SERVER - CLEAR`))
                    } else if(request.dbAction && request.dbAction === "delete" && request.key) {
                        this.cache.delete(request.key, request.path);
                        await this.updateCache(request.key);
                        return await response({ data: "success_deleted_the_cache_key" }).catch(e => console.error(e, `RESPONSE - SERVER - DELETE`))
                    } else if(request.dbAction && request.dbAction === "has" && request.key) {
                        return await response({ data: this.cache.has(request.key, request.path) }).catch(e => console.error(e, `RESPONSE - SERVER - HAS`))
                    } else if(request.dbAction && request.dbAction === "set" && request.key && request.data) {
                        this.cache.set(request.key, request.data, request.path);
                        await this.updateCache(request.key);
                        return await response({ data: "success_set_the_cache" }).catch(e => console.error(e, `RESPONSE - SERVER - SET`))
                    } else if(request.dbAction && request.dbAction === "ensure" && request.key && request.data) {
                        if(this.cache.has(request.key) && this.cache.has(request.key, request.path)) {
                            if(!this.compare(this.cache.get(request.key, request.path), request.data)) {
                                this.cache.ensure(request.key, request.data, request.path);
                                await this.updateCache(request.key);
                                return await response({ data: "success_ensured" }).catch(e => console.error(e, `RESPONSE - SERVER - ENSURE`))
                            }
                            return await response({ data: "no_ensure_needed" }).catch(e => console.error(e, `RESPONSE - SERVER - ENSURE`))
                        } else {
                            this.cache.ensure(request.key, request.data, request.path);
                            await this.updateCache(request.key);
                            return await response({ data: "success_ensured" }).catch(e => console.error(e, `RESPONSE - SERVER - ENSURE`))
                        }
                    } else if(request.dbAction && (request.dbAction === "values" || request.dbAction === "all")) {
                        return await response({ data: [...this.cache.array()] }).catch(e => console.error(e, `RESPONSE - SERVER - VALUES`))
                    } else if(request.dbAction && request.dbAction === "entries") {
                        return await response({ data: [...this.cache.entries()] }).catch(e => console.error(e, `RESPONSE - SERVER - ENTRIES `))
                    } else if(request.dbAction && request.dbAction === "keys") {
                        return await response({ data: [...this.cache.keyArray()] }).catch(e => console.error(e, `RESPONSE - SERVER - KEYS`))
                    } else if(request.dbAction && (request.dbAction == "count" ||request.dbAction === "size")) {
                        return await response({ data: this.cache.count })
                    } else if(request.dbAction && request.dbAction === "add" && request.key && request.data) {
                        this.cache.math(request.key, "+", request.data, request.path)
                        
                        await this.updateCache(request.key);
                        return await response({ data: "success_added_the_amount" }).catch(e => console.error(e, `RESPONSE - SERVER - ADD`))
                    } else if(request.dbAction && request.dbAction === "math" && request.key && request.data && request.operator) {
                        const { key, operator, data, path } = request;
                        this.cache.math(key, operator, data, path);
                        await this.updateCache(request.key);
                        return await response({ data: "success_math_the_amount" }).catch(e => console.error(e, `RESPONSE - SERVER - MATH`))
                    } else if(request.dbAction && request.dbAction === "push" && request.key && request.data) {

                        this.cache.push(request.key, request.data, request.path);
                        await this.updateCache(request.key);
                        return await response({ data: "success_pushed_the_item" }).catch(e => console.error(e, `RESPONSE - SERVER - PUSH`))
                    } else if(request.dbAction == "startSync") {
                        return await response({ data: [...this.cache.entries()] })
                    } else if(request.dbActeion && request.dbAction == "remove" && request.key && request.data) {
                        this.cache.remove(request.key, request.data, request.path);
                        await this.updateCache(request.key);
                        return await response({ data: "success_removed_the_item" }).catch(e => console.error(e, `RESPONSE - SERVER - REMOVE`))
                    } else if(request.dbAction && request.dbAction == "keyArray") {
                        await this.updateCache(request.key);
                        return await response({ data: this.cache.keyArray() }).catch(e => console.error(e, `RESPONSE - SERVER - KEYARRAY`))
                    } 
                    
                    else {
                        await response({ error: `wrong_action_response - ${request.dbAction} [${request.key}]`,  }).catch(e => console.error(e, `RESPONSE - SERVER - WRONG ACTION`))
                    }
                } catch(e) {
                    if(this.debug) {
                        console.error("received action-error: ", request.dbAction, e);
                    }
                    await response({ error: e, request }).catch(e => console.error(e, `RESPONSE - SERVER - ERROR`))
                }
                

            });
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
     * Make requests to update the client-caches
     * @param {string} key Key for the data to be
     * @param {Boolean} clear Optional: if it was a clear db request 
     * @returns {Promise<*>|Promise<Array<*>>} of the responses from all the clients
     */
    async updateCache(key, clear = false) {
        if(this.debug) console.log("Updating cache on", this.server.connections.length, "Connections")
        if(clear) {
            return await this.server.survey({requestSync: true, requestSyncClear: true}).catch(e => console.error(e, `SURVEY 1`))
        }
        if(this.cache.has(key)) {
            const data = this.cache.get(key);
            return await this.server.survey({ requestSync: key, requestSyncData: data }).catch(e => console.error(e, `SURVEY 1`))
        } else {
            return await this.server.survey({ requestSync: key, requestSyncData: undefined }).catch(e => console.error(e, `SURVEY 1`))
        }
    }
} 


module.exports = RemoteCacheServer;
