// ## File: src/app/api/share-target/route.ts
import { NextRequest, NextResponse } from 'next/server'

// Handle GET requests (validation pings from OS)
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL('/spliit/groups', req.url))
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return new Response('No file received', { status: 400 })
  }

  const buffer = await file.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const mimeType = file.type
  const dataUrl = `data:${mimeType};base64,${base64}`

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Processing Receipt...</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #fafafa; }
          .loader { border: 4px solid #f3f3f3; border-top: 4px solid #047857; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="loader"></div>
        <script>
          try {
            sessionStorage.setItem('pending-receipt-image', "${dataUrl}");
            window.location.href = '/spliit/groups';
          } catch (e) {
            console.error(e);
            document.body.innerHTML = '<p style="color:red">Error saving image: ' + e.message + '</p>';
          }
        </script>
      </body>
    </html>
  `

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  })
}