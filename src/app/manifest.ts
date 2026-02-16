import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Spliit',
    short_name: 'Spliit',
    description:
      'A minimalist web application to share expenses with friends and family. No ads, no account, no problem.',
    start_url: '/spliit/groups',
    id: '/spliit/groups',
    display: 'standalone',
    background_color: '#fff',
    theme_color: '#047857',
    icons: [
      {
        src: '/spliit/logo/48x48.png',
        sizes: '48x48',
        type: 'image/png',
      },
      {
        src: '/spliit/logo/64x64.png',
        sizes: '64x64',
        type: 'image/png',
      },
      {
        src: '/spliit/logo/128x128.png',
        sizes: '128x128',
        type: 'image/png',
      },
      {
        src: '/spliit/logo/144x144.png',
        sizes: '144x144',
        type: 'image/png',
      },
      {
        src: '/spliit/logo/192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/spliit/logo/256x256.png',
        sizes: '256x256',
        type: 'image/png',
      },
      {
        src: '/spliit/logo/512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/spliit/logo/512x512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    share_target: {
      action: '/spliit/api/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        files: [
          {
            name: 'file',
            accept: [
              'image/png',
              'image/jpeg',
              'image/gif',
              'image/webp',
              'image/bmp',
              '.png',
              '.jpg',
              '.jpeg',
              '.gif',
              '.webp',
              '.bmp',
            ],
          },
        ],
      },
    },
  }
}
