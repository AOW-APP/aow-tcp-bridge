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
  public static async resolveCellTower(mcc: number, mnc: number, lac: number, cellId: number, commandType?: string) {
    try {
      // 1. Attempt to query local cache database
      const { data, error } = await supabase
        .from('cell_towers')
        .select('location')
        .eq('mcc', mcc)
        .eq('mnc', mnc)
        .eq('lac', lac)
        .eq('cell_id', cellId)
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        const loc = data[0].location as any;
        
        // Handle standard PostgREST GeoJSON format: { type: "Point", coordinates: [longitude, latitude] }
        if (loc && loc.type === 'Point' && Array.isArray(loc.coordinates)) {
          return {
            lon: loc.coordinates[0],
            lat: loc.coordinates[1]
          };
        }
        
        // Handle HexEWKB binary format or WKT string
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
      }
      
      // 2. Fallback: If not found locally, query Unwired Labs API if key is available
      const unwiredToken = process.env.UNWIREDLABS_API_KEY;
      if (unwiredToken) {
        console.log(`[LBS Resolver] Cell ID ${cellId} not found locally. Querying Unwired Labs API...`);
        
        let radio = 'gsm';
        if (commandType) {
          const typeUpper = commandType.toUpperCase();
          if (typeUpper.includes('LTE')) {
            radio = 'lte';
          } else if (typeUpper.includes('WCDMA')) {
            radio = 'umts';
          } else {
            radio = cellId > 65535 ? 'lte' : 'gsm';
          }
        } else {
          radio = cellId > 65535 ? 'lte' : 'gsm';
        }
        
        try {
          const response = await fetch('https://us1.unwiredlabs.com/v2/process.php', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              token: unwiredToken,
              radio: radio,
              mcc: mcc,
              mnc: mnc,
              cells: [{
                lac: lac,
                cid: cellId
              }],
              address: 0
            })
          });

          if (response.ok) {
            const result = (await response.json()) as any;
            if (result && result.status === 'ok') {
              const lat = parseFloat(result.lat);
              const lon = parseFloat(result.lon);
              const range = result.accuracy ?? 1000;
              
              console.log(`[LBS Resolver] Found cell via Unwired Labs: Lat: ${lat}, Lon: ${lon}, Accuracy: ${range}m`);

              // Cache the result in the local cell_towers table to avoid calling the API again for this cell
              try {
                const { error: cacheError } = await supabase.from('cell_towers').insert({
                  radio: radio.toUpperCase(),
                  mcc,
                  mnc,
                  lac,
                  cell_id: cellId,
                  location: `POINT(${lon} ${lat})`,
                  range,
                  samples: 1,
                  updated_at: new Date().toISOString()
                });
                if (cacheError) throw cacheError;
                console.log(`[LBS Resolver] Cached cell ID ${cellId} locally.`);
              } catch (cacheErr: any) {
                console.error(`[LBS Resolver] Failed to cache cell in database:`, cacheErr.message);
              }

              return { lon, lat };
            } else {
              console.warn(`[LBS Resolver] Unwired Labs returned status: ${result?.status} - ${result?.message}`);
            }
          } else {
            console.error(`[LBS Resolver] Unwired Labs HTTP error: ${response.status}`);
          }
        } catch (fetchErr: any) {
          console.error(`[LBS Resolver] Failed to contact Unwired Labs API:`, fetchErr.message);
        }
      }
      
      return null;
    } catch (error: any) {
      console.error(`[LBS Resolver] Error querying cell tower database:`, error.message);
      return null;
    }
  }
}
