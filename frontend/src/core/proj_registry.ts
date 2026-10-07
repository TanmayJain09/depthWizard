import proj4 from 'proj4';

// A local, offline registry of common coordinate reference systems
// We avoid fetching from epsg.io to keep the app functional offline

let initialized = false;

export function initializeProjRegistry() {
  if (initialized) return;

  // WGS 84
  proj4.defs('EPSG:4326', '+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees');
  // Web Mercator
  proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs');

  // UTM Zones North (EPSG:32601 to EPSG:32660)
  for (let zone = 1; zone <= 60; zone++) {
    const epsg = `EPSG:326${zone.toString().padStart(2, '0')}`;
    const def = `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`;
    proj4.defs(epsg, def);
  }

  // UTM Zones South (EPSG:32701 to EPSG:32760)
  for (let zone = 1; zone <= 60; zone++) {
    const epsg = `EPSG:327${zone.toString().padStart(2, '0')}`;
    const def = `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`;
    proj4.defs(epsg, def);
  }

  initialized = true;
}

export function registerCustomCRS(epsgCode: string, proj4String: string) {
  if (!initialized) initializeProjRegistry();
  proj4.defs(epsgCode, proj4String);
}

export function hasCRS(epsgCode: string): boolean {
  if (!initialized) initializeProjRegistry();
  return !!proj4.defs(epsgCode);
}
