"use strict";
const message=document.getElementById("message"),progress=document.getElementById("progress"),retry=document.getElementById("retry");
window.setup.onProgress(data=>{
  retry.hidden=!data.error;
  if(data.error){message.textContent="Could not prepare the interface. Check your internet connection and try again.";progress.removeAttribute("value");return;}
  message.textContent=data.stage==="download"?`Downloading the original interface… ${data.percent}%`:
    data.stage==="extract"?"Checking and preparing the interface…":"Connecting to Microsoft…";
  if(data.stage==="download"){progress.max=100;progress.value=data.percent;}else progress.removeAttribute("value");
});
retry.addEventListener("click",()=>{retry.hidden=true;window.setup.retry();});
