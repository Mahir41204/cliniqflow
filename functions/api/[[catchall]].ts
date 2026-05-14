export async function onRequest(context: any) {
  const request = context.request;
  const url = new URL(request.url);
  
  // The actual URL of your Render backend
  const backendBase = "https://cliniqflow.onrender.com";
  
  // Create the destination URL. 
  // context.request.url contains the full original URL, e.g., https://cliniqflow.pages.dev/api/auth/user
  // url.pathname is exactly "/api/auth/user"
  const targetUrl = new URL(`${backendBase}${url.pathname}${url.search}`);
  
  // Clone the original request
  const proxyRequest = new Request(targetUrl, request);
  
  // Set X-Forwarded-Host so the backend knows the true origin
  proxyRequest.headers.set("x-forwarded-host", url.hostname);
  proxyRequest.headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
  
  return fetch(proxyRequest);
}
