"use strict";
// Electron's patched fs treats *.asar as virtual directories; use raw file I/O.
const fs = process.versions.electron ? require("original-fs") : require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");
const tls = require("node:tls");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const {Transform} = require("node:stream");
const {pipeline} = require("node:stream/promises");
const SOURCE = require("../vendor-source.json");
const ENDPOINT = "https://fe3.delivery.mp.microsoft.com/ClientWebService/client.asmx/secured";

function decodeXml(text) {
  return text.replace(/&(amp|lt|gt|quot|apos);/g, (_, key) => ({amp:"&",lt:"<",gt:">",quot:'"',apos:"'"}[key]));
}

function downloadUrl(xml, source=SOURCE) {
  for (const match of xml.matchAll(/<(?:\w+:)?FileLocation\b[^>]*>([\s\S]*?)<\/(?:\w+:)?FileLocation>/g)) {
    const read = name => match[1].match(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`))?.[1];
    if (read("FileDigest") !== source.sha1_base64) continue;
    const url = new URL(decodeXml(read("Url") || ""));
    if (!url.hostname.endsWith(".delivery.mp.microsoft.com") || url.username || url.password
        || !["http:","https:"].includes(url.protocol)) throw new Error("Unexpected Microsoft download host");
    return url.href;
  }
  throw new Error("The pinned Xiaomi package is not available from Microsoft");
}

function envelope(source=SOURCE) {
  const created = new Date().toISOString();
  const expires = new Date(Date.now()+300000).toISOString();
  return `<s:Envelope xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:s="http://www.w3.org/2003/05/soap-envelope">
<s:Header><a:Action s:mustUnderstand="1">http://www.microsoft.com/SoftwareDistribution/Server/ClientWebService/GetExtendedUpdateInfo2</a:Action>
<a:MessageID>urn:uuid:${crypto.randomUUID()}</a:MessageID><a:To s:mustUnderstand="1">${ENDPOINT}</a:To>
<o:Security s:mustUnderstand="1" xmlns:o="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
<Timestamp xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"><Created>${created}</Created><Expires>${expires}</Expires></Timestamp>
<wuws:WindowsUpdateTicketsToken wsu:id="ClientMSA" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" xmlns:wuws="http://schemas.microsoft.com/msus/2014/10/WindowsUpdateAuthorization">
<TicketType Name="MSA" Version="1.0" Policy="MBI_SSL">Retail</TicketType></wuws:WindowsUpdateTicketsToken></o:Security></s:Header>
<s:Body><GetExtendedUpdateInfo2 xmlns="http://www.microsoft.com/SoftwareDistribution/Server/ClientWebService">
<updateIDs><UpdateIdentity><UpdateID>${source.update_id}</UpdateID><RevisionNumber>${source.revision}</RevisionNumber></UpdateIdentity></updateIDs>
<infoTypes><XmlUpdateFragmentType>FileUrl</XmlUpdateFragmentType></infoTypes>
<deviceAttributes>BranchReadinessLevel=CB;CurrentBranch=rs_prerelease;OEMModel=Virtual Machine;FlightRing=WIS;AttrDataVer=21;SystemManufacturer=Microsoft Corporation;InstallLanguage=en-US;OSUILocale=en-US;InstallationType=Client;FlightingBranchName=external;FirmwareVersion=Hyper-V UEFI Release v2.5;SystemProductName=Virtual Machine;OSSkuId=48;FlightContent=Branch;App=WU;OEMName_Uncleaned=Microsoft Corporation;AppVer=10.0.16184.1001;OSArchitecture=AMD64;SystemSKU=None;UpdateManagementGroup=2;IsFlightingEnabled=1;IsDeviceRetailDemo=0;TelemetryLevel=3;OSVersion=10.0.16184.1001;DeviceFamily=Windows.Desktop;</deviceAttributes>
</GetExtendedUpdateInfo2></s:Body></s:Envelope>`;
}

async function resolveSource(signal) {
  const body=Buffer.from(envelope());
  const ca=fs.readFileSync(path.join(__dirname,"../packaging/certificates/microsoft-update-chain.pem"),"utf8");
  const xml=await new Promise((resolve,reject)=>{
    const req=https.request(ENDPOINT,{method:"POST",signal,ca:[...tls.rootCertificates,ca],
      headers:{"Content-Type":"application/soap+xml; charset=utf-8","Content-Length":body.length}},res=>{
      if(res.statusCode!==200){res.resume();reject(new Error("Microsoft package lookup failed"));return;}
      const chunks=[];let size=0;
      res.on("data",chunk=>{size+=chunk.length;if(size>2*1024*1024)res.destroy(new Error("Oversized package metadata"));else chunks.push(chunk);});
      res.on("end",()=>resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error",reject);
    });
    req.setTimeout(30000,()=>req.destroy(new Error("Microsoft lookup timed out")));
    req.on("error",reject);req.end(body);
  });
  return downloadUrl(xml);
}

async function hashFile(file) {
  const hash=crypto.createHash("sha256");
  for await(const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function fetchArchive(url, destination, progress, signal, source=SOURCE) {
  const start=source.asar.offset, end=start+source.asar.compressed_bytes-1;
  await new Promise((resolve,reject)=>{
    const transport=new URL(url).protocol==="https:"?https:http;
    const request=transport.get(url,{signal,headers:{Range:`bytes=${start}-${end}`}},response=>{
      if(response.statusCode!==206 || response.headers["content-range"]!==`bytes ${start}-${end}/${source.bytes}`){
        response.resume();reject(new Error("Microsoft did not return the expected package section"));return;
      }
      let bytes=0, last=0;
      const check=new Transform({transform(chunk,encoding,callback){
        bytes+=chunk.length;
        if(bytes>source.asar.compressed_bytes){callback(new Error("Oversized package section"));return;}
        if(Date.now()-last>200){last=Date.now();progress({stage:"download",percent:Math.floor(bytes/source.asar.compressed_bytes*100)});}
        callback(null,chunk);
      }});
      pipeline(response,check,fs.createWriteStream(destination,{flags:"wx",mode:0o600})).then(()=>{
        if(bytes!==source.asar.compressed_bytes)throw new Error("Incomplete package download");
        resolve();
      }).catch(reject);
    });
    request.setTimeout(30000,()=>request.destroy(new Error("Package download timed out")));
    request.on("error",reject);
  });
  if(await hashFile(destination)!==source.asar.compressed_sha256)throw new Error("Downloaded package section failed verification");
}

async function unpackArchive(compressed, archive, source=SOURCE) {
  let bytes=0;
  const check=new Transform({transform(chunk,encoding,callback){
    bytes+=chunk.length;
    callback(bytes>source.asar.bytes?new Error("Oversized interface archive"):null,chunk);
  }});
  if(source.asar.compression!==8)throw new Error("Unsupported package compression");
  await pipeline(fs.createReadStream(compressed),zlib.createInflateRaw(),check,
    fs.createWriteStream(archive,{flags:"wx",mode:0o600}));
  if(bytes!==source.asar.bytes || await hashFile(archive)!==source.asar.sha256)throw new Error("Interface archive failed verification");
}

async function importAsar(archive,destination,source=SOURCE) {
  const handle=await fsp.open(archive,"r");
  try {
    const size=(await handle.stat()).size;
    async function read(offset,length) {
      if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||length>128*1024*1024||offset+length>size)throw new Error("Invalid archive extent");
      const buffer=Buffer.alloc(length);
      let done=0;
      while(done<length){const {bytesRead}=await handle.read(buffer,done,length-done,offset+done);if(!bytesRead)throw new Error("Truncated archive");done+=bytesRead;}
      return buffer;
    }
    const prefix=await read(0,16), dataStart=8+prefix.readUInt32LE(4), jsonSize=prefix.readUInt32LE(12);
    if(jsonSize>16*1024*1024||16+jsonSize>dataStart||dataStart>size)throw new Error("Invalid archive header");
    const header=JSON.parse((await read(16,jsonSize)).toString("utf8"));
    function entry(parts){let node=header;for(const part of parts){if(!part||part==="."||part===".."||/[\\/:\0]/.test(part))throw new Error("Unsafe archive path");node=node.files?.[part];if(!node||node.link||node.unpacked)throw new Error("Unsupported archive entry");}return node;}
    async function contents(parts){const e=entry(parts);return read(dataStart+Number(e.offset),e.size);}
    const metadata=JSON.parse((await contents(["package.json"])).toString("utf8"));
    if(metadata.name!==source.name||metadata.version!==source.version)throw new Error("Unexpected Xiaomi interface version");
    for(const [relative,digest] of Object.entries(source.renderer_files)){
      const parts=relative.split("/"), bytes=await contents(["out","renderer",...parts]);
      if(crypto.createHash("sha256").update(bytes).digest("hex")!==digest)throw new Error("Renderer asset failed verification");
      const output=path.join(destination,"out","renderer",...parts);
      await fsp.mkdir(path.dirname(output),{recursive:true});
      await fsp.writeFile(output,bytes,{flag:"wx",mode:0o600});
    }
    await fsp.writeFile(path.join(destination,"manifest.json"),JSON.stringify({package:source.name,version:source.version,files:source.renderer_files},null,2));
  } finally {await handle.close();}
}

async function validRenderer(directory,source=SOURCE) {
  try {
    for(const [relative,digest] of Object.entries(source.renderer_files)){
      if(await hashFile(path.join(directory,"out","renderer",relative))!==digest)return false;
    }
    return true;
  }catch{return false;}
}

async function ensureRenderer(userData,progress=()=>{},signal) {
  const parent=path.join(userData,"vendor"),target=path.join(parent,SOURCE.version);
  if(await validRenderer(target))return path.join(target,"out/renderer/index.html");
  await fsp.mkdir(parent,{recursive:true});
  const temporary=await fsp.mkdtemp(path.join(parent,".prepare-"));
  try {
    progress({stage:"resolve",percent:0});
    const url=await resolveSource(signal);
    const compressed=path.join(temporary,"interface.deflate"),archive=path.join(temporary,"interface.archive");
    await fetchArchive(url,compressed,progress,signal);
    progress({stage:"extract",percent:100});
    await unpackArchive(compressed,archive);
    const output=path.join(temporary,"ready");
    await fsp.mkdir(output);
    await importAsar(archive,output);
    await fsp.rm(target,{recursive:true,force:true});
    await fsp.rename(output,target);
    return path.join(target,"out/renderer/index.html");
  } finally {await fsp.rm(temporary,{recursive:true,force:true});}
}

module.exports={SOURCE,downloadUrl,envelope,resolveSource,hashFile,fetchArchive,unpackArchive,importAsar,validRenderer,ensureRenderer};
