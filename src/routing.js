/** @type {import('./models').AppConfig} */
export const config =
  typeof __APP_CONFIG__ === "undefined"
    ? {
        mode: "shared",
        supabaseUrl: "",
        supabaseKey: "",
        basePath: "/",
        hashRouting: false,
      }
    : __APP_CONFIG__;

/** @param {string} path */
export function routeHref(path) {
  return config.hashRouting ? `${config.basePath}#${path}` : path;
}
export function currentRoute() {
  return new URL(
    config.hashRouting && location.hash.startsWith("#/")
      ? location.hash.slice(1)
      : location.pathname + location.search,
    location.origin,
  );
}
