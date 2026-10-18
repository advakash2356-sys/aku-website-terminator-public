// SSRF protection for public mode: public-IP-only, http/https only, DNS-pinned forward proxy for the browser.
const dns=require('dns').promises,net=require('net'),http=require('http');
const BL=new net.BlockList();
[['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]].forEach(([a,p])=>BL.addSubnet(a,p,'ipv4'));
[['::',128],['::1',128],['64:ff9b::',96],['100::',64],['2001::',23],['2001:db8::',32],['2002::',16],['fc00::',7],['fe80::',10],['fec0::',10],['ff00::',8]].forEach(([a,p])=>BL.addSubnet(a,p,'ipv6'));
// IPv4-mapped IPv6 is unwrapped and checked as IPv4; 6to4 (2002::/16) and NAT64 (64:ff9b::/96) are blocked wholesale.
function isPublicIp(ip){
  let v=net.isIP(ip);if(!v)return false;
  if(v===6){const m=/^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/i.exec(ip);
    if(m){ip=m[1]||[parseInt(m[2],16)>>8,parseInt(m[2],16)&255,parseInt(m[3],16)>>8,parseInt(m[3],16)&255].join('.');v=4}}
  return !BL.check(ip,v===4?'ipv4':'ipv6');
}
const BAD_NAMES=/(^|\.)(localhost|local|internal|localdomain|home\.arpa|metadata\.google\.internal)$/i;
const ALLOWED_PORTS=new Set(['','80','443']);
// Throws Error with user-safe message. Returns {url:URL, ips:[...]}.
async function assertPublicUrl(raw){
  let u;try{u=new URL(raw)}catch{throw new Error('Invalid URL')}
  if(u.protocol!=='http:'&&u.protocol!=='https:')throw new Error('Only http(s) URLs are allowed');
  if(u.username||u.password)throw new Error('URLs with credentials are not allowed');
  if(!ALLOWED_PORTS.has(u.port))throw new Error('Only ports 80 and 443 are allowed in public mode');
  const host=u.hostname.replace(/^\[|\]$/g,'');
  if(BAD_NAMES.test(host))throw new Error('Host not allowed');
  if(net.isIP(host)){if(!isPublicIp(host))throw new Error('Private, loopback or reserved addresses are not allowed');return{url:u,ips:[host]}}
  // decimal/hex/octal IPv4 forms are normalised by WHATWG URL to dotted quad, so they hit the branch above.
  let addrs;try{addrs=await dns.lookup(host,{all:true,verbatim:true})}catch{throw new Error('Host could not be resolved')}
  if(!addrs.length||!addrs.every(a=>isPublicIp(a.address)))throw new Error('Host resolves to a private, loopback or reserved address');
  return{url:u,ips:addrs.map(a=>a.address)};
}
// Forward proxy that re-resolves every hostname itself, rejects non-public IPs and connects to the validated IP
// (so DNS rebinding and redirects to internal hosts cannot bypass the check). Chromium is pointed at it.
function startGuardProxy(){
  const srv=http.createServer((q,r)=>{r.writeHead(405);r.end('HTTPS/HTTP via CONNECT only')});
  const resolve=async(host)=>{host=host.replace(/^\[|\]$/g,'');if(BAD_NAMES.test(host))throw 0;
    if(net.isIP(host)){if(!isPublicIp(host))throw 0;return host}
    const a=await dns.lookup(host,{all:true,verbatim:true});if(!a.length||!a.every(x=>isPublicIp(x.address)))throw 0;return a[0].address};
  srv.on('connect',async(q,sock,head)=>{
    sock.on('error',()=>{});
    try{
      const m=/^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(q.url||'');if(!m)throw 0;
      const port=+m[2];if(port!==80&&port!==443)throw 0;
      const ip=await resolve(m[1]);
      const up=net.connect({host:ip,port},()=>{sock.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head&&head.length)up.write(head);up.pipe(sock);sock.pipe(up)});
      up.setTimeout(30000,()=>up.destroy());up.on('error',()=>sock.destroy());sock.on('close',()=>up.destroy());
    }catch{sock.end('HTTP/1.1 403 Forbidden\r\n\r\n')}
  });
  return new Promise(res=>srv.listen(0,'127.0.0.1',()=>res({port:srv.address().port,close:()=>srv.close()})));
}
module.exports={isPublicIp,assertPublicUrl,startGuardProxy};
