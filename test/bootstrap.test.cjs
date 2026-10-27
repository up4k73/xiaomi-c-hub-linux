"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const zlib=require("node:zlib");
const b=require("../src/vendor-bootstrap.cjs");
const sha=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");

function fixture(){
  const header={files:{}},buffers=[];let offset=0;
  for(const [name,text] of Object.entries({"package.json":JSON.stringify({name:"xiaomi-c-hub",version:"2.4.3"}),
    "out/renderer/index.html":"<html>fixture</html>","out/main/index.js":"private main"})){
    const parts=name.split("/");let node=header;
    for(const part of parts.slice(0,-1))node=node.files[part]||(node.files[part]={files:{}});
    const bytes=Buffer.from(text);node.files[parts.at(-1)]={offset:String(offset),size:bytes.length};
    buffers.push(bytes);offset+=bytes.length;
  }
  const json=Buffer.from(JSON.stringify(header)),padded=Math.ceil(json.length/4)*4;
  const prefix=Buffer.alloc(16);prefix.writeUInt32LE(4,0);prefix.writeUInt32LE(padded+8,4);prefix.writeUInt32LE(padded+4,8);prefix.writeUInt32LE(json.length,12);
  const archive=Buffer.concat([prefix,json,Buffer.alloc(padded-json.length),...buffers]);
  const compressed=zlib.deflateRawSync(archive);
  return {archive,compressed,source:{...b.SOURCE,
    renderer_files:{"index.html":sha(Buffer.from("<html>fixture</html>"))},
    asar:{compression:8,bytes:archive.length,sha256:sha(archive)}}};
}

test("resolve only the pinned digest on an official Microsoft CDN",()=>{
  const xml=`<Root><FileLocation><FileDigest>${b.SOURCE.sha1_base64}</FileDigest><Url>http://tlu.dl.delivery.mp.microsoft.com/file?one=1&amp;two=2</Url></FileLocation></Root>`;
  assert.equal(b.downloadUrl(xml),"http://tlu.dl.delivery.mp.microsoft.com/file?one=1&two=2");
  assert.throws(()=>b.downloadUrl(xml.replace("tlu.dl.delivery.mp.microsoft.com","malicious.example")),/host/);
  assert.throws(()=>b.downloadUrl(xml.replace(b.SOURCE.sha1_base64,"unknown")),/not available/);
});

test("unpack and import only the pinned renderer, and detect changed cache files",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"chub-bootstrap-"));
  try{
    const f=fixture(),compressed=path.join(root,"compressed"),archive=path.join(root,"app.asar"),out=path.join(root,"vendor");
    await fs.writeFile(compressed,f.compressed);await fs.mkdir(out);
    await b.unpackArchive(compressed,archive,f.source);
    await b.importAsar(archive,out,f.source);
    assert.equal(await b.validRenderer(out,f.source),true);
    await assert.rejects(fs.access(path.join(out,"out/main/index.js")));
    await fs.writeFile(path.join(out,"out/renderer/index.html"),"modified");
    assert.equal(await b.validRenderer(out,f.source),false);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test("reject a mismatched archive hash and unsafe renderer path",async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"chub-bootstrap-"));
  try{
    const f=fixture();await fs.writeFile(path.join(root,"compressed"),f.compressed);
    await assert.rejects(b.unpackArchive(path.join(root,"compressed"),path.join(root,"bad.asar"),
      {...f.source,asar:{...f.source.asar,sha256:"0".repeat(64)}}),/verification/);
    await fs.writeFile(path.join(root,"good.asar"),f.archive);
    await assert.rejects(b.importAsar(path.join(root,"good.asar"),path.join(root,"out"),
      {...f.source,renderer_files:{"../escape":"0".repeat(64)}}),/Unsafe/);
    await assert.rejects(fs.access(path.join(root,"escape")));
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
