const CACHE='meu-treino-v6';
const SHELL=['/','/manifest.webmanifest','/icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/'))) )});

self.addEventListener('push',event=>{
  let data={title:'Descanso concluído',body:'Hora da próxima série.',data:{url:'/'}};
  try{if(event.data)data={...data,...JSON.parse(event.data.text())}}catch{}
  const options={
    body:data.body||'Hora da próxima série.',
    icon:data.icon||'/icon-192.png',
    badge:data.badge||'/icon-192.png',
    tag:data.tag||'workout-rest',
    renotify:data.renotify!==false,
    vibrate:data.vibrate||[200,100,200,100,250],
    data:data.data||{url:'/'}
  };
  event.waitUntil(self.registration.showNotification(data.title||'Descanso concluído',options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification.data?.url||'/';
  event.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      for(const client of list){
        if('focus' in client){
          client.navigate(target).catch(()=>{});
          return client.focus();
        }
      }
      return clients.openWindow?clients.openWindow(target):undefined;
    })
  );
});
