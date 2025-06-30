export namespace types {
	
	export class SSHConfig {
	    id: string;
	    name: string;
	    host: string;
	    port: number;
	    user: string;
	    authMethod: string;
	    password: string;
	    keyPath: string;
	
	    static createFrom(source: any = {}) {
	        return new SSHConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.authMethod = source["authMethod"];
	        this.password = source["password"];
	        this.keyPath = source["keyPath"];
	    }
	}
	export class SyncPair {
	    id: string;
	    configId: string;
	    localPath: string;
	    remotePath: string;
	    syncDeletes: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SyncPair(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.configId = source["configId"];
	        this.localPath = source["localPath"];
	        this.remotePath = source["remotePath"];
	        this.syncDeletes = source["syncDeletes"];
	    }
	}

}

