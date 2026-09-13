// Cloudflare Pages "Advanced Mode" worker - egyszerű, átlátszó proxy.
//
// A gyülekezeti adatbázis alkalmazás az Oracle-szerveren fut, egy ingyenes "sslip.io" domainen
// keresztül elérve HTTPS-sel (Coolify + Let's Encrypt) - ezt a domaint viszont néhány romániai
// szolgáltatónál blokkolják (gyakran visszaélésre használt, IP-t domainbe ágyazó szolgáltatás).
//
// Ez a worker egy megbízható, senki által nem blokkolt "*.pages.dev" cím MÖGÖTT fut a Cloudflare
// saját hálózatán - a látogató böngészője kizárólag ezzel a pages.dev címmel beszél, a tényleges
// (blokkolt) sslip.io címet a Cloudflare szerverei érik el a háttérben, amit a romániai szűrés
// nem érint (az nem a látogató saját internetkapcsolatán megy keresztül).
//
// Minden kérést (útvonal, metódus, fejlécek, törzs) változtatás nélkül továbbít, és a választ is
// változtatás nélkül adja vissza - beleértve a bejelentkezési sütiket (Set-Cookie) is.

const ORIGIN = "https://80.225.93.185.sslip.io";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const targetUrl = new URL(url.pathname + url.search, ORIGIN);

    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });

    const response = await fetch(proxyRequest);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  },
};
