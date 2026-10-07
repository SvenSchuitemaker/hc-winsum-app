import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="nl">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#0B5CAD" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="H.C. Winsum" />
        <link rel="manifest" href="/hc-winsum-app/manifest.json" />
        <link rel="apple-touch-icon" href="/hc-winsum-app/apple-touch-icon.png" />
        <ScrollViewStyleReset />
        <style>{`
          html,
          body,
          #root {
            width: 100%;
            max-width: 100%;
            min-height: 100%;
            margin: 0;
            overflow-x: hidden;
          }

          html {
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
          }

          body {
            min-width: 0;
            overscroll-behavior-x: none;
          }

          * {
            box-sizing: border-box;
            min-width: 0;
          }

          input,
          select,
          textarea,
          button {
            font-size: 16px;
          }

          @supports (padding: max(0px)) {
            body {
              padding-left: env(safe-area-inset-left);
              padding-right: env(safe-area-inset-right);
            }
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
