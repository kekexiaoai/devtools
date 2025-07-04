// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
// This file is automatically generated. DO NOT EDIT
import {types} from '../models';

export function DeleteConfig(arg1:string):Promise<void>;

export function DeleteSyncPair(arg1:string):Promise<void>;

export function GetConfigs():Promise<Array<types.SSHConfig>>;

export function GetSyncPairs(arg1:string):Promise<Array<types.SyncPair>>;

export function SaveConfig(arg1:types.SSHConfig):Promise<void>;

export function SaveSyncPair(arg1:types.SyncPair):Promise<void>;

export function SelectDirectory(arg1:string):Promise<string>;

export function SelectFile(arg1:string):Promise<string>;

export function ShowConfirmDialog(arg1:string,arg2:string):Promise<string>;

export function ShowErrorDialog(arg1:string,arg2:string):Promise<void>;

export function ShowInfoDialog(arg1:string,arg2:string):Promise<void>;

export function StartWatching(arg1:string):Promise<void>;

export function StopWatching(arg1:string):Promise<void>;

export function TestConnection(arg1:types.SSHConfig):Promise<string>;

export function UpdateRemoteFileFromClipboard(arg1:string,arg2:string,arg3:string,arg4:boolean):Promise<void>;
