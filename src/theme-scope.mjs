export function themeSkipReason(raw) {
  const url=new URL(raw);
  const route=(url.searchParams.get('initialRoute')??url.pathname).split(/[?#]/,1)[0];
  if(route==='/avatar-overlay'||route.startsWith('/avatar-overlay/'))return 'avatar-overlay';
  if(url.pathname==='/detached-window.html'||route==='/detached-window'||route.startsWith('/detached-window/'))return 'detached-window';
  return null;
}
