"use strict";
const fs=require("fs");
module.exports=({app,window,getClient,getBridge})=>{
  const checkPath=process.env.XIAOMI_DEMO_CHECK;
  if(checkPath) {
    window.webContents.once("did-finish-load",async()=>{
      try {
        for(let i=0;i<30&&!getBridge();i++)await new Promise(resolve=>setTimeout(resolve,100));
        if(!getBridge())throw new Error("Official renderer did not connect");
        const initial=await getClient().readState();
        fs.writeFileSync(checkPath+".before.json",JSON.stringify(initial,null,2),{mode:0o600});
        await new Promise(resolve=>setTimeout(resolve,600));
        const menuClicked=await window.webContents.executeJavaScript("(()=>{const node=Array.from(document.querySelectorAll('span,div')).find(el=>el.textContent.trim()==='Light effects');if(!node)return false;node.click();return true;})()");
        if(!menuClicked)throw new Error("Official lighting menu was not found");
        await new Promise(resolve=>setTimeout(resolve,300));
        const before=await window.webContents.executeJavaScript("({text:document.body.innerText.slice(0,2000),switches:document.querySelectorAll('.el-switch').length})");
        const clicked=await window.webContents.executeJavaScript("(()=>{const node=document.querySelector('.el-switch');if(!node)return false;node.click();return true;})()");
        await new Promise(resolve=>setTimeout(resolve,1300));
        const after=await getClient().readState();
        if(!clicked||after.rgbEnabled===initial.rgbEnabled)throw new Error("Official RGB switch did not reach the device state");
        await window.webContents.executeJavaScript("document.querySelector('.el-switch').click()");
        await new Promise(resolve=>setTimeout(resolve,300));
        const restored=await getClient().readState();
        if(JSON.stringify(restored)!==JSON.stringify(initial))throw new Error("UI round trip did not restore initial state");
        fs.writeFileSync(checkPath+".png",(await window.webContents.capturePage()).toPNG());
        fs.writeFileSync(checkPath+".json",JSON.stringify({before,clicked,initial,after,restored,matched:true,demo:true},null,2));
        app.quit();
      }catch(error){
        console.error(error);
        fs.writeFileSync(checkPath+".error.json",JSON.stringify({error:String(error)},null,2));
        app.exit(2);
      }
    });
  }
};
