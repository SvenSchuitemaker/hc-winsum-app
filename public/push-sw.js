/* H.C. Winsum browser-push, scoped to /hc-winsum-app/. */
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* ignore malformed payloads */ }
  event.waitUntil(self.registration.showNotification(data.title || "H.C. Winsum", {
    body: data.body || "Je hebt een nieuwe melding.",
    icon: "./icon.png",
    badge: "./favicon.png",
    data: { path: data.path || "/notifications" },
    tag: data.title || "hockeyapp",
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const scope = self.registration.scope;
  const relative = String(event.notification.data?.path || "/notifications").replace(/^\/+/, "");
  const destination = new URL(relative, scope).href;
  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({type:"window",includeUncontrolled:true});
    for (const client of clientsList) {
      if (client.url.startsWith(scope)) {
        await client.navigate(destination);
        return client.focus();
      }
    }
    return clients.openWindow(destination);
  })());
});
