export namespace keys {
	
	export class Accelerator {
	    Key: string;
	    Modifiers: string[];
	
	    static createFrom(source: any = {}) {
	        return new Accelerator(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Key = source["Key"];
	        this.Modifiers = source["Modifiers"];
	    }
	}

}

export namespace menu {
	
	export class MenuItem {
	    Label: string;
	    Role: number;
	    Accelerator?: keys.Accelerator;
	    Type: string;
	    Disabled: boolean;
	    Hidden: boolean;
	    Checked: boolean;
	    SubMenu?: Menu;
	
	    static createFrom(source: any = {}) {
	        return new MenuItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Label = source["Label"];
	        this.Role = source["Role"];
	        this.Accelerator = this.convertValues(source["Accelerator"], keys.Accelerator);
	        this.Type = source["Type"];
	        this.Disabled = source["Disabled"];
	        this.Hidden = source["Hidden"];
	        this.Checked = source["Checked"];
	        this.SubMenu = this.convertValues(source["SubMenu"], Menu);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Menu {
	    Items: MenuItem[];
	
	    static createFrom(source: any = {}) {
	        return new Menu(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Items = this.convertValues(source["Items"], MenuItem);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace sshtunnel {
	
	export class ActiveTunnelInfo {
	    id: string;
	    configId: string;
	    alias: string;
	    type: string;
	    localAddr: string;
	    remoteAddr: string;
	    status: string;
	    statusMsg: string;
	
	    static createFrom(source: any = {}) {
	        return new ActiveTunnelInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.configId = source["configId"];
	        this.alias = source["alias"];
	        this.type = source["type"];
	        this.localAddr = source["localAddr"];
	        this.remoteAddr = source["remoteAddr"];
	        this.status = source["status"];
	        this.statusMsg = source["statusMsg"];
	    }
	}
	export class ManualHostInfo {
	    hostName: string;
	    port: string;
	    user: string;
	    identityFile?: string;
	
	    static createFrom(source: any = {}) {
	        return new ManualHostInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hostName = source["hostName"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.identityFile = source["identityFile"];
	    }
	}
	export class SavedTunnelConfig {
	    id: string;
	    name: string;
	    tunnelType: string;
	    localPort: number;
	    gatewayPorts: boolean;
	    remoteHost?: string;
	    remotePort?: number;
	    hostSource: string;
	    hostAlias?: string;
	    manualHost?: ManualHostInfo;
	
	    static createFrom(source: any = {}) {
	        return new SavedTunnelConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.tunnelType = source["tunnelType"];
	        this.localPort = source["localPort"];
	        this.gatewayPorts = source["gatewayPorts"];
	        this.remoteHost = source["remoteHost"];
	        this.remotePort = source["remotePort"];
	        this.hostSource = source["hostSource"];
	        this.hostAlias = source["hostAlias"];
	        this.manualHost = this.convertValues(source["manualHost"], ManualHostInfo);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace types {
	
	export class HostKeyVerificationRequiredError {
	    alias: string;
	    fingerprint: string;
	    hostAddress: string;
	
	    static createFrom(source: any = {}) {
	        return new HostKeyVerificationRequiredError(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.alias = source["alias"];
	        this.fingerprint = source["fingerprint"];
	        this.hostAddress = source["hostAddress"];
	    }
	}
	export class PasswordRequiredError {
	    alias: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new PasswordRequiredError(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.alias = source["alias"];
	        this.message = source["message"];
	    }
	}
	export class ConnectionResult {
	    success: boolean;
	    errorMessage?: string;
	    passwordRequired?: PasswordRequiredError;
	    hostKeyVerificationRequired?: HostKeyVerificationRequiredError;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.errorMessage = source["errorMessage"];
	        this.passwordRequired = this.convertValues(source["passwordRequired"], PasswordRequiredError);
	        this.hostKeyVerificationRequired = this.convertValues(source["hostKeyVerificationRequired"], HostKeyVerificationRequiredError);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class LogEntry {
	    timestamp: string;
	    level: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new LogEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.level = source["level"];
	        this.message = source["message"];
	    }
	}
	
	export class SSHConfig {
	    id: string;
	    name: string;
	    host: string;
	    port: number;
	    user: string;
	    authMethod: string;
	    password: string;
	    keyPath: string;
	    clipboardFilePath?: string;
	
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
	        this.clipboardFilePath = source["clipboardFilePath"];
	    }
	}
	export class SSHHost {
	    alias: string;
	    hostName: string;
	    user: string;
	    port: string;
	    identityFile: string;
	    lastModified?: string;
	
	    static createFrom(source: any = {}) {
	        return new SSHHost(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.alias = source["alias"];
	        this.hostName = source["hostName"];
	        this.user = source["user"];
	        this.port = source["port"];
	        this.identityFile = source["identityFile"];
	        this.lastModified = source["lastModified"];
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
	export class TerminalSessionInfo {
	    id: string;
	    alias: string;
	    url: string;
	    type: string;
	
	    static createFrom(source: any = {}) {
	        return new TerminalSessionInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.alias = source["alias"];
	        this.url = source["url"];
	        this.type = source["type"];
	    }
	}

}

