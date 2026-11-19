(() => {
 const content=document.getElementById('content');
 const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let token=new URLSearchParams(location.hash.slice(1)).get('request')||sessionStorage.getItem('wecomBindingToken')||'';
 if(token){sessionStorage.setItem('wecomBindingToken',token);history.replaceState(null,'',location.pathname);}
 async function request(path,body){const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||"Request incomplete");return data;}
 function failure(error){content.innerHTML=`<p class="error">${escape(window.lfEnglishMessage(error.message))}</p><p>Return to WeCom and send /bind to the bot to get a new link.</p>`;}
 async function start(){
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error("Invalid binding link");
  const auth=await request('/api/auth/current?return_url='+encodeURIComponent(location.origin+location.pathname));
  if(!auth.user||auth.user.isGuest){
   content.innerHTML="<p>Please log in to your own platform account. After logging in, the original WeCom sender must still confirm for the binding to take effect.</p><button id=\"login\">Log in to Platform</button><button class=\"secondary\" id=\"local\" hidden>Local sign-in</button>";
   document.getElementById('login').onclick=()=>{if(auth.loginUrl)location.href=auth.loginUrl;else failure(new Error("Login entry unavailable"));};
   const local=await request('/api/auth/local').catch(()=>({enabled:false}));
   if(local.enabled){const button=document.getElementById('local');button.hidden=false;button.onclick=()=>request('/api/auth/local',{}).then(start).catch(failure);}
   return;
  }
  const data=await request('/api/bot-bindings/status',{token});
  if(data.status==='confirmed'){complete(data.loginName);return;}
  content.innerHTML=`<p>Current platform account</p><p id="account">${escape(auth.user.chineseName)} · ${escape(data.loginName)}</p><p>After binding, the Bot will use this account's personal credentials and project permissions to execute your commands. Please confirm that this is your own account.</p><button id="claim">Confirm Platform Account</button><p><small>Other people in the group clicking the link will not complete the binding directly.</small></p>`;
  document.getElementById('claim').onclick=async()=>{const button=document.getElementById('claim');button.disabled=true;try{const result=await request('/api/bot-bindings/claim',{token});if(result.status==='confirmed'){complete(result.loginName);return;}content.innerHTML=`<p>Final step: Confirmation by the original WeCom sender</p><p>Copy the command below and send it back to the Bot that provided the binding link. In group chats, please @Bot. You can also send it in a direct chat with the same Bot.</p><code id="command">${escape(result.command)}</code><p><button id="copy">Copy Confirmation Command</button></p><p>Will be linked to <strong>${escape(result.loginName)}</strong>. Do not forward the confirmation code.</p><small>Waiting for WeCom confirmation. The page will update automatically…</small>`;document.getElementById('copy').onclick=()=>navigator.clipboard.writeText(result.command).then(()=>{document.getElementById('copy').textContent="Copied";}).catch(()=>{document.getElementById('copy').textContent="Please select the command above to copy";});poll(result.loginName);}catch(error){failure(error);}};
 }
 function complete(login){sessionStorage.removeItem('wecomBindingToken');content.innerHTML=`<h2>Linking completed</h2><p>Current WeCom account is linked to <strong>${escape(login)}</strong>.</p><p>Please go back to the Bot and resend the previous request. You can unbind in the platform personal settings.</p><a class="button" href="/#/settings">View Personal Configuration</a>`;}
 function poll(login){const timer=setInterval(async()=>{try{const data=await request('/api/bot-bindings/status',{token});if(data.status==='confirmed'){clearInterval(timer);complete(login);}}catch(error){clearInterval(timer);failure(error);}},2500);}
 start().catch(failure);
})();
