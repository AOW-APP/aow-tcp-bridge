import { supabase } from '../supabase.ts';

export class LbsService {
  /**
   * Decodes a PostGIS HexEWKB Point (e.g. 0101000020E610000079E9263108AC074068B3EA73B51D4540)
   * into decimal degrees { lon, lat }.
   */
  public static parseHexEWKBPoint(hex: string) {
    if (typeof hex !== 'string') return null;

    // Standard Little Endian Point with SRID 4326 (SRID prefix: "0101000020E6100000")
    if (hex.startsWith('0101000020E6100000') && hex.length === 50) {
      const lonHex = hex.substring(18, 34);
      const latHex = hex.substring(34, 50);

      const lon = Buffer.from(lonHex, 'hex').readDoubleLE(0);
      const lat = Buffer.from(latHex, 'hex').readDoubleLE(0);

      return { lon, lat };
    }

    // Standard Little Endian Point without SRID (prefix: "0101000000")
    if (hex.startsWith('0101000000') && hex.length === 42) {
      const lonHex = hex.substring(10, 26);
      const latHex = hex.substring(26, 42);

      const lon = Buffer.from(lonHex, 'hex').readDoubleLE(0);
      const lat = Buffer.from(latHex, 'hex').readDoubleLE(0);

      return { lon, lat };
    }

    return null;
  }

  /**
   * Resolves the latitude and longitude of a cell tower using the self-hosted cell_towers database in Supabase.
   */
  public static async resolveCellTower(mcc: number, mnc: number, lac: number, cellId: number) {
    try {
      const { data, error } = await supabase
        .from('cell_towers')
        .select('location')
        .eq('mcc', mcc)
        .eq('mnc', mnc)
        .eq('lac', lac)
        .eq('cell_id', cellId)
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) return null;

      const loc = data[0].location as any;
      
      // 1. Handle standard PostgREST GeoJSON format: { type: "Point", coordinates: [longitude, latitude] }
      if (loc && loc.type === 'Point' && Array.isArray(loc.coordinates)) {
        return {
          lon: loc.coordinates[0],
          lat: loc.coordinates[1]
        };
      }
      
      // 2. Handle HexEWKB binary format
      if (typeof loc === 'string') {
        const parsedPoint = this.parseHexEWKBPoint(loc);
        if (parsedPoint) return parsedPoint;

        // Fallback if PostgREST returns a WKT string (e.g. "POINT(-3.70379 40.416775)")
        const wktMatch = loc.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/i);
        if (wktMatch) {
          return {
            lon: parseFloat(wktMatch[1]),
            lat: parseFloat(wktMatch[2])
          };
        }
      }
      
      return null;
    } catch (error: any) {
      console.error(`[LBS Resolver] Error querying cell tower database:`, error.message);
      return null;
    }
  }
}
