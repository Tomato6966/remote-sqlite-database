const Enmap = require("enmap");
const { Server } = require("net-ipc");
const { EventEmitter } = require('events')

class RemoteCacheServer extends EventEmitter {
    constructor(options) {
        super();

        if(!options.port || typeof options.port != "number") throw new SyntaxError("Missing the Option port");
        if(!options.username || typeof options.username != "string") throw new SyntaxError("Missing the Option username");
        if(!options.password || typeof options.password != "string") throw new SyntaxError("Missing the Option password");
        if(options.tls && typeof options.tls != "boolean") throw new SyntaxError("Provided option tls is not a Boolean");

        console.log("ENMAP DATABASE DATA")
        console.table({ name: options.name || "database", dataDir: options.dataDir })

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
                    if(request.dbAction && request.dbAction === "get" && request.key) {
                        const d = this.cache.get(request.key, request.path);
                        if(d === undefined) {
                            return await response({ error: "Key_is_not_in_Cache" })
                        }
                        return await response({ data: d });
                    } else if(request.dbAction && request.dbAction === "clear") {
                        this.cache.clear();
                        await this.updateCache(request.key);
                        return await response({ error: "success_cleared_the_cache" })
                    } else if(request.dbAction && request.dbAction === "delete" && request.key) {
                        this.cache.delete(request.key, request.path);
                        await this.updateCache(request.key);
                        return await response({ data: "success_deleted_the_cache_key" });
                    } else if(request.dbAction && request.dbAction === "has" && request.key) {
                        return await response({ data: this.cache.has(request.key, request.path) });
                    } else if(request.dbAction && request.dbAction === "set" && request.key && request.data) {
                        this.cache.set(request.key, request.data, request.path);
                        await this.updateCache(request.key);
                        return await response({ data: "success_set_the_cache" })
                    } else if(request.dbAction && request.dbAction === "ensure" && request.key && request.data) {
                        if(this.cache.has(request.key) && this.cache.has(request.key, request.path)) {
                            if(!this.compare(this.cache.get(request.key, request.path), request.data)) {
                                this.cache.ensure(request.key, request.data, request.path);
                                await this.updateCache(request.key);
                                return await response({ data: "success_ensured" })
                            }
                            return await response({ data: "no_ensure_needed" })
                        } else {
                            this.cache.ensure(request.key, request.data, request.path);
                            await this.updateCache(request.key);
                            return await response({ data: "success_ensured" })
                        }
                    } else if(request.dbAction && (request.dbAction === "values" || request.dbAction === "all")) {
                        return await response({ data: [...this.cache.values()] })
                    } else if(request.dbAction && request.dbAction === "entries") {
                        return await response({ data: [...this.cache.entries()] })
                    } else if(request.dbAction && request.dbAction === "keys") {
                        return await response({ data: [...this.cache.keys()] })
                    } else if(request.dbAction && (request.dbAction == "count" ||request.dbAction === "size")) {
                        return await response({ data: this.cache.count })
                    } else if(request.dbAction && request.dbAction === "add" && request.key && request.data) {
                        this.cache.math(request.key, "+", request.data, request.path)
                        
                        await this.updateCache(request.key);
                        return await response({ data: "success_added_the_amount" });
                    } else if(request.dbAction && request.dbAction === "push" && request.key && request.data) {

                        this.cache.push(request.key, request.data, request.path);
                        await this.updateCache(request.key);
                        return await response({ data: "success_pushed_the_item" });
                    } else if(request.dbAction == "startSync") {
                        return await response({ data: [...this.cache.entries()] })
                    } else if(request.dbAction && request.dbAction == "remove" && request.key && request.data) {
                        this.cache.remove(request.key, request.data, request.path);
                        await this.updateCache(request.key);
                        return await response({ data: "success_removed_the_item" });
                    } else if(request.dbAction && request.dbAction == "keyArray") {
                        await this.updateCache(request.key);
                        return await response({ data: this.cache.keyArray() });
                    }
                    
                    else {
                        await response({ error: "wrong_action_response", request })
                    }
                } catch(e) {
                    await response({ error: e, request })
                }
                

            });
    }
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
    async updateCache(key, clear = false) {
        // console.log("Updating cache on", this.server.connections.length, "Connections")
        if(clear) {
            return await this.server.survey({requestSync: true, requestSyncClear: true})
        }
        if(this.cache.has(key)) {
            const data = this.cache.get(key);
            return await this.server.survey({ requestSync: key, requestSyncData: data })
        } else {
            return await this.server.survey({ requestSync: key, requestSyncData: undefined })
        }
    }
} 


module.exports = RemoteCacheServer;
